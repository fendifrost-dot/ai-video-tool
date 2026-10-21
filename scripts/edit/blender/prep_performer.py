"""Prepare the approved performance as a texture for the Blender card, $0. Geometry and matte only: no grade.
usage: prep_performer.py <fg.mp4> <alpha.mp4> <out_dir> --roll DEG --scale S [--matte-hold LO,HI]

--matte-hold: the approved take repeats most frames in pairs (29.97 content in a 59.94 file) but its matte was cut
on every frame, so on a repeated frame his picture holds still while the matte's edge jumps (flashing at his
outline). With LO,HI (8-bit levels) the matte follows the take's picture: where the picture changed by under LO
(blurred, per pixel) the previous frame's matte is kept, over HI the frame's own matte is used, a blend between.
His pixels are never changed by it, only where the cut-out edge falls.
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
ap.add_argument("--matte-hold", default="", help="LO,HI: keep the previous matte where the picture did not change")
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
hold = [float(v) for v in A.matte_hold.split(",")] if A.matte_hold else None
n = 0; prev_f = prev_raw = None; held = 0.0
for i, (f8, a8) in enumerate(zip(frames(A.fg), frames(A.alpha, gray=True))):
    f = f8.astype(np.float32) / 255
    raw = a8.astype(np.float32) / 255
    if hold and prev_f is not None:
        d = blur(np.abs(f - prev_f).max(2) * 255, 2.0)                # how much his picture changed here
        w = np.clip((d - hold[0]) / (hold[1] - hold[0]), 0, 1)
        raw = w * raw + (1 - w) * prev_raw; held += float((w < 0.5).mean())
    prev_f, prev_raw = f, raw
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
      *(["matte held on", round(held / max(n - 1, 1), 3), "of the frame (mean)"] if hold else []))
