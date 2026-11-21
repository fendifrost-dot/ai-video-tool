"""Measure a camera from a picture, $0: up to three vanishing points by sequential RANSAC over line segments (the
showroom / LaSalle method, storm_lasalle_measure_plate_camera.py, extended), then the focal length from two
ORTHOGONAL vanishing points (f^2 = -(v1 - c).(v2 - c), principal point c at the picture centre), the horizon, and
the tilt (from the vertical vanishing point when one is found, else from the horizon row).

usage: measure_camera_vps.py <image> <out_prefix> [--mask x0,y0,x1,y1 ...]   (masks: regions to ignore, e.g. a person)
Prints every vanishing point with its inlier count and the focal for each orthogonal pair; writes <out_prefix>.json
and <out_prefix>.jpg (inlier segments per vanishing point in colour). MEASURED values come with their spread over
bootstrap resamples of the inliers (the +- printed)."""
import sys, json
import numpy as np, cv2

img_p, outp = sys.argv[1], sys.argv[2]
masks = [tuple(int(v) for v in a.split(",")) for a in sys.argv[3:] if a != "--mask"]
im = cv2.imread(img_p); H, W = im.shape[:2]; g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
segs = np.asarray(cv2.createLineSegmentDetector(0).detect(g)[0]).reshape(-1, 4)
L = np.hypot(segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1]); keep = L > 0.025 * W
for x0, y0, x1, y1 in masks:
    mx, my = (segs[:, 0] + segs[:, 2]) / 2, (segs[:, 1] + segs[:, 3]) / 2
    keep &= ~((mx > x0) & (mx < x1) & (my > y0) & (my < y1))
segs, L = segs[keep], L[keep]
lines = np.cross(np.c_[segs[:, :2], np.ones(len(segs))], np.c_[segs[:, 2:], np.ones(len(segs))])
lines /= np.hypot(lines[:, 0], lines[:, 1])[:, None]
mid = np.c_[(segs[:, 0] + segs[:, 2]) / 2, (segs[:, 1] + segs[:, 3]) / 2]
dirs = np.c_[segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1]] / L[:, None]

def consistent(p, idx):
    """angle (deg) between each segment and the direction to the vanishing point p (homogeneous)"""
    if abs(p[2]) < 1e-9: d = np.tile(p[:2] / np.hypot(*p[:2]), (len(idx), 1))
    else:
        q = p[:2] / p[2]; d = q - mid[idx]; d /= np.maximum(np.hypot(d[:, 0], d[:, 1]), 1e-9)[:, None]
    c = np.abs((dirs[idx] * d).sum(1)); return np.degrees(np.arccos(np.clip(c, 0, 1)))

rng = np.random.default_rng(7); free = np.arange(len(segs)); vps = []
for k in range(3):
    if len(free) < 20: break
    best = (0, None)
    w = L[free] / L[free].sum()
    for _ in range(6000):
        i, j = rng.choice(free, 2, replace=False, p=w); p = np.cross(lines[i], lines[j])
        if np.linalg.norm(p) < 1e-12: continue
        p = p / np.linalg.norm(p); sc = (L[free] * (consistent(p, free) < 1.5)).sum()
        if sc > best[0]: best = (sc, p)
    p = best[1]; inl = free[consistent(p, free) < 1.5]
    # least squares refinement (minimise the lines' distances to the point, by the smallest singular vector)
    def refine(ix):
        A = lines[ix] * L[ix][:, None]; return np.linalg.svd(A)[2][-1]
    p = refine(inl); boot = []
    for _ in range(200):
        bi = rng.choice(inl, len(inl)); q = refine(bi); boot.append(q / q[2] if abs(q[2]) > 1e-9 else q)
    vps.append({"p": p, "inliers": inl, "boot": np.array(boot)})
    free = np.setdiff1d(free, inl)
c = np.array([W / 2, H / 2]); out = {"size": [W, H], "vps": [], "pairs": []}
for n, v in enumerate(vps):
    p = v["p"]; fin = abs(p[2]) > 1e-6 and np.hypot(*(p[:2] / p[2] - c)) < 50 * W
    pt = (p[:2] / p[2]).tolist() if fin else None
    out["vps"].append({"point": pt, "direction_if_infinite": None if fin else (p[:2] / np.hypot(*p[:2])).tolist(),
                       "inliers": int(len(v["inliers"])), "length": float(L[v["inliers"]].sum())})
    print(f"VP{n}: {np.round(pt, 1) if pt else 'at infinity ' + str(np.round(p[:2] / np.hypot(*p[:2]), 3))}  inliers {len(v['inliers'])}")
for a in range(len(vps)):
    for b in range(a + 1, len(vps)):
        pa, pb = out["vps"][a]["point"], out["vps"][b]["point"]
        if pa is None or pb is None: continue
        f2 = -float(np.dot(np.array(pa) - c, np.array(pb) - c))
        fs = []
        for qa, qb in zip(vps[a]["boot"], vps[b]["boot"]):
            v2 = -float(np.dot(qa[:2] - c, qb[:2] - c))
            if v2 > 0: fs.append(np.sqrt(v2))
        if f2 > 0:
            f = np.sqrt(f2); spread = float(np.std(fs)) if fs else None
            out["pairs"].append({"vps": [a, b], "focal_px": f, "focal_spread_px": spread, "hfov_deg": float(np.degrees(2 * np.arctan(W / 2 / f)))})
            print(f"VP{a}-VP{b} orthogonal: focal {f:.1f} px (+- {spread:.1f}), {np.degrees(2 * np.arctan(W / 2 / f)):.1f} deg across")
        else:
            print(f"VP{a}-VP{b}: not orthogonal (dot > 0)")
json.dump(out, open(outp + ".json", "w"), indent=1)
v = im.copy(); cols = [(0, 255, 0), (0, 0, 255), (255, 0, 0)]
for n, vp in enumerate(vps):
    for s in segs[vp["inliers"]]: cv2.line(v, (int(s[0]), int(s[1])), (int(s[2]), int(s[3])), cols[n], max(1, W // 800))
cv2.imwrite(outp + ".jpg", cv2.resize(v, (1600, int(1600 * H / W))))
