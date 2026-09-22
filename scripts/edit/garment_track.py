#!/usr/bin/env python3
"""
Garment-relative tracking core (shared by garment_graphic_track.py and the keyframe
propagation lane). Brand-, garment- and project-agnostic: it tracks a PLANE the user anchors
on one frame (a quad in image coordinates) through a clip and reports, per frame, the
homography from the anchor frame, a confidence, and an occlusion mask for that plane.

ChatGPT ruling 2026-09-21 §4: "canonical graphic → tracked garment coordinates/plane →
perspective warp → illumination adaptation → occlusion → composite → temporal QA. It must
handle arms passing in front of the graphic."

Method ($0, CPU, OpenCV only):
  * sparse Lucas–Kanade point tracks seeded on a grid inside the anchor quad (plus corner
    features), forward–backward checked every frame; points keep their ANCHOR coordinates so
    the anchor→frame homography is re-fit from scratch each frame (no drift accumulation);
  * re-seeding when tracks are lost (new points get anchor coordinates through the inverse
    of the current homography);
  * confidence = RANSAC inlier ratio × survival ratio, gated by a minimum inlier count;
  * occlusion inside the plane = skin (YCrCb) ∪ appearance residual (anchor patch warped
    into the frame vs the frame itself, in blurred Lab) ∪ optional external mask, feathered;
  * illumination = low-frequency luminance ratio + Lab chroma shift between the frame and the
    anchor under the non-occluded plane.
"""
import json
import cv2
import numpy as np

# ----------------------------------------------------------------------------- video io

def read_frames(path, max_frames=None):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened(): raise SystemExit(f"cannot open {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    frames = []
    while True:
        ok, im = cap.read()
        if not ok: break
        frames.append(im)
        if max_frames and len(frames) >= max_frames: break
    cap.release()
    return frames, fps

# ----------------------------------------------------------------------------- geometry

def quad_array(q):
    a = np.asarray(q, dtype=np.float32).reshape(4, 2)
    return a

def quad_mask(shape_hw, quad, dilate_px=0):
    m = np.zeros(shape_hw[:2], np.uint8)
    cv2.fillConvexPoly(m, np.round(quad_array(quad)).astype(np.int32), 255)
    if dilate_px > 0:
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate_px + 1, 2 * dilate_px + 1)))
    return m

def seed_points(gray, quad, grid=6, margin=0.08):
    """Grid inside the quad (in a normalised (u,v) parametrisation) plus good features there."""
    q = quad_array(quad)
    pts = []
    for i in range(grid):
        for j in range(grid):
            u = margin + (1 - 2 * margin) * (i + 0.5) / grid
            v = margin + (1 - 2 * margin) * (j + 0.5) / grid
            top = q[0] * (1 - u) + q[1] * u
            bot = q[3] * (1 - u) + q[2] * u
            pts.append(top * (1 - v) + bot * v)
    pts = np.array(pts, np.float32)
    m = quad_mask(gray.shape, quad, dilate_px=6)
    feat = cv2.goodFeaturesToTrack(gray, maxCorners=60, qualityLevel=0.01, minDistance=5, mask=m)
    if feat is not None: pts = np.vstack([pts, feat.reshape(-1, 2)])
    return pts.reshape(-1, 1, 2)

LK = dict(winSize=(21, 21), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))

def lk_step(prev_gray, cur_gray, pts, fb_thresh=1.0):
    nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev_gray, cur_gray, pts, None, **LK)
    back, st2, _ = cv2.calcOpticalFlowPyrLK(cur_gray, prev_gray, nxt, None, **LK)
    fb = np.linalg.norm((pts - back).reshape(-1, 2), axis=1)
    ok = (st.reshape(-1) == 1) & (st2.reshape(-1) == 1) & (fb < fb_thresh)
    return nxt, ok

MOTION_MODELS = ("similarity", "affine", "homography")

def fit_h(anchor_pts, cur_pts, ransac=4.0, model="similarity"):
    """Anchor→current transform as a 3x3. A small garment plane (a chest band, a patch) is
    better served by fewer degrees of freedom: 'similarity' (4 DOF) is the stable default,
    'affine' (6) for foreshortening, 'homography' (8) only for large, truly planar regions."""
    if len(anchor_pts) < 6: return None, np.zeros(len(anchor_pts), bool)
    a = anchor_pts.reshape(-1, 1, 2); c = cur_pts.reshape(-1, 1, 2)
    if model == "homography":
        H, inl = cv2.findHomography(a, c, cv2.RANSAC, ransac)
    else:
        fn = cv2.estimateAffinePartial2D if model == "similarity" else cv2.estimateAffine2D
        A, inl = fn(a, c, method=cv2.RANSAC, ransacReprojThreshold=ransac, maxIters=3000, confidence=0.995, refineIters=20)
        H = None if A is None else np.vstack([A, [0, 0, 1]])
    if H is None or inl is None: return None, np.zeros(len(anchor_pts), bool)
    return H, inl.reshape(-1).astype(bool)

def warp_quad(H, quad):
    q = quad_array(quad).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(q, H).reshape(4, 2)

# ----------------------------------------------------------------------------- tracking

def reacquire(anchor_gray, cur_gray, quad, approx_H, model="affine", search_px=40, min_score=0.45, min_inliers=8):
    """Re-acquire the plane against the ANCHOR frame directly (not against the previous frame),
    so recovered points carry TRUE anchor coordinates after an occlusion or a coast.
    Low-texture friendly: (1) the anchor plane is warped by the approximate transform and
    found in the current frame by normalised cross-correlation inside a search window;
    (2) grid points seeded on the anchor plane are refined with LK between the warped anchor
    and the current frame; (3) the anchor→current transform is fit from those points.
    Returns (H, anchor_pts, cur_pts) or (None, None, None)."""
    h, w = cur_gray.shape[:2]
    warped = cv2.warpPerspective(anchor_gray, approx_H, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    q = warp_quad(approx_H, quad)
    x0, y0 = int(np.floor(q[:, 0].min())), int(np.floor(q[:, 1].min())); x1, y1 = int(np.ceil(q[:, 0].max())), int(np.ceil(q[:, 1].max()))
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(w, x1), min(h, y1)
    if x1 - x0 < 8 or y1 - y0 < 8: return None, None, None
    tmpl = warped[y0:y1, x0:x1]
    sx0, sy0 = max(0, x0 - search_px), max(0, y0 - search_px); sx1, sy1 = min(w, x1 + search_px), min(h, y1 + search_px)
    region = cur_gray[sy0:sy1, sx0:sx1]
    if region.shape[0] <= tmpl.shape[0] or region.shape[1] <= tmpl.shape[1]: return None, None, None
    res = cv2.matchTemplate(region, tmpl, cv2.TM_CCOEFF_NORMED)
    _, score, _, loc = cv2.minMaxLoc(res)
    if score < min_score: return None, None, None
    dx, dy = (sx0 + loc[0]) - x0, (sy0 + loc[1]) - y0
    H1 = np.array([[1, 0, dx], [0, 1, dy], [0, 0, 1]], np.float64) @ approx_H
    apts = seed_points(anchor_gray, quad)
    cur0 = cv2.perspectiveTransform(apts, H1).astype(np.float32)
    shifted = cv2.warpPerspective(anchor_gray, H1, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    nxt, ok = lk_step(shifted, cur_gray, cur0, fb_thresh=1.5)
    if ok.sum() < min_inliers: return None, None, None
    H, inl = fit_h(apts[ok].reshape(-1, 2), nxt[ok].reshape(-1, 2), model=model)
    if H is None or inl.sum() < min_inliers: return None, None, None
    return H, apts[ok][inl].reshape(-1, 1, 2), nxt[ok][inl].reshape(-1, 1, 2)

def expand_quad(quad, factor):
    """Scale a quad about its centre (factor 1 = unchanged)."""
    q = quad_array(quad); c = q.mean(axis=0)
    return quad_array(c + (q - c) * float(factor))

def track_plane(frames, anchor_idx, quad, min_inliers=8, reseed_below=18, fb_thresh=1.5, model="similarity", smooth_sigma=1.0, max_coast=6, track_quad=None):
    """Track the anchor quad through all frames (backward from the anchor and forward).
    `track_quad` (default: the quad itself) is the region whose texture is TRACKED; the
    returned transforms are applied to `quad`, the region the graphic occupies. Use a larger
    track_quad when the graphic sits on a textureless patch (a plain chest panel) surrounded by
    trackable structure (zip, seams, an existing stripe) on the same garment plane.
    Returns per-frame dicts: {H (3x3 or None), quad (4x2 or None), confidence, inliers, tracked}."""
    grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]
    n = len(frames)
    out = [None] * n
    out[anchor_idx] = {"H": np.eye(3), "quad": quad_array(quad), "confidence": 1.0, "inliers": 0, "tracked": 0}
    tq = quad_array(quad) if track_quad is None else quad_array(track_quad)

    def run(direction):
        idx = anchor_idx
        pts = seed_points(grays[idx], tq)                      # current positions
        apts = pts.copy()                                       # anchor coordinates of the same points
        H_prev = np.eye(3); coast = 0
        while True:
            j = idx + direction
            if j < 0 or j >= n: break
            if len(pts):
                nxt, ok = lk_step(grays[idx], grays[j], pts, fb_thresh)
                pts, apts = nxt[ok], apts[ok]
            H, inl = fit_h(apts.reshape(-1, 2), pts.reshape(-1, 2), model=model) if len(pts) else (None, np.zeros(0, bool))
            n_inl = int(inl.sum()) if H is not None else 0
            if coast > 0 or n_inl < min_inliers:
                # after (or during) a coast, frame-to-frame tracks are not trustworthy: match the
                # ANCHOR frame directly so recovered points carry true anchor coordinates
                Hr, ar, cr = reacquire(grays[anchor_idx], grays[j], tq, H_prev if H is None else H, model=model)
                if Hr is not None:
                    H, apts, pts = Hr, ar, cr; inl = np.ones(len(pts), bool); n_inl = int(len(pts))
            if H is not None and n_inl >= min_inliers:
                pts, apts = pts[inl], apts[inl]; coast = 0
                conf = min(1.0, n_inl / 24.0) * (n_inl / max(1, len(inl)))
                out[j] = {"H": H, "quad": warp_quad(H, quad), "confidence": float(conf), "inliers": n_inl, "tracked": int(len(inl))}
                H_prev = H
            else:
                # COAST on the last good transform for a few frames (an arm passing, a blur),
                # confidence decaying; beyond max_coast the frame is honestly untracked.
                coast += 1
                if coast <= max_coast:
                    out[j] = {"H": H_prev, "quad": warp_quad(H_prev, quad), "confidence": float(max(0.0, 0.45 - 0.08 * coast)), "inliers": n_inl, "tracked": int(len(pts)), "coasting": coast}
                else:
                    out[j] = {"H": None, "quad": None, "confidence": 0.0, "inliers": n_inl, "tracked": int(len(pts))}
                if H is not None and n_inl >= min_inliers // 2: pts, apts = pts[inl], apts[inl]
            # re-seed inside the current plane; new points get anchor coordinates via H^-1
            if len(pts) < reseed_below and out[j]["quad"] is not None and coast == 0:
                fresh = seed_points(grays[j], warp_quad(out[j]["H"], tq))
                try:
                    Hinv = np.linalg.inv(out[j]["H"])
                except np.linalg.LinAlgError:
                    Hinv = None
                if Hinv is not None:
                    fa = cv2.perspectiveTransform(fresh, Hinv)
                    pts = np.vstack([pts, fresh]) if len(pts) else fresh
                    apts = np.vstack([apts, fa]) if len(apts) else fa
            idx = j
    run(+1); run(-1)
    if smooth_sigma and smooth_sigma > 0: smooth_track(out, quad, smooth_sigma)
    return out

def smooth_track(track, quad, sigma):
    """Temporal Gaussian smoothing of the tracked corners over each contiguous tracked run,
    then the anchor→frame transform is re-derived from the smoothed quad (exact for 4 points)."""
    n = len(track); r = max(1, int(round(3 * sigma))); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    q0 = quad_array(quad)
    i = 0
    while i < n:
        if track[i] is None or track[i]["quad"] is None: i += 1; continue
        j = i
        while j + 1 < n and track[j + 1] is not None and track[j + 1]["quad"] is not None: j += 1
        qs = np.stack([track[t]["quad"] for t in range(i, j + 1)])           # (m,4,2)
        if len(qs) >= 3:
            pad = np.concatenate([qs[:1].repeat(r, 0), qs, qs[-1:].repeat(r, 0)])
            sm = np.stack([np.tensordot(k, pad[t:t + 2 * r + 1], axes=(0, 0)) for t in range(len(qs))])
            for t in range(i, j + 1):
                qq = sm[t - i].astype(np.float32)
                track[t]["quad"] = qq; track[t]["H"] = cv2.getPerspectiveTransform(q0, qq)
        i = j + 1

# ----------------------------------------------------------------------------- occlusion + light

def skin_mask(bgr):
    ycc = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)
    m = cv2.inRange(ycc, (0, 135, 85), (255, 180, 135))
    return m

def occlusion_mask(frame, anchor_frame, H, quad, extra_mask=None, resid_thresh=34.0, feather=5, use_skin=False, min_blob_frac=0.06):
    """Inside the tracked plane: 1 where the plane is NOT the garment surface anymore
    (appearance far from the anchor's garment under the same homography; optionally skin —
    off by default because light garments fall inside the YCrCb skin range)."""
    h, w = frame.shape[:2]
    plane = quad_mask(frame.shape, warp_quad(H, quad), dilate_px=feather + 2)
    warped_anchor = cv2.warpPerspective(anchor_frame, H, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    a = cv2.GaussianBlur(cv2.cvtColor(warped_anchor, cv2.COLOR_BGR2LAB), (0, 0), 3).astype(np.float32)
    b = cv2.GaussianBlur(cv2.cvtColor(frame, cv2.COLOR_BGR2LAB), (0, 0), 3).astype(np.float32)
    # chroma-weighted residual: illumination changes mostly move L, occluders move a/b too
    resid = np.sqrt(0.35 * (a[..., 0] - b[..., 0]) ** 2 + (a[..., 1] - b[..., 1]) ** 2 + (a[..., 2] - b[..., 2]) ** 2)
    occ = (resid > resid_thresh).astype(np.uint8) * 255
    if use_skin: occ |= skin_mask(frame)
    if extra_mask is not None: occ |= extra_mask
    # An occluder (arm, hand, hair, prop) is a LARGE connected region; the generator redrawing
    # a stroke or a glyph differently is thin and small. Keep only blobs bigger than
    # min_blob_frac of the plane so lettering flicker never punches holes in the graphic.
    occ = cv2.morphologyEx(occ, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    occ = (occ & plane)
    n_lab, lab_img, stats, _ = cv2.connectedComponentsWithStats(occ)
    plane_area = max(1, int((plane > 0).sum())); keep = np.zeros_like(occ)
    for i in range(1, n_lab):
        if stats[i, cv2.CC_STAT_AREA] >= min_blob_frac * plane_area: keep[lab_img == i] = 255
    occ = cv2.dilate(keep, np.ones((9, 9), np.uint8)) & plane
    occ_f = cv2.GaussianBlur(occ.astype(np.float32) / 255.0, (0, 0), feather)
    return np.clip(occ_f, 0, 1), plane

def illumination(frame, anchor_frame, H, quad, occ):
    """Gain on L and shift on a/b (Lab) from the non-occluded plane region, low-frequency."""
    h, w = frame.shape[:2]
    plane = quad_mask(frame.shape, warp_quad(H, quad)) > 0
    keep = plane & (occ < 0.3)
    if keep.sum() < 50: return 1.0, 0.0, 0.0
    wa = cv2.warpPerspective(anchor_frame, H, (w, h), borderMode=cv2.BORDER_REPLICATE)
    la = cv2.cvtColor(wa, cv2.COLOR_BGR2LAB).astype(np.float32); lb = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
    gain = float(np.clip((lb[..., 0][keep].mean() + 1) / (la[..., 0][keep].mean() + 1), 0.55, 1.6))
    da = float(np.clip(lb[..., 1][keep].mean() - la[..., 1][keep].mean(), -12, 12))
    db = float(np.clip(lb[..., 2][keep].mean() - la[..., 2][keep].mean(), -12, 12))
    return gain, da, db

# ----------------------------------------------------------------------------- qa

def temporal_qa(track, fps):
    conf = np.array([t["confidence"] if t else 0.0 for t in track])
    quads = [t["quad"] for t in track]
    jitter = []
    for k in range(1, len(quads) - 1):
        if quads[k - 1] is None or quads[k] is None or quads[k + 1] is None: jitter.append(None); continue
        acc = quads[k + 1] - 2 * quads[k] + quads[k - 1]
        jitter.append(float(np.linalg.norm(acc, axis=1).mean()))
    jv = [j for j in jitter if j is not None]
    lost = [i for i, t in enumerate(track) if t is None or t["quad"] is None]
    return {
        "frames": len(track), "fps": fps,
        "confidence_mean": float(conf.mean()), "confidence_min": float(conf.min()),
        "frames_lost": lost, "lost_fraction": len(lost) / max(1, len(track)),
        "corner_jitter_px_mean": float(np.mean(jv)) if jv else None, "corner_jitter_px_p95": float(np.percentile(jv, 95)) if jv else None,
    }

def to_jsonable(track):
    return [None if t is None else {"H": None if t["H"] is None else np.asarray(t["H"]).round(6).tolist(), "quad": None if t["quad"] is None else np.asarray(t["quad"]).round(2).tolist(), "confidence": round(t["confidence"], 4), "inliers": t["inliers"], "tracked": t["tracked"]} for t in track]
