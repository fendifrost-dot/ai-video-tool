#!/usr/bin/env python3
"""
CAMERA ENGINE — a deterministic virtual camera over a matted performer and a depth-mapped plate.

  python3 scripts/edit/camera_engine.py --matte-dir cam/S11_matte --plate plates/hook.jpg \\
      --spec '{"move":{"type":"push","amount":0.18},"lens":"anamorphic_35","angle":{"keystone":0.05}}' \\
      --out cam/S11_push.mp4 [--audio cuts/S11_master.mp4] [--plate-depth plates/hook_depth.png]

Why (2026-10-01): the treatment speaks in camera language — "hero low push", "slider glide",
"crane descend", "fast orbit", "whip pan to reframe" — and the shot specs carry `framing`,
`cameraAngle` and `lens` fields, but the only camera the pipeline had was a 1.5 % plate push.
A generative camera (asking a video model to re-shoot the take) re-renders the performer and
comes back different every time. This camera keeps 100 % of the performer's pixels and is a
pure function of data: the same spec on the same inputs renders the same frames.

Model (nothing here knows a shot, a Look or a project):
  * Layers: the performer (alpha + decontaminated colour exported by composite_environment.py
    --export-matte) and the plate with a monocular depth map (Depth-Anything-v2 ONNX, computed
    here if not supplied). The performer's depth is read from the plate at his feet, so parallax
    is expressed relative to HIS plane: things nearer than him move more, farther move less.
  * Camera path: a per-frame state (zoom, pan, roll, keystone) from a MOVE (push, pull, truck,
    pedestal, crane, orbit, whip_pan, snap_zoom, dolly_zoom, static) with an easing curve over a
    window, plus optional handheld noise (sum of sines, seeded) — all from the spec.
  * Rendering: the plate is sampled through a backward map with per-pixel depth parallax (no
    holes); the performer is a rigid layer at parallax weight 1; both go through the same
    keystone/roll; the LENS post stack (presets in lens_presets.json) adds depth-of-field on the
    plate, perspective compression, barrel distortion, anamorphic flares, halation, chromatic
    aberration, vignette, grain, and motion blur proportional to the camera's own velocity.
  * Output: the video, the per-frame camera path (JSON, for provenance and for a UI to draw), a
    contact sheet.
"""
import argparse, json, math, os, subprocess, sys, tempfile
import cv2, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEPTH_MODEL = os.path.expanduser("~/.cache/avt/depth_anything_v2_small.onnx")
DEPTH_URL = "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx"


# ----------------------------------------------------------------------------- depth
def plate_depth(img, size=518):
    """relative inverse depth (bigger = nearer), normalised to [0, 1], from Depth-Anything-v2 small (ONNX, CPU)."""
    import onnxruntime as ort
    if not os.path.exists(DEPTH_MODEL):
        os.makedirs(os.path.dirname(DEPTH_MODEL), exist_ok=True); subprocess.run(["curl", "-sSL", "-o", DEPTH_MODEL, DEPTH_URL], check=True)
    s = ort.InferenceSession(DEPTH_MODEL, providers=["CPUExecutionProvider"])
    h, w = img.shape[:2]
    nh, nw = (size, int(round(size * w / h / 14)) * 14) if h >= w else (int(round(size * h / w / 14)) * 14, size)
    x = cv2.cvtColor(cv2.resize(img, (nw, nh)), cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    d = s.run(None, {"pixel_values": x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    d = cv2.resize(d, (w, h), interpolation=cv2.INTER_CUBIC)
    lo, hi = np.percentile(d, 1), np.percentile(d, 99)
    return np.clip((d - lo) / max(1e-6, hi - lo), 0, 1).astype(np.float32)


# ----------------------------------------------------------------------------- easing / path
def ease(t, kind):
    t = float(np.clip(t, 0, 1))
    if kind == "linear": return t
    if kind == "in": return t * t
    if kind == "out": return 1 - (1 - t) ** 2
    if kind == "snap": return 1 - (1 - t) ** 5
    return t * t * (3 - 2 * t)                       # in_out (smoothstep)


def handheld_noise(n, fps, strength, seed=7):
    """three low-frequency sines per axis with seeded phases: a breathing, not a shake."""
    rng = np.random.default_rng(seed); t = np.arange(n) / fps
    def chan(amp):
        v = np.zeros(n)
        for f, a in ((0.35, 1.0), (0.9, 0.5), (2.1, 0.22)):
            v += a * np.sin(2 * math.pi * f * t + rng.uniform(0, 2 * math.pi))
        return v / 1.72 * amp * strength
    return {"px": chan(0.012), "py": chan(0.009), "roll": chan(0.6), "zoom": chan(0.006)}


def camera_path(move, n, fps, handheld=0.0):
    """per-frame zoom (1 = base), pan (fractions of frame), roll (deg), plus flags for the move type."""
    kind = move.get("type", "static"); amt = float(move.get("amount", 0.0)); ez = move.get("ease", "in_out")
    t0, t1 = float(move.get("start", 0.0)), float(move.get("end", 1.0)); direction = move.get("direction", "right")
    sx = {"left": -1.0, "right": 1.0}.get(direction, 1.0); sy = {"up": -1.0, "down": 1.0}.get(direction, 1.0)
    zoom = np.ones(n); px = np.zeros(n); py = np.zeros(n); roll = np.zeros(n); plate_zoom = np.ones(n); orbit = np.zeros(n)
    for i in range(n):
        u = ease((i / max(1, n - 1) - t0) / max(1e-6, t1 - t0), ez)
        if kind == "push": zoom[i] = 1 + amt * u
        elif kind == "pull": zoom[i] = 1 + amt * (1 - u) if amt > 0 else 1.0
        elif kind == "truck": px[i] = sx * amt * u
        elif kind == "pedestal": py[i] = -sy * amt * u
        elif kind == "crane": py[i] = sy * amt * u; zoom[i] = 1 + 0.35 * amt * u           # a descend brings the camera closer too
        elif kind == "orbit": orbit[i] = sx * amt * u
        elif kind == "whip_pan": px[i] = sx * amt * (u - 1.0)                                # arrives on the frame: starts offset, lands centred
        elif kind == "snap_zoom": zoom[i] = 1 + amt * ease((i / max(1, n - 1) - t0) / max(1e-6, (t1 - t0)), "snap")
        elif kind == "dolly_zoom": plate_zoom[i] = 1 + amt * u                                # performer stays, the world rushes
    if handheld > 0:
        hh = handheld_noise(n, fps, handheld)
        px = px + hh["px"]; py = py + hh["py"]; roll = roll + hh["roll"]; zoom = zoom * (1 + hh["zoom"])
    return {"zoom": zoom, "px": px, "py": py, "roll": roll, "plate_zoom": plate_zoom, "orbit": orbit, "kind": kind}


# ----------------------------------------------------------------------------- image ops
def cover_fit(img, W, H, scale=1.0):
    h, w = img.shape[:2]; s = max(W / w, H / h) * scale
    out = cv2.resize(img, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_LANCZOS4 if s > 1 else cv2.INTER_AREA)
    if out.shape[0] < H or out.shape[1] < W:                      # scale < 1 (a wide lens shows more plate than exists): reflect-pad to cover
        ph, pw = max(0, H - out.shape[0]), max(0, W - out.shape[1])
        out = cv2.copyMakeBorder(out, ph // 2, ph - ph // 2, pw // 2, pw - pw // 2, cv2.BORDER_REFLECT_101)
    y0 = (out.shape[0] - H) // 2; x0 = (out.shape[1] - W) // 2
    return out[y0:y0 + H, x0:x0 + W]


def dof_levels(plate, max_px, aspect, levels=4):
    """blur pyramid of the plate: level k blurred by max_px * k / (levels-1), anisotropic for an anamorphic bokeh."""
    out = [plate]
    for k in range(1, levels):
        r = max_px * k / (levels - 1); kx = max(1, int(round(r * aspect)) | 1); ky = max(1, int(round(r)) | 1)
        out.append(cv2.GaussianBlur(plate, (kx, ky), 0))
    return out


def blend_levels(levels, amount):
    """amount in [0, 1] per pixel → linear blend between the two nearest blur levels."""
    L = len(levels) - 1; f = np.clip(amount, 0, 1) * L; lo = np.floor(f).astype(np.int32); w = (f - lo)[..., None]
    hi = np.minimum(lo + 1, L); st = np.stack(levels)                                    # (levels, H, W, 3)
    idx_lo = lo[None, ..., None]; idx_hi = hi[None, ..., None]
    a = np.take_along_axis(st, np.broadcast_to(idx_lo, (1,) + lo.shape + (3,)), axis=0)[0]
    b = np.take_along_axis(st, np.broadcast_to(idx_hi, (1,) + hi.shape + (3,)), axis=0)[0]
    return a * (1 - w) + b * w


_DISTORT_MAPS = {}
def radial_distort(img, k1):
    if abs(k1) < 1e-6: return img
    H, W = img.shape[:2]; key = (W, H, round(k1, 5))
    maps = _DISTORT_MAPS.get(key)
    if maps is None:                                     # the maps depend only on the frame size and k1: build once per run
        cx, cy = W / 2, H / 2; r0 = math.hypot(cx, cy)
        xs, ys = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
        nx, ny = (xs - cx) / r0, (ys - cy) / r0; r2 = nx * nx + ny * ny; f = 1 + k1 * r2
        maps = _DISTORT_MAPS[key] = ((cx + nx * f * r0).astype(np.float32), (cy + ny * f * r0).astype(np.float32))
    return cv2.remap(img, maps[0], maps[1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def chromatic(img, px):
    if px < 0.05: return img
    H, W = img.shape[:2]; cx, cy = W / 2, H / 2; r0 = math.hypot(cx, cy)
    xs, ys = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32)); nx, ny = (xs - cx) / r0, (ys - cy) / r0
    out = img.copy()
    for c, s in ((2, px), (0, -px)):                                                       # R out, B in (BGR order)
        out[..., c] = cv2.remap(img[..., c], (xs + nx * s).astype(np.float32), (ys + ny * s).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return out


def directional_blur(img, dx, dy):
    L = math.hypot(dx, dy)
    if L < 1.0: return img
    k = int(L) | 1; ker = np.zeros((k, k), np.float32); c = k // 2
    cv2.line(ker, (int(round(c - dx / 2)), int(round(c - dy / 2))), (int(round(c + dx / 2)), int(round(c + dy / 2))), 1.0, 1)
    ker /= max(1e-6, ker.sum()); return cv2.filter2D(img, -1, ker)


def lens_post(frame, lens, vel_px, grain_rng, vignette_map):
    """the lens character, in order: motion blur → distortion → flares/halation → chromatic → vignette → contrast/sat → grain."""
    f = frame.astype(np.float32) / 255.0
    if lens["motion_blur"] > 0 and (abs(vel_px[0]) + abs(vel_px[1])) > 1.0:
        f = directional_blur(f, vel_px[0] * lens["motion_blur"], vel_px[1] * lens["motion_blur"])
    f = radial_distort(f, lens["distortion"])
    luma = f @ np.array([0.114, 0.587, 0.299], np.float32)
    if lens["flare"] > 0:
        hi = np.clip((luma - lens["flare_threshold"]) / max(1e-3, 1 - lens["flare_threshold"]), 0, 1)
        kx = max(3, int(lens["flare_length"] * f.shape[1]) | 1); streak = cv2.blur(hi, (kx, 3)); streak = cv2.GaussianBlur(streak, (0, 0), 2.5)
        f = f + streak[..., None] * np.array(lens["flare_color"], np.float32)[None, None, :] * lens["flare"] * 1.6
    if lens["halation"] > 0:
        hi = np.clip((luma - 0.75) / 0.25, 0, 1); glow = cv2.GaussianBlur(hi, (0, 0), 18)
        f = f + glow[..., None] * np.array(lens["halation_color"], np.float32)[None, None, :] * lens["halation"]
    f = np.clip(f, 0, 1)
    f = chromatic(f, lens["chromatic"] * 2.5)
    f = f * (1 - lens["vignette"] * vignette_map)[..., None]
    f = np.clip((f - 0.5) * lens["contrast"] + 0.5, 0, 1)
    if abs(lens["saturation"] - 1) > 1e-3:
        g = f @ np.array([0.114, 0.587, 0.299], np.float32); f = np.clip(g[..., None] + (f - g[..., None]) * lens["saturation"], 0, 1)
    if lens["grain"] > 0:
        noise = grain_rng.normal(0, 1, f.shape[:2]).astype(np.float32); noise = cv2.GaussianBlur(noise, (0, 0), 0.6)
        f = np.clip(f + (noise * lens["grain"] * (0.35 + 0.65 * (1 - luma)))[..., None], 0, 1)
    return (f * 255).astype(np.uint8)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--matte-dir", required=True, help="alpha_%05d.png + fg_%05d.png from composite_environment.py --export-matte")
    ap.add_argument("--plate", required=True, help="a still, or a VIDEO (living plate): decoded at --fps and read frame-for-frame; depth is measured on its first frame (plate cameras in our worlds move slowly — the parallax field holds)")
    ap.add_argument("--plate-depth", default=None, help="16-bit PNG, bigger = nearer; computed with Depth-Anything-v2 if absent")
    ap.add_argument("--plate-offset", type=float, default=0.0, help="video plate: start this many seconds into the plate"); ap.add_argument("--plate-loop", action="store_true", help="video plate: loop when shorter than the matte (default: hold the last frame)")
    ap.add_argument("--plate-depth-every", type=int, default=0, help="video plate: recompute depth every N plate frames (0 = first frame only)")
    ap.add_argument("--spec", required=True, help="JSON (inline or path): move, lens, angle, framing, handheld, focus")
    ap.add_argument("--out", required=True); ap.add_argument("--audio", default=None, help="clip whose audio track is copied onto the output")
    ap.add_argument("--fps", type=int, default=24); ap.add_argument("--size", default="1080x1920"); ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--lens-presets", default=os.path.join(HERE, "lens_presets.json"))
    ap.add_argument("--near-weight", type=float, default=1.6, help="parallax weight of the nearest plate pixel relative to the performer's plane")
    ap.add_argument("--far-weight", type=float, default=0.35, help="parallax weight of the farthest plate pixel relative to the performer's plane")
    ap.add_argument("--dof-max-px", type=float, default=14.0, help="plate blur (px at 1080 wide) one full depth unit away from focus, at dof = 1")
    ap.add_argument("--overscan", type=float, default=None, help="plate overscan factor; auto from the move when absent")
    ap.add_argument("--max-overscan", type=float, default=2.2, help="cap for the auto overscan (whip pans beyond it rely on the reflect border)")
    ap.add_argument("--sheet", default=None, help="contact sheet path (default next to --out)")
    ap.add_argument("--range", default=None, help="a:b frame range of the matte to render (default all)")
    ap.add_argument("--label", default=None, help="burn a small label into the output (for contact videos)")
    a = ap.parse_args()
    W, H = (int(v) for v in a.size.lower().split("x"))
    spec = json.load(open(a.spec)) if os.path.exists(a.spec) else json.loads(a.spec)
    presets = json.load(open(a.lens_presets))["presets"]
    lens_spec = spec.get("lens", "clean_50"); lens = dict(presets[lens_spec if isinstance(lens_spec, str) else lens_spec.get("preset", "clean_50")])
    if isinstance(lens_spec, dict): lens.update({k: v for k, v in lens_spec.items() if k != "preset"})
    move = spec.get("move", {"type": "static"}); angle = spec.get("angle", {}); framing = spec.get("framing", {})
    handheld = float(spec.get("handheld", lens.get("handheld_default", 0.0))); focus = spec.get("focus", "performer")

    alphas = sorted(f for f in os.listdir(a.matte_dir) if f.startswith("alpha_"))
    if a.range:
        r0, r1 = (int(v) for v in a.range.split(":")); alphas = alphas[r0:r1]
    n = len(alphas)
    if n == 0: raise SystemExit("no alpha_*.png in --matte-dir")
    grade = spec.get("grade", {"cool": 0.06, "contrast": 1.06})
    path = camera_path(move, n, a.fps, handheld)

    # ---- plate (still or video), depth, overscan
    plate_frames = None
    if a.plate.lower().endswith((".mp4", ".mov", ".webm", ".mkv")):
        ptmp = tempfile.mkdtemp(prefix="avt_cam_plate_")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a.plate_offset:.3f}", "-i", a.plate, "-vf", f"fps={a.fps}", os.path.join(ptmp, "p_%05d.png")], check=True)
        plate_frames = sorted(os.path.join(ptmp, f) for f in os.listdir(ptmp) if f.startswith("p_"))
        if not plate_frames: raise SystemExit("video plate decoded to no frames")
        plate0 = cv2.imread(plate_frames[0])
    else:
        plate0 = cv2.imread(a.plate)
    # the compositor's plate-aware grade travels with the matte export (grade.json) unless the spec sets its own grade
    gpath = os.path.join(a.matte_dir, "grade.json")
    if "grade" not in spec and os.path.exists(gpath):
        try: grade = json.load(open(gpath))
        except Exception: pass
    if a.plate_depth and os.path.exists(a.plate_depth):
        d16 = cv2.imread(a.plate_depth, cv2.IMREAD_UNCHANGED); depth0 = (d16.astype(np.float32) / (65535.0 if d16.dtype == np.uint16 else 255.0))
    else:
        depth0 = plate_depth(plate0)
        if a.plate_depth: cv2.imwrite(a.plate_depth, (depth0 * 65535).astype(np.uint16))
    max_pan = float(max(np.abs(path["px"]).max(), np.abs(path["py"]).max(), np.abs(path["orbit"]).max() * a.near_weight))
    min_zoom = float(min(path["zoom"].min(), 1.0)); kst = abs(float(angle.get("keystone", 0.0)))
    over = a.overscan or min(a.max_overscan, 1.0 + 2 * max_pan * a.near_weight + (1 / min_zoom - 1) + kst + 0.08)   # beyond the cap the reflect border carries a whip; upscaling a plate 4x buys nothing
    comp = float(lens["compression"])
    PW, PH = int(round(W * over)), int(round(H * over))
    plate = cover_fit(plate0, PW, PH, scale=comp).astype(np.float32)
    depth = cover_fit((depth0 * 65535).astype(np.uint16), PW, PH, scale=comp).astype(np.float32) / 65535.0
    def plate_frame(i):
        """The fitted plate for output frame i (a still: always the same array)."""
        if plate_frames is None: return plate
        k = (i % len(plate_frames)) if a.plate_loop else min(i, len(plate_frames) - 1)
        return cover_fit(cv2.imread(plate_frames[k]), PW, PH, scale=comp).astype(np.float32)

    # ---- performer plane: depth at the feet (lowest alpha rows), median over the clip
    feet = []
    for i in range(0, n, max(1, n // 8)):
        al = cv2.imread(os.path.join(a.matte_dir, alphas[i]), cv2.IMREAD_GRAYSCALE)
        rows = np.where((al > 128).any(axis=1))[0]
        if len(rows): feet.append(int(rows.max()))
    feet_y = int(np.median(feet)) if feet else int(H * 0.9)
    fs = float(framing.get("scale", 1.0)); fx_, fy_ = float(framing.get("x", 0.0)), float(framing.get("y", 0.0))
    # where the feet land on the plate (base placement), in plate coordinates
    ox, oy = (PW - W) / 2, (PH - H) / 2
    feet_plate_y = int(np.clip(oy + H / 2 + (feet_y - H / 2) * fs + fy_ * H, 0, PH - 1))
    dn_p = float(np.median(depth[max(0, feet_plate_y - 8):feet_plate_y + 8, int(PW * 0.3):int(PW * 0.7)]))
    if not np.isfinite(dn_p): raise SystemExit(f"performer plane depth undefined (feet_plate_y={feet_plate_y}, depth shape {depth.shape}, plate {PW}x{PH})")
    print(f"performer plane: feet row {feet_y}, plate depth {dn_p:.3f}; overscan {over:.3f}; lens {lens_spec}; move {move}", flush=True)
    # parallax weight relative to the performer: 1 at his plane, near_weight at dn=1, far_weight at dn=0
    w_par = np.where(depth >= dn_p, 1 + (a.near_weight - 1) * (depth - dn_p) / max(1e-3, 1 - dn_p), a.far_weight + (1 - a.far_weight) * depth / max(1e-3, dn_p)).astype(np.float32)
    w_orb = (depth - dn_p).astype(np.float32)                                              # orbit: sign flips at his plane

    # ---- depth of field on the plate (precomputed levels; focus on the performer's plane or the plate's near/far)
    focus_dn = dn_p if focus == "performer" else (float(focus) if not isinstance(focus, str) else 0.5)
    dof_amt = np.clip(np.abs(depth - focus_dn) * lens["dof"] * 1.6, 0, 1)
    dof_amt_half = cv2.resize(dof_amt, (PW // 2, PH // 2), interpolation=cv2.INTER_AREA)
    dof_mix = np.clip(dof_amt * 8.0, 0, 1)[..., None]            # where the plate is in focus keep the full-res pixels
    def plate_with_dof(pl, fast=False):
        if lens["dof"] <= 0: return pl
        if not fast:
            lv = dof_levels(pl, a.dof_max_px * (W / 1080.0), lens["bokeh_aspect"], levels=4); out = blend_levels(lv, dof_amt); del lv; return out
        # video plates, per frame: the blur pyramid at half resolution (a defocus is low-frequency), blended back
        # under the sharp full-res plate where the focus map says sharp — ~4× cheaper, same picture
        half = cv2.resize(pl, (PW // 2, PH // 2), interpolation=cv2.INTER_AREA)
        lv = dof_levels(half, a.dof_max_px * (W / 1080.0) / 2.0, lens["bokeh_aspect"], levels=4); bl = blend_levels(lv, dof_amt_half); del lv
        up = cv2.resize(bl, (PW, PH), interpolation=cv2.INTER_LINEAR)
        return pl * (1 - dof_mix) + up * dof_mix
    plate_dof = plate_with_dof(plate)

    # ---- geometry helpers
    xs, ys = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32)); cx, cy = W / 2, H / 2
    vign = np.clip(np.sqrt(((xs - cx) / cx) ** 2 + ((ys - cy) / cy) ** 2) / 1.42, 0, 1) ** 2.2
    grain_rng = np.random.default_rng(11); tmp = tempfile.mkdtemp(prefix="avt_cam_"); cam_log = []; prev = None

    for i in range(n):
        Z = float(path["zoom"][i]); PZ = float(path["plate_zoom"][i]); px, py = float(path["px"][i]), float(path["py"][i]); orb = float(path["orbit"][i]); roll = float(path["roll"][i])
        # --- plate through the camera: backward map with per-pixel parallax (depth sampled at the destination)
        # destination pixel (x,y) in the output frame → plate coordinates
        dx = xs - cx; dy = ys - cy
        # depth at the destination: look up the plate depth under the un-zoomed position (first-order)
        mx0 = (ox + cx + dx / (Z * PZ)).astype(np.float32); my0 = (oy + cy + dy / (Z * PZ)).astype(np.float32)
        d_dst = cv2.remap(depth, mx0, my0, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        wp = cv2.remap(w_par, mx0, my0, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE); wo = cv2.remap(w_orb, mx0, my0, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        zpix = 1 + (Z - 1) * wp; zpix = zpix * (1 + (PZ - 1) * wp)
        mx = ox + cx + dx / zpix - (px * W) * wp - orb * W * wo
        my = oy + cy + dy / zpix - (py * H) * wp
        if plate_frames is not None and i > 0: plate_dof = plate_with_dof(plate_frame(i), fast=True)   # living plate: this frame's picture through the same depth field
        bg = cv2.remap(plate_dof, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        # --- performer: rigid layer at weight 1 (framing first, then the camera)
        al = cv2.imread(os.path.join(a.matte_dir, alphas[i]), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255.0
        fg = cv2.imread(os.path.join(a.matte_dir, alphas[i].replace("alpha_", "fg_"))).astype(np.float32)
        s_p = fs * Z; tx = cx - cx * s_p + (fx_ + px) * W + fx_ * 0; ty = cy - cy * s_p + (fy_ + py) * H
        M = np.array([[s_p, 0, tx], [0, s_p, ty]], np.float32)
        fg_w = cv2.warpAffine(fg, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
        al_w = cv2.warpAffine(al, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)[..., None]
        if focus != "performer" and lens["dof"] > 0:                                           # focus on the plate: the performer softens instead
            k = max(1, int(a.dof_max_px * lens["dof"] * 0.6) | 1); fg_w = cv2.GaussianBlur(fg_w, (k, k), 0); al_w = cv2.GaussianBlur(al_w, (k, k), 0)[..., None] if al_w.ndim == 2 else cv2.GaussianBlur(al_w[..., 0], (k, k), 0)[..., None]
        # the performer's grade so he sits in the room (the same light cool the compositor applied)
        if "L_gain" in grade:
            # the compositor's plate-aware grade (composite_environment.py --match-plate), same numbers, same result
            lab = cv2.cvtColor(np.clip(fg_w, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
            lab[..., 0] = np.clip((lab[..., 0] - grade["fg_L_mean"]) * grade["L_gain"] + grade["fg_L_mean"] + grade["L_shift"], 0, 255)
            lab[..., 1] = np.clip(lab[..., 1] + grade["a_shift"], 0, 255); lab[..., 2] = np.clip(lab[..., 2] + grade["b_shift"], 0, 255)
            fg_w = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
        else:
            cool = float(grade.get("cool", 0.0)); fg_w = fg_w * np.array([1 - cool, 1 - cool * 0.4, 1 + cool * 0.6], np.float32)
            fg_w = np.clip((fg_w - 128) * float(grade.get("contrast", 1.0)) + 124, 0, 255)
        frame = fg_w * al_w + bg * (1 - al_w)
        # --- angle: keystone (+ = looking up, bottom wider) and roll, as one perspective warp of the whole frame
        k = float(angle.get("keystone", 0.0)); rd = roll + float(angle.get("roll_deg", 0.0))
        if abs(k) > 1e-4 or abs(rd) > 1e-3:
            src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
            dst = np.float32([[W * k * 0.5, 0], [W - W * k * 0.5, 0], [W + W * k * 0.5, H], [-W * k * 0.5, H]]) if k >= 0 else np.float32([[-W * -k * 0.5, 0], [W + W * -k * 0.5, 0], [W - W * -k * 0.5, H], [W * -k * 0.5, H]])
            Hm = cv2.getPerspectiveTransform(src, dst); R = np.vstack([cv2.getRotationMatrix2D((cx, cy), rd, 1.0 + abs(k) * 0.6), [0, 0, 1]]).astype(np.float32)
            frame = cv2.warpPerspective(frame, (R @ Hm).astype(np.float32), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        # --- camera velocity (px/frame) for motion blur
        vel = (0.0, 0.0)
        if prev is not None: vel = ((px - prev[0]) * W + (Z - prev[2]) * 0.0, (py - prev[1]) * H)
        prev = (px, py, Z)
        out = lens_post(np.clip(frame, 0, 255).astype(np.uint8), lens, vel, grain_rng, vign)
        if a.label: cv2.putText(out, a.label, (24, H - 36), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 0), 6); cv2.putText(out, a.label, (24, H - 36), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2)
        cv2.imwrite(os.path.join(tmp, f"c_{i:05d}.png"), out)
        # edge reveal: a performer the source frame cuts (hips at the bottom edge) must never lift off that edge
        bottom_rows = np.where((al_w[..., 0] > 0.5).any(axis=1))[0]; src_rows = np.where((al > 0.5).any(axis=1))[0]
        reveal = bool(len(src_rows) and src_rows.max() >= al.shape[0] - 2 and len(bottom_rows) and bottom_rows.max() < H - 2)
        cam_log.append({"frame": i, "zoom": round(Z, 5), "plate_zoom": round(PZ, 5), "pan": [round(px, 5), round(py, 5)], "orbit": round(orb, 5), "roll": round(roll, 3), "vel_px": [round(v, 2) for v in vel], "edge_reveal": reveal})
        if i % 48 == 0: print(f"camera {i + 1}/{n}", flush=True)

    cmd = ["ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i", os.path.join(tmp, "c_%05d.png")]
    if a.audio:
        ss = (int(a.range.split(":")[0]) / a.fps) if a.range else 0.0
        cmd += ["-ss", f"{ss:.4f}", "-i", a.audio, "-map", "0:v", "-map", "1:a?", "-c:a", "aac", "-b:a", "160k", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", a.out]
    subprocess.run(cmd, check=True)
    base = os.path.splitext(a.out)[0]
    reveals = [c["frame"] for c in cam_log if c["edge_reveal"]]
    if reveals: print(f"WARNING: the move lifts the performer's cut edge off the frame bottom on {len(reveals)} frames (first {reveals[0]}) — reduce the vertical pan / zoom-out or use a source with more headroom", flush=True)
    json.dump({"spec": spec, "lens": lens, "size": [W, H], "fps": a.fps, "frames": n, "performer_plane_depth": dn_p, "overscan": over, "edge_reveal_frames": reveals, "path": cam_log}, open(base + "_camera.json", "w"), indent=1)
    idx = [int(n * f) for f in (0.0, 0.33, 0.66, 0.98)]; tiles = [cv2.resize(cv2.imread(os.path.join(tmp, f"c_{i:05d}.png")), (W // 3, H // 3)) for i in idx]
    cv2.imwrite(a.sheet or (base + "_sheet.jpg"), np.hstack(tiles), [cv2.IMWRITE_JPEG_QUALITY, 86])
    for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    if plate_frames is not None:
        for f in plate_frames: os.remove(f)
        os.rmdir(os.path.dirname(plate_frames[0]))
    print(f"wrote {a.out} ({n} frames @ {a.fps} fps)")


if __name__ == "__main__":
    main()
