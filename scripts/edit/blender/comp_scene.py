"""Finish the Blender passes into the shot, $0: measured light on him, the island in front of him, focus, grain.
usage: comp_scene.py <params.json> <passes_dir> <move> <plate_light.npy> <out.mp4> [--frames N] [--stills DIR]

Inputs are build_scene.py's passes for one camera move (static or dolly) and scene_<move>.json (his depth per frame).
His light, all from params.json:
  - white balance + exposure: the room's white (penguin belly) over the take's white (the door beside him), per channel,
    in linear light, so he takes the room's warm downlight without a guessed "darken";
  - top light: +/- stops from his head to the counter (the downlight is in front of and above him);
  - the room's light changes: a reference surface's colour per plate frame over its median (measure_plate_light.py),
    followed at `flash_follow`.
Then, as the composite lane does (src/lib/composite/pixels.ts): an inner edge band with a screen wrap of the
blurred room (lens.wrap, 0.5 in the lane), and grain 7 on the finished frame. The room in front of him (depth < his depth) occludes him; that
edge gets the island's own lens blur. Depth of field: thin lens, focused on him. His pixels are graded, never redrawn."""
import argparse, json, os, subprocess
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument("params"); ap.add_argument("passes"); ap.add_argument("move"); ap.add_argument("plate_light"); ap.add_argument("out")
ap.add_argument("--frames", type=int, default=0); ap.add_argument("--stills", default="")
ap.add_argument("--only", type=int, default=0)
A = ap.parse_args()
P = json.load(open(A.params)); S = json.load(open(os.path.join(A.passes, f"scene_{A.move}.json")))
W, H, NF = 1080, 1920, (A.frames or P["frames"])
FPS = 60000 / 1001

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
frames = [A.only] if A.only else range(1, NF + 1)
rows = np.arange(H, dtype=np.float32)[:, None]
for i in frames:
    zf = S["performer_depth_per_frame"][i - 1]
    env = read_rgba(os.path.join(A.passes, f"{A.move}_env", f"f_{i:04d}.png"))
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
    ec = lens.get("edge_colour_from_inside_px", 0)
    if ec:  # his outline takes the colour of his body just inside it: the take's own background (a white door) is
            # left in the soft edge and changes with the matte every frame; the edge keeps its shape (alpha), not that light
        body = (fg[..., 3] > 0.98).astype(np.float32)
        near = blur(body, ec)
        fill = blur(him * body[..., None], ec) / np.maximum(near, 1e-4)[..., None]
        use = ((fg[..., 3] <= 0.98) & (near > 1e-3))[..., None]
        him = np.where(use, fill, him).astype(np.float32)
    ch = lens.get("edge_choke", 0)
    if ch:  # the matte's thin outer fringe (alpha under `ch`) is dropped and the rest re-spread to 0..1
        fg[..., 3] = np.clip((fg[..., 3] - ch) / (1 - ch), 0, 1)
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
    wide = blur(room, 30.0)
    k = P["lens"].get("wrap", 0.5)                 # share of the blurred room screened onto his outline
    wrap = him * (1 - k) + (1 - (1 - him) * (1 - wide)) * k
    v = room * (1 - a[..., None]) + him * a[..., None]
    v = v * (1 - edge[..., None]) + wrap * edge[..., None]
    v = v + (rng.random((H, W, 1)) - 0.5) * 7 / 255
    out8 = (np.clip(v, 0, 1) * 255).round().astype(np.uint8)
    if A.stills:
        os.makedirs(A.stills, exist_ok=True); cv2.imwrite(os.path.join(A.stills, f"c_{i:04d}.png"), cv2.cvtColor(out8, cv2.COLOR_RGB2BGR))
    else:
        vw.stdin.write(out8.tobytes())
if vw: vw.stdin.close(); vw.wait()
print("wrote", A.stills or A.out, "move", A.move, "gain", np.round(g_wb, 4), "frames", len(list(frames)))
