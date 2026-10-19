"""Check the finished shot against the approved performance, frame by frame, $0.
usage: verify_scene.py <approved.mp4> <final.mp4> <scene_<move>.json> <params.json> <face_landmarker.task> <out.json>
                       [--every N]

The take -> shot map is known exactly: the roll and scale of prep_performer.py, then the card's corners on screen
per frame from build_scene.py. So the approved frame is pushed through that map (and a per-channel linear gain is
fitted over his face, since the grade is linear in light) to PREDICT the final face, and compared with it:
  face pixels   PSNR over his face oval between the prediction and the final (what is left is lens softness,
                anti-aliasing, grain and the top-light gradient; a redrawn or warped face would fall far lower);
  mouth timing  the same prediction from approved frames i-3..i+3: the best match must be frame i (lag 0) on every
                checked frame, by a clear margin (dB) over the neighbours;
  mouth motion  inner-lip gap over eye width (MediaPipe) in both films, correlated (a noisy, secondary signal at
                this face size)."""
import argparse, json, subprocess
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

ap = argparse.ArgumentParser()
for a in ("approved", "final", "scene", "params", "model", "out"): ap.add_argument(a)
ap.add_argument("--every", type=int, default=4)
ap.add_argument("--inner", type=int, default=5, help="px kept off the face outline (the lane's edge band and wrap live there)")
A = ap.parse_args()
W, H = 1080, 1920
S = json.load(open(A.scene)); P = json.load(open(A.params))
roll = P["source"]["roll_deg"]; soft = P["lens"].get("performer_softness_px", 0)

def frames(p):
    pr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    out = []
    while len(b := pr.stdout.read(W * H * 3)) == W * H * 3: out.append(np.frombuffer(b, np.uint8).reshape(H, W, 3))
    return out
appr, fin = frames(A.approved), frames(A.final)
n = min(len(appr), len(fin))
lin = lambda v: np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)
R = np.vstack([cv2.getRotationMatrix2D((W / 2, H / 2), roll, 1.0), [0, 0, 1]])
SC = S.get("texture_scale", 0.31)            # the prepared texture's scale (prep_performer.py)
def take_to_shot(i):
    """3x3 map from approved-frame pixels to final pixels at frame i."""
    c = np.float32(S["card_corners_px_per_frame"][i])                  # UV 00, 10, 11, 01 on screen
    w2, h2 = round(W * SC), round(H * SC)
    uvpx = np.float32([[0, h2], [w2, h2], [w2, 0], [0, 0]])            # those UVs in the prepared texture's pixels
    Hc = cv2.getPerspectiveTransform(uvpx, c)
    return Hc @ np.diag([SC, SC, 1.0]) @ R
def predict(j, i):
    a = appr[j].astype(np.float32)
    a = cv2.warpAffine(a, R[:2], (W, H), flags=cv2.INTER_LINEAR)
    small = cv2.resize(a, (round(W * SC), round(H * SC)), interpolation=cv2.INTER_AREA)
    c = np.float32(S["card_corners_px_per_frame"][i]); w2, h2 = small.shape[1], small.shape[0]
    Hc = cv2.getPerspectiveTransform(np.float32([[0, h2], [w2, h2], [w2, 0], [0, 0]]), c)
    out = cv2.warpPerspective(small, Hc, (W, H), flags=cv2.INTER_LINEAR)
    return cv2.GaussianBlur(out, (0, 0), max(0.5, soft)) / 255

lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=A.model), num_faces=1))
def detect(img, box, up):
    x0, y0, x1, y1 = box
    cimg = np.ascontiguousarray(cv2.resize(img[y0:y1, x0:x1], None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC))
    r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cimg))
    if not r.face_landmarks: return None
    return np.array([[q.x * cimg.shape[1] / up + x0, q.y * cimg.shape[0] / up + y0] for q in r.face_landmarks[0]])
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149,
        150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
det_src = (int(.1 * W), int(.05 * H), int(.85 * W), int(.6 * H))

def psnr(pred, got, mask):
    pa, fa = lin(pred[mask]), lin(got[mask].astype(np.float32) / 255)
    g = (pa * fa).sum(0) / np.maximum((pa * pa).sum(0), 1e-9)
    e = np.clip(pa * g, 0, 1) ** (1 / 2.4) - np.clip(fa, 0, 1) ** (1 / 2.4)
    return 10 * np.log10(1 / max(float((e ** 2).mean()), 1e-12))

rows = []; mouth = []
for i in range(0, n, A.every):
    pa = detect(appr[i], det_src, 1.0)
    if pa is None: continue
    M = take_to_shot(i)
    oval = cv2.perspectiveTransform(pa[OVAL][None].astype(np.float32), M)[0]
    mask = np.zeros((H, W), np.uint8); cv2.fillPoly(mask, [oval.round().astype(np.int32)], 1)
    mask = cv2.erode(mask, np.ones((2 * A.inner + 1, 2 * A.inner + 1), np.uint8)).astype(bool)
    scores = {j - i: psnr(predict(j, i), fin[i], mask) for j in range(max(0, i - 3), min(n, i + 4))}
    best = max(scores, key=scores.get)
    others = [v for k, v in scores.items() if k != 0]
    rows.append(dict(i=i, psnr_lag0=round(scores[0], 2), best_lag=best,
                     margin_db=round(scores[0] - max(others), 2) if others else None, face_px=int(mask.sum())))
    x0, y0 = np.floor(oval.min(0) - 40).astype(int); x1, y1 = np.ceil(oval.max(0) + 40).astype(int)
    pf = detect(fin[i], (max(0, x0), max(0, y0), min(W, x1), min(H, y1)), 4.0)
    if pf is not None:
        mo = lambda p: np.linalg.norm(p[13] - p[14]) / np.linalg.norm(p[33] - p[263])
        mouth.append((mo(pa), mo(pf)))
mo = np.array(mouth)
rep = dict(frames_checked=len(rows), every=A.every,
           face_psnr_db_median=round(float(np.median([r["psnr_lag0"] for r in rows])), 2),
           face_psnr_db_min=round(float(np.min([r["psnr_lag0"] for r in rows])), 2),
           timing_lag0_fraction=round(float(np.mean([r["best_lag"] == 0 for r in rows])), 4),
           timing_margin_db_median=round(float(np.median([r["margin_db"] for r in rows if r["margin_db"] is not None])), 2),
           timing_margin_db_min=round(float(np.min([r["margin_db"] for r in rows if r["margin_db"] is not None])), 2),
           face_area_px_median=int(np.median([r["face_px"] for r in rows])),
           mouth_landmark_pairs=len(mo), mouth_corr=round(float(np.corrcoef(mo[:, 0], mo[:, 1])[0, 1]), 4) if len(mo) > 2 else None)
json.dump(dict(summary=rep, rows=rows), open(A.out, "w"), indent=1)
print(json.dumps(rep, indent=1))
