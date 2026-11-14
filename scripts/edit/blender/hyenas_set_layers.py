"""Cut the Hyenas texture still into the surfaces the Blender build uses, $0 and deterministic.
usage: hyenas_set_layers.py <hyenas_set.json> <texture_still.jpg> <out_dir>
  texture_still   asset 93b20e39: the look plate with smoke, flares and red light removed (flash-lit, clear air)
Writes (16-bit where colour matters, straight alpha):
  car.png         the car's front, RGBA: outline traced by eye from a pixel grid and snapped by GrabCut in a band
  car_depth.npy   metres from the still's camera for every car pixel (fascia, hood, windscreen, roof, mirrors, tyres):
                  hyenas_set_build.py turns it into a relief mesh, so the car has real depth
  card_<name>.png bushes, grass and branches, RGBA: they were lit by a flash against a black night, so their
                  brightness is their matte (nothing is redrawn)
  sand.png        the dirt in front of the car seen from straight above (inverse perspective), a detail texture
  layers.json     each piece's size in metres and the measurements it comes from
  sheet.jpg       every piece over grey, to look at before building"""
import json, sys
import cv2, numpy as np

pp, still, out = sys.argv[1:4]
P = json.load(open(pp)); T = P["texture_still"]
im = cv2.imread(still, cv2.IMREAD_COLOR).astype(np.float32) / 255
H0, W0 = im.shape[:2]
assert [W0, H0] == T["size"], (W0, H0)
F, HOR, CH, CX, Z0 = T["focal_px"], T["horizon_y"], T["camera_height"], T["car_centre_x"], T["car_front_depth"]
luma = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
sm = lambda x, lo, hi: np.clip((x - lo) / (hi - lo), 0, 1) ** 2 * (3 - 2 * np.clip((x - lo) / (hi - lo), 0, 1))
save16 = lambda p, a: cv2.imwrite(p, np.clip(a * 65535, 0, 65535).astype(np.uint16))
L = {"still": T["asset"], "pieces": {}}

# ---- the car: outline read off a labelled pixel grid (DECISION), snapped to the picture by GrabCut in a 14 px band ----
poly = np.array([(462, 1104), (1112, 1104), (1136, 1150), (1166, 1340), (1264, 1345), (1266, 1427), (1182, 1432),
                 (1200, 1530), (1207, 1605), (1277, 1632), (1277, 1832), (1273, 1850), (1273, 2068), (1262, 2091),
                 (1112, 2091), (1100, 1975), (473, 1975), (461, 2091), (312, 2091), (302, 2068), (302, 1850),
                 (295, 1832), (295, 1632), (368, 1605), (377, 1530), (395, 1432), (303, 1427), (305, 1345),
                 (408, 1340), (438, 1150)], np.int32)
m0 = np.zeros((H0, W0), np.uint8); cv2.fillPoly(m0, [poly], 255)
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (29, 29))
sure_fg, maybe = cv2.erode(m0, k), cv2.dilate(m0, k)
gc = np.full((H0, W0), cv2.GC_BGD, np.uint8)
gc[maybe > 0] = cv2.GC_PR_BGD; gc[m0 > 0] = cv2.GC_PR_FGD; gc[sure_fg > 0] = cv2.GC_FGD
x0, y0, x1, y1 = 240, 1050, 1340, 2150
sub = (im[y0:y1, x0:x1] * 255).astype(np.uint8); g = gc[y0:y1, x0:x1].copy()
cv2.setRNGSeed(7)
cv2.grabCut(sub, g, None, np.zeros((1, 65)), np.zeros((1, 65)), 4, cv2.GC_INIT_WITH_MASK)
snapped = np.zeros((H0, W0), np.uint8); snapped[y0:y1, x0:x1] = ((g == cv2.GC_FGD) | (g == cv2.GC_PR_FGD)) * 255
# above the fenders the car is black on a black bush: the picture cannot place the edge there, the traced outline does
snapped[:1440] = m0[:1440]
snapped = cv2.morphologyEx(snapped, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(snapped)
snapped = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8) * 255
car_a = cv2.GaussianBlur(snapped.astype(np.float32) / 255, (0, 0), 1.2)
L["pieces"]["car"] = {"traced_px": int((m0 > 0).sum()), "snapped_px": int((snapped > 0).sum())}

# depth of each car pixel from the still's camera (metres). Bands MEASURED on the grid, depths from the car's SPEC
# proportions: bumper to windscreen base about 1.3 m, the windscreen nearly upright, the front axle 0.6 m back
yy, xx = np.mgrid[0:H0, 0:W0].astype(np.float32)
d = np.full((H0, W0), Z0, np.float32)                                       # fascia: grille, lamps, bumper
hood = (yy < 1590) & (yy >= 1414); d[hood] = (Z0 + 0.10 + (1590 - yy) / 176 * 1.20)[hood]
cab = yy < 1414; d[cab] = (Z0 + 1.30 + (1414 - yy) / 310 * 0.35)[cab]       # windscreen, raked a little, then the roof
mir = ((xx < 400) | (xx > 1172)) & (yy > 1330) & (yy < 1432); d[mir] = Z0 + 1.25
tyre = ((xx < 440) | (xx > 1130)) & (yy > 1900); d[tyre] = Z0 + 0.60
arch = ((xx < 372) | (xx > 1200)) & (yy > 1600) & (yy <= 1900); d[arch] = Z0 + 0.35
d = cv2.GaussianBlur(d, (0, 0), 7)
c = (230, 1080, 1340, 2110)                                                 # crop written out (x0, y0, x1, y1)
rgba = np.dstack([im[c[1]:c[3], c[0]:c[2]], car_a[c[1]:c[3], c[0]:c[2]]])
save16(f"{out}/car.png", rgba); np.save(f"{out}/car_depth.npy", d[c[1]:c[3], c[0]:c[2]])
L["pieces"]["car"].update({"crop": c, "focal_px": F, "horizon_y": HOR, "camera_height": CH, "centre_x": CX})

# ---- bushes, grass, branches: brightness is the matte ----
cards = {   # name: (x0, y0, x1, y1, depth from the still's camera in metres (ESTIMATE from where it meets the ground), key lo, key hi)
    "thorn_l":  (0, 700, 300, 1470, 6.6, 0.07, 0.22),
    "grass_l":  (0, 1440, 292, 2085, 6.0, 0.20, 0.46),
    "grass_r":  (1284, 1400, 1536, 2110, 6.2, 0.20, 0.46),
    "twigs_r":  (1150, 960, 1536, 1420, 8.0, 0.06, 0.20),
    "canopy":   (500, 0, 1536, 1000, 9.0, 0.045, 0.16),
    "far_l":    (0, 360, 660, 1010, 11.0, 0.03, 0.12),
}
for name, (a, b, c2, e, depth, lo, hi) in cards.items():
    crop = im[b:e, a:c2]; al = sm(luma[b:e, a:c2], lo, hi)
    al = al * (1 - cv2.dilate(car_a[b:e, a:c2], np.ones((25, 25), np.uint8)))   # the car (arch, mirror) is not a plant
    if name in ("grass_l", "grass_r"):
        al[-70:] *= np.linspace(1, 0, 70)[:, None] ** 0.5                   # the sand under the grass fades out
        # the crop cuts the grass off square: give it its own ragged top, each column ending at a different height
        rs = np.random.default_rng(len(name) + a); hh, ww = al.shape
        top = cv2.GaussianBlur(rs.uniform(0.05, 0.55, (1, ww)).astype(np.float32), (0, 0), 1.2)[0] * hh
        al = al * np.clip((np.arange(hh)[:, None] - top[None, :]) / (0.12 * hh), 0, 1)
    if name == "canopy": al[:, :60] *= np.linspace(0, 1, 60)[None, :]
    if name in ("canopy", "far_l"): al[-170:] *= np.linspace(1, 0, 170)[:, None]   # the still's own haze above the car
    edge = 24                                                               # no hard card edge
    ramp = np.minimum(np.minimum(np.arange(al.shape[1]), np.arange(al.shape[1])[::-1])[None, :] / edge, 1.0)
    if name not in ("grass_l", "thorn_l", "far_l"): al = al * ramp
    else: al = al * np.minimum(np.arange(al.shape[1])[::-1][None, :] / edge, 1.0)   # these run off the left edge of the still
    al = cv2.GaussianBlur(al.astype(np.float32), (0, 0), 0.7)
    # the flash's fall-off is in the picture; lift the colour to an even exposure so Blender's lights do the lighting
    col = crop / max(np.percentile(luma[b:e, a:c2][al > 0.5], 90), 1e-3) * 0.55 if (al > 0.5).any() else crop
    save16(f"{out}/card_{name}.png", np.dstack([np.clip(col, 0, 1), al]))
    ppm = F / depth
    L["pieces"][name] = {"crop": [a, b, c2, e], "depth_m": depth, "size_m": [round((c2 - a) / ppm, 3), round((e - b) / ppm, 3)],
                         "coverage": round(float((al > 0.5).mean()), 3)}

# ---- the dirt, from above: row y is ground at depth F*CH/(y-HOR) (pitch 0 about the horizon row, ESTIMATE) ----
PPM = 420; z_near, z_far, half_w = 3.60, 5.55, 0.92
gh, gw = int((z_far - z_near) * PPM), int(2 * half_w * PPM)
Z = z_far - (np.arange(gh, dtype=np.float32) + 0.5) / PPM; X = (np.arange(gw, dtype=np.float32) + 0.5) / PPM - half_w
mx = (CX - 18 + X[None, :] * F / Z[:, None]).astype(np.float32); my = np.repeat((HOR + F * CH / Z)[:, None], gw, 1).astype(np.float32)
sand = cv2.remap(im, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
flat = cv2.GaussianBlur(sand, (0, 0), 90)                                   # take the flash's fall-off out: detail only
sand = np.clip(sand / np.maximum(flat, 1e-3) * flat.mean((0, 1)), 0, 1)
save16(f"{out}/sand.png", sand)
L["pieces"]["sand"] = {"px_per_m": PPM, "size_m": [round(gw / PPM, 3), round(gh / PPM, 3)],
                       "mean_srgb": [round(float(v), 4) for v in sand.mean((0, 1))[::-1]], "rows": [float(my.min()), float(my.max())]}
json.dump(L, open(f"{out}/layers.json", "w"), indent=1)

# ---- a sheet to look at ----
def over_grey(p, h=620):
    a = cv2.imread(p, cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535
    if a.shape[2] == 4: a = a[..., :3] * a[..., 3:] + 0.35 * (1 - a[..., 3:])
    return cv2.resize(a, (max(1, int(a.shape[1] * h / a.shape[0])), h), interpolation=cv2.INTER_AREA)
tiles = [over_grey(f"{out}/car.png")] + [over_grey(f"{out}/card_{n}.png") for n in cards] + [over_grey(f"{out}/sand.png")]
cv2.imwrite(f"{out}/sheet.jpg", (np.hstack(tiles) * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 88])
for kname, v in L["pieces"].items(): print(kname, v)
