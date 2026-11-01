"""Per-scene tracking of the SUBJECT's face for body_only_swap (pure numpy; the detector is the caller's).

A montage holds several scenes and several people. The landmarker returns whatever face it finds — on c041 v2
(1 Nov 2026) it found nothing on four frames of the wide shot, then the man in the foreground, and the put-back
borrowed those: the brow line and head box landed off his head and the new bucket hat's underside showed the
original background and skin. The rules here: a face is his when the swap CHANGED the clothes under it (the
redressed person is the subject, never the largest face); a detection that disagrees with its scene's median is
dropped; every frame of a scene is filled from the nearest kept detection of THAT scene, never from another."""
import numpy as np

# a face geometry is (oval points (K, 2) float32, brow row, face height, eye row), as body_only_swap builds it


def scene_starts(diffs, thresh=25.0):
    """Scene starts from per-frame mean |frame_k - frame_(k-1)| (diffs[0] is unused): frame 0 and every frame whose
    difference from the one before exceeds thresh (the put-back's own cut rule)."""
    return [0] + [k for k in range(1, len(diffs)) if diffs[k] > thresh]


def centre(face):
    pts = face[0]
    return float(pts[:, 0].mean()), float(pts[:, 1].mean())


def torso_box(face, shape):
    """The box under a face where its owner's clothes are: half a face height either side, two face heights down."""
    pts, _, fh, _ = face
    H, W = shape
    x0, x1 = int(pts[:, 0].min() - 0.5 * fh), int(pts[:, 0].max() + 0.5 * fh)
    y0 = int(pts[:, 1].max()); y1 = int(y0 + 2.0 * fh)
    return max(0, x0), max(0, y0), min(W, x1), min(H, y1)


def subject_score(face, changed):
    """Share of strongly changed pixels (original vs aligned swap) in the torso box under the face."""
    x0, y0, x1, y1 = torso_box(face, changed.shape)
    if x1 <= x0 or y1 <= y0: return 0.0
    return float(changed[y0:y1, x0:x1].mean())


def pick_subject(cands, changed, min_score=0.15):
    """The candidate whose clothes the swap changed most; None when no candidate clears min_score."""
    best, bs = None, min_score
    for f in cands:
        s = subject_score(f, changed)
        if s > bs: best, bs = f, s
    return best


def track_scene(faces):
    """faces: one geometry or None per frame of ONE scene. Detections whose centre lies more than half the scene's
    median face height from the median centre, or whose height is outside 0.7..1.4 of the median, are dropped.
    Every frame then takes the oval of the nearest kept detection in time, with brow and eye rows interpolated
    linearly between the kept detections. All None when the scene has no detection."""
    n = len(faces); idx = [k for k, f in enumerate(faces) if f is not None]
    if not idx: return [None] * n
    fh_med = float(np.median([faces[k][2] for k in idx]))
    cx = float(np.median([centre(faces[k])[0] for k in idx])); cy = float(np.median([centre(faces[k])[1] for k in idx]))
    keep = [k for k in idx if abs(centre(faces[k])[0] - cx) <= 0.5 * fh_med and abs(centre(faces[k])[1] - cy) <= 0.5 * fh_med
            and 0.7 <= faces[k][2] / fh_med <= 1.4]
    if not keep: keep = idx
    ka = np.array(keep, np.float32)
    brows = np.array([faces[k][1] for k in keep], np.float32); eyes = np.array([faces[k][3] for k in keep], np.float32)
    out = []
    for k in range(n):
        j = keep[int(np.argmin(np.abs(ka - k)))]
        pts, _, fh, _ = faces[j]
        out.append((pts, float(np.interp(k, ka, brows)), fh, float(np.interp(k, ka, eyes))))
    return out
