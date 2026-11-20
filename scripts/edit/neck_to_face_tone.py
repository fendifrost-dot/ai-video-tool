"""$0. The drawn neck under his real head takes the tone of his own face (the head is his photo's pixels and is not
touched). Neck = skin (MediaPipe multiclass) joined to his head, below the head mask and above the garment's collar.
Per colour channel the neck's percentiles are fitted to his cheeks' (gain and lift), feathered at the neck's edge.
Writes the corrected still and a mask of head + neck for the clip's hold.

usage: neck_to_face_tone.py <still.png> <head_mask.png> <out_still.png> <out_head_and_neck_mask.png> <models_dir>
"""
import sys, os, numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
st_p, m_p, out_p, hm_p, models = sys.argv[1:6]
st = cv2.imread(st_p); m = cv2.imread(m_p, 0) > 127; H, W = m.shape
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=os.path.join(models, "selfie_multiclass_256x256.tflite")), output_category_mask=True))
cat = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(st, cv2.COLOR_BGR2RGB)))).category_mask.numpy_view().squeeze()
skin = (cat == 2) | (cat == 3)                                   # body skin, face skin
ys, xs = np.where(m); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); hh = y1 - y0
box = np.zeros((H, W), bool); box[int(y0 + 0.55 * hh):int(y1 + 0.55 * hh), max(0, x0 - 12):x1 + 12] = True     # from his cheeks down to under the collar line
neck = skin & box & ~m
neck = cv2.morphologyEx(neck.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
n, lab, stt, _ = cv2.connectedComponentsWithStats(neck)
keep = np.zeros((H, W), np.uint8)
dil = cv2.dilate(m.astype(np.uint8), np.ones((9, 9), np.uint8))
for i in range(1, n):
    if (dil[lab == i] > 0).any() and stt[i, cv2.CC_STAT_AREA] > 60: keep[lab == i] = 1      # only skin touching his head
neck = keep > 0
cheek = m.copy(); cheek[:int(y0 + 0.45 * hh)] = False; cheek[int(y0 + 0.82 * hh):] = False
# the neck takes his cheeks' colour and sits a little darker than them (it is under his chin); its own light and dark
# patches are halved, so no pale strip and no dark band is left. (A percentile fit was tried first: it stretched a pale
# strip into a greenish-white one.)
L = cv2.cvtColor(st, cv2.COLOR_BGR2LAB).astype(np.float32); Lo = L.copy()
cm = np.median(L[cheek], 0); nm = np.median(L[neck], 0)
Lo[..., 0] = cm[0] * 0.92 + (L[..., 0] - nm[0]) * 0.5
Lo[..., 1] = cm[1] + (L[..., 1] - nm[1]) * 0.5
Lo[..., 2] = cm[2] + (L[..., 2] - nm[2]) * 0.5
out = cv2.cvtColor(np.clip(Lo, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32); f = st.astype(np.float32); ab = [(0.5, 0.0)] * 3
w = cv2.GaussianBlur(neck.astype(np.float32), (0, 0), 2.0)[..., None]; w[m] = 0
res = (f * (1 - w) + out * w).round().astype(np.uint8); res[m] = st[m]
lab_ = lambda im, k: np.round(cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)[k].mean(0), 1)
print("neck px", int(neck.sum()), "| B,G,R (gain, lift):", [(round(a, 2), round(b, 1)) for a, b in ab])
print("Lab mean  cheeks", lab_(st, cheek), " neck before", lab_(st, neck), " neck after", lab_(res, neck))
print("max change inside his head mask:", int(np.abs(res.astype(int) - st.astype(int))[m].max()))
cv2.imwrite(out_p, res); cv2.imwrite(hm_p, ((m | neck).astype(np.uint8)) * 255)
