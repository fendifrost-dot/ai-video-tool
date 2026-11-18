# Measure the plate's camera from the picture (the showroom method): vanishing point of the street's depth lines (RANSAC over
# line segments) -> horizon row and principal column; verticals -> pitch / roll check.
import cv2, numpy as np, json
im = cv2.imread("../../places_chicago_v1/A_lasalle.jpg"); H, W = im.shape[:2]; g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
lsd = cv2.createLineSegmentDetector(0); segs = np.asarray(lsd.detect(g)[0]).reshape(-1, 4)
L = np.hypot(segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1]); segs = segs[L > 60]; L = L[L > 60]
ang = np.degrees(np.arctan2(segs[:, 3] - segs[:, 1], segs[:, 2] - segs[:, 0])) % 180
vert = np.abs(ang - 90) < 4; horiz = (ang < 4) | (ang > 176); obl = ~vert & ~horiz
print("segments", len(segs), "vertical", int(vert.sum()), "oblique", int(obl.sum()))
print("verticals: median tilt from 90 deg", round(float(np.median(ang[vert] - 90)), 2), "left half", round(float(np.median((ang[vert] - 90)[segs[vert][:, 0] < W / 2])), 2), "right half", round(float(np.median((ang[vert] - 90)[segs[vert][:, 0] > W / 2])), 2))
S = segs[obl]; Lw = L[obl]
lines = np.cross(np.c_[S[:, :2], np.ones(len(S))], np.c_[S[:, 2:], np.ones(len(S))]); lines /= np.hypot(lines[:, 0], lines[:, 1])[:, None]
rng = np.random.default_rng(7); best = (0, None)
for _ in range(4000):
    i, j = rng.choice(len(lines), 2, replace=False, p=Lw / Lw.sum()); p = np.cross(lines[i], lines[j])
    if abs(p[2]) < 1e-9: continue
    p = p / p[2]
    if not (0 < p[0] < W and 0 < p[1] < H * 1.3): continue
    d = np.abs(lines @ p); sc = (Lw * (d < 3)).sum()
    if sc > best[0]: best = (sc, p)
p = best[1]; inl = np.abs(lines @ p) < 3
A = lines[inl][:, :2] * Lw[inl][:, None]; b = -lines[inl][:, 2] * Lw[inl]; vp = np.linalg.lstsq(A, b, rcond=None)[0]
print("vanishing point (full 2752x1536):", vp.round(1), "inlier segments", int(inl.sum()), "of", len(lines), "inlier length share", round(float(Lw[inl].sum() / Lw.sum()), 2))
k = 1920 / W; print("at 1920x1080: horizon_y", round(vp[1] * k, 1), "principal_x", round(vp[0] * k, 1))
json.dump({"vp_full": vp.tolist(), "horizon_y_1080": vp[1] * k, "principal_x_1920": vp[0] * k, "inliers": int(inl.sum())}, open("plate_camera_measure.json", "w"))
v = im.copy()
for s in S[inl]: cv2.line(v, (int(s[0]), int(s[1])), (int(s[2]), int(s[3])), (0, 255, 0), 2)
cv2.line(v, (0, int(vp[1])), (W, int(vp[1])), (0, 0, 255), 2); cv2.circle(v, (int(vp[0]), int(vp[1])), 14, (0, 0, 255), 3)
cv2.imwrite("plate_camera_measure.jpg", cv2.resize(v, (1600, 893)))
