"""Frost the Boss cover compose, $0: matte him from the dressed 4K frame (RobustVideoMatting, gated by a place-limited key
for the wall panel behind him), scale to the plate, grade to it, soft contact shadow, grain. First used 6 Nov 2026 on
Fendi's star-of-cars photo. usage: compose_cover_still.py <frame4k.png> <plate.png> <cx> <cy> <height_px> <out.jpg>"""
import sys, os, numpy as np, cv2, onnxruntime as ort
frame_p, plate_p, cx, cy, H, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
img = cv2.imread(frame_p)[:, :, ::-1]  # RGB
crop = img[1250:3500, 250:1650]        # him, 4K pixels (1400x2250)
sess = ort.InferenceSession(os.path.expanduser("~/.cache/avt/rvm_mobilenetv3_fp32.onnx"), providers=["CPUExecutionProvider"])
src = (crop.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
for _ in range(4):  # warm the recurrent state on the same frame
    fgr, pha, *rec = sess.run(None, {"src": src, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": np.array([0.45], np.float32)})
alpha = pha[0, 0]; fg = (fgr[0].transpose(1, 2, 0) * 255).clip(0, 255).astype(np.uint8)
ys, xs = np.where(alpha > 0.5); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
fg, alpha = fg[y0:y1 + 1, x0:x1 + 1], alpha[y0:y1 + 1, x0:x1 + 1]
# tighten the matte: the take's motion smear and the white wall bleed into the edge; erode 3 px at 4K, feather 2 px
# behind his back hangs the wall's dark electrical panel; RVM takes it as jacket. The panel is a mid-dark neutral
# (lum ~50, chroma ~5) and sits only behind his back (the left half of the box, below the head), so key it there only:
# the cap and the tux shadows share its tone but not its place.
srcbox = crop[y0:y1 + 1, x0:x1 + 1].astype(np.float32)
lum = srcbox.mean(2); chroma = srcbox.max(2) - srcbox.min(2)
Hb, Wb = lum.shape; yy, xx = np.mgrid[0:Hb, 0:Wb]
for row in (500, 700, 900): print('row', row, 'lum every 40px:', lum[row, ::40].round(0).astype(int).tolist()[:12])
panel = (lum > 40) & (lum < 170) & (chroma < 34) & (xx < Wb * 0.55) & (yy > Hb * 0.17) & (yy < Hb * 0.62)
panel = cv2.morphologyEx(panel.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)).astype(bool)
print('panel pixels keyed', int(panel.sum()))
a = ((alpha > 0.5) & ~panel).astype(np.uint8)
a = cv2.morphologyEx(a, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(a, 8)
keep = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]) if n > 1 else 0
a = (lab == keep).astype(np.uint8)
a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, np.ones((21, 21), np.uint8))
alpha = cv2.erode(a.astype(np.float32), np.ones((9, 9), np.uint8)); alpha = cv2.GaussianBlur(alpha, (0, 0), 2.5)
cv2.imwrite('matte_debug.png', (alpha * 255).astype(np.uint8))
print("matte box", x0, y0, x1 - x0, y1 - y0, "alpha mean in box", round(float(alpha.mean()), 3))
plate = cv2.imread(plate_p)[:, :, ::-1].astype(np.float32)
P = plate.shape[0]
s = H / alpha.shape[0]; w = max(1, int(round(alpha.shape[1] * s)))
fg_s = cv2.resize(fg, (w, H), interpolation=cv2.INTER_AREA).astype(np.float32); a_s = cv2.resize(alpha, (w, H), interpolation=cv2.INTER_AREA)
# grade him to the plate: match channel means of the asphalt around the centre, lower contrast a touch, cool the warm room light
ring = plate[max(0, cy - 2 * H):min(P, cy + 2 * H), max(0, cx - 2 * H):min(P, cx + 2 * H)]
pm = ring.reshape(-1, 3).mean(0)
m = a_s > 0.5; hm = fg_s[m].mean(0)
gain = (pm / max(pm.mean(), 1)) / (hm / max(hm.mean(), 1))      # colour cast only, not brightness
fg_g = fg_s * gain[None, None, :]
lum_ratio = (pm.mean() * 0.55 + 0.45 * 60) / max(hm.mean(), 1)  # overcast top light: he sits a little darker than the open asphalt
fg_g = (fg_g * min(max(lum_ratio, 0.6), 1.1)).clip(0, 255)
fg_g = ((fg_g - fg_g.mean()) * 0.92 + fg_g.mean()).clip(0, 255)  # flatter contrast, like the plate
# soften to the plate's sharpness and add the plate's grain
fg_g = cv2.GaussianBlur(fg_g, (0, 0), 0.7)
# placement: feet at (cx, cy) -> box
x = cx - w // 2; y = cy - H
canvas = plate.copy()
# contact shadow: soft ellipse under the feet, overcast = directly beneath
sh = np.zeros((P, P), np.float32); cv2.ellipse(sh, (cx, cy - int(H * 0.03)), (int(w * 0.55), int(H * 0.06)), 0, 0, 360, 1.0, -1)
sh = cv2.GaussianBlur(sh, (0, 0), H * 0.03)
canvas *= (1 - 0.38 * sh)[:, :, None]
# paste
ys0, ys1, xs0, xs1 = max(0, y), min(P, y + H), max(0, x), min(P, x + w)
fy0, fx0 = ys0 - y, xs0 - x
A = a_s[fy0:fy0 + (ys1 - ys0), fx0:fx0 + (xs1 - xs0)][:, :, None]
canvas[ys0:ys1, xs0:xs1] = canvas[ys0:ys1, xs0:xs1] * (1 - A) + fg_g[fy0:fy0 + (ys1 - ys0), fx0:fx0 + (xs1 - xs0)] * A
# grain over everything, light
rng = np.random.default_rng(7); canvas = (canvas + rng.normal(0, 1.6, canvas.shape)).clip(0, 255)
cv2.imwrite(out, canvas[:, :, ::-1].astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])
print("wrote", out, "him", w, "x", H, "at", x, y)
