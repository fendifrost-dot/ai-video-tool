#!/usr/bin/env python3
"""
LENS LOOK: give a finished clip the look of a chosen lens, f-stop and distance. Deterministic, $0, nothing drawn by a model.

  python3 scripts/edit/lens_look.py --src take.mp4 --alpha alpha.mp4 --out look.mp4 \\
      --lens portrait_85 --f-stop 1.8 --subject-m 0.91 --background-m 1.6 [--compare side_by_side.mp4] [--sheet sheet.jpg]
  a background at many distances (a room with a floor, a street): replace --background-m by --depth --far-m 2.5
  a scene without him: no --alpha, and --depth --focus-at 0.5,0.6 --subject-m 7 --far-m 40

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
    does it. Two ways to say how far the background is:
      --background-m B   ONE plane B metres behind him (a wall take). No model.
      --depth            a depth map of the scene (Depth-Anything-v2 small, ONNX, CPU, local: the model
                         camera_engine.plate_depth already uses). The model gives relative depth only, so it is tied
                         to metres at two points: him (--subject-m) and the farthest thing in the picture (--far-m;
                         omit for "far away"). The map is ONE picture for the clip (the median of a few frames,
                         him left out), so the blur cannot flicker; a camera that moves is refused, not smeared.
                         Each pixel's blur is its own distance's; the picture is blended from a few blur levels.
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

VERSION = 3
ALPHA_LO, ALPHA_HI = 8, 247   # DECISION: an 8-bit matte from a video codec carries a few levels of noise; below / above these it is clear / solid
GAMMA = 2.2
# The one depth model this tool will load: onnx-community/depth-anything-v2-small, onnx/model.onnx, 99,060,839 bytes.
# Checked before the model is opened, so a swapped or half-downloaded file stops the run.
DEPTH_MODEL_SHA256 = "afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c"


_MODEL_OK = {}
def checked_depth_model():
    """The depth model's sha256, after checking the file is there and is the pinned one. Never downloads."""
    path = CE.DEPTH_MODEL
    if path not in _MODEL_OK:
        if not os.path.isfile(path): raise SystemExit(f"the depth model is not at {path}; pass --depth-model or set AVT_DEPTH_MODEL (this tool does not download it)")
        got = sha256(path)
        if got != DEPTH_MODEL_SHA256: raise SystemExit(f"{path} is not the pinned depth model (sha256 {got[:12]}..., expected {DEPTH_MODEL_SHA256[:12]}...); not loading it")
        _MODEL_OK[path] = got
    return _MODEL_OK[path]


def local_path(path):
    """A file path for ffmpeg / ffprobe: absolute (so it can never read as an option) and a local file only."""
    if "://" in path or path.startswith(("-", "pipe:", "concat:", "subfile,")): raise SystemExit(f"not a local file path: {path}")
    return os.path.abspath(path)


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


def radius_map_px(inv_depth, mode, subject_m, focal_src, focal_tgt, f_stop, src_lens, frame_w_mm, width_px, crop):
    """Per-pixel blur radius (output pixels) from a map of 1 / distance-from-the-camera (1/m): the target lens's
    disc at each pixel's distance, minus (in quadrature) the disc the source lens already put there."""
    z = 1.0 / np.maximum(inv_depth, 1e-4)                                    # metres from the real camera
    focus = subject_m * focal_tgt / focal_src if mode == "same_framing" else subject_m
    zt = np.maximum(focus + (z - subject_m), focal_tgt / 1000.0 * 1.5)       # the same scene seen from the modelled camera
    def disc(f, n, s, zz): return f * f / (n * (s * 1000.0 - f)) * np.abs(zz - s) / zz
    r_t = 0.5 * disc(focal_tgt, f_stop, focus, zt) / frame_w_mm * width_px
    n_eq = src_lens["f_stop"] * src_lens["focal_eq_mm"] / src_lens["real_focal_mm"]
    r_s = 0.5 * disc(src_lens["focal_eq_mm"], n_eq, subject_m, z) / frame_w_mm * width_px * crop
    return np.sqrt(np.maximum(0.0, r_t * r_t - r_s * r_s)).astype(np.float32)


def metric_inverse_depth(rel, near_rel, far_rel, subject_m, far_m):
    """The model's relative depth (bigger = nearer) tied to metres at two points: `near_rel` is at subject_m,
    `far_rel` is at far_m (None = far away, 1/distance 0). Returns 1 / distance (1/m), linear between and beyond."""
    inv_far = 0.0 if not far_m else 1.0 / far_m
    return np.maximum(inv_far + (rel - far_rel) * (1.0 / subject_m - inv_far) / (near_rel - far_rel), 1e-4).astype(np.float32)


def camera_shift_px(a, b, alpha_a=None, alpha_b=None):
    """How far the BACKGROUND moved between two frames, in pixels: corner points outside his matte, followed from
    one frame to the other, median displacement. He is left out because he is allowed to move; the camera is not.
    Falls back to phase correlation of the whole picture when the background has too few points to follow."""
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY); gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    mask = np.full(ga.shape, 255, np.uint8)
    for al in (alpha_a, alpha_b):
        if al is not None: mask[cv2.dilate(al, np.ones((25, 25), np.uint8)) > 0.02] = 0
    pts = cv2.goodFeaturesToTrack(ga, 400, 0.01, 8, mask=mask)
    if pts is not None and len(pts) >= 20:
        nxt, ok, _ = cv2.calcOpticalFlowPyrLK(ga, gb, pts, None, winSize=(31, 31), maxLevel=3)
        back, ok2, _ = cv2.calcOpticalFlowPyrLK(gb, ga, nxt, None, winSize=(31, 31), maxLevel=3)
        good = (ok.ravel() == 1) & (ok2.ravel() == 1) & (np.linalg.norm((back - pts).reshape(-1, 2), axis=1) < 1.0)
        if good.sum() >= 20: return float(np.median(np.linalg.norm((nxt - pts).reshape(-1, 2)[good], axis=1)))
    (dx, dy), _ = cv2.phaseCorrelate(ga.astype(np.float32), gb.astype(np.float32), cv2.createHanningWindow((ga.shape[1], ga.shape[0]), cv2.CV_32F))
    return float(math.hypot(dx, dy))


def clean_plate(samples, grow_px=6):
    """The scene with him taken out: per pixel the median of the frames where he is not, and where he stands in every
    sample, filled in from the surroundings. Only the depth model looks at this picture; it never reaches the output."""
    k = 2 * grow_px + 1; el = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    stack = np.stack([f.astype(np.float32) for f, _ in samples])
    gone = np.stack([cv2.dilate(a, el) > 0.02 for _, a in samples])
    stack[gone] = np.nan
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore"); plate = np.nanmedian(stack, axis=0)
    hole = np.isnan(plate[..., 0]); plate = np.where(hole[..., None], 0, plate).astype(np.uint8)
    if hole.any():
        H, W = hole.shape; sw, sh = max(1, W // 4), max(1, H // 4)
        small = cv2.resize(plate, (sw, sh), interpolation=cv2.INTER_AREA)
        hs = cv2.dilate(cv2.resize(hole.astype(np.uint8), (sw, sh), interpolation=cv2.INTER_NEAREST), np.ones((3, 3), np.uint8))
        filled = cv2.resize(cv2.inpaint(small, hs, 5, cv2.INPAINT_TELEA), (W, H), interpolation=cv2.INTER_LINEAR)
        plate = np.where(hole[..., None], filled, plate)
    return plate, hole


def static_inverse_depth(samples, subject_m, far_m, focus_at=None, depth_fn=None):
    """ONE map of 1 / distance (1/m) for a locked-off clip. samples: [(frame uint8, alpha float or None)].

    With his matte: the depth model reads a person's outline softly, which leaves a ghost of him in the wall's depth.
    So the map is taken from the scene with him REMOVED (clean_plate), where there is no outline to bleed. His own
    distance is found in each sample's with-him depth and carried into the clean map's scale by a straight-line fit
    on the pixels far from him (the model's scale and offset change from picture to picture).
    Without a matte (a scene without him): the median of the samples' depth, focused at `focus_at`."""
    if depth_fn is None:
        checked_depth_model(); depth_fn = CE.plate_depth
    if samples[0][1] is None:
        if focus_at is None: raise SystemExit("--depth without his matte needs --focus-at x,y (the point that is in focus)")
        rel = np.median(np.stack([depth_fn(f) for f, _ in samples]), axis=0).astype(np.float32)
        H, W = rel.shape; x = int(np.clip(focus_at[0] * W, 4, W - 5)); y = int(np.clip(focus_at[1] * H, 4, H - 5))
        near = float(np.median(rel[y - 4:y + 5, x - 4:x + 5])); nears = [near]
    else:
        plate, _ = clean_plate(samples); rel = depth_fn(plate)
        g = 2 * max(4, int(0.06 * rel.shape[1])) + 1; el = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (g, g))
        nears = []
        for frame, alpha in samples:
            if (alpha >= 1.0).sum() < 50: continue
            d = depth_fn(frame); away = cv2.dilate(alpha, el) < 0.02
            if away.sum() < 500: continue
            a_, b_ = np.polyfit(rel[away].ravel()[::7], d[away].ravel()[::7], 1)     # d = a * rel + b on the pixels far from him
            if a_ < 0.2: continue
            nears.append((float(np.median(d[alpha >= 1.0])) - b_) / a_)
        if not nears: raise SystemExit("could not place him in the depth map (his matte is empty or fills the frame); use --background-m")
        near = float(np.median(nears))
    far = float(np.percentile(rel, 2))
    if near - far < 0.05:
        raise SystemExit(f"the depth map does not separate the focus point from the background (near {near:.2f}, far {far:.2f}); use --background-m for a flat wall")
    inv = metric_inverse_depth(rel, near, far, subject_m, far_m)
    return inv, [{"near_rel": round(near, 4), "far_rel": round(far, 4), "near_rel_per_sample": [round(v, 4) for v in nears]}]


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


def depth_of_field(frame, alpha, radius, aspect=1.0, guard_px=3, levels=5, check=False):
    """frame: HxWx3 uint8; alpha: HxW float 0..1 (1 = him). The background blurred, him untouched.
    radius: one number (one background plane) or an HxW map of radii (a depth map); a map is rendered as a blend
    of `levels` blur levels. out = source + (1 - alpha) * (blurred background - sharp background): where he is
    solid this is the source."""
    lin = (frame.astype(np.float32) / 255.0) ** GAMMA
    k = 2 * int(guard_px) + 1
    grown = cv2.dilate(alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) if guard_px > 0 else alpha
    weight = 1.0 - grown                                    # the ring just outside his matte is kept out of the blur's source
    fill, den = blur_background(lin, weight, float(guard_px) + 3.0)       # what the background is under his soft edge
    sharp = np.where((alpha < 0.004)[..., None], lin, np.where((den > 0.02)[..., None], fill, lin))
    if np.ndim(radius) == 0:
        blurred, _ = blur_background(lin, weight, float(radius), aspect)
    else:
        r_max = float(radius.max())
        if r_max < 0.6: blurred = sharp
        else:
            stack = [sharp] + [blur_background(lin, weight, r_max * i / (levels - 1), aspect)[0] for i in range(1, levels)]
            blurred = CE.blend_levels(stack, radius / r_max); del stack
    out = lin + (1.0 - alpha)[..., None] * (blurred - sharp)
    out = (np.clip(out, 0, 1) ** (1.0 / GAMMA) * 255.0 + 0.5).astype(np.uint8)
    solid = alpha >= 1.0
    # MEASURED before anything is copied back: how far the blur maths moved his solid pixels. The formula adds
    # (1 - alpha) * something, so this is 0 unless the code is wrong; main() stops the run if it is not.
    drift = solid_drift(out, frame, solid)
    out[solid] = frame[solid]
    return (out, drift) if check else out


def solid_drift(out, frame, solid):
    """Largest difference (8-bit levels) between two pictures on his solid pixels; 0 when there are none."""
    return int(np.abs(out[solid].astype(np.int16) - frame[solid].astype(np.int16)).max()) if solid.any() else 0


def vignette_map(W, H):
    """The same falloff camera_coverage.render_2d feeds lens_post."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    return np.clip((r - 0.55) / 0.9, 0, 1) ** 1.5


def crop_to_lens(img, crop, about, interp, out_wh=None):
    """The view of a lens `crop` times longer from the same spot: crop about a point (fractions of the frame), scaled
    to out_wh (default: the picture's own size)."""
    H, W = img.shape[:2]; OW, OH = out_wh or (W, H)
    if crop <= 1.0 + 1e-6 and (OW, OH) == (W, H): return img
    cw, ch = W / crop, H / crop
    x0 = float(np.clip(about[0] * W - cw / 2, 0, W - cw)); y0 = float(np.clip(about[1] * H - ch / 2, 0, H - ch))
    sx, sy = OW / cw, OH / ch
    M = np.array([[sx, 0, -x0 * sx], [0, sy, -y0 * sy]], np.float32)
    return cv2.warpAffine(img, M, (OW, OH), flags=interp if sx >= 1 else cv2.INTER_AREA, borderMode=cv2.BORDER_REFLECT)


# ----------------------------------------------------------------------------- io
def probe(path):
    """(width, height, fps, frames, note) of the picture AS DISPLAYED: a rotation tag (a phone held upright stores a
    sideways picture) is applied, because ffmpeg applies it when it decodes. frames is a real count of decoded frames.
    fps is the average rate, so a clip whose frames are unevenly spaced keeps its length."""
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
                          "stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames:stream_side_data=rotation:stream_tags=rotate",
                          "-of", "json", local_path(path)], capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    def rate(v):
        a, b = (v or "0/1").split("/"); return float(a) / float(b) if float(b) else 0.0
    rot = 0.0
    for sd in s.get("side_data_list", []) or []:
        if "rotation" in sd: rot = float(sd["rotation"])
    if not rot and "rotate" in (s.get("tags") or {}): rot = float(s["tags"]["rotate"])
    w, h = int(s["width"]), int(s["height"])
    if int(round(abs(rot))) % 180 == 90: w, h = h, w
    r, avg = rate(s.get("r_frame_rate")), rate(s.get("avg_frame_rate"))
    fps = avg if avg > 0 else r
    note = None if (r <= 0 or abs(avg - r) / r < 0.005) else f"variable frame rate (nominal {r:.3f}, average {avg:.3f}): the output is constant-rate at the average"
    return w, h, fps, int(s["nb_read_frames"]), note


def reader(path, W, H, pix, first=0, count=None, picks=None):
    """Decoded frames by INDEX, never by clock: frames first .. first+count-1, or exactly the frames in `picks`.
    -fps_mode passthrough hands over each decoded frame once (no frame is repeated or dropped to fit a rate), so
    frame k of the picture and frame k of the matte are the same k (PROBLEM_INDEX: pair frame by frame)."""
    ch = 3 if pix == "bgr24" else 1
    sel = ""
    if picks is not None: sel = "select='" + "+".join(f"eq(n,{int(k)})" for k in sorted(set(picks))) + "',"; count = len(set(picks))
    elif first > 0: sel = f"select='gte(n,{int(first)})',"
    cmd = ["ffmpeg", "-v", "error", "-protocol_whitelist", "file", "-i", local_path(path), "-an", "-vf", f"{sel}scale={W}:{H}", "-fps_mode", "passthrough"]
    cmd += (["-frames:v", str(int(count))] if count else []) + ["-f", "rawvideo", "-pix_fmt", pix, "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    try:
        while True:
            buf = p.stdout.read(W * H * ch)
            if len(buf) < W * H * ch: break
            yield np.frombuffer(buf, np.uint8).reshape((H, W, 3) if ch == 3 else (H, W))
    finally:                                              # also when the caller stops early: end ffmpeg before its pipe closes
        if p.poll() is None: p.kill()
        p.stdout.close(); p.wait()


def writer(path, W, H, fps, crf):
    return subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", f"{fps:.6f}", "-i", "-",
                             "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
                             "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", local_path(path)], stdin=subprocess.PIPE)


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
    ap.add_argument("--alpha", default=None, help="his matte as a video (white = him), same frame count as --src")
    ap.add_argument("--lens", default="clean_50", help="lens character: a preset from lens_presets.json, or 'none'")
    ap.add_argument("--focal", type=float, default=None, help="target focal length, mm full-frame equivalent (default: the preset's)")
    ap.add_argument("--f-stop", type=float, default=None, help="target f-stop; omit for no depth of field")
    ap.add_argument("--mode", default="same_framing", choices=["same_framing", "same_position"])
    ap.add_argument("--subject-m", type=float, default=None, help="camera to him (or to the focus point) at the shoot, metres")
    ap.add_argument("--background-m", type=float, default=None, help="him to the background, metres: ONE plane, no model")
    ap.add_argument("--depth", action="store_true", help="a depth map of the scene instead of one plane (locked-off camera only)")
    ap.add_argument("--far-m", type=float, default=None, help="--depth: camera to the farthest thing in the picture, metres; omit for far away")
    ap.add_argument("--focus-at", default=None, help="--depth without a matte: the point in focus, fractions of the frame x,y")
    ap.add_argument("--depth-samples", type=int, default=5, help="--depth: frames the one depth map is the median of")
    ap.add_argument("--depth-model", default=os.environ.get("AVT_DEPTH_MODEL"), help="path of depth_anything_v2_small.onnx (default: camera_engine's cache)")
    ap.add_argument("--source-phone", default="iphone_14"); ap.add_argument("--source-lens", default="1x")
    ap.add_argument("--about", default="0.5,0.5", help="same_position: the point the crop is centred on, fractions of the frame")
    ap.add_argument("--out-short-px", type=int, default=0, help="short side of the output in pixels (default: the source's)")
    ap.add_argument("--start", type=float, default=0.0, help="start of the window in the source, seconds")
    ap.add_argument("--duration", type=float, default=None, help="length of the window, seconds (default: to the end)")
    ap.add_argument("--edge-guard-px", type=int, default=3, help="ring outside his matte kept out of the blur's source (stops a dark rim of him in the blur)")
    ap.add_argument("--crf", type=int, default=14)
    ap.add_argument("--max-frames", type=int, default=0)
    ap.add_argument("--compare", default=None, help="also write source | result side by side")
    ap.add_argument("--sheet", default=None, help="also write a still sheet: three frames and his outline enlarged")
    a = ap.parse_args()

    a.src = local_path(a.src); a.out = local_path(a.out)
    if a.alpha: a.alpha = local_path(a.alpha)
    if a.compare: a.compare = local_path(a.compare)
    if a.sheet: a.sheet = local_path(a.sheet)
    inputs = {os.path.realpath(p) for p in (a.src, a.alpha) if p}
    for w in (a.out, a.compare, a.sheet, a.out + ".json", a.out + ".blurmap.jpg", a.out + ".v.mp4", a.out + ".mux.mp4",
              a.compare and a.compare + ".v.mp4", a.compare and a.compare + ".mux.mp4"):
        if w and os.path.realpath(w) in inputs: raise SystemExit(f"{w} is one of the inputs: an output must not overwrite the source or the matte")
    presets = json.load(open(os.path.join(HERE, "lens_presets.json")))["presets"]
    if a.lens != "none" and a.lens not in presets: raise SystemExit(f"--lens is 'none' or one of: {', '.join(presets)}")
    lens = None if a.lens == "none" else dict(presets[a.lens])
    phone, diag = SG.load_phone(a.source_phone)
    if a.source_lens not in phone["lenses"]: raise SystemExit(f"--source-lens is one of: {', '.join(phone['lenses'])}")
    src_lens = phone["lenses"][a.source_lens]; focal_src = float(src_lens["focal_eq_mm"])
    focal = float(a.focal if a.focal else (lens["focal_mm"] if lens else focal_src))
    if a.f_stop is not None and a.f_stop <= 0: raise SystemExit("--f-stop must be above 0")
    if a.subject_m is not None and a.subject_m <= 0: raise SystemExit("--subject-m must be above 0")
    if a.background_m is not None and a.background_m <= 0: raise SystemExit("--background-m must be above 0")
    if a.far_m is not None and a.subject_m is not None and a.far_m <= a.subject_m: raise SystemExit("--far-m must be farther than --subject-m")
    def point(text, name):
        try: x, y = (float(v) for v in text.split(","))
        except ValueError: raise SystemExit(f"{name} is two numbers x,y between 0 and 1")
        if not (0 <= x <= 1 and 0 <= y <= 1): raise SystemExit(f"{name} is two numbers x,y between 0 and 1")
        return (x, y)
    W, H, fps, n, rate_note = probe(a.src)
    if rate_note: print(f"note: {rate_note}")
    if a.out_short_px:
        k = a.out_short_px / min(W, H); OW, OH = int(round(W * k / 2)) * 2, int(round(H * k / 2)) * 2
    else: OW, OH = W, H
    w_mm, _ = SG.frame_mm("vertical" if H > W else "horizontal", diag)
    crop = focal / focal_src if a.mode == "same_position" else 1.0
    if crop < 1.0 - 1e-6: raise SystemExit(f"{focal:g} mm is wider than the {focal_src:g} mm this was shot on; a wider view than was shot does not exist. Use --mode same_framing.")
    about = point(a.about, "--about")
    aspect = float(lens.get("bokeh_aspect", 1.0)) if lens else 1.0
    first = int(round(a.start * fps))                    # the window in FRAMES: the same indices for picture, matte and depth samples
    total = n - first if a.duration is None else int(round(a.duration * fps))
    total = min(total, n - first)
    if a.max_frames: total = min(total, a.max_frames)
    if first < 0 or total < 1: raise SystemExit(f"the window is empty: the clip has {n} frames, the window starts at frame {first}")
    win = dict(first=first, count=total)
    def view(img, interp): return crop_to_lens(img, crop, about, interp, (OW, OH))
    def frames_of(path, pix, **kw):                       # the source read at its own size when it is cropped, else straight at the output size
        if crop > 1.0 + 1e-6: return reader(path, W, H, pix, **kw)
        return reader(path, OW, OH, pix, **kw)
    def matte(raw): return view(np.clip((raw.astype(np.float32) - ALPHA_LO) / (ALPHA_HI - ALPHA_LO), 0, 1), cv2.INTER_LINEAR)

    radius = 0.0; depth_meta = None
    physics = {"mode": a.mode, "focal_target_mm": focal, "focal_source_mm": focal_src, "crop": round(crop, 4)}
    if a.f_stop:
        if a.subject_m is None: raise SystemExit("depth of field needs --subject-m (camera to him, or to the focus point)")
        if a.depth == (a.background_m is not None): raise SystemExit("depth of field needs exactly one of --background-m (one plane) or --depth (a depth map)")
        if not a.depth and not a.alpha: raise SystemExit("--background-m blurs one plane behind his matte: it needs --alpha")
        if a.alpha:
            aw, ah, _, an, _ = probe(a.alpha)
            if an != n: raise SystemExit(f"matte and picture must pair frame by frame: {a.alpha} has {an} frames, {a.src} has {n}")
            if abs(aw / ah - W / H) > 0.01: raise SystemExit(f"the matte is {aw}x{ah} and the picture {W}x{H}: not the same shape")
        physics.update({"f_stop": a.f_stop, "subject_m": a.subject_m, "bokeh_aspect": aspect})
        if not a.depth:
            focus_m, bg_m = target_distances(a.mode, a.subject_m, a.background_m, focal_src, focal)
            r_t = blur_radius_px(focal, a.f_stop, focus_m, bg_m, w_mm, OW)
            r_s = source_radius_px(src_lens, a.subject_m, a.background_m, w_mm, OW, crop)
            radius = math.sqrt(max(0.0, r_t * r_t - r_s * r_s))
            physics.update({"background_m": a.background_m, "modelled_focus_m": round(focus_m, 3),
                            "modelled_background_from_camera_m": round(bg_m, 3), "target_blur_radius_px": round(r_t, 2),
                            "source_blur_radius_px": round(r_s, 2), "applied_blur_radius_px": round(radius, 2),
                            "applied_blur_share_of_width": round(2 * radius / OW, 4)})
            print(f"depth of field: {focal:g} mm f/{a.f_stop:g} focused at {focus_m:.2f} m, background {bg_m:.2f} m from the camera -> "
                  f"blur disc {2 * r_t:.1f} px wide ({SG.blur_word(2 * r_t / OW)}); the source lens already gave {2 * r_s:.1f} px; applying {2 * radius:.1f} px")
        else:
            if a.depth_model: CE.DEPTH_MODEL = a.depth_model
            model_hash = checked_depth_model()
            k = max(2, min(a.depth_samples, total))
            picks = sorted({first + int(total * (q + 0.5) / k) for q in range(k)})
            times = [p_ / fps for p_ in picks]
            pics = list(frames_of(a.src, "bgr24", picks=picks))
            mats = list(frames_of(a.alpha, "gray", picks=picks)) if a.alpha else [None] * len(pics)
            if len(mats) != len(pics): raise SystemExit("matte and picture gave a different number of depth samples: they do not pair")
            samples = [(view(fr, cv2.INTER_LANCZOS4), None if m is None else matte(m)) for fr, m in zip(pics, mats)]
            del pics, mats
            if len(samples) < 2: raise SystemExit("could not read enough frames for the depth map")
            shift = max(camera_shift_px(samples[0][0], sm[0], samples[0][1], sm[1]) for sm in samples[1:])
            if shift > 2.0: raise SystemExit(f"the camera moves (the background shifts {shift:.1f} px across the depth samples). One depth map would smear; per-frame depth is not built. Use --background-m, or a locked-off stretch.")
            focus_at = point(a.focus_at, "--focus-at") if a.focus_at else None
            inv, anchors = static_inverse_depth(samples, a.subject_m, a.far_m, focus_at)
            radius = radius_map_px(inv, a.mode, a.subject_m, focal_src, focal, a.f_stop, src_lens, w_mm, OW, crop)
            cap = float(np.percentile(radius, 99.5)); radius = np.minimum(radius, cap)
            bgm = (samples[0][1] < 0.02) if samples[0][1] is not None else np.ones(radius.shape, bool)
            depth_meta = {"model": CE.DEPTH_MODEL, "model_sha256": model_hash, "sample_frames": picks, "samples_at_s": [round(t, 3) for t in times], "anchors": anchors,
                          "far_m": a.far_m, "camera_shift_px": round(shift, 2),
                          "distance_m_percentiles_5_50_95": [round(float(1 / np.percentile(inv[bgm], q)), 2) for q in (95, 50, 5)],
                          "blur_radius_px_percentiles_5_50_95": [round(float(np.percentile(radius[bgm], q)), 2) for q in (5, 50, 95)], "blur_radius_px_max": round(cap, 2)}
            physics["depth"] = depth_meta
            vis = cv2.applyColorMap(np.clip(radius / max(cap, 1e-6) * 255, 0, 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
            cv2.imwrite(a.out + ".blurmap.jpg", vis)
            d = depth_meta["distance_m_percentiles_5_50_95"]; r = depth_meta["blur_radius_px_percentiles_5_50_95"]
            print(f"depth map: background from {d[0]} m to {d[2]} m (middle {d[1]} m); camera shift {shift:.2f} px; "
                  f"blur disc {2 * r[0]:.1f} to {2 * r[2]:.1f} px wide (middle {2 * r[1]:.1f}, {SG.blur_word(2 * r[1] / OW)}); map saved to {a.out}.blurmap.jpg")
    if crop > 1.0:
        print(f"crop: {crop:.2f}x about {about} ({W / crop:.0f} source pixels across the {OW}-pixel frame)")

    has_dof = bool(a.f_stop) and float(np.max(radius)) >= 0.6
    vig = vignette_map(OW, OH) if lens else None
    rng = np.random.default_rng(11)
    temps = [a.out + ".v.mp4"] + ([a.compare + ".v.mp4"] if a.compare else [])
    worst = 0; done = 0; shots = {}; cover = []; zero = np.zeros((OH, OW), np.float32)
    want = {int(total * f) for f in (0.15, 0.5, 0.85)}
    try:
        enc = writer(temps[0], OW, OH, fps, a.crf)
        cmp_enc = writer(temps[1], 2 * OW, OH, fps, a.crf + 2) if a.compare else None
        alphas = frames_of(a.alpha, "gray", **win) if (a.alpha and has_dof) else None
        for i, frame in enumerate(frames_of(a.src, "bgr24", **win)):
            base = view(frame, cv2.INTER_LANCZOS4)
            out = base; al = None
            if has_dof:
                if alphas is not None:
                    raw = next(alphas, None)
                    if raw is None: raise SystemExit(f"the matte ran out at frame {i} of the window: matte and picture do not pair")
                    al = matte(raw); cover.append(float((al >= 1.0).mean()))
                out, drift = depth_of_field(base, zero if al is None else al, radius, aspect, a.edge_guard_px if al is not None else 0, check=True)
                worst = max(worst, drift)
            final = CE.lens_post(out, lens, (0.0, 0.0), rng, vig) if lens else out
            enc.stdin.write(final.tobytes())
            if cmp_enc: cmp_enc.stdin.write(np.hstack([label(base, "source"), label(final, f"{focal:g} mm" + (f" f/{a.f_stop:g}" if a.f_stop else "") + f" {a.lens}")]).tobytes())
            if a.sheet and i in want: shots[i] = (base.copy(), final.copy(), None if al is None else al.copy())
            done += 1
        enc.stdin.close(); enc.wait()
        if cmp_enc: cmp_enc.stdin.close(); cmp_enc.wait()
        if done != total: raise SystemExit(f"read {done} frames of the picture, expected {total}: not writing a clip of the wrong length")
        if alphas is not None:
            if next(alphas, None) is not None: raise SystemExit("the matte has frames left over after the picture ended: matte and picture do not pair")
            if max(cover) <= 0.0: raise SystemExit("his matte is empty on every frame (wrong file, or black = him?): nothing would be protected, so nothing was written")
            empty = sum(1 for c in cover if c <= 0.0)
            print(f"his matte is solid on {100 * float(np.median(cover)):.1f} % of the frame (least {100 * min(cover):.1f} %"
                  + (f"; EMPTY on {empty} of {done} frames, where the whole frame is blurred" if empty else "") + ")")
            print(f"max |out - source| inside his matte, before the lens character: {worst}  (measured before his pixels are copied back)")
            if worst != 0: raise SystemExit("the blur reached his solid pixels: this is a bug, nothing was written")
        finished = []
        for path, tmp in zip((a.out, a.compare), temps[:2] + [None]):
            if path is None: continue
            # The picture decides the length: the audio is cut to the frames written, never the frames to the audio.
            seek = (["-ss", f"{first / fps:.4f}"] if first else []) + ["-t", f"{done / fps:.4f}"]
            mux = path + ".mux.mp4"; temps.append(mux)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-protocol_whitelist", "file", "-i", tmp, "-protocol_whitelist", "file"] + seek + ["-i", a.src,
                            "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-f", "mp4", mux], check=True)
            finished.append((mux, path))
        for mux, path in finished: os.replace(mux, path)   # only now, with every file complete, does anything take its final name
    finally:                                              # fail closed: a run that stops leaves no half-written file, and never
        for tmp in temps:                                 # deletes or damages a file that was already at --out before it began
            if os.path.exists(tmp): os.remove(tmp)

    if a.sheet and shots:
        rows = []
        for i in sorted(shots):
            b, f, al = shots[i]; row = np.hstack([label(b, f"source f{i}"), label(f, "lens look")])
            if al is not None:
                ec = edge_crop(b, f, al)
                if ec is not None: row = np.hstack([row, cv2.resize(ec, (int(ec.shape[1] * OH / ec.shape[0]), OH))])
            rows.append(cv2.resize(row, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA))
        wmax = max(r.shape[1] for r in rows)
        cv2.imwrite(a.sheet, np.vstack([cv2.copyMakeBorder(r, 0, 0, 0, wmax - r.shape[1], cv2.BORDER_CONSTANT) for r in rows]), [cv2.IMWRITE_JPEG_QUALITY, 90])

    def sh(cmd):
        try: return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()
        except OSError: return ""
    commit = sh(["git", "-C", HERE, "rev-parse", "HEAD"])
    dirty = bool(sh(["git", "-C", HERE, "status", "--porcelain", "--", "lens_look.py", "shoot_guide.py", "camera_engine.py", "lens_presets.json", "phone_cameras.json"]))
    ffv = (sh(["ffmpeg", "-version"]).splitlines() or [""])[0]
    meta = {"tool": "scripts/edit/lens_look.py", "version": VERSION, "commit": commit, "uncommitted_changes": dirty, "ffmpeg": ffv,
            "arguments": {k: v for k, v in sorted(vars(a).items())},
            "model": None if depth_meta is None else "depth-anything-v2-small (ONNX): distances only, draws nothing", "seed": 11,
            "source": {"path": a.src, "sha256": sha256(a.src), "width": W, "height": H, "fps": fps, "frames": done, "first_frame": first, "start_s": round(first / fps, 4), "frame_rate_note": rate_note,
                       "camera": f"{phone['label']} {a.source_lens}", "lens": src_lens},
            "output": {"width": OW, "height": OH},
            "matte": None if not a.alpha else {"path": a.alpha, "sha256": sha256(a.alpha), "levels": [ALPHA_LO, ALPHA_HI]},
            "lens": {"preset": a.lens, "values": lens}, "physics": physics,
            "proof_max_diff_inside_matte": worst if cover else None,
            "matte_solid_share_of_frame": None if not cover else {"median": round(float(np.median(cover)), 4), "least": round(min(cover), 4), "empty_frames": sum(1 for c in cover if c <= 0.0)},
            "evidence": {"blur_size": "VERIFIED against the thin-lens formula (tests/test_lens_look.py); HYPOTHESIS that it matches a photograph through that lens until one is shot side by side",
                         "distances": "as given on the command line; with --depth, in between is the model's ESTIMATE tied to the two given distances",
                         "perspective": "NOT changed: it is the take's own"}}
    json.dump(meta, open(a.out + ".json", "w"), indent=1)
    print(f"wrote {a.out} ({done} frames) and {a.out}.json")


if __name__ == "__main__":
    main()
