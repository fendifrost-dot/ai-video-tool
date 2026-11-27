"""His two feet per frame, in the plate's pixels and on the set's floor, from the placed cut-out, $0.

The lowest band of his matte (the bottom 7 % of his height) is split into its left and right blobs; each blob's
lowest row is where that shoe touches the floor, its column the shoe's centre. With the plate's level camera (focal,
principal point, lens height) each contact pixel gives the shoe's floor position: depth z = h f / (row - horizon),
x = (column - cx) z / f. One foot hidden behind the other leaves one blob: both feet then take it. A foot lifted off
the floor reads as further away (its lowest row is higher): the median over +-2 frames steadies a stepping foot.

usage: feet_from_placed.py <static_fg dir> <placement.json> <out.json> --cx CX
"""
import argparse, json, os
import numpy as np, cv2

ap = argparse.ArgumentParser(); ap.add_argument("fg"); ap.add_argument("placement"); ap.add_argument("out"); ap.add_argument("--cx", type=float, required=True)
A = ap.parse_args()
PL = json.load(open(A.placement)); f, hor, h = PL["plate_focal_px"], PL["plate_horizon_row"], PL["lens_height_m"]
files = sorted(x for x in os.listdir(A.fg) if x.startswith("f_") and x.endswith(".png"))
raw = []
for fn in files:
    a = cv2.imread(os.path.join(A.fg, fn), cv2.IMREAD_UNCHANGED)[..., 3] > 32768
    ys, xs = np.nonzero(a)
    top, bot = ys.min(), ys.max(); band = a.copy(); band[: int(bot - 0.07 * (bot - top))] = False
    n, lab, st, _ = cv2.connectedComponentsWithStats(band.astype(np.uint8))
    blobs = sorted((q for q in range(1, n) if st[q, cv2.CC_STAT_AREA] > 15), key=lambda q: -st[q, cv2.CC_STAT_AREA])[:2]
    feet = []
    for q in blobs:
        yy, xx = np.nonzero(lab == q); low = yy.max(); feet.append((float(np.median(xx[yy >= low - 2])), float(low)))
    if len(feet) == 1: feet = feet * 2
    raw.append(sorted(feet))                                         # left foot first
raw = np.array(raw)                                                  # (N, 2 feet, x/y)
sm = np.stack([np.median(raw[max(0, k - 2):k + 3], axis=0) for k in range(len(raw))])
out = []
for fr in sm:
    fl = []
    for x, y in fr:
        z = h * f / max(y - hor, 1.0); fl.append({"px": [x, y], "depth_m": z, "x_m": (x - A.cx) * z / f})
    out.append(fl)
json.dump({"feet_per_frame": out, "lens_height_m": h, "focal_px": f, "horizon_row": hor, "cx": A.cx}, open(A.out, "w"), indent=1)
d = np.array([[ft["depth_m"] for ft in fr] for fr in out])
print(f"frames {len(out)}: nearest foot {d.min():.2f} m, farthest foot {d.max():.2f} m; widest depth gap between his feet {np.abs(d[:,0]-d[:,1]).max():.2f} m")
