"""$0. The head mask for a clothes-only edit of a photo whose OLD garment has a collar standing up beside the jaw.
Above the bottom of his nose: the put-back tool's own mask (hair, forehead, ears). Below it: only inside his face's
own outline (cheeks, mouth, goatee, chin, from the face landmarks), so the old collar beside his jaw is the edit's.
Prints how much of his face box the mask covers: must be about 1.

usage: head_mask_no_collar.py <photo in the edit's frame> <tool mask.png> <out mask.png> <models_dir>
"""
import sys, os, numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
ph_p, m_p, out_p, models = sys.argv[1:5]
ph = cv2.imread(ph_p); m = cv2.imread(m_p, 0) > 127; H, W = m.shape
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.join(models, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1, min_face_detection_confidence=0.2))
ys, xs = np.where(m); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
crop = np.ascontiguousarray(cv2.cvtColor(ph[y0:y1 + 1, x0:x1 + 1], cv2.COLOR_BGR2RGB)); s = 1400 / max(crop.shape[:2]); big = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big))); assert r.face_landmarks, "no face found"
P = np.array([[x0 + q.x * big.shape[1] / s, y0 + q.y * big.shape[0] / s] for q in r.face_landmarks[0]], np.float32)
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
oval = np.zeros((H, W), np.uint8); cv2.fillPoly(oval, [P[OVAL].astype(np.int32)], 1)
oval = cv2.erode(oval, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
ynose = int(P[2][1])
out = m.copy(); out[ynose:] = m[ynose:] & (oval[ynose:] > 0)
n, lab, st, _ = cv2.connectedComponentsWithStats(out.astype(np.uint8)); out = lab == 1 + st[1:, cv2.CC_STAT_AREA].argmax()
fx0, fy0 = P[:, 0].min(), P[:, 1].min(); fx1, fy1 = P[:, 0].max(), P[:, 1].max()
inside = oval > 0
print("mask px %d -> %d; his face outline covered: %.3f; split at y %d" % (int(m.sum()), int(out.sum()), out[inside].mean(), ynose))
cv2.imwrite(out_p, out.astype(np.uint8) * 255); cv2.imwrite(out_p.replace(".png", "_oval.png"), oval * 255)
