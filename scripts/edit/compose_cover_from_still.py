"""Compose a dressed STILL of him (face put back) onto the cover plate, $0: RobustVideoMatting on the still, largest
body kept, scale so his height is <height_px>, feet at (cx, cy), grade to the plate, soft contact shadow, grain.
usage: compose_from_still.py <still.png> <plate.png> <cx> <cy> <height_px> <out.jpg>"""
import sys, os, numpy as np, cv2, onnxruntime as ort
still_p, plate_p, cx, cy, Hh, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
img = cv2.imread(still_p)[:, :, ::-1]
sess = ort.InferenceSession(os.path.expanduser("~/.cache/avt/rvm_mobilenetv3_fp32.onnx"), providers=["CPUExecutionProvider"])
src = (img.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]; rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
for _ in range(4):
    fgr, pha, *rec = sess.run(None, {"src": src, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": np.array([0.4], np.float32)})
alpha = pha[0, 0]; fg = (fgr[0].transpose(1, 2, 0) * 255).clip(0, 255).astype(np.uint8)
a = (alpha > 0.5).astype(np.uint8); n, lab, stats, _ = cv2.connectedComponentsWithStats(a, 8)
keep = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]) if n > 1 else 0; a = (lab == keep).astype(np.uint8)
a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
al = cv2.erode(a.astype(np.float32), np.ones((5, 5), np.uint8)); al = cv2.GaussianBlur(al, (0, 0), 1.5)
ys, xs = np.where(al > 0.5); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
fg, al = fg[y0:y1 + 1, x0:x1 + 1], al[y0:y1 + 1, x0:x1 + 1]
print("matte box", x0, y0, x1 - x0, y1 - y0)
plate = cv2.imread(plate_p)[:, :, ::-1].astype(np.float32); P = plate.shape[0]
s = Hh / al.shape[0]; w = max(1, int(round(al.shape[1] * s)))
fg_s = cv2.resize(fg, (w, Hh), interpolation=cv2.INTER_AREA).astype(np.float32); a_s = cv2.resize(al, (w, Hh), interpolation=cv2.INTER_AREA)
ring = plate[max(0, cy - 2 * Hh):min(P, cy + 2 * Hh), max(0, cx - 2 * Hh):min(P, cx + 2 * Hh)]; pm = ring.reshape(-1, 3).mean(0)
m = a_s > 0.5; hm = fg_s[m].mean(0)
gain = (pm / max(pm.mean(), 1)) / (hm / max(hm.mean(), 1)); fg_g = fg_s * gain[None, None, :]
lum_ratio = (pm.mean() * 0.55 + 0.45 * 60) / max(hm.mean(), 1); fg_g = (fg_g * min(max(lum_ratio, 0.6), 1.1)).clip(0, 255)
fg_g = ((fg_g - fg_g.mean()) * 0.92 + fg_g.mean()).clip(0, 255); fg_g = cv2.GaussianBlur(fg_g, (0, 0), 0.7)
x = cx - w // 2; y = cy - Hh; canvas = plate.copy()
sh = np.zeros((P, P), np.float32); cv2.ellipse(sh, (cx, cy - int(Hh * 0.03)), (int(w * 0.55), int(Hh * 0.06)), 0, 0, 360, 1.0, -1); sh = cv2.GaussianBlur(sh, (0, 0), Hh * 0.03)
canvas *= (1 - 0.38 * sh)[:, :, None]
ys0, ys1, xs0, xs1 = max(0, y), min(P, y + Hh), max(0, x), min(P, x + w); fy0, fx0 = ys0 - y, xs0 - x
A = a_s[fy0:fy0 + (ys1 - ys0), fx0:fx0 + (xs1 - xs0)][:, :, None]
canvas[ys0:ys1, xs0:xs1] = canvas[ys0:ys1, xs0:xs1] * (1 - A) + fg_g[fy0:fy0 + (ys1 - ys0), fx0:fx0 + (xs1 - xs0)] * A
rng = np.random.default_rng(7); canvas = (canvas + rng.normal(0, 1.6, canvas.shape)).clip(0, 255)
cv2.imwrite(out, canvas[:, :, ::-1].astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95]); print("wrote", out, "him", w, "x", Hh, "at", x, y)
