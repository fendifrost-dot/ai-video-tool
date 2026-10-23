"""Body-only clothing swap, $0: clothes from the Genjutsu output, everything else from the ORIGINAL pixels.
usage: body_only_swap.py <original.mp4> <swap.mp4> <out_dir>
- Both cover the same 4.000 s; the original frame at t takes the swap frame at t (swap is time-conformed already).
- Swap frames are aligned to the original by an ECC affine fit on the background (Genjutsu shifts and rescales).
- Taken from the swap: clothes/accessories in either frame, plus the cap (above the brow line, over the head), plus
  any strongly changed pixel next to him that is not protected (an original shoe or hem reaching past the new one).
- Always original: the face from the eyebrows down (landmark face shape: eyes, glasses, nose, mouth, beard), face skin
  and hair below the brows, and skin wherever the swap also shows skin (hands, neck). A swap sleeve over the original
  bare arm wins. The script proves it: max |out - original| inside the protected region is printed (must be 0;
  measured before the final video encode).
- Models (env AVT_MODELS, default ./models): MediaPipe selfie_multiclass_256x256.tflite and face_landmarker.task.
- A small face (env AVT_HEAD_ZOOM=4): see HEAD_ZOOM below. The run must print a first face detection, not None;
  with None the face shape and brow line are missing and the glasses would come from the swap.
- Verified on c033 (18 Oct 2026): docs/research/results/2026-10-18-body-only-swap/BODY_ONLY_SWAP_TEST_2026-10-18.md"""
import subprocess, sys, os, json
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

MODELS = os.environ.get("AVT_MODELS", "models")  # selfie_multiclass_256x256.tflite + face_landmarker.task
orig_p, swap_p, out_dir = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)

def probe(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate,duration", "-of", "json", p], capture_output=True, text=True).stdout
    s = json.loads(o)["streams"][0]; n, d = s["r_frame_rate"].split("/")
    return int(s["width"]), int(s["height"]), float(n) / float(d), float(s["duration"])

def read(p, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-vf", f"scale={w}:{h}:flags=lanczos", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)

W, H, FPS, DUR = probe(orig_p)
_, _, SFPS, SDUR = probe(swap_p)
orig = read(orig_p, W, H)
swap = read(swap_p, W, H)            # upscaled to the original's size; only the clothes are used
print("original", orig.shape, FPS, "swap", swap.shape, SFPS)

seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "selfie_multiclass_256x256.tflite")),
    running_mode=vision.RunningMode.IMAGE, output_category_mask=True))
def cats(img):
    r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
    return np.squeeze(r.category_mask.numpy_view()).copy()   # 0 bg, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others

OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
BROWS = [70,63,105,66,107,336,296,334,293,300]
lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1))
DET = (0.1, 0.05, 0.85, 0.6)  # x, y, w, h of the frame searched for the face (full-body framing: the face is small)
# env AVT_HEAD_ZOOM (default 0, off): when the search box finds no face, enlarge a crop around his face skin this many
# times and look again. The 23 Oct reshoot needs it (his face ~100 px wide at 1080); c033 (18 Oct) runs without it.
HEAD_ZOOM = int(os.environ.get("AVT_HEAD_ZOOM", "0"))
last_face = None
def face_region(img):
    """Mask of the face from the eyebrows down (eyes, glasses, nose, mouth, jaw, beard line), and the brow cut row."""
    global last_face
    h0, w0, _ = img.shape
    x0, y0 = int(w0 * DET[0]), int(h0 * DET[1]); cw, ch = int(w0 * DET[2]), int(h0 * DET[3])
    r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img[y0:y0 + ch, x0:x0 + cw])))
    if not r.face_landmarks and HEAD_ZOOM:   # a small face: look again on an enlarged crop around his face skin
        fs = (cats(img) == 3).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(fs)
        if n > 1:
            bx, by, bw, bh, _ = st[1 + np.argmax(st[1:, cv2.CC_STAT_AREA])]
            side = int(max(bw, bh) * 2.2); x0 = max(0, bx + bw // 2 - side // 2); y0 = max(0, by + bh // 2 - side // 2)
            crop = img[y0:y0 + side, x0:x0 + side]; ch, cw = crop.shape[:2]
            big = cv2.resize(crop, (cw * HEAD_ZOOM, ch * HEAD_ZOOM), interpolation=cv2.INTER_CUBIC)
            r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
    if r.face_landmarks:
        L = r.face_landmarks[0]
        pts = np.array([[x0 + L[k].x * cw, y0 + L[k].y * ch] for k in OVAL], np.float32)
        face_h = pts[:, 1].max() - pts[:, 1].min()
        brow = min(y0 + L[k].y * ch for k in BROWS) - 0.04 * face_h
        last_face = (pts, brow, face_h)
    if last_face is None: return None, None
    pts, brow, face_h = last_face
    m = np.zeros((h0, w0), np.uint8)
    cv2.fillPoly(m, [pts.astype(np.int32)], 1)
    m = cv2.dilate(m, np.ones((9, 9), np.uint8))
    m[: int(brow)] = 0                     # above the brows (cap, forehead under the brim) may take the swap
    return m.astype(bool), brow

# per swap frame: categories and an affine aligning it to the original frame at the same time
SC = 0.25
def gray_small(img): return cv2.resize(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), None, fx=SC, fy=SC).astype(np.float32)
swap_cat, warp = {}, {}
fourcc = cv2.VideoWriter_fourcc(*"mp4v")
tmp = os.path.join(out_dir, "_bodyonly.mp4")
vw = cv2.VideoWriter(tmp, fourcc, FPS, (W, H))
face_err = 0; seam_frames = []
prev_M = np.eye(2, 3, dtype=np.float32)
# frames before the first face detection borrow the first detection (the face shape only gates the cap/brow line)
first = None
for k in range(len(orig)):
    face_region(orig[k])
    if last_face is not None: first = k; break
print("first face detection at frame", first)
for i, o in enumerate(orig):
    t = i / FPS
    j = min(len(swap) - 1, int(round(t * SFPS)))
    oc = cats(o)
    if j not in warp:
        bgmask = cv2.resize(((oc == 0) * 255).astype(np.uint8), None, fx=SC, fy=SC, interpolation=cv2.INTER_NEAREST)
        M = prev_M.copy()
        try:
            _, M = cv2.findTransformECC(gray_small(o), gray_small(swap[j]), M, cv2.MOTION_AFFINE,
                                        (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5), bgmask, 5)
        except cv2.error:
            pass
        prev_M = M
        Mf = M.copy(); Mf[:, 2] /= SC
        sw = cv2.warpAffine(swap[j], Mf, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        warp[j] = sw; swap_cat[j] = cats(sw)
    sw, sc = warp[j], swap_cat[j]
    # always original: face skin and hair (beard) of the ORIGINAL; other skin only where the swap shows skin too
    # (hands, neck). Where the swap puts a sleeve over the original bare arm, the sleeve wins.
    face, brow = face_region(o)
    rows = np.arange(H)[:, None]
    below_brow = (rows > brow) if brow is not None else np.ones((H, 1), bool)
    protect = ((oc == 3) & below_brow) | ((oc == 1) & below_brow) | ((oc == 2) & (sc == 2))
    if face is not None: protect |= face
    clothes = np.isin(oc, (4, 5)) | np.isin(sc, (4, 5))
    # the cap: anything labelled hair/accessory above the brow line, in either frame, comes from the swap
    above_brow = ~below_brow
    clothes |= (np.isin(oc, (1, 5)) | np.isin(sc, (1, 5))) & above_brow
    if last_face is not None:   # cap box: above the brows, over the head; any non-background pixel comes from the swap
        pts, _, fh = last_face
        x_lo, x_hi = int(pts[:, 0].min() - 0.35 * fh), int(pts[:, 0].max() + 0.35 * fh)
        y_lo = int(brow - 0.9 * fh)
        box = np.zeros((H, W), bool); box[max(0, y_lo):int(brow), max(0, x_lo):min(W, x_hi)] = True
        clothes |= box & ((oc != 0) | (sc != 0))
    # where the original garment reaches past the new one (a bigger shoe, a longer hem) the swap shows floor or
    # wall there; the segmenter can miss a dark shoe on a dark floor, so any strong change next to him that is not
    # protected is taken from the swap too (c044, 23 Oct: the original black toe showed under the cream sneaker)
    near = cv2.dilate(((oc != 0) | (sc != 0)).astype(np.uint8), np.ones((31, 31), np.uint8)).astype(bool)
    changed = np.abs(o.astype(np.int16) - sw.astype(np.int16)).max(2) > 40
    clothes |= changed & near
    m = (clothes & ~protect).astype(np.float32)
    m = cv2.GaussianBlur(m, (0, 0), 2.0)
    m[protect] = 0.0                                       # no feather leaks onto the face or hands
    out = (o.astype(np.float32) * (1 - m[..., None]) + sw.astype(np.float32) * m[..., None]).round().clip(0, 255).astype(np.uint8)
    face_err = max(face_err, int(np.abs(out[protect].astype(int) - o[protect].astype(int)).max()) if protect.any() else 0)
    vw.write(cv2.cvtColor(out, cv2.COLOR_RGB2BGR))
    if i in (0, 60, 120, 180, 239):
        cv2.imwrite(os.path.join(out_dir, f"mask_{i:03d}.png"), (m * 255).astype(np.uint8))
vw.release()
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", tmp, "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", os.path.join(out_dir, "c033_body_only_swap.mp4")], check=True)
os.remove(tmp)
print("frames", len(orig), "swap frames aligned", len(warp), "max |out-original| on face/hair/skin:", face_err)
