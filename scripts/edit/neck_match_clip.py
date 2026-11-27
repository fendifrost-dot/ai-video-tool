"""$0. On every frame of a clip, the skin of his NECK takes the tone of his own (held) face in that same frame.

Why per frame: the hold keeps his photo's face, but the neck under it is the video model's, and it drifts lighter and
pinker than his face (Fendi, 20 Nov 2026: "The neck is still super light. It doesn't match the skin tone of his face").
A thin neck strip does not survive inside the face hold's eroded mask, so it is corrected here instead.

Neck = skin (MediaPipe multiclass, this frame) below his head mask, above the garment, joined to his head.
Target = the median Lab colour of his cheeks in this frame, at LIGHT x their lightness (the neck is under his chin);
the neck's own light and dark patches are kept at KEEP of their size. His head is not touched (printed).

usage: neck_match_clip.py <frames_dir> <head_mask_in_frame.png | folder of per-frame head masks> <out_dir> <models_dir>   env LIGHT (0.90) KEEP (0.45)
"""
import sys, os, glob, numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
fdir, m_p, out_dir, models = sys.argv[1:5]; LIGHT = float(os.environ.get("LIGHT", "0.95")); KEEP = float(os.environ.get("KEEP", "0.45")); MODE = os.environ.get("MODE", "cap"); SOFT = float(os.environ.get("SOFT", "0.1")); CAP = float(os.environ.get("CAP", "1.3"))
os.makedirs(out_dir, exist_ok=True)
fs = sorted(glob.glob(os.path.join(fdir, "f_*.png"))); f0 = cv2.imread(fs[0]); H, W = f0.shape[:2]
def regions(mask_file):
    """his head mask on this frame, and the parts measured from it (cheeks, jaw, the box the neck is looked for in)"""
    m = cv2.resize(cv2.imread(mask_file, 0), (W, H), interpolation=cv2.INTER_AREA) > 127
    ys, xs = np.where(m); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); hh = y1 - y0
    head = cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0
    cheek = cv2.erode(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0
    cheek[:int(y0 + 0.45 * hh)] = False; cheek[int(y0 + 0.80 * hh):] = False
    jaw = cv2.erode(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0; jaw[:int(y0 + 0.80 * hh)] = False
    box = np.zeros((H, W), bool); box[int(y0 + 0.5 * hh):int(y1 + 0.75 * hh), max(0, x0 - 20):x1 + 20] = True
    return m, head, cheek, jaw, box


PER_FRAME = os.path.isdir(m_p)          # a folder of head masks, one per frame (he moves): from wan_face_putback_track.py
if not PER_FRAME: m, head, cheek, jaw, box = regions(m_p)
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=os.path.join(models, "selfie_multiclass_256x256.tflite")), output_category_mask=True))
rows = []; worst = 0
for k, f in enumerate(fs):
    img = cv2.imread(f)
    if PER_FRAME: m, head, cheek, jaw, box = regions(os.path.join(m_p, os.path.basename(f)))
    cat = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))).category_mask.numpy_view().squeeze()
    skin = ((cat == 2) | (cat == 3)) & box & ~head
    skin = cv2.morphologyEx(skin.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(skin); neck = np.zeros((H, W), bool); ring = cv2.dilate(head.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 40 and (ring & (lab == i)).any(): neck |= lab == i
    L = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    if neck.sum() < 50:
        cv2.imwrite(os.path.join(out_dir, os.path.basename(f)), img); continue
    cm = np.median(L[cheek], 0); nm = np.median(L[neck], 0); Lo = L.copy()
    if MODE == "cap":
        # What Fendi saw (20 Nov 2026) is a PALE BAND down the lit side of the neck (lightness 140-190 where the lit side
        # of his face is about 100), not a neck that is light all over: under his chin it is darker than his cheeks.
        # So: every neck pixel lighter than the lit side of his face (T) is pulled down to just above T and takes his
        # cheeks' colour; everything darker keeps its own shading and only takes the cheeks' colour cast.
        # Measured on the clip (frame 76): the light comes from his left (forehead 126, that cheek 117); his other cheek is
        # 77, his jaw and chin 50-52, and the pale band sits on that SHADOW side at 104-190. So the reference is his JAW
        # (the bottom fifth of his head mask), not his cheeks: the neck may be at most CAP x the jaw's lightness.
        T = float(np.percentile(L[jaw][:, 0], 60)) * CAP
        over = np.clip(L[..., 0] - T, 0, None); wc = np.clip(over / 30.0, 0, 1)
        Lo[..., 0] = np.where(over > 0, T + over * SOFT, L[..., 0])
        Lo[..., 1] = (L[..., 1] + (cm[1] - nm[1])) * (1 - wc) + cm[1] * wc
        Lo[..., 2] = (L[..., 2] + (cm[2] - nm[2])) * (1 - wc) + cm[2] * wc
        # the pale sliver where neck meets collar is labelled garment by the segmenter: take it too (bright, within 4 px)
        fringe = (cat == 4) & (L[..., 0] > max(T + 30, 125)) & (cv2.dilate(neck.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0) & ~head
        neck = neck | fringe
    elif MODE == "scale":
        # the neck keeps its own shading (it is scaled, not flattened): its bright part is brought to LIGHT x his cheeks'
        # usual lightness, and its colour is shifted onto his cheeks' colour. (Flattening it, tried first, left a grey bib.)
        k_ = float(np.clip(LIGHT * np.percentile(L[cheek][:, 0], 60) / max(np.percentile(L[neck][:, 0], 85), 1), 0.4, 1.2))
        Lo[..., 0] = L[..., 0] * k_
        Lo[..., 1] = L[..., 1] + (cm[1] - nm[1])
        Lo[..., 2] = L[..., 2] + (cm[2] - nm[2])
    else:
        Lo[..., 0] = cm[0] * LIGHT + (L[..., 0] - nm[0]) * KEEP
        Lo[..., 1] = cm[1] + (L[..., 1] - nm[1]) * KEEP
        Lo[..., 2] = cm[2] + (L[..., 2] - nm[2]) * KEEP
    fixed = cv2.cvtColor(np.clip(Lo, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
    w = cv2.GaussianBlur(neck.astype(np.float32), (0, 0), 1.5)[..., None]; w[head] = 0
    out = (img.astype(np.float32) * (1 - w) + fixed * w).round().astype(np.uint8); out[m] = img[m]
    worst = max(worst, int(np.abs(out.astype(int) - img.astype(int))[m].max()))
    La = cv2.cvtColor(out, cv2.COLOR_BGR2LAB).astype(np.float32)
    rows.append((k, int(neck.sum()), cm[0], nm[0], float(np.median(La[neck][:, 0])), nm[1] - cm[1], nm[2] - cm[2],
                 float(np.percentile(L[cheek][:, 0], 95)), float(np.percentile(L[neck][:, 0], 98)), float(np.percentile(La[neck][:, 0], 98))))
    cv2.imwrite(os.path.join(out_dir, os.path.basename(f)), out)
r = np.array(rows)
print("frames %d, corrected %d; neck px median %d" % (len(fs), len(r), np.median(r[:, 1])))
print("lightness (0-255): cheeks median %.0f | neck BEFORE %.0f (%.2f of cheeks) | neck AFTER %.0f (%.2f of cheeks)" % (np.median(r[:, 2]), np.median(r[:, 3]), np.median(r[:, 3] / r[:, 2]), np.median(r[:, 4]), np.median(r[:, 4] / r[:, 2])))
print("neck colour offset from cheeks BEFORE (a red-green, b yellow-blue): %.1f, %.1f" % (np.median(r[:, 5]), np.median(r[:, 6])))
print("brightest part (0-255): his face %.0f | neck BEFORE %.0f | neck AFTER %.0f" % (np.median(r[:, 7]), np.median(r[:, 8]), np.median(r[:, 9])))
print("max change inside his head mask:", worst)
