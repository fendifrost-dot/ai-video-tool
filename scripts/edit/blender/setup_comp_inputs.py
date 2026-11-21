"""Inputs for comp_scene.py from a placed performer (level_and_place.py) and a rebuilt set's shadow pass, $0.

The room picture per frame = the room (one render, or a plate's frames) x his shadow, the shadow being the set
rendered WITH his cut-out at his depth over the set WITHOUT it (same camera, samples and seed), in linear light.
White balance: the room's white (a white card where he stands, or a measured white surface) over the take's white.

usage: setup_comp_inputs.py --fg <static_fg dir> --placement <placement.json> --room <png | frames dir>
         --shadow <dir with s_0000 (no him) and s_0001..> --out <passes dir>
         --white-plate R,G,B | --card <render with a white card> --white-source R,G,B (sRGB 0-255)
         --ppm <take px per metre at his face> [--eye 1.78] [--exposure 0] [--wall-depth m]
"""
import argparse, json, os
import numpy as np, cv2

ap = argparse.ArgumentParser()
for k in ("fg", "placement", "room", "shadow", "out", "white_source"): ap.add_argument("--" + k.replace("_", "-"), dest=k, required=True)
ap.add_argument("--white-plate", dest="white_plate"); ap.add_argument("--card")
ap.add_argument("--ppm", type=float, required=True); ap.add_argument("--eye", type=float, default=1.78)
ap.add_argument("--exposure", type=float, default=0.0); ap.add_argument("--wall-depth", dest="wall_depth", type=float, default=0.0)
A = ap.parse_args()
lin = lambda v: np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)
srgb = lambda v: np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(np.clip(v, 0, None), 1 / 2.4) - 0.055)
rd = lambda p: cv2.imread(p, cv2.IMREAD_UNCHANGED)[..., :3].astype(np.float32) / (65535 if cv2.imread(p, cv2.IMREAD_UNCHANGED).dtype == np.uint16 else 255)
PL = json.load(open(A.placement)); N = len(PL["depth_m_per_frame"])
fg0 = cv2.imread(os.path.join(A.fg, "f_0001.png"), cv2.IMREAD_UNCHANGED); H, W = fg0.shape[:2]
for d in ("static_env", "static_refl", "static_depth"): os.makedirs(os.path.join(A.out, d), exist_ok=True)
fgl = os.path.join(A.out, "static_fg")
if not os.path.exists(fgl): os.symlink(os.path.abspath(A.fg), fgl)
ref = rd(os.path.join(A.shadow, "s_0000.png")) + 1 / 256
room_one = None if os.path.isdir(A.room) else lin(rd(A.room))
stats = []
for i in range(1, N + 1):
    sh = rd(os.path.join(A.shadow, f"s_{i:04d}.png")) + 1 / 256
    r = np.clip(lin(sh) / lin(ref), 0, 1).mean(2)
    r[r > 0.985] = 1.0                                         # render noise where he throws nothing
    r = cv2.resize(cv2.GaussianBlur(r, (0, 0), 0.8), (W, H), interpolation=cv2.INTER_CUBIC)
    room = room_one if room_one is not None else lin(rd(os.path.join(A.room, f"f_{i:04d}.png")))
    cv2.imwrite(os.path.join(A.out, "static_env", f"f_{i:04d}.png"), (np.clip(srgb(room * r[..., None]), 0, 1) * 65535).round().astype(np.uint16))
    stats.append(float(r.min()))
refl = os.path.join(A.out, "_refl.png"); cv2.imwrite(refl, np.zeros((H, W, 3), np.uint16))
for i in range(1, N + 1):
    p = os.path.join(A.out, "static_refl", f"f_{i:04d}.png")
    if not os.path.exists(p): os.symlink(os.path.abspath(refl), p)
wd = A.wall_depth or max(PL["depth_m_per_frame"]) + 1.0
cv2.imwrite(os.path.join(A.out, "static_depth", "f_0001.png"), np.full((H, W), int(min(wd, 49.9) / 50 * 65535), np.uint16))
if A.card:
    card = rd(A.card); e = room_one if room_one is not None else None
    base = rd(A.room) if e is not None else None
    base = cv2.resize(base, (card.shape[1], card.shape[0]), interpolation=cv2.INTER_AREA)   # the card may be a smaller render
    diff = (np.abs(card - base).max(2) > 0.02)
    diff = cv2.erode(diff.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    wp = (np.median(card[diff], 0)[::-1] * 255).round(1)          # BGR -> RGB
else:
    wp = np.array([float(v) for v in A.white_plate.split(",")])
ws = np.array([float(v) for v in A.white_source.split(",")])
f, hor, ch = PL["plate_focal_px"], PL["plate_horizon_row"], PL["lens_height_m"]
P = {"_doc": "setup_comp_inputs.py: measured camera (level_and_place.py), room x his shadow from the rebuilt set",
     "frame": [W, H], "frames": N, "render_fps": [24, 1], "room_scale": 1.0,
     "plate": {"fps": 24.0, "start_seconds": 0.0, "camera_height": ch, "focal_px": f, "horizon_y": hor},
     "source": {"px_per_metre_at_face": A.ppm, "eye_height": A.eye},
     "light": {"white_plate_srgb": (wp / 255).round(4).tolist(), "white_source_srgb": (ws / 255).round(4).tolist(),
               "exposure_stops": A.exposure, "top_light_stops": [0.1, -0.25], "top_light_low_m": 0.9, "flash_follow": 0.0},
     "lens": {"wrap": 0.0, "edge_tween_px": 3, "edge_colour_from_inside_px": 1.5, "edge_choke": 0.15, "f_stop": 2.0,
              "performer_softness_px": 0.5, "_doc": "the c033 room 2 v2 settings (PROBLEM_INDEX: outline flash)"}}
json.dump(P, open(os.path.join(A.out, "params.json"), "w"), indent=1)
json.dump({"lens_mm": f * 36 / H, "performer_depth_per_frame": PL["depth_m_per_frame"], "check_horizon_px": [W / 2, hor], "room_scale": 1.0},
          open(os.path.join(A.out, "scene_static.json"), "w"), indent=1)
np.save(os.path.join(A.out, "plate_light.npy"), np.full((N, 3), 0.5, np.float32))
print("frames", N, "room white", wp, "take white", ws, "darkest shadow", round(min(stats), 3))
