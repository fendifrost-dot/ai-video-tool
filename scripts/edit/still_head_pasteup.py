"""$0. Paste-up for the blend pass: his real head from the SAME photo (brows down, ears, beard, glasses) laid over the clothing
edit at its true place, so Gemini only has to seat the hat and collar round a head that is already his.
Writes the paste-up, the wide paste mask and the hard face mask (brows down to the chin) for still_face_putback's given-mask mode.
usage: head_pasteup.py photo.jpg edit.jpg out_prefix models"""
import sys, os, numpy as np, cv2
from PIL import Image, ImageOps
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
pp, ep, pre, models = sys.argv[1:5]
E_ = np.asarray(Image.open(ep).convert("RGB")); H, W = E_.shape[:2]
O = cv2.resize(np.asarray(ImageOps.exif_transpose(Image.open(pp)).convert("RGB")), (W, H), interpolation=cv2.INTER_AREA)
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.join(models, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1))
x0, x1, y0, y1 = int(W * .25), int(W * .75), 0, int(H * .35); c = np.ascontiguousarray(O[y0:y1, x0:x1]); s = 1600 / c.shape[1]
def find(img):
    big = cv2.resize(np.ascontiguousarray(img[y0:y1, x0:x1]), None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big))); assert r.face_landmarks
    return np.array([[x0 + q.x * big.shape[1] / s, y0 + q.y * big.shape[0] / s] for q in r.face_landmarks[0]], np.float32)
p = find(O); pe = find(E_)
k = float(np.ptp(pe[:, 1]) / np.ptp(p[:, 1])); t = pe.mean(0) - k * p.mean(0)     # the edit moved and resized his head: scale and shift the PHOTO (no turn) so his real head sits where the edit's head is; the figure keeps its frame and its feet
print("photo -> edit: scale", round(k, 4), "shift px", t.round(1).tolist())
Of = np.asarray(ImageOps.exif_transpose(Image.open(pp)).convert("RGB")); kf = k * W / Of.shape[1]
O = cv2.warpAffine(cv2.GaussianBlur(Of, (0, 0), 0.45 / kf), np.float32([[kf, 0, t[0]], [0, kf, t[1]]]), (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
p = p * k + t
fw, fh = float(np.ptp(p[:, 0])), float(np.ptp(p[:, 1])); brow = float(min(p[i][1] for i in (105, 66, 107, 336, 296, 334)))
roll = float(np.degrees(np.arctan2(p[263][1] - p[33][1], p[263][0] - p[33][0]))); print("face", round(fw), "x", round(fh), "px; head roll deg", round(roll, 1))
hard = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(hard, cv2.convexHull(p.astype(np.int32)), 255)
hard[:max(0, int(brow - 0.06 * fh)), :] = 0; hard[int(p[:, 1].max() + 0.02 * fh):, :] = 0
wide = cv2.dilate(hard, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.34 * fw) | 1, int(0.10 * fh) | 1)))   # out to the glasses' hinges, ears and beard edge
wide[:max(0, int(brow - 0.06 * fh)), :] = 0
soft = np.maximum(cv2.GaussianBlur(wide.astype(np.float32) / 255, (0, 0), fw * 0.02), (hard > 0).astype(np.float32)).clip(0, 1)[..., None]
out = np.rint(E_ * (1 - soft) + O * soft).astype(np.uint8)
Image.fromarray(out).save(pre + "_pasteup.png"); Image.fromarray(out).save(pre + "_pasteup.jpg", quality=95); Image.fromarray(O).save(pre + "_photo_in_frame.png")
cv2.imwrite(pre + "_hardmask.png", hard); print("wrote", pre + "_pasteup.png")
