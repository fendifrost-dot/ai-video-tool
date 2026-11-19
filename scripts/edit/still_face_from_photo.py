"""$0. His real face from one of HIS photographs, brought into a generated still where the model drew its own face.
The photo is scaled, turned and shifted (similarity only, from the face landmarks of both) onto the drawn face, then
colour only is matched to the still (Lab mean, and lightness spread) over cheeks and nose, and the still's own light (low
frequencies: the brim's shadow) is laid over his face (AVT_FACE_SHADE=0 turns that off). AVT_FACE_TOP: how far above his brows the mask starts, as a share of the face height (0.06;
lower or negative when the still's hat brim sits at his brow line). Writes
<prefix>_photo_in_frame.png (the "original" for still_face_putback.py) and <prefix>_facemask.png (his face from the
brows down to the chin: the hat, brim and collar stay the still's). Then:
  AVT_STILL_HEAD_MASK=<prefix>_facemask.png still_face_putback.py <prefix>_photo_in_frame.png still.png out.png
which prints the proof (0 inside the mask). The likeness is his pixels; the POSE is the still's, so pick the photo whose
angle matches (the printed turn and residual say how well). Never for footage.
AVT_FACE_EXACT=<matte of the photo, PNG>: HIS PIXELS, WHOLE HEAD (Partnership, Allen, 19 Nov 2026: the default mode halved
the contrast of his face to match a dark still and replaced only brows-to-chin, and Fendi said "His face is off use the
Verified method to restore his pixels"). The colour match is then ONE gain per colour channel in linear light (exposure and
white balance, measured on cheeks and nose: no contrast change, no shade), and the mask is his whole head from the photo's
own matte (face, ears, hair, cap) down to the chin. Nothing of his head is the still's.
usage: still_face_from_photo.py <his_photo> <still> <x,y,w,h head box in the still> <prefix> [models_dir]"""
import sys, os, numpy as np, cv2
from PIL import Image, ImageOps
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
pp, sp, box, pre = sys.argv[1:5]; models = sys.argv[5] if len(sys.argv) > 5 else os.environ.get("AVT_MODELS", "models")
A = np.asarray(ImageOps.exif_transpose(Image.open(pp)).convert("RGB")); B = np.asarray(Image.open(sp).convert("RGB")); H, W = B.shape[:2]
bx, by, bw, bh = (int(v) for v in box.split(","))
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.join(models, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1, min_face_detection_confidence=0.2, min_face_presence_confidence=0.2))   # a near-profile head or a small dark one is still found
def find(img, x0, y0, w, h):
    c = np.ascontiguousarray(img[y0:y0 + h, x0:x0 + w]); s = 1400 / max(c.shape[:2]); big = cv2.resize(c, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
    return None if not r.face_landmarks else np.array([[x0 + q.x * big.shape[1] / s, y0 + q.y * big.shape[0] / s] for q in r.face_landmarks[0]], np.float32)
pa = find(A, 0, 0, A.shape[1], A.shape[0])
if pa is None: pa = find(A, int(A.shape[1] * .25), 0, int(A.shape[1] * .5), int(A.shape[0] * .35))     # a small head in a full-body photo
assert pa is not None, "no face in his photo"
pb = find(B, bx, by, bw, bh); assert pb is not None, "no face in the still's head box"
M, inl = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=max(1.0, 0.02 * float(np.ptp(pb[:, 0]))))
sc = float(np.hypot(M[0, 0], M[1, 0])); rot = float(np.degrees(np.arctan2(M[1, 0], M[0, 0])))
pw = pa @ M[:, :2].T + M[:, 2]; fw, fh = float(np.ptp(pw[:, 0])), float(np.ptp(pw[:, 1]))
print("photo -> still: scale", round(sc, 4), "turn deg", round(rot, 2), "| face in the still", round(fw, 1), "x", round(fh, 1), "px | median landmark residual", round(float(np.median(np.linalg.norm(pw - pb, axis=1))) / fw * 100, 1), "% of face width")
Ab = cv2.GaussianBlur(A, (0, 0), 0.45 / sc) if sc < 0.8 else A
O = cv2.warpAffine(Ab, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
skin = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(skin, cv2.convexHull(pw[[117, 118, 101, 36, 205, 187, 123, 346, 347, 330, 266, 425, 411, 352, 6, 197, 195, 5, 4]].astype(np.int32)), 255); k = skin > 0
EXACT = os.environ.get("AVT_FACE_EXACT")
if EXACT:
    lin = lambda x: (x.astype(np.float32) / 255) ** 2.2; gains = lin(B)[k].mean(0) / np.maximum(lin(O)[k].mean(0), 1e-4)
    O = (np.clip(lin(O) * gains, 0, 1) ** (1 / 2.2) * 255).round().astype(np.uint8); print("exact mode: one linear gain per channel (R, G, B)", gains.round(3).tolist(), "| no contrast change, no shade")
    am = cv2.warpAffine(cv2.imread(EXACT, cv2.IMREAD_GRAYSCALE), M, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
    mk = (cv2.erode(am, np.ones((3, 3), np.uint8)) >= 247).astype(np.uint8) * 255                      # the solid inside of his own matte
    mk[int(round(pw[:, 1].max() + 0.02 * fh)):, :] = 0                                                # nothing below the chin: the neck and collar are the still's
    reach = np.zeros((H, W), np.uint8); cv2.ellipse(reach, (int(pw[:, 0].mean()), int(pw[:, 1].mean() - 0.35 * fh)), (int(1.1 * fw), int(1.35 * fh)), 0, 0, 360, 255, -1)
    mk = cv2.bitwise_and(mk, reach)                                                                   # his head only, not a shoulder the matte also holds
    hullm = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(hullm, cv2.convexHull(pw.astype(np.int32)), 255); hullm = cv2.dilate(hullm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.08 * fw) | 1, int(0.08 * fw) | 1)))
    mouth = int(round(float(pw[13][1]))); mk[mouth:] = cv2.bitwise_and(mk[mouth:], hullm[mouth:])     # from the mouth down only his face: beside the jaw the matte holds his collar and shoulder
    Image.fromarray(O).save(pre + "_photo_in_frame.png"); cv2.imwrite(pre + "_facemask.png", mk); print("wrote", pre + "_photo_in_frame.png", pre + "_facemask.png", "| head mask px", int((mk > 0).sum())); sys.exit(0)
la, lb = cv2.cvtColor(O, cv2.COLOR_RGB2LAB).astype(np.float32), cv2.cvtColor(B, cv2.COLOR_RGB2LAB).astype(np.float32)
for c in range(3):
    ma, sa, mb, sb = la[..., c][k].mean(), la[..., c][k].std(), lb[..., c][k].mean(), lb[..., c][k].std()
    g = float(np.clip(sb / max(sa, 1e-3), 0.35, 1.3)) if c == 0 else 1.0
    la[..., c] = (la[..., c] - ma) * g + mb; print("Lab", "Lab"[c], "photo", round(float(ma), 1), "+-", round(float(sa), 1), "still", round(float(mb), 1), "+-", round(float(sb), 1), "gain", round(g, 3))
if os.environ.get("AVT_FACE_SHADE", "1") == "1":   # the still's own light on his face (the brim's shadow, the dark side): low frequencies only, his detail untouched
    sg = 0.14 * fw; reg = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(reg, cv2.convexHull(pw.astype(np.int32)), 255); wgt = cv2.GaussianBlur((reg > 0).astype(np.float32), (0, 0), sg) + 1e-4
    for c in range(3):
        lo = lambda x: cv2.GaussianBlur(x * (reg > 0), (0, 0), sg) / wgt
        la[..., c] += lo(lb[..., c]) - lo(la[..., c])
    print("shade: low frequencies (sigma", round(sg, 1), "px) taken from the still")
O = cv2.cvtColor(np.clip(la, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)
mk = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(mk, cv2.convexHull(pw.astype(np.int32)), 255)
brow = float(min(pw[i][1] for i in (105, 66, 107, 336, 296, 334))); mk = cv2.erode(mk, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.07 * fw) | 1, int(0.07 * fw) | 1)))   # stay inside his beard line: beyond it is the photo's background
se = float(os.environ.get("AVT_FACE_SIDE", "0"))   # extra cut at the sides below the eyes, as a share of the face width: keeps the seam inside his beard when his photo has a bright rim on the cheeks
if se > 0:
    low = cv2.erode(mk, np.ones((1, int(2 * se * fw) | 1), np.uint8)); cut = int(round(float(pw[4][1])))   # from the tip of the nose down
    mk[cut:] = low[cut:]
mk[:max(0, int(round(brow - float(os.environ.get("AVT_FACE_TOP", "0.06")) * fh))), :] = 0; mk[int(round(pw[:, 1].max() + 0.02 * fh)):, :] = 0
Image.fromarray(O).save(pre + "_photo_in_frame.png"); cv2.imwrite(pre + "_facemask.png", mk); print("wrote", pre + "_photo_in_frame.png", pre + "_facemask.png")
