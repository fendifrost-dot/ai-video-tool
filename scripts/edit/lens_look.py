#!/usr/bin/env python3
"""
LENS LOOK: give a finished clip the look of a chosen lens, f-stop and distance. Deterministic, $0, no model.

  python3 scripts/edit/lens_look.py --src take.mp4 --alpha alpha.mp4 --out look.mp4 \\
      --lens portrait_85 --f-stop 1.8 --subject-m 0.91 --background-m 1.6 [--compare side_by_side.mp4] [--sheet sheet.jpg]

Why (Fendi, 25 Nov 2026: "an emulator effect built into AVT to instantly replicate a lens/distance/camera"):
camera_engine.py already carries a lens stack, but only for a matted performer over a separate plate, with a
unitless blur. A finished take had no way to say "50 mm at f/1.4" and get that lens's blur and character. This is the
last step on a finished clip: after the swap, the cut-out and the composite, never before them.

What a lens look is, and what this does about each part:
  * Perspective (the shape of a face, how close the background feels) is set at the shoot by the camera's distance.
    NOT changed here. shoot_guide.py gives the distance for a target lens. --mode says which honest reading to render:
      same_framing  (default) the picture keeps its framing; the blur is what the target lens gives when the camera
                    backs off until the framing matches (subject distance scaled by target / source focal length).
      same_position the camera stays where it stood; the view is cropped to the target lens's field of view.
  * Field of view: a crop (same_position). A longer lens only; a wider view than was shot does not exist.
  * Depth of field: thin-lens blur disc in real units, from the target focal length, f-stop, the distance to him
    and the distance from him to the background, minus the blur the source lens already put there. Computed in
    linear light with a disc kernel (an oval for an anamorphic preset), so highlights open into discs the way glass
    does it. v1 is ONE background plane behind his matte (his wall takes). A background at many distances needs a
    depth map and is not built.
  * Lens character (distortion, flares, halation, chromatic aberration, vignette, contrast, grain): the proven stack,
    camera_engine.lens_post, with the presets in lens_presets.json, unchanged.

His pixels: the blur touches only the background. Wherever his matte is solid, the frame before the lens character
is his source pixel, bit for bit; the run prints `max |out - source| inside his matte: 0` as proof. The lens
character is a whole-frame optical finish (it is what a lens does) and is applied to him too, as camera_coverage.py
already does on finished clips. No model draws anything.

Pairing (PROBLEM_INDEX, "a strip of the take's white wall inside his outline"): matte and picture are paired frame
by frame and the frame counts must match, or the run refuses.
"""
import argparse, hashlib, json, math, os, subprocess, sys
import cv2, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import camera_engine as CE   # noqa: E402  (lens_post: the proven lens-character stack)
import shoot_guide as SG     # noqa: E402  (frame_mm, blur_disc_mm, the phone table)

VERSION = 1
ALPHA_LO, ALPHA_HI = 8, 247   # DECISION: an 8-bit matte from a video codec carries a few levels of noise; below / above these it is clear / solid
GAMMA = 2.2


# ----------------------------------------------------------------------------- optics
def target_distances(mode, subject_m, background_m, focal_src, focal_tgt):
    """(focus distance, background distance from the camera) the target lens is modelled at."""
    s = subject_m * focal_tgt / focal_src if mode == "same_framing" else subject_m
    return s, s + background_m


def blur_radius_px(focal_tgt, f_stop, focus_m, background_cam_m, frame_w_mm, width_px):
    """Radius in output pixels of the target lens's blur disc on the background."""
    return 0.5 * SG.blur_disc_mm(focal_tgt, f_stop, focus_m, background_cam_m) / frame_w_mm * width_px


def source_radius_px(src_lens, subject_m, background_m, frame_w_mm, width_px, crop):
    """Radius of the blur the source lens already put on the background, in output pixels."""
    n_eq = src_lens["f_stop"] * src_lens["focal_eq_mm"] / src_lens["real_focal_mm"]
    return 0.5 * SG.blur_disc_mm(src_lens["focal_eq_mm"], n_eq, subject_m, subject_m + background_m) / frame_w_mm * width_px * crop


def disc_kernel(radius, aspect=1.0):
    """A filled disc of the given radius, antialiased; aspect > 1 makes the tall oval of an anamorphic lens (same area)."""
    ry = radius * math.sqrt(aspect); rx = radius / math.sqrt(aspect)
    half = int(math.ceil(max(rx, ry))) + 1; size = 2 * half + 1; ss = 4
    big = np.zeros((size * ss, size * ss), np.float32)
    cv2.ellipse(big, (((size * ss - 1) / 2.0, (size * ss - 1) / 2.0), (2 * rx * ss, 2 * ry * ss), 0.0), 1.0, -1, cv2.LINE_AA)
    k = cv2.resize(big, (size, size), interpolation=cv2.INTER_AREA)
    return k / max(1e-9, float(k.sum()))


def blur_background(lin, weight, radius, aspect=1.0):
    """The background alone, blurred by a disc: a normalised convolution, so nothing of him (weight 0) bleeds into it.
    lin: HxWx3 linear light; weight: HxW, 1 = background. Returns HxWx3 and the HxW coverage it was normalised by."""
    H, W = weight.shape
    half = radius >= 8.0                                    # a wide blur holds no fine detail: do it at half size
    num = lin * weight[..., None]; den = weight
    if half:
        num = cv2.resize(num, (W // 2, H // 2), interpolation=cv2.INTER_AREA); den = cv2.resize(den, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    k = disc_kernel(radius / 2.0 if half else radius, aspect)
    num = cv2.filter2D(num, -1, k, borderType=cv2.BORDER_REFLECT); den = cv2.filter2D(den, -1, k, borderType=cv2.BORDER_REFLECT)
    if half:
        num = cv2.resize(num, (W, H), interpolation=cv2.INTER_LINEAR); den = cv2.resize(den, (W, H), interpolation=cv2.INTER_LINEAR)
    return num / np.maximum(den, 1e-4)[..., None], den


def depth_of_field(frame, alpha, radius, aspect=1.0, guard_px=3):
    """frame: HxWx3 uint8; alpha: HxW float 0..1 (1 = him). The background blurred by `radius`, him untouched.
    out = source + (1 - alpha) * (blurred background - sharp background): where he is solid this is the source."""
    lin = (frame.astype(np.float32) / 255.0) ** GAMMA
    k = 2 * int(guard_px) + 1
    grown = cv2.dilate(alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) if guard_px > 0 else alpha
    weight = 1.0 - grown                                    # the ring just outside his matte is kept out of the blur's source
    blurred, _ = blur_background(lin, weight, radius, aspect)
    fill, den = blur_background(lin, weight, float(guard_px) + 3.0)       # what the background is under his soft edge
    sharp = np.where((alpha < 0.004)[..., None], lin, np.where((den > 0.02)[..., None], fill, lin))
    out = lin + (1.0 - alpha)[..., None] * (blurred - sharp)
    out = (np.clip(out, 0, 1) ** (1.0 / GAMMA) * 255.0 + 0.5).astype(np.uint8)
    solid = alpha >= 1.0
    out[solid] = frame[solid]                               # exact, not "close": his solid pixels never pass through the float maths
    return out


def vignette_map(W, H):
    """The same falloff camera_coverage.render_2d feeds lens_post."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    return np.clip((r - 0.55) / 0.9, 0, 1) ** 1.5


def crop_to_lens(img, crop, about, interp):
    """The view of a lens `crop` times longer from the same spot: crop about a point (fractions of the frame), scaled back up."""
    if crop <= 1.0 + 1e-6: return img
    H, W = img.shape[:2]; cw, ch = W / crop, H / crop
    x0 = float(np.clip(about[0] * W - cw / 2, 0, W - cw)); y0 = float(np.clip(about[1] * H - ch / 2, 0, H - ch))
    M = np.array([[crop, 0, -x0 * crop], [0, crop, -y0 * crop]], np.float32)
    return cv2.warpAffine(img, M, (W, H), flags=interp, borderMode=cv2.BORDER_REFLECT)


# ----------------------------------------------------------------------------- io
def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames",
                          "-of", "json", path], capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]; a, b = s["r_frame_rate"].split("/")
    return int(s["width"]), int(s["height"]), float(a) / float(b), int(s["nb_read_frames"])


def reader(path, W, H, pix):
    ch = 3 if pix == "bgr24" else 1
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", pix, "-"], stdout=subprocess.PIPE)
    while True:
        buf = p.stdout.read(W * H * ch)
        if len(buf) < W * H * ch: break
        yield np.frombuffer(buf, np.uint8).reshape((H, W, 3) if ch == 3 else (H, W))
    p.stdout.close(); p.wait()


def writer(path, W, H, fps, crf):
    return subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", f"{fps:.6f}", "-i", "-",
                             "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
                             "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", path], stdin=subprocess.PIPE)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def label(img, text):
    out = img.copy(); s = max(0.6, img.shape[1] / 900.0)
    cv2.putText(out, text, (int(14 * s), int(34 * s)), cv2.FONT_HERSHEY_SIMPLEX, s, (0, 0, 0), int(4 * s) + 1, cv2.LINE_AA)
    cv2.putText(out, text, (int(14 * s), int(34 * s)), cv2.FONT_HERSHEY_SIMPLEX, s, (255, 255, 255), int(2 * s), cv2.LINE_AA)
    return out


def edge_crop(src, out, alpha, size=200, zoom=3):
    """Source and result at his outline, enlarged: the place a depth-of-field pass shows its faults."""
    ys, xs = np.where(alpha > 0.5)
    if len(ys) == 0: return None
    y = int(ys.min() + 0.18 * (ys.max() - ys.min())); row = np.where(alpha[y] > 0.5)[0]; x = int(row.max()) if len(row) else int(xs.max())
    H, W = alpha.shape; x0 = int(np.clip(x - size // 2, 0, W - size)); y0 = int(np.clip(y - size // 2, 0, H - size))
    z = lambda im: cv2.resize(im[y0:y0 + size, x0:x0 + size], None, fx=zoom, fy=zoom, interpolation=cv2.INTER_NEAREST)
    return np.hstack([label(z(src), "source"), label(z(out), "lens look")])


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Give a finished clip the look of a chosen lens, f-stop and distance.")
    ap.add_argument("--src", required=True, help="the finished clip")
    ap.add_argument("--out", required=True)
    ap.add_argument("--alpha", default=None, help="his matte as a video (white = him), same frame count as --src; needed for depth of field")
    ap.add_argument("--lens", default="clean_50", help="lens character: a preset from lens_presets.json, or 'none'")
    ap.add_argument("--focal", type=float, default=None, help="target focal length, mm full-frame equivalent (default: the preset's)")
    ap.add_argument("--f-stop", type=float, default=None, help="target f-stop; omit for no depth of field")
    ap.add_argument("--mode", default="same_framing", choices=["same_framing", "same_position"])
    ap.add_argument("--subject-m", type=float, default=None, help="camera to him at the shoot, metres")
    ap.add_argument("--background-m", type=float, default=None, help="him to the background, metres (one plane)")
    ap.add_argument("--source-phone", default="iphone_14"); ap.add_argument("--source-lens", default="1x")
    ap.add_argument("--about", default="0.5,0.5", help="same_position: the point the crop is centred on, fractions of the frame")
    ap.add_argument("--edge-guard-px", type=int, default=3, help="ring outside his matte kept out of the blur's source (stops a dark rim of him in the blur)")
    ap.add_argument("--crf", type=int, default=14)
    ap.add_argument("--max-frames", type=int, default=0)
    ap.add_argument("--compare", default=None, help="also write source | result side by side")
    ap.add_argument("--sheet", default=None, help="also write a still sheet: three frames and his outline enlarged")
    a = ap.parse_args()

    presets = json.load(open(os.path.join(HERE, "lens_presets.json")))["presets"]
    if a.lens != "none" and a.lens not in presets: raise SystemExit(f"--lens is 'none' or one of: {', '.join(presets)}")
    lens = None if a.lens == "none" else dict(presets[a.lens])
    phone, diag = SG.load_phone(a.source_phone)
    if a.source_lens not in phone["lenses"]: raise SystemExit(f"--source-lens is one of: {', '.join(phone['lenses'])}")
    src_lens = phone["lenses"][a.source_lens]; focal_src = float(src_lens["focal_eq_mm"])
    focal = float(a.focal if a.focal else (lens["focal_mm"] if lens else focal_src))
    W, H, fps, n = probe(a.src)
    w_mm, _ = SG.frame_mm("vertical" if H > W else "horizontal", diag)
    crop = focal / focal_src if a.mode == "same_position" else 1.0
    if crop < 1.0 - 1e-6: raise SystemExit(f"{focal:g} mm is wider than the {focal_src:g} mm this was shot on; a wider view than was shot does not exist. Use --mode same_framing.")
    about = tuple(float(v) for v in a.about.split(","))
    aspect = float(lens.get("bokeh_aspect", 1.0)) if lens else 1.0

    radius = 0.0; physics = {"mode": a.mode, "focal_target_mm": focal, "focal_source_mm": focal_src, "crop": round(crop, 4)}
    if a.f_stop:
        if not a.alpha or a.subject_m is None or a.background_m is None:
            raise SystemExit("depth of field needs --alpha, --subject-m and --background-m (v1 blurs one background plane behind his matte)")
        an = probe(a.alpha)[3]
        if an != n: raise SystemExit(f"matte and picture must pair frame by frame: {a.alpha} has {an} frames, {a.src} has {n}")
        focus_m, bg_m = target_distances(a.mode, a.subject_m, a.background_m, focal_src, focal)
        r_t = blur_radius_px(focal, a.f_stop, focus_m, bg_m, w_mm, W)
        r_s = source_radius_px(src_lens, a.subject_m, a.background_m, w_mm, W, crop)
        radius = math.sqrt(max(0.0, r_t * r_t - r_s * r_s))
        physics.update({"f_stop": a.f_stop, "subject_m": a.subject_m, "background_m": a.background_m, "modelled_focus_m": round(focus_m, 3),
                        "modelled_background_from_camera_m": round(bg_m, 3), "target_blur_radius_px": round(r_t, 2),
                        "source_blur_radius_px": round(r_s, 2), "applied_blur_radius_px": round(radius, 2),
                        "applied_blur_share_of_width": round(2 * radius / W, 4), "bokeh_aspect": aspect})
        print(f"depth of field: {focal:g} mm f/{a.f_stop:g} focused at {focus_m:.2f} m, background {bg_m:.2f} m from the camera -> "
              f"blur disc {2 * r_t:.1f} px wide ({SG.blur_word(2 * r_t / W)}); the source lens already gave {2 * r_s:.1f} px; applying {2 * radius:.1f} px")
    if crop > 1.0:
        print(f"crop: {crop:.2f}x about {about} ({W / crop:.0f} source pixels across the {W}-pixel frame)")

    vig = vignette_map(W, H) if lens else None
    rng = np.random.default_rng(11)
    enc = writer(a.out + ".v.mp4", W, H, fps, a.crf)
    cmp_enc = writer(a.compare + ".v.mp4", 2 * W, H, fps, a.crf + 2) if a.compare else None
    alphas = reader(a.alpha, W, H, "gray") if (a.alpha and radius >= 0.6) else None
    worst = 0; done = 0; picks = {}; want = {int(n * f) for f in (0.15, 0.5, 0.85)}
    for i, frame in enumerate(reader(a.src, W, H, "bgr24")):
        if a.max_frames and i >= a.max_frames: break
        base = crop_to_lens(frame, crop, about, cv2.INTER_LANCZOS4)
        out = base; al = None
        if alphas is not None:
            raw = next(alphas, None)
            if raw is None: raise SystemExit(f"the matte ran out at frame {i}")
            al = np.clip((raw.astype(np.float32) - ALPHA_LO) / (ALPHA_HI - ALPHA_LO), 0, 1)
            al = crop_to_lens(al, crop, about, cv2.INTER_LINEAR)
            out = depth_of_field(base, al, radius, aspect, a.edge_guard_px)
            solid = al >= 1.0
            if solid.any(): worst = max(worst, int(np.abs(out[solid].astype(np.int16) - base[solid].astype(np.int16)).max()))
        final = CE.lens_post(out, lens, (0.0, 0.0), rng, vig) if lens else out
        enc.stdin.write(final.tobytes())
        if cmp_enc: cmp_enc.stdin.write(np.hstack([label(base, "source"), label(final, f"{focal:g} mm" + (f" f/{a.f_stop:g}" if a.f_stop else "") + f" {a.lens}")]).tobytes())
        if a.sheet and i in want: picks[i] = (base.copy(), final.copy(), None if al is None else al.copy())
        done += 1
    enc.stdin.close(); enc.wait()
    for path, e in ((a.out, None), (a.compare, cmp_enc)):
        if path is None: continue
        if e: e.stdin.close(); e.wait()
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path + ".v.mp4", "-i", a.src, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-shortest", path], check=True)
        os.remove(path + ".v.mp4")
    if alphas is not None:
        print(f"max |out - source| inside his matte, before the lens character: {worst}")
        if worst != 0: raise SystemExit("his solid pixels changed in the depth-of-field pass: this is a bug, do not use the output")

    if a.sheet and picks:
        rows = []
        for i in sorted(picks):
            b, f, al = picks[i]; row = np.hstack([label(b, f"source f{i}"), label(f, "lens look")])
            if al is not None:
                ec = edge_crop(b, f, al)
                if ec is not None: row = np.hstack([row, cv2.resize(ec, (int(ec.shape[1] * H / ec.shape[0]), H))])
            rows.append(cv2.resize(row, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA))
        wmax = max(r.shape[1] for r in rows)
        cv2.imwrite(a.sheet, np.vstack([cv2.copyMakeBorder(r, 0, 0, 0, wmax - r.shape[1], cv2.BORDER_CONSTANT) for r in rows]), [cv2.IMWRITE_JPEG_QUALITY, 90])

    try: commit = subprocess.run(["git", "-C", HERE, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    except OSError: commit = ""
    meta = {"tool": "scripts/edit/lens_look.py", "version": VERSION, "commit": commit, "model": None, "seed": 11,
            "source": {"path": a.src, "sha256": sha256(a.src), "width": W, "height": H, "fps": fps, "frames": done,
                       "camera": f"{phone['label']} {a.source_lens}"},
            "matte": None if not a.alpha else {"path": a.alpha, "sha256": sha256(a.alpha), "levels": [ALPHA_LO, ALPHA_HI]},
            "lens": {"preset": a.lens, "values": lens}, "physics": physics,
            "proof_max_diff_inside_matte": worst if alphas is not None else None,
            "evidence": {"blur_size": "VERIFIED against the thin-lens formula (tests/test_lens_look.py); HYPOTHESIS that it matches a photograph through that lens until one is shot side by side",
                         "distances": "as given on the command line; label them where they came from",
                         "perspective": "NOT changed: it is the take's own"}}
    json.dump(meta, open(a.out + ".json", "w"), indent=1)
    print(f"wrote {a.out} ({done} frames) and {a.out}.json")


if __name__ == "__main__":
    main()
