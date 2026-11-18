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
usage: still_face_from_photo.py <his_photo> <still> <x,y,w,h head box in the still> <prefix> [models_dir]"""
import sys, os, numpy as np, cv2
from PIL import Image, ImageOps
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
pp, sp, box, pre = sys.argv[1:5]; models = sys.argv[5] if len(sys.argv) > 5 else os.environ.get("AVT_MODELS", "models")
A = np.asarray(ImageOps.exif_transpose(Image.open(pp)).convert("RGB")); B = np.asarray(Image.open(sp).convert("RGB")); H, W = B.shape[:2]
bx, by, bw, bh = (int(v) for v in box.split(","))
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.join(models, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1))
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
mk[:max(0, int(round(brow - float(os.environ.get("AVT_FACE_TOP", "0.06")) * fh))), :] = 0; mk[int(round(pw[:, 1].max() + 0.02 * fh)):, :] = 0
Image.fromarray(O).save(pre + "_photo_in_frame.png"); cv2.imwrite(pre + "_facemask.png", mk); print("wrote", pre + "_photo_in_frame.png", pre + "_facemask.png")
