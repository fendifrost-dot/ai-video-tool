"""$0. Hold a photo's face on a generated clip in which the person MOVES ACROSS THE FRAME.

`wan_face_putback.py` follows the head with dense optical flow added up from the first frame. That is right for a
head that stays put (10 px on older Allen T7) and it SMEARS when he walks (T10, 20 Nov 2026: 163 px, the face tore
from the second second on). Here the head is followed by its face landmarks instead: on every frame the still's head
is moved, turned in the picture plane and scaled (one similarity transform, smoothed over time) onto the landmarks of
the face the video model drew there. Light: the slow brightness change of the render only, as in the flow version.

It cannot turn a face: when the render's head looks down or to the side, the photo's face is still the photo's view.
So it prints, per frame, how far the render's head is turned from the still's (degrees) and how well the landmarks
fit, and lists the stretches that are usable. Judge those stretches, not the whole clip.

usage: wan_face_putback_track.py <frames_dir> <still.png> <head_mask.png> <out_dir> <models_dir> [<head_only_mask.png> <masks_out_dir>]
env:   MAX_TURN (12 degrees)  MAX_FIT (0.07 of the eye distance)  SMOOTH (1.5 frames)
The optional pair writes the head-only mask moved to each frame (for neck_match_clip.py, which needs it per frame).
"""
import glob, os, sys
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

fdir, still_p, mask_p, out_dir, models = sys.argv[1:6]
head_p, masks_out = (sys.argv[6], sys.argv[7]) if len(sys.argv) > 7 else (None, None)
MAX_TURN = float(os.environ.get("MAX_TURN", "12")); MAX_FIT = float(os.environ.get("MAX_FIT", "0.07")); SMOOTH = float(os.environ.get("SMOOTH", "1.5"))
os.makedirs(out_dir, exist_ok=True)
if masks_out: os.makedirs(masks_out, exist_ok=True)
fs = sorted(glob.glob(os.path.join(fdir, "f_*.png"))); f0 = cv2.imread(fs[0]); H, W = f0.shape[:2]
still = cv2.resize(cv2.imread(still_p), (W, H), interpolation=cv2.INTER_AREA)
mask = cv2.resize(cv2.imread(mask_p, 0), (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
head_only = cv2.resize(cv2.imread(head_p, 0), (W, H), interpolation=cv2.INTER_AREA) if head_p else None
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(models, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE,
    num_faces=1, min_face_detection_confidence=0.2, output_facial_transformation_matrixes=True))


def detect(img, box):
    """landmarks (478x2, frame pixels) and the head's rotation matrix, looked for inside box (zoomed)"""
    x0, y0, x1, y1 = box
    crop = img[y0:y1, x0:x1]; z = 640.0 / max(crop.shape[:2])
    big = cv2.resize(crop, None, fx=z, fy=z, interpolation=cv2.INTER_CUBIC)
    r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(big, cv2.COLOR_BGR2RGB))))
    if not r.face_landmarks: return None, None
    P = np.array([[x0 + q.x * big.shape[1] / z, y0 + q.y * big.shape[0] / z] for q in r.face_landmarks[0]], np.float32)
    return P, np.array(r.facial_transformation_matrixes[0])[:3, :3]


def box_round(P, pad=0.9):
    cx, cy = P.mean(0); s = max(np.ptp(P[:, 0]), np.ptp(P[:, 1])) * (0.5 + pad)
    return max(0, int(cx - s)), max(0, int(cy - s)), min(W, int(cx + s)), min(H, int(cy + s))


ys, xs = np.where(mask > 0.5)
P0, R0 = detect(still, box_round(np.array([[xs.min(), ys.min()], [xs.max(), ys.max()]], np.float32), 0.6))
assert P0 is not None, "no face found in the still"
eye = float(np.linalg.norm(P0[33] - P0[263])); c0 = P0.mean(0)
print("still: face found, eye distance %.1f px" % eye)

# pass 1: where the head is on every frame
box = box_round(P0); par = []; turn = []; fit = []; found = []
for f in fs:
    img = cv2.imread(f); P, R = detect(img, box)
    if P is None: P, R = detect(img, (0, 0, W, H))
    if P is None:
        par.append(par[-1] if par else (1.0, 0.0, c0[0], c0[1])); turn.append(99.0); fit.append(9.0); found.append(False); continue
    A, _ = cv2.estimateAffinePartial2D(P0, P, method=cv2.LMEDS)
    s = float(np.hypot(A[0, 0], A[1, 0])); th = float(np.arctan2(A[1, 0], A[0, 0])); c = A[:, :2] @ c0 + A[:, 2]
    par.append((s, th, float(c[0]), float(c[1])))
    Rd = R @ R0.T; turn.append(float(np.degrees(np.arccos(np.clip((np.trace(Rd) - 1) / 2, -1, 1)))))
    fit.append(float(np.sqrt((((P0 @ A[:, :2].T + A[:, 2]) - P) ** 2).sum(1).mean()) / (eye * s)))
    found.append(True); box = box_round(P)
par = np.array(par); turn = np.array(turn); fit = np.array(fit); found = np.array(found)
if SMOOTH > 0:                                    # landmark noise on a small face would make his head tremble on his body
    k = cv2.getGaussianKernel(int(6 * SMOOTH) | 1, SMOOTH).ravel()
    par = np.stack([np.convolve(np.pad(par[:, i], len(k) // 2, mode="edge"), k, mode="valid") for i in range(4)], 1)

# pass 2: his still's head, moved to that place, lit by the render's slow brightness
for i, f in enumerate(fs):
    cur = cv2.imread(f); s, th, cx, cy = par[i]
    M = np.array([[s * np.cos(th), -s * np.sin(th), 0], [s * np.sin(th), s * np.cos(th), 0]], np.float32)
    M[:, 2] = np.array([cx, cy]) - M[:, :2] @ c0
    own = cv2.warpAffine(still, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    w0 = cv2.warpAffine(f0, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    m = cv2.warpAffine(mask, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    m = cv2.GaussianBlur(cv2.erode(m, np.ones((5, 5), np.uint8)), (0, 0), 3.0)
    ratio = (cv2.GaussianBlur(cur.astype(np.float32), (0, 0), 14) + 4) / (cv2.GaussianBlur(w0, (0, 0), 14) + 4)
    ratio = np.repeat(ratio.mean(2, keepdims=True), 3, 2)          # brightness only: the render's colour drift tinted his face violet
    lit = np.clip(own * np.clip(ratio, 0.45, 2.4), 0, 255)
    out = (cur.astype(np.float32) * (1 - m[..., None]) + lit * m[..., None]).round().astype(np.uint8); out[m == 0] = cur[m == 0]
    cv2.imwrite(os.path.join(out_dir, os.path.basename(f)), out)
    if masks_out:
        cv2.imwrite(os.path.join(masks_out, os.path.basename(f)), cv2.warpAffine(head_only, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT))

ok = found & (turn <= MAX_TURN) & (fit <= MAX_FIT)
print("frames %d; face found on %d; head travels up to %.0f px from the first frame; size %.2f-%.2f of the still's" % (
    len(fs), int(found.sum()), float(np.hypot(par[:, 2] - c0[0], par[:, 3] - c0[1]).max()), par[:, 0].min(), par[:, 0].max()))
print("head turned from the still's view: median %.1f, max %.1f degrees; landmark fit: median %.3f, max %.3f of the eye distance" % (
    float(np.median(turn[found])), float(turn[found].max()), float(np.median(fit[found])), float(fit[found].max())))
runs = []; a = None
for i, v in enumerate(list(ok) + [False]):
    if v and a is None: a = i
    if not v and a is not None: runs.append((a, i - 1)); a = None
print("usable stretches (turn <= %.0f deg, fit <= %.2f), frames from 1:" % (MAX_TURN, MAX_FIT),
      ", ".join("%d-%d (%.1f s)" % (a + 1, b + 1, (b - a + 1) / 30.0) for a, b in runs if b - a >= 14) or "none of 0.5 s or more")
np.savetxt(os.path.join(out_dir, "track.csv"), np.column_stack([np.arange(1, len(fs) + 1), par, turn, fit, found]), fmt="%.4f", delimiter=",",
           header="frame,scale,angle_rad,cx,cy,turn_deg,fit,found", comments="")
