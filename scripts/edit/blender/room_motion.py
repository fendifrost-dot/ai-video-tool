"""The showroom plate without generative video: the still's layers moved by fixed curves, $0 and deterministic.
usage: room_motion.py <params.json> <layers_dir> <snow_dir> <out_dir> [--only FRAME] [--mp4 out.mp4]
  layers_dir  from room_layers.py (bg, car, penguin, glass, led, layers.json)
  snow_dir    from snow.py (snow_0001.png ...)
Writes out_dir/plate_0001.png ... (1080x1920, 8-bit RGB), the plate build_scene.py projects. Per frame, back to front:
  1. the yard through the glass: the trees sway with the wind (a smooth displacement that grows with height above
     the snowy ground and fades to 0 at every frame and mullion, so nothing outside the glass moves)
  2. Blender's snow, only in the glass
  3. the Ferrari, its LED light dimmed by the rolling band a phone's rolling shutter records from PWM-driven LEDs:
     each sensor row is read a little later, so the lamp's on/off cycle lands as soft dark bands that crawl slowly
     across the lamp (the beat between the PWM rate and the frame rate). It is not a flash: the whole lamp never
     goes dark at once
  4. the penguin, its own pixels moved by keyframed tracks: it waddles away along the floor (never redrawn)"""
import json, math, os, sys, subprocess
import cv2, numpy as np

argv = sys.argv[1:]
pp, ld, sd, od = argv[:4]
opt = dict(zip(argv[4::2], argv[5::2]))
P = json.load(open(pp)); V = P["room_v5"]; WD = V["wind"]; TR = V["trees"]; LD = V["led"]; PG = V["penguin_motion"]
NFR = P["frames"]; FPS = 60000 / 1001
L = json.load(open(f"{ld}/layers.json"))
r16 = lambda p: cv2.imread(p, cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535
bg = r16(f"{ld}/bg.png"); car = r16(f"{ld}/car.png"); pen = r16(f"{ld}/penguin.png"); led = r16(f"{ld}/led.png")
glass = (cv2.imread(f"{ld}/glass.png", 0) > 127).astype(np.float32)
H, W = bg.shape[:2]
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def gust(t):
    return WD["base"] + sum(a * math.sin(2 * math.pi * t / p + ph) for a, p, ph in WD["gusts"])

# ---- trees: two smooth phase fields so neighbouring branches do not move in lockstep (seeded) ----
rng = np.random.default_rng(TR["seed"])
def smooth_field(sigma):
    f = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), sigma)
    return f / (np.abs(f).max() + 1e-6)
ph1 = smooth_field(TR["phase_sigma_px"]) * math.pi; ph2 = smooth_field(TR["phase_sigma_px"] / 2) * math.pi
edge = cv2.distanceTransform((glass > 0).astype(np.uint8), cv2.DIST_L2, 5)
taper = np.clip(edge / TR["edge_taper_px"], 0, 1)
y_ground = TR["ground_y_1080"]
height_w = np.clip((y_ground - yy) / (y_ground - TR["full_sway_y_1080"]), 0, 1) ** 1.5
amp = TR["amplitude_px"] * height_w * taper * glass

# ---- LED rolling band ----
c_rgb, c_a = car[..., :3], car[..., 3:]
lum = c_rgb.max(2)
led_frac = np.clip(led / np.maximum(lum, 1e-4), 0, 1)[..., None]       # share of each car pixel that is LED light
def band(f):
    ph = yy[:, :1] / LD["period_rows"] + f * LD["drift_cycles_per_frame"]
    pulse = (0.5 - 0.5 * np.cos(2 * math.pi * ph)) ** LD["sharpness"]
    return 1 - LD["depth"] * pulse                                       # 1 = full light, per row

# ---- penguin: its own pixels moved by keyframed tracks, never redrawn (inverse maps, back to the still) ----
# It stands a beat, then waddles away along the floor: its ground point follows a path in the room (MEASURED camera,
# so it scales with perspective), its body rocks about the stance foot each step and bobs, its head tilts about the
# neck, and the flipper that stands clear of its body is held out for balance. `mirror` turns it to face its path
# (the still's own pixels, flipped). The clean still shows wherever it has been.
fx, fy = L["penguin_feet_px_1080"]
F_ = P["plate"]["focal_px"]; HOR_ = P["plate"]["horizon_y"]; CH_ = P["plate"]["camera_height"]
WK = PG["walk"]; X0, Z0 = P["penguin"]["position"]
def ground_px(X, Z): return 540 + F_ * X / Z, HOR_ + F_ * CH_ / Z
g0 = ground_px(X0, Z0)
neck_y = PG["neck_y_1080"]
FL = PG["flipper"]
flip = np.zeros((H, W), np.float32); fx0, fy0, fx1, fy1 = FL["box_1080"]; flip[fy0:fy1, fx0:fx1] = 1
flip = cv2.GaussianBlur(flip, (0, 0), 1.0)[..., None]
pen_body, pen_flip = pen * (1 - flip), pen * flip          # premultiplied, so the split adds back to the penguin
piv_flip = list(FL["pivot_1080"]); feet_piv = [list(q) for q in WK["feet_1080"]]; flap_sign = 1
if PG["mirror"]:                                          # about the vertical through its feet
    mx = (2 * fx - xx).astype(np.float32)
    pen_body = cv2.remap(pen_body, mx, yy, cv2.INTER_LINEAR); pen_flip = cv2.remap(pen_flip, mx, yy, cv2.INTER_LINEAR)
    piv_flip[0] = 2 * fx - piv_flip[0]; feet_piv = [[2 * fx - q[0], q[1]] for q in feet_piv]; flap_sign = -1
ys_, xs_ = np.nonzero(pen_body[..., 3] > 0.01)
nx = float(np.median(xs_[(ys_ > neck_y - 3) & (ys_ < neck_y + 3)]))
def track(keys, t):
    """Smooth (cosine) interpolation through [t, value] keys; held outside them."""
    if t <= keys[0][0]: return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1: u = (t - t0) / (t1 - t0); return v0 + (v1 - v0) * (0.5 - 0.5 * math.cos(math.pi * u))
    return keys[-1][1]
def walked(t):
    """Metres walked by t: still until start_s, then up to speed over ramp_s (integral of a smooth ramp)."""
    t0, r, v = WK["start_s"], WK["ramp_s"], WK["speed_mps"]
    if t <= t0: return 0.0
    u = t - t0
    if u <= r: return v * (u / 2 - r / (2 * math.pi) * math.sin(math.pi * u / r))
    return v * (r / 2 + (u - r))
def rot(px, py, cx, cy, deg):
    a = math.radians(deg); c, s_ = math.cos(a), math.sin(a)
    return cx + c * (px - cx) - s_ * (py - cy), cy + s_ * (px - cx) + c * (py - cy)
def place_penguin(t, out):
    d = walked(t); dx, dz = WK["direction"]
    X, Z = X0 + dx * d, Z0 + dz * d
    gx_t, gy_t = ground_px(X, Z)
    ox, oy = fx + gx_t - g0[0], fy + gy_t - g0[1]                     # its feet in this frame (from the measured ones)
    k = Z0 / Z                                                         # perspective scale
    on = min(1.0, d / max(WK["speed_mps"] * WK["step_s"], 1e-6))      # the waddle builds over the first step
    ph = max(t - WK["start_s"], 0) / WK["step_s"]; stance = int(ph) % 2; u = ph - int(ph)
    roll = on * WK["roll_deg"] * math.sin(math.pi * u) * (1 if stance == 0 else -1)
    bob = on * WK["bob_px"] * math.sin(math.pi * u) + PG["bob_px"] * math.sin(2 * math.pi * t / PG["sway_period_s"])
    sway = (1 - on) * PG["sway_deg"] * math.sin(2 * math.pi * t / PG["sway_period_s"] + PG["sway_phase"])
    breath = 1 + PG["breath"] * math.sin(2 * math.pi * t / PG["breath_period_s"])
    pvx, pvy = feet_piv[stance] if on > 0 else (fx, fy)
    x0, y0 = max(int(ox - 220 * k), 0), max(int(oy - 460 * k), 0)
    x1, y1 = min(int(ox + 220 * k), W), min(int(oy + 40 * k), H)
    if x1 <= x0 or y1 <= y0: return                                   # walked out of frame
    gx, gy = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
    rx, ry = (gx - ox) / k + fx, (gy - oy) / k + fy + bob             # undo the path and the bob: the still's frame
    bx, by = rot(rx, ry, pvx, pvy, -(roll + sway))                    # undo the rock about the stance foot
    by = fy + (by - fy) / breath
    w = np.clip((neck_y + 12 - by) / 24, 0, 1)
    hx, hy = rot(bx, by, nx, neck_y, -track(PG["head_keys"], t))
    hx = nx + (hx - nx) / (1 - PG["head_turn_squash"] * track(PG["head_turn_keys"], t))
    sx = (bx + w * (hx - bx)).astype(np.float32); sy = (by + w * (hy - by)).astype(np.float32)
    o = out[y0:y1, x0:x1]
    p = cv2.remap(pen_body, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    o = o * (1 - p[..., 3:]) + p[..., :3]
    fxp, fyp = rot(bx, by, *piv_flip, -flap_sign * track(FL["keys"], t))
    p = cv2.remap(pen_flip, fxp.astype(np.float32), fyp.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    out[y0:y1, x0:x1] = o * (1 - p[..., 3:]) + p[..., :3]

def frame(f):
    t = (f - 1) / FPS; g = gust(t)
    dx = amp * g * (np.sin(2 * math.pi * t / TR["period_s"] + ph1) * TR["sway_mix"] + np.sin(2 * math.pi * t / TR["flutter_period_s"] + ph2) * (1 - TR["sway_mix"]))
    dx += amp * g * TR["lean"]                                           # the wind leans them a little downwind
    dy = 0.25 * amp * g * np.sin(2 * math.pi * t / TR["period_s"] + ph2)
    out = cv2.remap(bg, xx - dx, yy - dy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    sp = f"{sd}/snow_{f:04d}.png"
    if os.path.exists(sp):
        s = r16(sp); sa = s[..., 3:] * glass[..., None]
        out = out * (1 - sa) + s[..., :3] * sa
    lit = c_rgb * (1 - (1 - band(f))[..., None] * led_frac)
    out = out * (1 - c_a) + lit
    if PG.get("enabled", True): place_penguin(t, out)          # off: the clean still shows where it stood
    return out

os.makedirs(od, exist_ok=True)
frames = [int(opt["--only"])] if "--only" in opt else range(1, NFR + 1)
for f in frames:
    cv2.imwrite(f"{od}/plate_{f:04d}.png", (np.clip(frame(f), 0, 1) * 255).round().astype(np.uint8))
if "--mp4" in opt:
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", "60000/1001", "-i", f"{od}/plate_%04d.png",
                    "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", opt["--mp4"]], check=True)
print("DONE plate", len(list(frames)))
