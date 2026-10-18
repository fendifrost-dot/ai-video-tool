"""Composite a face-preserved performance (body-only swap output) over a MOVING plate, offline, $0.
usage: composite_over_plate.py <fg.mp4> <alpha.mp4> <plate.mp4|png> <out.mp4> [--scale S] [--cx X] [--plate-start T]
       [--exposure E] [--push P] [--seed N]

A port of the composite lane's frame recipe (src/lib/composite/pixels.ts, plate-composite-v3-2026-10-16), so the
offline result matches what the app's "Composite over plate" does. Added for the moving-environment test:
- placement: the performer is scaled by S (default 0.9) about the frame, bottom-anchored, his matte centre at x = X;
- exposure: an extra multiplier E on the performer before the recipe grade (the recipe grade is unchanged);
- camera: a slow push-in P (default 0.03 = 3 % over the shot), applied to the FINISHED frame so plate and performer
  move together (a camera move under a static matte would tear him off the plate).
The performer's frame times are the input's own; the plate is sampled at its own clock from --plate-start.
Colour only: the recipe grade and E change his colour/brightness, never his geometry; the face is not redrawn.
The matte is the composite lane's own (matte-video-proxy, Fal veed/video-background-removal alpha mp4), not the
RVM/rembg matte of the older scripts/edit/composite_environment.py.
Canonical use: docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md, "Moving environment"."""
import argparse, json, subprocess
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument("fg"); ap.add_argument("alpha"); ap.add_argument("plate"); ap.add_argument("out")
ap.add_argument("--scale", type=float, default=0.9); ap.add_argument("--cx", type=float, default=620)
ap.add_argument("--plate-start", type=float, default=0.0); ap.add_argument("--exposure", type=float, default=1.0)
ap.add_argument("--push", type=float, default=0.03); ap.add_argument("--seed", type=int, default=33)
ap.add_argument("--frames", type=int, default=0, help="render only the first N frames (0 = all)")
A = ap.parse_args()

def probe(p):
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=width,height,r_frame_rate", "-of", "json", p], capture_output=True, text=True).stdout)["streams"][0]
    n, d = s["r_frame_rate"].split("/"); return int(s["width"]), int(s["height"]), float(n) / float(d)

def read(p, w, h, gray=False):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-vf", f"scale={w}:{h}", "-f", "rawvideo",
                          "-pix_fmt", "gray" if gray else "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape((-1, h, w) if gray else (-1, h, w, 3))

W, H, FPS = probe(A.fg)
fg = read(A.fg, W, H)
al = read(A.alpha, W, H, gray=True)
n = min(len(fg), len(al)) if not A.frames else min(A.frames, len(fg), len(al))
if A.plate.lower().endswith((".png", ".jpg", ".jpeg")):
    pl = cv2.cvtColor(cv2.resize(cv2.imread(A.plate), (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)[None]
    PFPS = 1.0
else:
    _, _, PFPS = probe(A.plate); pl = read(A.plate, W, H)
print("fg", fg.shape, FPS, "alpha", al.shape, "plate", pl.shape, PFPS, "frames", n)

# ---- recipe constants (pixels.ts RECIPE / GRADE) ----
G = dict(brightness=-0.05, contrast=1.04, saturation=0.9,
         cb=dict(rs=0.08, gs=0.02, bs=-0.08, rm=0.05, gm=0.0, bm=-0.06, rh=0.06, gh=0.0, bh=-0.04))
blur = lambda x, s: cv2.GaussianBlur(x, (0, 0), s)
def erode(a, r): return cv2.erode(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
key = np.clip(120 + 140 * xx / W - 35 * yy / H, 0, 255) / 255.0   # key gradient (pixels.ts keyGradient)

def grade(rgb):
    r, g, b = rgb[..., 0] * key, rgb[..., 1] * key, rgb[..., 2] * key
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    pb = (b - y) / 1.8556 * G["saturation"]; pr = (r - y) / 1.5748 * G["saturation"]
    y2 = (y - 0.5) * G["contrast"] + 0.5 + G["brightness"]
    r = np.clip(y2 + 1.5748 * pr, 0, 1); b = np.clip(y2 + 1.8556 * pb, 0, 1)
    g = np.clip((y2 - 0.2126 * r - 0.0722 * b) / 0.7152, 0, 1)
    l = (np.maximum(np.maximum(r, g), b) + np.minimum(np.minimum(r, g), b)) * 0.5
    a, bb, sc = 4.0, 1 / 3, 0.7   # pixels.ts balanceWeights (ffmpeg colorbalance's lightness bands)
    ws = np.clip((bb - l) * a + 0.5, 0, 1) * sc
    wm = np.clip((l - bb) * a + 0.5, 0, 1) * np.clip((1 - bb - l) * a + 0.5, 0, 1) * sc
    wh = np.clip((l + bb - 1) * a + 0.5, 0, 1) * sc
    cb = G["cb"]
    return np.stack([np.clip(r + cb["rs"] * ws + cb["rm"] * wm + cb["rh"] * wh, 0, 1),
                     np.clip(g + cb["gs"] * ws + cb["gm"] * wm + cb["gh"] * wh, 0, 1),
                     np.clip(b + cb["bs"] * ws + cb["bm"] * wm + cb["bh"] * wh, 0, 1)], -1)

# placement from the matte's horizontal centre on the first frames
cols = np.where((al[: min(n, 30)].mean(0) > 128).any(0))[0]
mcx = (cols.min() + cols.max()) / 2 if len(cols) else W / 2
M = np.float32([[A.scale, 0, A.cx - A.scale * mcx], [0, A.scale, H - A.scale * H]])
rng = np.random.default_rng(A.seed)
vw = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                       "-r", f"{FPS:.6f}", "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p",
                       "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                       "-movflags", "+faststart", A.out], stdin=subprocess.PIPE)
for i in range(n):
    t = i / FPS
    p = pl[min(len(pl) - 1, int(round((A.plate_start + t) * PFPS)))].astype(np.float32) / 255
    f = cv2.warpAffine(fg[i], M, (W, H), flags=cv2.INTER_AREA, borderValue=0).astype(np.float32) / 255
    raw = cv2.warpAffine(al[i], M, (W, H), flags=cv2.INTER_AREA, borderValue=0).astype(np.float32) / 255
    # 1. matte eroded a pixel, feathered σ1, never past the raw matte
    a1 = blur(erode(raw, 1), 1.0); a1[raw < 0.08] = 0
    # 2. inner edge band
    inner = blur(erode(a1, 4), 5.0); edge = blur(np.clip(a1 - inner, 0, 1), 1.5) * a1
    # 2b. decontaminate the feather of the take's background
    out_w = (1 - raw)[..., None]
    bg = blur(f * out_w, 8.0) / np.maximum(blur(out_w[..., 0], 8.0)[..., None], 1e-3)
    feather = (raw > 0.08) & (raw < 0.98)
    fc = f.copy()
    fc[feather] = np.clip((f[feather] - (1 - raw[feather])[:, None] * bg[feather]) / np.maximum(raw[feather], 0.08)[:, None], 0, 1)
    # 3. key light + grade (+ exposure match)
    fgg = grade(np.clip(fc * A.exposure, 0, 1))
    # 4. plate soft σ1.2 and wide σ30
    soft, wide = blur(p, 1.2), blur(p, 30.0)
    # 5. over, then screen wrap on the inner band; 6. grain 7
    screen = 1 - (1 - fgg) * (1 - wide)
    wrap = fgg * 0.5 + screen * 0.5
    base = soft * (1 - a1[..., None]) + fgg * a1[..., None]
    v = base * (1 - edge[..., None]) + wrap * edge[..., None]
    v = v + ((rng.random((H, W, 1)) - 0.5) * 7 / 255)
    # camera: slow push-in on the finished frame (plate and performer together)
    z = 1 + A.push * (i / max(1, n - 1))
    C = cv2.getRotationMatrix2D((W / 2, H * 0.45), 0, z)
    v = cv2.warpAffine(np.clip(v, 0, 1), C, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    vw.stdin.write((v * 255).round().astype(np.uint8).tobytes())
vw.stdin.close(); vw.wait()
print("wrote", A.out, "scale", A.scale, "cx", A.cx, "matte centre", mcx, "exposure", A.exposure, "push", A.push)
