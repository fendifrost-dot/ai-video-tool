"""Match a pasted figure to its plate on a finished cover: matte him (RVM on a 3x crop), lift his exposure, mix in the
plate's cast, add the plate's grain to him only. The plate's pixels are never touched.

    python -I scripts/edit/cover_regrade_figure.py cover.jpg out.jpg --stops 0.55 --lift 10 --tint 0.12 --grain 1.3
    --centre 0.505,0.485 --half 0.12

Frost the Boss cover, 7 Nov 2026: his figure measured a mean luma of 21 against asphalt at 116 (crushed), and carried
none of the plate's grain (the paste downscaled it away). Fendi picked lift b (0.55 stops, +10, 12 % tint) with grain
g2 (1.3x the plate's residual, measured on a flat asphalt patch beside him).
"""
import argparse, os, numpy as np, cv2, onnxruntime as ort

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--stops", type=float, default=0.55); ap.add_argument("--lift", type=float, default=10.0)
ap.add_argument("--tint", type=float, default=0.12); ap.add_argument("--grain", type=float, default=1.3)
ap.add_argument("--centre", default="0.505,0.485", help="his centre as fractions of the picture"); ap.add_argument("--half", type=float, default=0.12)
ap.add_argument("--seed", type=int, default=11)
a = ap.parse_args()
img = cv2.imread(a.src)[:, :, ::-1].astype(np.float32); P = img.shape[0]
fx, fy = (float(v) for v in a.centre.split(",")); cx, cy, half = int(P * fx), int(P * fy), int(P * a.half)
crop = img[cy - half:cy + half, cx - half:cx + half]
up = cv2.resize(crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
sess = ort.InferenceSession(os.path.expanduser("~/.cache/avt/rvm_mobilenetv3_fp32.onnx"), providers=["CPUExecutionProvider"])
x = (up / 255.0).transpose(2, 0, 1)[None].astype(np.float32); rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
for _ in range(4):
    _, pha, *rec = sess.run(None, {"src": x, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": np.array([1.0], np.float32)})
m = (pha[0, 0] > 0.5).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8); keep = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]); m = (lab == keep).astype(np.float32)
m = cv2.GaussianBlur(m, (0, 0), 1.2); m = cv2.resize(m, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_AREA)
alpha = np.zeros((P, P), np.float32); alpha[cy - half:cy + half, cx - half:cx + half] = m
him = alpha > 0.6
LUMA = np.array([0.299, 0.587, 0.114], np.float32)
ring = cv2.dilate(him.astype(np.uint8), np.ones((61, 61), np.uint8)).astype(bool) & ~cv2.dilate(him.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
tint = img[ring].mean(0)
print("him: mean luma %.1f, ring %.1f" % ((img @ LUMA)[him].mean(), (img @ LUMA)[ring].mean()))
# 1. lift + cast
f = img * (2.0 ** a.stops) + a.lift
f = f * (1 - a.tint) + (f.mean(2, keepdims=True) * (tint / tint.mean())[None, None, :]) * a.tint
out = img * (1 - alpha[:, :, None]) + f * alpha[:, :, None]
# 2. the plate's grain, measured on a flat patch beside him, laid on him only (weaker in the deep blacks)
patch = img[cy - 60:cy + 60, cx - 260:cx - 140] @ LUMA; resid = patch - cv2.GaussianBlur(patch, (0, 0), 2.0)
g_plate = float(resid.std()); r1 = float(np.corrcoef(resid[:, :-1].ravel(), resid[:, 1:].ravel())[0, 1])
sig = 0.45 if r1 < 0.2 else (0.7 if r1 < 0.4 else 1.0)
noise = cv2.GaussianBlur(np.random.default_rng(a.seed).normal(0, 1, (P, P)).astype(np.float32), (0, 0), sig); noise *= g_plate * a.grain / noise.std()
w = np.clip(0.35 + (out @ LUMA) / 160.0, 0.35, 1.0)
out = out + (noise * w * alpha)[:, :, None]
print("plate grain std %.2f (lag-1 %.2f) -> him x%.1f; him mean luma now %.1f" % (g_plate, r1, a.grain, (out @ LUMA)[him].mean()))
cv2.imwrite(a.out, out[:, :, ::-1].clip(0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95]); print("wrote", a.out)
