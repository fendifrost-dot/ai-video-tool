"""Keep his own cap and recolour it; darken the swap's jeans. $0, no generation.

Fendi, 24 Oct (c044): "Worst case scenario just change the color of my hat instead of trying to do a swap. You can't
see the front of the hat anyway. And darker jeans would look better for this shot." The Genjutsu cap never sat
where his black cap sits (he wears it low, the old brim reached his glasses), so every put-back left black of the old
cap under the new one. This script drops the swap above his eyes altogether: every row above the eye line is the
ORIGINAL take (his cap, forehead, the wall, his shadow), and the cap's own pixels are shifted from black to the
jacket's cream with their shading kept. Below the eye line the dressed put-back stays, except that the jeans
(blue-ish clothes pixels below the jacket hem) are darkened to an indigo.

    python scripts/edit/recolor_cap_jeans.py <original take> <dressed put-back> <out dir> [--cap r,g,b]
        [--jeans-gamma 1.5] [--jeans-tint 0.70,0.80,1.12]

Both inputs are the same size and frame rate (the put-back is built on the take). Prints the cream it sampled from
the jacket, the frames in which no face was found, and the proof: max |out - original| on his face skin below the
eye line (the landmark oval, as body_only_swap protects it), which must be 0.
Env: AVT_MODELS (dir with face_landmarker.task + selfie_multiclass_256x256.tflite), AVT_HEAD_ZOOM (as body_only_swap).
"""
import os, sys, json, argparse, subprocess
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

ap = argparse.ArgumentParser()
ap.add_argument("orig"); ap.add_argument("dressed"); ap.add_argument("out_dir")
ap.add_argument("--cap", default=None, help="cream as r,g,b; default: sampled from the jacket")
ap.add_argument("--jeans-gamma", type=float, default=1.75)
ap.add_argument("--jeans-tint", default="0.68,0.75,1.00")
ap.add_argument("--no-jeans", action="store_true")
a = ap.parse_args()
os.makedirs(a.out_dir, exist_ok=True)
MODELS = os.environ.get("AVT_MODELS", os.path.join(os.path.dirname(__file__), "models"))
HEAD_ZOOM = int(os.environ.get("AVT_HEAD_ZOOM", "0"))

def probe(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                        "-of", "json", p], capture_output=True, text=True).stdout
    s = json.loads(o)["streams"][0]; return int(s["width"]), int(s["height"]), s["r_frame_rate"]
def read(p, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
W, H, RATE = probe(a.orig)
orig, dressed = read(a.orig, W, H), read(a.dressed, W, H)
n = min(len(orig), len(dressed))
print("frames", n, "size", W, H, RATE)

seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "selfie_multiclass_256x256.tflite")),
    running_mode=vision.RunningMode.IMAGE, output_category_mask=True))
def cats(img):
    r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
    return np.squeeze(r.category_mask.numpy_view()).copy()   # 0 bg, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others
lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1))
OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
BROWS = [70,63,105,66,107,336,296,334,293,300]
EYES = [159,160,158,386,387,385]
DET = (0.1, 0.05, 0.85, 0.6)

def face(img, oc):
    """(oval points, brow row, face height, eye row) or None."""
    h0, w0, _ = img.shape
    x0, y0 = int(w0 * DET[0]), int(h0 * DET[1]); cw, ch = int(w0 * DET[2]), int(h0 * DET[3])
    r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img[y0:y0 + ch, x0:x0 + cw])))
    if not r.face_landmarks and HEAD_ZOOM:
        fs = (oc == 3).astype(np.uint8)
        k, lab, st, _ = cv2.connectedComponentsWithStats(fs)
        if k > 1:
            bx, by, bw, bh, _ = st[1 + np.argmax(st[1:, cv2.CC_STAT_AREA])]
            side = int(max(bw, bh) * 2.2); x0 = max(0, bx + bw // 2 - side // 2); y0 = max(0, by + bh // 2 - side // 2)
            crop = img[y0:y0 + side, x0:x0 + side]; ch, cw = crop.shape[:2]
            big = cv2.resize(crop, (cw * HEAD_ZOOM, ch * HEAD_ZOOM), interpolation=cv2.INTER_CUBIC)
            r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
    if not r.face_landmarks: return None
    L = r.face_landmarks[0]
    pts = np.array([[x0 + L[k].x * cw, y0 + L[k].y * ch] for k in OVAL], np.float32)
    fh = pts[:, 1].max() - pts[:, 1].min()
    brow = min(y0 + L[k].y * ch for k in BROWS) - 0.04 * fh
    eye = min(y0 + L[k].y * ch for k in EYES) - 0.02 * fh
    return pts, brow, fh, eye

# pass 1: faces and labels per frame; the eye line and face height smoothed over time
ocs, faces = [], []
for i in range(n):
    oc = cats(orig[i]); ocs.append(oc); faces.append(face(orig[i], oc))
missing = [i for i, f in enumerate(faces) if f is None]
print("frames without a face:", missing)
if len(missing) == n: raise SystemExit("no face found in any frame")
def smooth(vals):
    v = np.array([x if x is not None else np.nan for x in vals], np.float32)
    idx = np.arange(len(v)); v = np.interp(idx, idx[np.isfinite(v)], v[np.isfinite(v)])
    return np.array([np.median(v[max(0, k - 4):k + 5]) for k in range(len(v))], np.float32)
eye_s = smooth([f[3] if f else None for f in faces])
fh_s = smooth([f[2] if f else None for f in faces])
cx_s = smooth([float(f[0][:, 0].mean()) if f else None for f in faces])

# the cream: lit, warm clothes pixels of the dressed frames (the jacket)
if a.cap:
    cream = np.array([float(x) for x in a.cap.split(",")], np.float32)
else:
    samp = []
    for i in range(0, n, max(1, n // 8)):
        dc = cats(dressed[i]); px = dressed[i][dc == 4].astype(np.float32)
        g = px.mean(1); warm = (px[:, 0] > px[:, 2] + 25) & (g > 150)
        if warm.any(): samp.append(px[warm])
    cream = np.median(np.concatenate(samp), 0)
print("cream r,g,b:", [round(float(c), 1) for c in cream])
tint = np.array([float(x) for x in a.jeans_tint.split(",")], np.float32)

out_p = os.path.join(a.out_dir, "recolored.mp4")
vw = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", RATE,
                       "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_p], stdin=subprocess.PIPE)
rows = np.arange(H)[:, None]; cols = np.arange(W)[None, :]
proof = 0; proof_at = None; cap_px = []; jeans_px = []
for i in range(n):
    o, d, oc = orig[i], dressed[i], ocs[i]
    eye, fh, cx = float(eye_s[i]), float(fh_s[i]), float(cx_s[i])
    cut = eye + 0.06 * fh                       # a little under the eye tops: the old brim is above it, the glasses are his in both
    head = rows < cut
    out = np.where(head[..., None], o, d)       # above his eyes: the take, untouched (cap, forehead, wall, shadow)
    # his face below the eye line (the landmark oval, dilated 9 px, as body_only_swap protects it) is the take's, so a
    # put-back whose brow band reached a few rows under this cut cannot leave swap pixels on his face
    fm = np.zeros((H, W), np.uint8)
    f = faces[i] if faces[i] is not None else next((faces[j] for j in range(i, -1, -1) if faces[j] is not None), None) or next(f for f in faces if f is not None)
    cv2.fillPoly(fm, [f[0].astype(np.int32)], 1); fm = cv2.dilate(fm, np.ones((9, 9), np.uint8)).astype(bool) & ~head
    out[fm] = o[fm]
    # the cap: dark pixels in the head zone around his face that are not face skin, biggest component, feathered
    g = cv2.cvtColor(o, cv2.COLOR_RGB2GRAY)
    box = head & (rows > eye - 1.3 * fh) & (np.abs(cols - cx) < 0.9 * fh)
    cand = (box & (g < 75) & (oc != 3) & (oc != 2)).astype(np.uint8)
    cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    k, lab, st, _ = cv2.connectedComponentsWithStats(cand)
    capm = np.zeros((H, W), np.float32)
    if k > 1:
        big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
        capm = (lab == big).astype(np.uint8)
        capm = cv2.morphologyEx(capm, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(np.float32)
        capm = cv2.GaussianBlur(capm, (0, 0), 1.0); capm[int(cut):] = 0.0     # the feather never crosses the cut
    cap_px.append(float((capm > 0.5).sum()))
    if capm.max() > 0:
        lo, hi = np.percentile(g[capm > 0.5], [3, 97]) if (capm > 0.5).sum() > 50 else (15, 70)
        t = np.clip((g.astype(np.float32) - lo) / max(8.0, hi - lo), 0, 1)
        shade = 0.62 + 0.38 * t                                       # black fabric's shading stretched onto cream
        cream_img = cream[None, None, :] * shade[..., None]
        out = (out.astype(np.float32) * (1 - capm[..., None]) + cream_img * capm[..., None]).round().clip(0, 255).astype(np.uint8)
    # the jeans: blue-ish clothes pixels of the dressed frame below the jacket hem, not the shoes, not skin
    if not a.no_jeans:
        dc = cats(d)
        pxf = d.astype(np.float32); gd = pxf.mean(2)
        jeans = (dc == 4) & (rows > eye + 2.0 * fh) & (pxf[..., 2] >= pxf[..., 0] - 8) & (gd < 185) & ~head
        jm = cv2.morphologyEx(jeans.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        jm = cv2.GaussianBlur(jm.astype(np.float32), (0, 0), 1.5)
        jeans_px.append(float((jm > 0.5).sum()))
        dark = (255.0 * (pxf / 255.0) ** a.jeans_gamma * tint[None, None, :]).clip(0, 255)
        out = (out.astype(np.float32) * (1 - jm[..., None]) + dark * jm[..., None]).round().clip(0, 255).astype(np.uint8)
    # proof: his face (the landmark oval, dilated 9 px, as body_only_swap protects it) below the eye line is the take's
    if fm.any():
        dm = np.abs(out.astype(int) - o.astype(int)).max(2) * fm
        if dm.max() > proof:
            proof = int(dm.max()); py, px = np.unravel_index(int(dm.argmax()), dm.shape); proof_at = (i, py, px)
    vw.stdin.write(np.ascontiguousarray(out).tobytes())
    if i in (0, n // 2, n - 1):
        cv2.imwrite(os.path.join(a.out_dir, f"capmask_{i:03d}.png"), (capm * 255).astype(np.uint8))
vw.stdin.close()
if vw.wait() != 0: raise SystemExit("encode failed")
print("cap px per frame: min %d median %d max %d" % (min(cap_px), np.median(cap_px), max(cap_px)))
if jeans_px: print("jeans px per frame: min %d median %d max %d" % (min(jeans_px), np.median(jeans_px), max(jeans_px)))
print("max |out-original| on the face oval below the eye line:", proof, "at (frame, y, x)", proof_at)
print("wrote", out_p)
