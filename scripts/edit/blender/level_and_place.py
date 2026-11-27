"""His cut-out, levelled to a level camera and placed in a plate's camera, $0. His pixels are resampled once (one
homography + one scale), never redrawn.

1. Level: the take's camera is measured (measure_camera_vps.py + solve_camera_height.py: focal, tilt, roll). Each
   prep_performer.py frame is warped by the rotation homography K R K^-1 that turns that camera level with the same
   yaw, so verticals stand upright and the horizon is the principal row.
2. Place: the plate's camera is level too, at the SAME lens height. Then a pure scale about the horizon keeps him
   standing on the floor at every depth: a take pixel at height y above his feet maps to the plate exactly as his
   depth changes (MEASURED feet -> depth per frame is printed and written for the comp and the shadow pass).
   s = (f_plate / f_take) * (d_take / d_plate) is fixed by where his first frame stands (--depth, metres).

usage: level_and_place.py <prep_dir> <take_solved.json> <out_dir> --plate W,H,f,cx,cy --depth D --x X
       [--src 1920x1080] [--feet-rows auto]
  take_solved.json: solve_camera_height.py output (focal at its own size; scaled to --src)
  --plate: output size, focal px, principal column and row (the horizon) of the plate's level camera
  --depth: his distance from the plate camera on the first frame; --x: his first-frame body column in the plate
Writes <out>/static_fg/f_####.png (16-bit straight RGBA) and <out>/placement.json (scale, per-frame feet row and depth)."""
import argparse, json, os
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument("prep"); ap.add_argument("solved"); ap.add_argument("out")
ap.add_argument("--plate", required=True); ap.add_argument("--depth", type=float, required=True); ap.add_argument("--x", type=float, required=True)
ap.add_argument("--src", default="1920x1080"); ap.add_argument("--lens-height", type=float, required=True)
A = ap.parse_args()
SW, SH = (int(v) for v in A.src.split("x"))
S = json.load(open(A.solved)); k = SW / S["size"][0]
ft = S["focal_px"] * k; tilt = np.radians(S["tilt_down_deg"]); roll = np.radians(S["roll_deg"])
PW, PH, fp, pcx, pcy = (float(v) for v in A.plate.split(",")); PW, PH = int(PW), int(PH)
# camera coords x right, y down, z forward. The take camera = level camera rotated: pitch down by tilt, then roll.
def Rx(a): c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def Rz(a): c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
R_take = Rz(roll) @ Rx(tilt)             # level -> take; signs VERIFIED on the wall take (verticals -0.23 / +0.02 deg after levelling)
Kt = np.array([[ft, 0, SW / 2], [0, ft, SH / 2], [0, 0, 1]])
# levelled frame: same focal, a canvas tall enough to keep his feet (the level horizon is its principal row)
LW, LH = SW, SH + 400; Kl = np.array([[ft, 0, LW / 2], [0, ft, LH / 2], [0, 0, 1]])
Hm = Kl @ R_take.T @ np.linalg.inv(Kt)     # take pixel -> level pixel
os.makedirs(os.path.join(A.out, "static_fg"), exist_ok=True)
files = sorted(f for f in os.listdir(A.prep) if f.startswith("p_") and f.endswith(".png"))
feet, depth, s = [], [], None
h = A.lens_height
for i, fn in enumerate(files, 1):
    im = cv2.imread(os.path.join(A.prep, fn), cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535
    a = im[..., 3:]; pm = np.dstack([im[..., :3] * a, a])
    lv = cv2.warpPerspective(pm, Hm, (LW, LH), flags=cv2.INTER_LINEAR, borderValue=0)
    al = lv[..., 3]; rows = np.nonzero((al > 0.5).any(1))[0]
    yf = float(rows.max()) if len(rows) else LH / 2 + 1     # his lowest solid row (the lower foot) in the level frame
    d_take = h * ft / max(yf - LH / 2, 1.0)
    if s is None:
        s = (fp / ft) * (d_take / A.depth)
        cols = np.nonzero((al > 0.5).any(0))[0]; x0 = float(np.median(np.nonzero(al > 0.5)[1]))
        M = np.float32([[s, 0, A.x - s * x0], [0, s, pcy - s * LH / 2]])
    pl = cv2.warpAffine(cv2.resize(lv, None, fx=1, fy=1), M, (PW, PH), flags=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR, borderValue=0)
    aa = pl[..., 3:]; rgb = np.where(aa > 1e-4, pl[..., :3] / np.maximum(aa, 1e-4), 0)
    cv2.imwrite(os.path.join(A.out, "static_fg", f"f_{i:04d}.png"), (np.dstack([np.clip(rgb, 0, 1), np.clip(aa, 0, 1)]) * 65535).round().astype(np.uint16))
    yf_p = pcy + s * (yf - LH / 2); feet.append(yf_p); depth.append(h * fp / max(yf_p - pcy, 1.0))
json.dump({"scale": s, "take_focal_px": ft, "plate_focal_px": fp, "lens_height_m": h, "tilt_down_deg": S["tilt_down_deg"],
           "roll_deg": S["roll_deg"], "plate_horizon_row": pcy, "feet_row_per_frame": feet, "depth_m_per_frame": depth},
          open(os.path.join(A.out, "placement.json"), "w"), indent=1)
print(f"scale {s:.4f}; feet row {feet[0]:.1f} -> {feet[-1]:.1f}; depth {depth[0]:.2f} -> {depth[-1]:.2f} m (min {min(depth):.2f}, max {max(depth):.2f})")
