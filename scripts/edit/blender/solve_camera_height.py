"""Camera rotation and height from measure_camera_vps.py's output plus one upright object of known height, $0.

The depth vanishing point and the vertical vanishing point give the camera's rotation (focal from the pair); a vertical
of known height standing on the floor (a door: bottom and top pixel on one edge) gives the lens height. A second
upright (a person: feet and head pixels, height known) is solved the same way as a check.

usage: solve_camera_height.py <vps.json> <depth_vp_index> <vertical_vp_index> <bx,by,tx,ty,height_m> [more uprights...]
Pixels in the measured picture's own size. Prints tilt (down +), roll, focal, and for each upright: the lens height
it implies and its distance."""
import sys, json
import numpy as np

M = json.load(open(sys.argv[1])); W, H = M["size"]; c = np.array([W / 2, H / 2])
i0, i1 = int(sys.argv[2]), int(sys.argv[3])
v0, v1 = np.array(M["vps"][i0]["point"]), np.array(M["vps"][i1]["point"])
f = float(np.sqrt(-np.dot(v0 - c, v1 - c)))
Kinv = lambda p: np.array([(p[0] - c[0]) / f, (p[1] - c[1]) / f, 1.0])     # camera coords: x right, y down, z forward
d0 = Kinv(v0); d0 /= np.linalg.norm(d0)
up = -Kinv(v1); up /= np.linalg.norm(up)                       # the vertical VP is below (tilted down): up points away
if up[1] > 0: up = -up                                         # image y is down: "up" has negative y
fwd = d0 - np.dot(d0, up) * up; fwd /= np.linalg.norm(fwd)
if fwd[2] < 0: fwd = -fwd
right = np.cross(up, fwd)
R = np.stack([right, fwd, up])                                 # world (x right, y forward, z up) from camera coords
tilt_down = float(np.degrees(np.arcsin(-np.dot(np.array([0, 0, 1.0]), up) * -1)))   # see below
# camera optical axis (0,0,1) in world: R @ (0,0,1)
ax = R @ np.array([0, 0, 1.0]); tilt_down = float(-np.degrees(np.arcsin(ax[2])))
cam_right = R @ np.array([1.0, 0, 0]); roll = float(np.degrees(np.arcsin(cam_right[2])))
print(f"focal {f:.1f} px ({np.degrees(2*np.arctan(W/2/f)):.1f} deg across), tilt {tilt_down:.2f} deg down, roll {roll:.2f} deg")
out = {"focal_px": f, "tilt_down_deg": tilt_down, "roll_deg": roll, "size": [W, H], "uprights": []}
for arg in sys.argv[4:]:
    bx, by, tx, ty, hm = (float(v) for v in arg.split(","))
    wb = R @ Kinv((bx, by)); wt = R @ Kinv((tx, ty))
    # floor point = C + t wb (z = 0 -> t = -h / wb_z); top point = C + s wt (z = hm -> s = (hm - h) / wt_z)
    # same horizontal distance: (-h / wb_z) |wb_xy| = ((hm - h) / wt_z) |wt_xy|
    a = np.hypot(*wb[:2]) / -wb[2]; b = np.hypot(*wt[:2]) / wt[2] if abs(wt[2]) > 1e-9 else np.inf
    # a h = b (hm - h)  ->  h = b hm / (a + b)
    h = b * hm / (a + b) if np.isfinite(b) else hm
    dist = a * h
    print(f"upright {hm} m at ({bx:.0f},{by:.0f})-({tx:.0f},{ty:.0f}): lens height {h:.3f} m, distance {dist:.2f} m")
    out["uprights"].append({"bottom": [bx, by], "top": [tx, ty], "height_m": hm, "lens_height_m": h, "distance_m": dist})
json.dump(out, open(sys.argv[1].replace(".json", "_solved.json"), "w"), indent=1)
