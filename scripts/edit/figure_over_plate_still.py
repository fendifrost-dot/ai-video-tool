"""$0. His whole REAL figure (his photo with only the top changed, his head put back: proof 0) cut out with the veed
matte as delivered and stood in a plate. Nothing of him is generated except the garment; the figure is only resized.
Inside the solid part of the matte the output equals the resized figure exactly (printed).

usage: figure_over_plate_still.py <figure.png> <alpha.png> <plate.jpg> <scale> <x_left> <out.png>
"""
import sys
sys.path.insert(0, "/Volumes/T7/tools/LivePortrait/site-packages")
import cv2, numpy as np
fig_p, a_p, plate_p, sc, x0, out_p = sys.argv[1:7]; sc = float(sc); x0 = int(x0)
fig = cv2.imread(fig_p); a = cv2.imread(a_p, 0); plate = cv2.imread(plate_p)
H, W = plate.shape[:2]
if a.shape != fig.shape[:2]: a = cv2.resize(a, (fig.shape[1], fig.shape[0]), interpolation=cv2.INTER_LINEAR)
fw, fh = int(round(fig.shape[1] * sc)), int(round(fig.shape[0] * sc))
f = cv2.resize(fig, (fw, fh), interpolation=cv2.INTER_AREA); al = cv2.resize(a, (fw, fh), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
y0 = H - fh                                           # his body runs out of the bottom of the frame, as in his photo
F = np.zeros((H, W, 3), np.float32); A = np.zeros((H, W), np.float32)
ys, ye = max(0, y0), H; xs, xe = max(0, x0), min(W, x0 + fw)
F[ys:ye, xs:xe] = f[ys - y0:ye - y0, xs - x0:xe - x0]; A[ys:ye, xs:xe] = al[ys - y0:ye - y0, xs - x0:xe - x0]
solid = (A > 0.98).astype(np.uint8)
# edge: the photo's fence and lawn cling to the matte's rim; the rim takes its colour from just inside him
inner = cv2.erode(solid, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
src = F.copy().astype(np.uint8)
fill = cv2.inpaint(src, (1 - inner).astype(np.uint8), 3, cv2.INPAINT_TELEA).astype(np.float32)
rim = (A > 0) & (inner == 0)
Fc = F.copy(); Fc[rim] = fill[rim]
Ae = np.clip((cv2.GaussianBlur(A, (0, 0), 0.8) - 0.18) / 0.72, 0, 1)
Ae[inner > 0] = 1
out = plate.astype(np.float32) * (1 - Ae[..., None]) + Fc * Ae[..., None]
out = out.round().astype(np.uint8)
print("figure %dx%d at x %d, y %d; max |out - resized figure| inside the solid matte: %d (%d px)" % (fw, fh, x0, y0, int(np.abs(out.astype(int) - F.astype(int)).max(2)[inner > 0].max()), int(inner.sum())))
cv2.imwrite(out_p, out); cv2.imwrite(out_p.replace(".png", "_alpha.png"), (Ae * 255).astype(np.uint8))
