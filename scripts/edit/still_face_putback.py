"""Still face put-back, $0: the original photo's head (face, beard, glasses, cap, hair) pasted back over a clothing edit of
that photo. The edit is aligned to the photo (ECC, similarity, on the head), the head mask comes from the face
landmarks (grown to the cap), the paste is hard inside and feathered at the rim. Prints the proof: max |out-original|
inside the hard head mask, which must be 0. usage: still_face_putback.py <original.jpg> <edit.png> <out.png> [models_dir]"""
import sys, os, numpy as np, cv2
from PIL import Image, ImageOps
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
orig_p, edit_p, out_p = sys.argv[1:4]; models = sys.argv[4] if len(sys.argv) > 4 else os.environ.get("AVT_MODELS", "models")
orig = np.asarray(ImageOps.exif_transpose(Image.open(orig_p)).convert("RGB")); edit = np.asarray(Image.open(edit_p).convert("RGB"))
H, W = edit.shape[:2]; o = cv2.resize(orig, (W, H), interpolation=cv2.INTER_AREA)
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.join(models, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1))
r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(o)))
if r.face_landmarks:
    pts = np.array([[p.x * W, p.y * H] for p in r.face_landmarks[0]], np.float32)
else:  # a small head in a full-body photo: look again in the upper middle, enlarged
    cx0, cy0, cx1, cy1 = int(W * 0.25), 0, int(W * 0.75), int(H * 0.35)
    big = cv2.resize(np.ascontiguousarray(o[cy0:cy1, cx0:cx1]), None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
    assert r.face_landmarks, "no face in the original, even enlarged"
    pts = np.array([[cx0 + p.x * big.shape[1] / 2, cy0 + p.y * big.shape[0] / 2] for p in r.face_landmarks[0]], np.float32)
    print("face found on the enlarged head crop")
x0, y0 = pts.min(0); x1, y1 = pts.max(0); fw, fh = x1 - x0, y1 - y0
print("face box in the edit's frame", int(x0), int(y0), int(fw), int(fh))
# align the edit to the photo on the head region (the edit may drift a few pixels): ECC similarity on grey
hx0, hy0, hx1, hy1 = int(max(0, x0 - fw)), int(max(0, y0 - 1.6 * fh)), int(min(W, x1 + fw)), int(min(H, y1 + 0.6 * fh))
g1 = cv2.cvtColor(o[hy0:hy1, hx0:hx1], cv2.COLOR_RGB2GRAY).astype(np.float32) / 255; g2 = cv2.cvtColor(edit[hy0:hy1, hx0:hx1], cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
warp = np.eye(2, 3, dtype=np.float32)
try:
    cc, warp = cv2.findTransformECC(g1, g2, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
    print("ECC on the head", round(float(cc), 4), "warp", warp.round(3).tolist())
except cv2.error as e:
    print("ECC failed, identity used", e)
# bring the edit into the photo's frame
full = warp.copy(); full[0, 2] += hx0 - (full[0, 0] * hx0 + full[0, 1] * hy0); full[1, 2] += hy0 - (full[1, 0] * hx0 + full[1, 1] * hy0)
edit_al = cv2.warpAffine(edit, full, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
# head mask: the face hull grown sideways and up over the cap, down to the chin only (the collar is the edit's)
hull = cv2.convexHull(pts.astype(np.int32))
m = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(m, hull, 255)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
cap = np.zeros((H, W), np.uint8); cv2.ellipse(cap, (int(cx), int(cy - 0.35 * fh)), (int(0.75 * fw), int(1.05 * fh)), 0, 0, 360, 255, -1)
m = cv2.bitwise_or(m, cap)
m[int(y1 + 0.02 * fh):, :] = 0  # nothing below the chin
hard = m.copy(); soft = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), max(2, fw * 0.03))
soft = np.maximum(soft, (hard > 0).astype(np.float32))
out = (edit_al.astype(np.float32) * (1 - soft[..., None]) + o.astype(np.float32) * soft[..., None]).clip(0, 255).astype(np.uint8)
diff = np.abs(out.astype(int) - o.astype(int)).max(2); print("max |out-original| inside the hard head mask:", int(diff[hard > 0].max()), "hard mask px", int((hard > 0).sum()))
Image.fromarray(out).save(out_p); cv2.imwrite(out_p.replace(".png", "_mask.png"), hard)
print("wrote", out_p)
