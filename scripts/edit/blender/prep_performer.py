"""Prepare the approved performance as a texture for the Blender card, $0. Geometry and matte only: no grade.
usage: prep_performer.py <fg.mp4> <alpha.mp4> <out_dir> --roll DEG --scale S [--matte-hold LEVELS]

--matte-hold: the approved take repeats most frames (24p content in a 59.94 file: a new picture every 2-3 frames) but its matte was cut
on every frame, so on a repeated frame his picture holds still while the matte's edge jumps (flashing at his
outline). With LEVELS, a frame whose picture differs from the previous one by under LEVELS (99.5th percentile of the
per-pixel change, at 540x960 after a 1 px blur) is a repeat and reuses the previous frame's matte exactly; every
new picture uses its own matte. Whole frames only: a per-pixel blend left partial edges held over still background,
which piled up into ghost trails. His pixels are never changed by it, only where the cut-out edge falls.
Per frame, in the take's own pixels (the composite lane's recipe, src/lib/composite/pixels.ts, steps 1 and 2b):
  1. matte eroded 1 px, feathered sigma 1, zero below 0.08 of the raw matte;
  2. the feather's colour decontaminated of the take's background (sigma 8);
then the whole frame is rotated by --roll (the source phone's measured roll) and scaled by --scale with area
filtering on premultiplied colour, so Blender minifies by no more than ~10 % (Cycles has no mipmaps).
Writes <out_dir>/p_0001.png ... straight-alpha RGBA, 16-bit. His pixels are resampled once, never redrawn."""
import argparse, os, subprocess
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument("fg"); ap.add_argument("alpha"); ap.add_argument("out")
ap.add_argument("--roll", type=float, required=True); ap.add_argument("--scale", type=float, required=True)
ap.add_argument("--matte-hold", type=float, default=0, help="LEVELS: on a repeated picture, reuse the previous matte")
A = ap.parse_args()
W, H = 1080, 1920
os.makedirs(A.out, exist_ok=True)

def frames(p, gray=False):
    pr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", p, "-vf", f"scale={W}:{H}", "-f", "rawvideo",
                           "-pix_fmt", "gray" if gray else "rgb24", "-"], stdout=subprocess.PIPE)
    n = W * H * (1 if gray else 3)
    while len(b := pr.stdout.read(n)) == n:
        yield np.frombuffer(b, np.uint8).reshape((H, W) if gray else (H, W, 3))

blur = lambda x, s: cv2.GaussianBlur(x, (0, 0), s)
erode = lambda a, r: cv2.erode(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
R = cv2.getRotationMatrix2D((W / 2, H / 2), A.roll, 1.0)
w2, h2 = round(W * A.scale), round(H * A.scale)
n = 0; prev_small = prev_raw = None; held = 0
for i, (f8, a8) in enumerate(zip(frames(A.fg), frames(A.alpha, gray=True))):
    f = f8.astype(np.float32) / 255
    raw = a8.astype(np.float32) / 255
    small = blur(cv2.resize(f8, (540, 960), interpolation=cv2.INTER_AREA).astype(np.float32), 1.0)
    if A.matte_hold and prev_small is not None and np.percentile(np.abs(small - prev_small).max(2), 99.5) < A.matte_hold:
        raw = prev_raw; held += 1                                     # the same picture: the same matte
    prev_small, prev_raw = small, raw
    a1 = blur(erode(raw, 1), 1.0); a1[raw < 0.08] = 0
    out_w = (1 - raw)[..., None]
    bg = blur(f * out_w, 8.0) / np.maximum(blur(out_w[..., 0], 8.0)[..., None], 1e-3)
    feather = (raw > 0.08) & (raw < 0.98)
    fc = f.copy()
    fc[feather] = np.clip((f[feather] - (1 - raw[feather])[:, None] * bg[feather])
                          / np.maximum(raw[feather], 0.08)[:, None], 0, 1)
    pm = np.dstack([fc * a1[..., None], a1])                          # premultiplied, for filtering
    pm = cv2.warpAffine(pm, R, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
    pm = cv2.resize(pm, (w2, h2), interpolation=cv2.INTER_AREA)
    a = pm[..., 3:]
    rgb = np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0)
    out = np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])
    cv2.imwrite(os.path.join(A.out, f"p_{i + 1:04d}.png"),
                cv2.cvtColor((out * 65535).round().astype(np.uint16), cv2.COLOR_RGBA2BGRA))
    n += 1
print("wrote", n, "frames", w2, "x", h2, "roll", A.roll, "scale", A.scale,
      *(["matte reused on", held, "repeated frames"] if A.matte_hold else []))
