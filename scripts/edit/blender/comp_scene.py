"""Finish the Blender passes into the shot, $0: measured light on him, the island in front of him, focus, grain.
usage: comp_scene.py <params.json> <passes_dir> <move> <plate_light.npy> <out.mp4> [--frames N] [--stills DIR]
       [--only FRAME[,FRAME...]] [--wrap screen|off|light] [--env-dir DIR] [--wide-env DIR] [--stats out.json]

Inputs are build_scene.py's passes for one camera move (static or dolly) and scene_<move>.json (his depth per frame).
His light, all from params.json:
  - white balance + exposure: the room's white (penguin belly) over the take's white (the door beside him), per channel,
    in linear light, so he takes the room's warm downlight without a guessed "darken";
  - top light: +/- stops from his head to the counter (the downlight is in front of and above him);
  - the room's light changes: a reference surface's colour per plate frame over its median (measure_plate_light.py),
    followed at `flash_follow`.
Then, as the composite lane does (src/lib/composite/pixels.ts): an inner edge band with a 0.5 screen wrap of the
blurred room, and grain 7 on the finished frame. The room in front of him (depth < his depth) occludes him; that
edge gets the island's own lens blur. Depth of field: thin lens, focused on him. His pixels are graded, never redrawn.

The edge wrap (Fendi, 19 Oct: "there is bleed I believe from the headlight effect, it looks like I'm coming out of
the environment"). Room v5 put bright LED lamps right behind his car-side outline, and the 0.5 screen wrap of the
blurred room lifts that outline toward lamp-white; the rolling LED band then makes it pulse. Switches, all off by
default so the filed v5 renders reproduce bit for bit (params.json `comp` picks the shipped setting):
  --wrap screen   the composite lane's 0.5 screen wrap (v5 as filed)
  --wrap off      no wrap at all (test 1: if the halo goes, the wrap is the cause)
  --wrap light    a normal light wrap: him mixed toward the blurred room by `comp.light_amount`, the room clipped to
                  `comp.light_cap` above him, so a lamp behind him cannot lift his edge by more than amount x cap
  --env-dir DIR   the room pass from another plate, e.g. one rendered with the LED band off (test 2)
  --wide-env DIR  the wrap's blurred room from another env pass, e.g. one rendered with the LED light removed, so the
                  lamps cannot feed the wrap while they still show in the room (fix a)
  --stats FILE    per frame, how much the wrap lifts his edge (luma, 0..255) inside the lamp window
                  (`comp.stats_box_1080[move]`): mean = the halo, its spread over frames = the pulse"""
import argparse, json, os, subprocess
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument("params"); ap.add_argument("passes"); ap.add_argument("move"); ap.add_argument("plate_light"); ap.add_argument("out")
ap.add_argument("--frames", type=int, default=0); ap.add_argument("--stills", default="")
ap.add_argument("--only", default="")   # one frame, or a comma list (tests)
ap.add_argument("--wrap", choices=["screen", "off", "light"], default=None)
ap.add_argument("--env-dir", default=""); ap.add_argument("--wide-env", default=""); ap.add_argument("--stats", default="")
A = ap.parse_args()
P = json.load(open(A.params)); S = json.load(open(os.path.join(A.passes, f"scene_{A.move}.json")))
W, H, NF = 1080, 1920, (A.frames or P["frames"])
FPS = 60000 / 1001
C = P.get("comp", {})
WRAP = A.wrap or C.get("wrap", "screen")
ENV_DIR = A.env_dir or os.path.join(A.passes, f"{A.move}_env")
WIDE_ENV = A.wide_env or (os.path.join(A.passes, C["wide_env"].format(move=A.move)) if C.get("wide_env") else "")

lin = lambda v: np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)
srgb = lambda v: np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(np.clip(v, 0, None), 1 / 2.4) - 0.055)
blur = lambda x, s: cv2.GaussianBlur(x, (0, 0), s) if s > 0.05 else x
erode = lambda a, r: cv2.erode(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
def read_rgba(p):
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535
    return cv2.cvtColor(im, cv2.COLOR_BGRA2RGBA if im.shape[2] == 4 else cv2.COLOR_BGR2RGB)
def depth(i):
    d = os.path.join(A.passes, f"{A.move}_depth")
    f = os.path.join(d, f"f_{i:04d}.png")
    if not os.path.exists(f): f = os.path.join(d, sorted(os.listdir(d))[0])     # locked-off: one depth
    return cv2.imread(f, cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535 * 50.0   # build_scene.py DEPTH_RANGE

L = P["light"]; lens = P["lens"]; pl = P["plate"]
g_wb = lin(np.array(L["white_plate_srgb"])) / lin(np.array(L["white_source_srgb"]))
ref = np.load(A.plate_light); ref_med = np.median(ref, 0)            # the reference surface per plate frame
f_mm = S["lens_mm"]; px_per_mm = H / 36.0; aperture = f_mm / lens["f_stop"]
src = P["source"]; ppm = src["px_per_metre_at_face"]

def coc_px(z, zf):  # thin-lens circle of confusion diameter, px
    z = np.maximum(z, 0.05) * 1000; zf = zf * 1000
    return aperture * f_mm * np.abs(z - zf) / (z * (zf - f_mm)) * px_per_mm

def dof(img, c):     # gather blur by levels of the circle of confusion (diameter px)
    levels = [0, 1, 2, 3, 4, 6]
    stack = [img] + [blur(img, l / 2.3) for l in levels[1:]]
    out = np.zeros_like(img); c = np.clip(c, 0, levels[-1])
    for k in range(len(levels) - 1):
        lo, hi = levels[k], levels[k + 1]
        w = np.clip((c - lo) / (hi - lo), 0, 1)[..., None]; sel = ((c >= lo) & (c <= hi))[..., None]
        out = np.where(sel, stack[k] * (1 - w) + stack[k + 1] * w, out)
    return out

rng = np.random.default_rng(33)
vw = None
if not A.stills:
    vw = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                           "-r", "60000/1001", "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p",
                           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                           "-movflags", "+faststart", A.out], stdin=subprocess.PIPE)
frames = [int(f) for f in A.only.split(",")] if A.only else range(1, NF + 1)
rows = np.arange(H, dtype=np.float32)[:, None]
stats = []
for i in frames:
    zf = S["performer_depth_per_frame"][i - 1]
    env = read_rgba(os.path.join(ENV_DIR, f"f_{i:04d}.png"))
    refl = read_rgba(os.path.join(A.passes, f"{A.move}_refl", f"f_{i:04d}.png"))
    fg = read_rgba(os.path.join(A.passes, f"{A.move}_fg", f"f_{i:04d}.png"))
    Z = depth(i)
    # his light: white balance + exposure, the room's light changes, then the top light by height on screen
    t_plate = pl["start_seconds"] + (i - 1) / FPS
    k = min(len(ref) - 1, int(round(t_plate * pl["fps"])))
    flash = np.exp(L["flash_follow"] * np.log(lin(ref[k]) / lin(ref_med)))
    gain = g_wb * 2 ** L["exposure_stops"] * flash
    px_m = H / 36.0 * f_mm / zf                                      # px per metre at his depth
    hor = S["check_horizon_px"][1]; rs = S.get("room_scale", 1.0); ch = pl["camera_height"] * rs   # this camera's horizon row
    y_head = hor - (src["eye_height"] + 0.12 - ch) * px_m
    y_counter = hor - (P["island"]["top"] * rs - ch) * px_m
    tt = np.clip((rows - y_head) / max(1.0, y_counter - y_head), 0, 1)
    top = 2 ** (L["top_light_stops"][0] * (1 - tt) + L["top_light_stops"][1] * tt)
    him = srgb(np.clip(lin(fg[..., :3]) * gain * top[..., None], 0, 1)).astype(np.float32)
    soft = lens.get("performer_softness_px", 0)
    if soft:  # lens softness on premultiplied colour, so the edge does not pick up black
        a0 = fg[..., 3]; him = blur(him * a0[..., None], soft) / np.maximum(blur(a0, soft), 1e-4)[..., None]
        fg[..., 3] = blur(a0, soft)
    # occlusion by the room in front of him (the island), blurred like the island itself
    near = Z < zf - 0.05
    occ = near.astype(np.float32)
    if near.any(): occ = blur(occ, max(0.3, float(np.median(coc_px(Z[near], zf))) / 2.3))
    a = fg[..., 3] * (1 - occ)
    # the room: his reflection (lit like him) added in linear light, then depth of field
    room = srgb(np.clip(lin(env) + lin(refl) * gain * 2 ** np.mean(L["top_light_stops"]), 0, 1)).astype(np.float32)
    room = dof(room, coc_px(Z, zf))
    # edge band + wrap (pixels.ts, at his scale on screen)
    s = px_m / ppm
    inner = blur(erode(a, max(1, round(4 * s))), max(0.6, 5 * s)); edge = blur(np.clip(a - inner, 0, 1), 0.6) * a
    if WIDE_ENV:   # the wrap sees a room without the LED light; the shot still shows the lamps
        envw = read_rgba(os.path.join(WIDE_ENV, f"f_{i:04d}.png"))
        wide = blur(srgb(np.clip(lin(envw) + lin(refl) * gain * 2 ** np.mean(L["top_light_stops"]), 0, 1)).astype(np.float32), 30.0)
    else:
        wide = blur(room, 30.0)
    if WRAP == "screen":
        wrap = him * 0.5 + (1 - (1 - him) * (1 - wide)) * 0.5
    elif WRAP == "light":
        k = C.get("light_amount", 0.2); cap = C.get("light_cap", 0.08)
        wrap = him * (1 - k) + np.minimum(wide, him + cap) * k
    else:
        wrap = him
    v = room * (1 - a[..., None]) + him * a[..., None]
    v = v * (1 - edge[..., None]) + wrap * edge[..., None]
    if A.stats:
        x0, y0, x1, y1 = C.get("stats_box_1080", {}).get(A.move, [0, 0, W, H])
        luma = lambda x: x[..., 0] * 0.2126 + x[..., 1] * 0.7152 + x[..., 2] * 0.0722
        e = edge[y0:y1, x0:x1]; m = e > 0.05
        d = ((luma(wrap[y0:y1, x0:x1]) - luma(him[y0:y1, x0:x1])) * e)[m] * 255   # the wrap's own lift (0 with --wrap off)
        stats.append({"frame": i, "lift_mean": round(float(d.mean()), 3) if m.any() else 0.0,
                      "lift_p95": round(float(np.percentile(d, 95)), 3) if m.any() else 0.0, "edge_px": int(m.sum())})
    v = v + (rng.random((H, W, 1)) - 0.5) * 7 / 255
    out8 = (np.clip(v, 0, 1) * 255).round().astype(np.uint8)
    if A.stills:
        os.makedirs(A.stills, exist_ok=True); cv2.imwrite(os.path.join(A.stills, f"c_{i:04d}.png"), cv2.cvtColor(out8, cv2.COLOR_RGB2BGR))
    else:
        vw.stdin.write(out8.tobytes())
if vw: vw.stdin.close(); vw.wait()
if A.stats:
    lm = np.array([r["lift_mean"] for r in stats])
    json.dump({"move": A.move, "wrap": WRAP, "env_dir": ENV_DIR, "wide_env": WIDE_ENV,
               "lift_mean": round(float(lm.mean()), 3), "lift_spread_sd": round(float(lm.std()), 3),
               "frames": stats}, open(A.stats, "w"), indent=1)
print("wrote", A.stills or A.out, "move", A.move, "wrap", WRAP, "gain", np.round(g_wb, 4), "frames", len(list(frames)))
