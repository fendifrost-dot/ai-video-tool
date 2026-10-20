"""Split the showroom still into layers that Blender and room_motion.py can move, $0 and deterministic.
usage: room_layers.py <params.json> <original_still.png> <ferrari_still.png> <clean_still.png> <car_matte.png>
                      <penguin_matte.png> <out_dir>
  original_still  d4da62ba, the measured still (the island, the kitchen and the penguin come from it)
  ferrari_still   20fcf483, the blue Ferrari pasted over the original (only the car is taken from it)
  clean_still     an xAI edit of the original with the vehicle and the penguin removed, used only where they were
  car_matte, penguin_matte   8-bit masks at the still's size (car: outline traced by eye and snapped by GrabCut)
All stills are 1584x2816; the clean still is first aligned to the original (ECC affine). Writes, at 1080x1920:
  bg.png        the room without car or penguin (16-bit RGB): the original, with the clean still only where the
                vehicle and the penguin stood, and the original island everywhere it is in front
  car.png       the Ferrari, scaled to its real size about its front-wheel ground point (16-bit RGBA, premultiplied
                alpha in a straight PNG: colour * alpha), cut by the island edge found in the picture
  penguin.png   the penguin (16-bit RGBA), its feet pivot in layers.json
  glass.png     where the outside is seen through the windows (8-bit), mullions and frames excluded
  led.png       the Ferrari's lit LED strips and their glow (16-bit, emitted light to modulate)
  layers.json   pivots, scale, the measurements they come from"""
import json, sys
import cv2, numpy as np
from scipy import ndimage as ndi

pp, p_orig, p_car, p_clean, p_cm, p_pm, out = sys.argv[1:8]
P = json.load(open(pp)); V = P["room_v5"]
rd = lambda p: cv2.imread(p, cv2.IMREAD_UNCHANGED).astype(np.float32) / (65535 if cv2.imread(p, -1).dtype == np.uint16 else 255)
orig, ferr, clean = rd(p_orig), rd(p_car), rd(p_clean)
H0, W0 = orig.shape[:2]; k = 1080 / W0
g = lambda a: cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)

# ---- align the clean still to the original on everything but the vehicle band and the window (ECC affine) ----
m = np.ones((H0, W0), np.uint8); m[int(.5 * H0):int(.78 * H0)] = 0; m[int(.12 * H0):int(.5 * H0), int(.35 * W0):] = 0
_, warp = cv2.findTransformECC(g(orig), g(clean), np.eye(2, 3, dtype=np.float32), cv2.MOTION_AFFINE,
                               (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-7), m, 5)
clean = cv2.warpAffine(clean, warp, (W0, H0), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)

# ---- the island in front, from the measured camera, its top edge snapped to the picture ----
F = P["plate"]["focal_px"] / k; HOR = P["plate"]["horizon_y"] / k; CX = 540 / k; CH = P["plate"]["camera_height"]
isl = P["island"]; ax = np.array(isl["long_axis"]); A = np.array(isl["corner_far"]); B = np.array(isl["corner_near"])
proj = lambda X, Z, h: (CX + F * X / Z, HOR + F * (CH - h) / Z)
fp = [A, B, B + ax * 8.0, A + ax * 8.0]                 # the island runs out of frame: a long footprint for the mask
hull = cv2.convexHull(np.array([proj(p[0], p[1], hh) for p in fp for hh in (0, isl["top"])], np.float32)).reshape(-1, 2)
island = np.zeros((H0, W0), np.uint8); cv2.fillPoly(island, [hull.round().astype(np.int32)], 1)
# per column, the island's far edge is the strongest dark->bright step within 14 px of the projected edge
lum = cv2.GaussianBlur(g(orig), (0, 0), 1.2); gy = np.diff(lum, axis=0, prepend=lum[:1])
edge_rows = {}
x_far0, y_far0 = proj(*A, isl["top"]); x_far1, y_far1 = proj(*(A + ax * 8.0), isl["top"])
for x in range(int(np.ceil(x_far0)), W0):
    yp = y_far0 + (x - x_far0) * (y_far1 - y_far0) / (x_far1 - x_far0)
    lo, hi = int(yp) - 14, int(yp) + 14
    edge_rows[x] = lo + int(np.argmax(gy[lo:hi, x]))
xs = np.array(sorted(edge_rows)); ys = ndi.median_filter(np.array([edge_rows[x] for x in xs], float), 31)
for x, y in zip(xs, ys): island[:int(round(y)), x] = 0; island[int(round(y)):int(round(y)) + 30, x] = 1
island = island.astype(np.float32)
island_soft = cv2.GaussianBlur(island, (0, 0), 0.8)

# ---- background: the original, with the clean still where the vehicle and the penguin were ----
car_m = cv2.imread(p_cm, 0) > 127; pen_m = cv2.imread(p_pm, 0) > 127
dz = np.abs(orig - clean).max(2) > 0.07
suv = np.zeros_like(dz); x0, y0, x1, y1 = V["vehicle_box"]; suv[y0:y1, x0:x1] = dz[y0:y1, x0:x1]
suv = ndi.binary_closing(suv, np.ones((21, 21))); suv = ndi.binary_fill_holes(suv)
gone = pen_m
if not P["room_v5"]["penguin_motion"].get("enabled", True):   # no penguin: its whole box plus a margin, so no edge sliver stays
    pys0, pxs0 = np.nonzero(pen_m); gone = np.zeros_like(pen_m)
    gone[max(pys0.min() - 40, 0):pys0.max() + 40, max(pxs0.min() - 40, 0):pxs0.max() + 40] = True
take = ndi.binary_dilation(suv | car_m | gone, iterations=30).astype(np.float32)
take = cv2.GaussianBlur(take, (0, 0), 8) * (1 - island_soft)
bg = orig * (1 - take[..., None]) + clean * take[..., None]

# ---- the Ferrari at its real size ----
# The pasted car stands top_px above the ground line at the car's measured depth; in the room's metric (scaled
# by room_scale) that is height_m. A Purosangue is spec_height_m, so it is scaled by spec/height about its
# front-wheel ground point (it stays parked on the same spot, on the same floor line).
RS = P["room_scale"]; zc = V["car_depth_m"]
y_ground = HOR + F * CH / zc
ys_, xs_ = np.nonzero(car_m); top = ys_.min()
height_m = (y_ground - top) * zc / F * RS
s = V["car_spec_height_m"] / height_m
ax_, ay_ = V["car_anchor_x_px"], y_ground
M = np.array([[s, 0, ax_ * (1 - s)], [0, s, ay_ * (1 - s)]], np.float32)
a = car_m.astype(np.float32); a = cv2.GaussianBlur(a, (0, 0), 0.7)
car_pm = np.dstack([ferr * a[..., None], a])
car_pm = cv2.warpAffine(car_pm, M, (W0, H0), flags=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)
car_pm *= (1 - island_soft)[..., None]                        # the island is in front of it

# ---- LEDs: light above the paint underneath it (a morphological opening removes the thin bright strips) ----
lumf = ferr.max(2)
base = cv2.morphologyEx(ferr, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
emit = np.clip(ferr - base, 0, None).max(2) * car_m
emit *= np.clip((lumf - V["led_min_value"]) / 0.15, 0, 1)        # only where it is lamp-bright
glow = cv2.GaussianBlur(emit, (0, 0), 10) * 2.5
led = np.clip(emit + glow, 0, 1) * car_m
led = cv2.warpAffine(led, M, (W0, H0), flags=cv2.INTER_AREA) * (1 - island_soft)
lamps = np.zeros((H0, W0), np.float32)                # only the lamp units: the badge and paint highlights stay steady
for x0_, y0_, x1_, y1_ in V["lamp_boxes_1080"]: lamps[int(y0_ / k):int(y1_ / k), int(x0_ / k):int(x1_ / k)] = 1
led *= cv2.GaussianBlur(lamps, (0, 0), 6)

# ---- penguin ----
pa = cv2.GaussianBlur(pen_m.astype(np.float32), (0, 0), 0.8)
pen_pm = np.dstack([orig * pa[..., None], pa])
pys, pxs = np.nonzero(pen_m)
feet = (float(np.median(pxs[pys > pys.max() - 25])), float(pys.max()))

# ---- glass: the window wall and the clerestory panes (traced on the grid, DECISION), minus frames ----
glass = np.zeros((H0, W0), np.uint8)
for poly in V["glass_polys"]: cv2.fillPoly(glass, [np.array(poly, np.int32)], 1)
for x0_, x1_ in V["mullions_x"]: glass[:, x0_:x1_] = 0
for (xa, ya), (xb, yb), half in V["transoms"]:
    for x in range(xa, xb): yc = ya + (x - xa) * (yb - ya) / (xb - xa); glass[int(yc - half):int(yc + half), x] = 0
glass = glass.astype(np.float32)

# ---- painted snowflakes: small bright dots over the dark sky are removed so only Blender's snow moves ----
v8 = (bg.max(2) * 255).astype(np.uint8)
th = cv2.morphologyEx(v8, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
ring = cv2.morphologyEx(v8, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
dots = (th > V["flake_tophat"]) & (ring < V["flake_dark_ring"]) & (glass > 0)
lab, n = ndi.label(dots); sz = ndi.sum(dots, lab, range(1, n + 1))
dots = np.isin(lab, 1 + np.nonzero(sz <= 40)[0])
dots = ndi.binary_dilation(dots, iterations=2)
flake_col = np.median(orig[dots], 0) if dots.any() else np.array([0.8, 0.8, 0.8])
bg_in = np.dstack([ndi.median_filter(bg[..., c], size=11) for c in range(3)])   # the dark sky around each dot
bg = np.where(dots[..., None], bg_in, bg)

# ---- write at 1080x1920 ----
R = lambda a, it=cv2.INTER_AREA: cv2.resize(a, (1080, 1920), interpolation=it)
w16 = lambda p, a: cv2.imwrite(f"{out}/{p}", (np.clip(a, 0, 1) * 65535).round().astype(np.uint16))
w16("bg.png", R(bg)); w16("car.png", R(car_pm)); w16("penguin.png", R(pen_pm)); w16("led.png", R(led))
cv2.imwrite(f"{out}/glass.png", (R(glass, cv2.INTER_LINEAR) > 0.5).astype(np.uint8) * 255)
meta = {"scale_to_1080": k, "clean_warp": warp.tolist(),
        "car": {"pasted_top_px_1080": top * k, "ground_line_px_1080": y_ground * k, "depth_m": zc,
                "pasted_height_m": round(height_m, 3), "spec_height_m": V["car_spec_height_m"], "scale": round(s, 4),
                "anchor_px_1080": [ax_ * k, y_ground * k]},
        "penguin_feet_px_1080": [feet[0] * k, feet[1] * k],
        "painted_flakes_removed": int(n and (sz <= 40).sum()), "flake_colour_bgr": [float(c) for c in flake_col]}
json.dump(meta, open(f"{out}/layers.json", "w"), indent=1)
print(json.dumps(meta["car"]), "flakes removed", meta["painted_flakes_removed"])
