"""Put his real take into the storm set: back pass, then him (re-projected to the 3D lens and matted), then the front pass.
$0. PREVIEW QUALITY: the matte here is the local MediaPipe selfie segmenter (soft, ~4 px), good enough to judge
framing, scale and the camera turn. The shipping matte is the proven one (docs/PROBLEM_INDEX.md: matte-video-proxy,
as delivered), a paid call that needs Fendi's OK.
usage: storm_him_comp.py <storm_set.json> <storm_out_dir> <take.mov> <take_start_s> <out_png_dir> [--grade 1] [--matte-dir DIR] [--drop-hue 35,95]
  storm_out_dir   storm_set_build.py's output with png_back/ and png_front/ (--passes back,front)
  take_start_s    file time of the take that plays at the storm's frame 1
  --drop-hue      OpenCV hue range (0-179) of a coloured backdrop to remove from the segmenter's matte (his green blanket: 35,95)
  --matte-dir     a folder of alpha PNGs (one per storm frame, in the take's own 1920x1080 frame) to use instead of the segmenter
Writes <out_png_dir>/storm_0001.png ...; storm_set_comp.py then adds rain, grain and the mp4.

Why re-projection is exact: the 3D lens stands where his phone stood (camera.footage in storm_set.json, measured from the
room's lines in his take). A different tilt, turn, roll and focal length from the same spot is a pure rotation about
the lens, so his picture maps to the 3D picture by one homography per frame, with no parallax error.
Models: $AVT_MODELS/selfie_multiclass_256x256.tflite."""
import glob, json, math, os, subprocess, sys
import cv2
import numpy as np

pp, od, take, t0, out = sys.argv[1:6]; opt = dict(zip(sys.argv[6::2], sys.argv[7::2]))
P = json.load(open(pp)); C = P["camera"]; F = C["footage"]; FPS = P["render"]["fps"]
backs = sorted(glob.glob(f"{od}/png_back/storm_*.png")); fronts = sorted(glob.glob(f"{od}/png_front/storm_*.png"))
assert backs and len(backs) == len(fronts), "render --passes back,front first"
h, w = cv2.imread(backs[0]).shape[:2]; k = w / P["render"]["size"][0]
SW, SH = F["size"]

def basis(pitch, roll, yaw):
    """Camera axes (right, up, forward) as world columns; world: X right, Y away from the camera, Z up.
    roll: world up leans this far to the right in the picture; yaw: + = turned left."""
    cp, sp = math.cos(pitch), math.sin(pitch); cr, sr = math.cos(roll), math.sin(roll)
    fwd = np.array([0, cp, sp]); up0 = np.array([0, -sp, cp]); right0 = np.array([1.0, 0, 0])
    R = np.stack([cr * right0 + sr * up0, -sr * right0 + cr * up0, fwd], 1)
    cy, sy = math.cos(yaw), math.sin(yaw)
    return np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]]) @ R
def K(f, cx, cy): return np.array([[f, 0, cx], [0, -f, cy], [0, 0, 1.0]])       # camera (x right, y up, z forward) -> pixels
Kr = K(F["focal_px"], SW / 2, SH / 2); Rr = basis(math.radians(F["pitch_deg"]), math.radians(F["roll_deg"]), 0.0)
Kv = K(C["focal_px"] * k, w / 2, h / 2)
MOVE = [list(m) + [0.0] * (3 - len(m)) for m in (C.get("move", {}).get("keys") or [[0, 0, 0]])]
def yaw_at(t):
    if t <= MOVE[0][0]: return math.radians(MOVE[0][2])
    for a, b in zip(MOVE, MOVE[1:]):
        if t <= b[0]:
            f = (t - a[0]) / max(b[0] - a[0], 1e-6); f = f * f * (3 - 2 * f); return math.radians(a[2] + (b[2] - a[2]) * f)
    return math.radians(MOVE[-1][2])
assert all(abs(m[1]) < 1e-6 for m in MOVE), "a camera slide (x) cannot be matched by re-projecting his take; use a turn (yaw)"

seg = None
if "--matte-dir" not in opt:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(os.environ.get("AVT_MODELS", "models"), "selfie_multiclass_256x256.tflite")),
        running_mode=vision.RunningMode.IMAGE, output_confidence_masks=True))
def matte(rgb, i):
    if seg is None: return cv2.imread(sorted(glob.glob(opt["--matte-dir"] + "/*.png"))[i], cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
    a = np.zeros((SH, SW), np.float32)
    for x0 in (0, (SW - SH) // 2, SW - SH):                                 # three square tiles across: the model sees 256 px squares
        tile = np.ascontiguousarray(rgb[:, x0:x0 + SH])
        bg = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=tile)).confidence_masks[0].numpy_view()
        fg = cv2.resize(1 - np.squeeze(bg), (SH, SH), interpolation=cv2.INTER_CUBIC)
        a[:, x0:x0 + SH] = np.maximum(a[:, x0:x0 + SH], fg)
    a = np.clip((cv2.GaussianBlur(a, (0, 0), 1.5) - 0.35) / 0.3, 0, 1)
    if "--drop-hue" in opt:                                                 # a coloured backdrop the segmenter keeps (his green blanket, 17 Nov)
        lo, hi = (int(v) for v in opt["--drop-hue"].split(","))
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        g = ((hsv[..., 0] >= lo) & (hsv[..., 0] <= hi) & (hsv[..., 1] > 45) & (hsv[..., 2] > 25)).astype(np.uint8)
        g = cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)); g = cv2.dilate(g, np.ones((5, 5), np.uint8))
        a = a * (1 - cv2.GaussianBlur(g.astype(np.float32), (0, 0), 1.5))
        m = cv2.morphologyEx((a > 0.5).astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))   # scraps of the backdrop: keep his own shape only
        n, lab, st, _ = cv2.connectedComponentsWithStats(m)
        if n > 1:
            keep = cv2.dilate((lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8), np.ones((15, 15), np.uint8))
            a = a * cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 2)
    return a

os.makedirs(out, exist_ok=True)
proc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-ss", str(float(t0)), "-i", take, "-vf", f"fps={FPS},scale={SW}:{SH}",
                         "-frames:v", str(len(backs)), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
GR = np.array([0.98, 0.90, 0.82], np.float32) * 0.82 if opt.get("--grade", "1") == "1" else np.ones(3, np.float32)   # BGR: cooler, darker: storm light
for i, (bp, fp) in enumerate(zip(backs, fronts)):
    b = proc.stdout.read(SW * SH * 3)
    if len(b) < SW * SH * 3: break
    rgb = np.frombuffer(b, np.uint8).reshape(SH, SW, 3)
    a = matte(rgb, i)
    Rv = basis(math.radians(C["pitch_deg"]), 0.0, yaw_at(i / FPS))
    H = Kv @ Rv.T @ Rr @ np.linalg.inv(Kr)
    him = cv2.warpPerspective(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), H, (w, h), flags=cv2.INTER_AREA).astype(np.float32) / 255
    al = cv2.warpPerspective(a, H, (w, h), flags=cv2.INTER_AREA)[..., None]
    him = np.clip((him - 0.5) * 1.08 + 0.5, 0, 1) * GR
    o = cv2.imread(bp).astype(np.float32) / 255
    o = o * (1 - al) + him * al
    fr = cv2.imread(fp, cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    fa = fr[..., 3:4]; o = o * (1 - fa) + fr[..., :3] * fa
    cv2.imwrite(f"{out}/storm_{i + 1:04d}.png", (np.clip(o, 0, 1) * 255 + 0.5).astype(np.uint8))
print("wrote", out, i + 1, "frames")
