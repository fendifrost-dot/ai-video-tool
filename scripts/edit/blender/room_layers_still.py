"""Split a single room still (the car already in it, nothing to remove) into the layers room_motion.py moves, $0.
usage: room_layers_still.py <params.json> <still> <car_matte.png> <out_dir>
  still      the room picture at any size; scaled to 1080 wide and cropped to 1920 rows (params plate.crop_top_px, at
             1080 wide) so nothing is stretched
  car_matte  8-bit mask at the still's size (outline traced by eye on a grid, snapped by GrabCut)
Writes, at 1080x1920, the same files as room_layers.py so room_motion.py runs unchanged:
  bg.png        the still, its painted snowflakes removed from the glass (16-bit RGB)
  car.png       the car's own pixels (16-bit RGBA, premultiplied), laid back over the snow so no flake crosses it
  penguin.png   empty (this room has none)
  glass.png     where the outside is seen through the windows (8-bit): panes minus frames, mullions and the car
  led.png       the car's lit LED strips and their glow inside the lamp boxes (16-bit, the light the band modulates)
  layers.json   the scale, crop and what was removed"""
import json, sys
import cv2, numpy as np
from scipy import ndimage as ndi

pp, p_still, p_cm, out = sys.argv[1:5]
P = json.load(open(pp)); V = P["room_v5"]
raw = cv2.imread(p_still, cv2.IMREAD_UNCHANGED)
im = raw.astype(np.float32) / (65535 if raw.dtype == np.uint16 else 255)
H0, W0 = im.shape[:2]; k = 1080 / W0; CT = P["plate"]["crop_top_px"]
car_m = cv2.imread(p_cm, 0) > 127

# ---- glass: the panes (MEASURED on a pixel grid of the still), minus frames, mullions and the car ----
glass = np.zeros((H0, W0), np.uint8)
for poly in V["glass_polys"]: cv2.fillPoly(glass, [np.array(poly, np.int32)], 1)
for x0_, x1_ in V["mullions_x"]: glass[:, x0_:x1_] = 0
for (xa, ya), (xb, yb), half in V["transoms"]:
    for x in range(xa, xb): yc = ya + (x - xa) * (yb - ya) / (xb - xa); glass[int(yc - half):int(yc + half), x] = 0
glass[ndi.binary_dilation(car_m, iterations=2)] = 0
glass = glass.astype(np.float32)

# ---- the car's pixels, premultiplied; its LED light (a morphological opening removes the thin bright strips) ----
a = cv2.GaussianBlur(car_m.astype(np.float32), (0, 0), 0.7)
car_pm = np.dstack([im * a[..., None], a])
lumf = im.max(2)
base = cv2.morphologyEx(im, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
emit = np.clip(im - base, 0, None).max(2) * car_m
emit *= np.clip((lumf - V["led_min_value"]) / 0.15, 0, 1)          # only where it is lamp-bright
glow = cv2.GaussianBlur(emit, (0, 0), 10) * 2.5
led = np.clip(emit + glow, 0, 1) * car_m
lamps = np.zeros((H0, W0), np.float32)                  # only the lamp units: badge and paint highlights stay steady
for x0_, y0_, x1_, y1_ in V["lamp_boxes_1080"]:
    lamps[int((y0_ + CT) / k):int((y1_ + CT) / k), int(x0_ / k):int(x1_ / k)] = 1
led *= cv2.GaussianBlur(lamps, (0, 0), 6)

# ---- painted snowflakes: small bright dots over the dark sky are removed so only Blender's snow moves ----
v8 = (im.max(2) * 255).astype(np.uint8)
th = cv2.morphologyEx(v8, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
ring = cv2.morphologyEx(v8, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
dots = (th > V["flake_tophat"]) & (ring < V["flake_dark_ring"]) & (glass > 0)
lab, n = ndi.label(dots); sz = ndi.sum(dots, lab, range(1, n + 1))
dots = np.isin(lab, 1 + np.nonzero(sz <= 40)[0])
dots = ndi.binary_dilation(dots, iterations=2)
bg_in = np.dstack([ndi.median_filter(im[..., c], size=11) for c in range(3)])   # the dark sky around each dot
bg = np.where(dots[..., None], bg_in, im)

# ---- write at 1080x1920: scale to 1080 wide, keep rows CT..CT+1920 ----
h1 = round(H0 * k); assert h1 >= 1920 + CT, (h1, CT)
def R(x, it=cv2.INTER_AREA): return cv2.resize(x, (1080, h1), interpolation=it)[CT:CT + 1920]
w16 = lambda p, x: cv2.imwrite(f"{out}/{p}", (np.clip(x, 0, 1) * 65535).round().astype(np.uint16))
w16("bg.png", R(bg)); w16("car.png", R(car_pm)); w16("led.png", R(led))
w16("penguin.png", np.zeros((1920, 1080, 4), np.float32))
cv2.imwrite(f"{out}/glass.png", (R(glass, cv2.INTER_LINEAR) > 0.5).astype(np.uint8) * 255)
meta = {"scale_to_1080": k, "crop_top_px_1080": CT, "still_px": [W0, H0],
        "painted_flakes_removed": int(n and (sz <= 40).sum()), "penguin_feet_px_1080": [0, 0]}
json.dump(meta, open(f"{out}/layers.json", "w"), indent=1)
print(json.dumps(meta))
