#!/usr/bin/env python3
"""
Deterministic graphics attached to moving garments — logos, wordmarks, patches, embroidery,
numbers: anything a generative model keeps redrawing differently frame to frame.

ChatGPT ruling 2026-09-21 §4: "generator owns garment/body interaction; deterministic layer
owns exact branding whenever geometry permits … canonical graphic → tracked garment
coordinates/plane → perspective warp → illumination adaptation → occlusion → composite →
temporal QA. It must handle arms passing in front of the graphic. Make it project/brand agnostic."

  python3 scripts/edit/garment_graphic_track.py --video shot.mp4 --graphic band.png \\
      --anchor-frame 30 --anchor-quad 303,713,417,710,417,752,303,758 \\
      --out-dir gfx/ [--matte alpha.mp4] [--min-confidence 0.35] [--opaque]

Inputs
  --video         the shot (any resolution; the wardrobe edit or the environment composite)
  --graphic       the canonical graphic. PNG with alpha for a mark on a surface; an OPAQUE
                  crop (e.g. the band segment from the product photo, --opaque) when the
                  graphic must REPLACE what the generator drew underneath it.
  --anchor-*      where the graphic sits on ONE frame: the frame index and the four corners
                  (top-left, top-right, bottom-right, bottom-left) of the graphic's plane in
                  that frame's pixel coordinates. That is the only creative input; everything
                  else is tracked.
  --matte         optional person/garment alpha video: pixels outside it never receive graphic.
  --anchors       several anchors "f:x1,y1,…,x4,y4;f:…" — each is tracked through the whole
                  shot and every frame takes the most confident one. A tracked quad whose
                  edge lengths drift more than --max-shape-drift× from its anchor's (after
                  removing scale) is degenerate and loses the frame (quad_shape_ok).
  --erase-above / --erase-below   stray-mark eraser: a band above/below the tracked plane
                  (fraction of its height; --erase-extend l,r widens it sideways) in which
                  off-colour ISLANDS — blobs fully enclosed by garment colour, smaller than
                  --erase-max-blob of the band — are inpainted away before the graphic goes on.
                  Anything touching the band's outer edge (tie, hand, stripe, fold) is not an
                  island and is left alone; --erase-mode flat repaints the whole band instead.
Outputs
  <out-dir>/<name>_graphic.mp4      the shot with the graphic composited
  <out-dir>/<name>_track.json       per-frame homography, quad, confidence, occlusion fraction,
                                    illumination, plus the temporal-QA summary
  <out-dir>/<name>_qa_sheet.jpg     frame strip: original | composite | occlusion, sampled
The graphic is dropped (not guessed) on frames whose tracking confidence is below
--min-confidence; those frames are listed in the QA so a re-anchor can be placed.
"""
import argparse, json, os, subprocess, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from garment_track import (expand_quad, illumination, occlusion_mask, quad_array, quad_mask, read_frames, temporal_qa, to_jsonable, track_plane, warp_quad)

def load_graphic(path, opaque):
    g = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if g is None: raise SystemExit(f"cannot read graphic {path}")
    if g.ndim == 2: g = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
    if g.shape[2] == 3 or opaque:
        alpha = np.full(g.shape[:2], 255, np.uint8)
        bgr = g[..., :3]
    else:
        alpha = g[..., 3]; bgr = g[..., :3]
    return bgr, alpha

def auto_anchor(frame, gbgr, scales=np.linspace(0.35, 1.6, 26), aspect_tol=(0.6, 1.6), min_score=0.35):
    """Find where the canonical graphic sits on the anchor frame: multi-scale normalised
    cross-correlation of the graphic over the frame in Lab (colour matters: a navy band with
    gold marks must not match a grey shelf), with the graphic's aspect also varied within
    aspect_tol because a generator often draws a band taller or shorter than the true one.
    Returns (quad TL,TR,BR,BL, score) or (None, score)."""
    fl = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB); gl = cv2.cvtColor(gbgr, cv2.COLOR_BGR2LAB)
    gh, gw = gl.shape[:2]; best = (None, -1.0)
    for sc in scales:
        for ar in np.linspace(aspect_tol[0], aspect_tol[1], 6):
            tw, th = int(round(gw * sc)), int(round(gh * sc * ar))
            if tw < 16 or th < 8 or tw >= fl.shape[1] or th >= fl.shape[0]: continue
            t = cv2.resize(gl, (tw, th), interpolation=cv2.INTER_AREA)
            res = cv2.matchTemplate(fl, t, cv2.TM_CCOEFF_NORMED)
            _, score, _, loc = cv2.minMaxLoc(res)
            if score > best[1]: best = ((loc[0], loc[1], tw, th), score)
    if best[0] is None or best[1] < min_score: return None, best[1]
    x, y, tw, th = best[0]
    return quad_array([x, y, x + tw - 1, y, x + tw - 1, y + th - 1, x, y + th - 1]), best[1]

def graphic_to_plane_h(gw, gh, quad):
    src = np.array([[0, 0], [gw - 1, 0], [gw - 1, gh - 1], [0, gh - 1]], np.float32)
    return cv2.getPerspectiveTransform(src, quad_array(quad))

def apply_illumination(bgr, gain, da, db):
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab[..., 0] = np.clip(lab[..., 0] * gain, 0, 255); lab[..., 1] = np.clip(lab[..., 1] + da, 0, 255); lab[..., 2] = np.clip(lab[..., 2] + db, 0, 255)
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

def quad_shape_ok(anchor_quad, quad, max_drift):
    """Compare each edge length of the tracked quad with the anchor's, after removing the mean
    scale. Returns (ok, worst_ratio); ok is False if any edge changed by more than max_drift×."""
    q0 = np.asarray(anchor_quad, np.float32); q1 = np.asarray(quad, np.float32)
    e0 = np.array([np.linalg.norm(q0[(i + 1) % 4] - q0[i]) for i in range(4)]); e1 = np.array([np.linalg.norm(q1[(i + 1) % 4] - q1[i]) for i in range(4)])
    if (e0 <= 1e-3).any(): return True, 1.0
    r = e1 / e0; r = r / max(1e-6, r.mean())
    worst = float(max(r.max(), 1.0 / max(1e-6, r.min())))
    return worst <= max_drift, worst

def snap_to_band(frames, track, anchors, owner, reach, tol, min_conf):
    """Vertical refinement of a tracked plane against the SURFACE it sits on: a band segment's
    own texture (the lettering a generator redraws every frame) is a weak tracking target and the
    plane creeps or rotates off the band over a fast move, but the band's edges are the strongest
    lines in the region. Per frame the plane is rectified with `reach` extra rows above and below;
    on its left third and its right third separately, each row's share of band-coloured pixels
    (Lab distance to the anchor plane's median < tol) is taken, small gaps (the lettering) are
    closed, the run of band rows around the plane's centre is found, and the plane's four corners
    are moved along the plane's vertical axis onto that run (at most `reach` px, so a missing edge
    leaves the corner alone). Offsets are median-smoothed over 5 frames. Only frames with
    confidence ≥ min_conf are touched."""
    def band_run(near, reach, Hp):
        rows = (near > 0.5).astype(np.uint8)
        rows = cv2.morphologyEx(rows[:, None], cv2.MORPH_CLOSE, np.ones((15, 1), np.uint8))[:, 0].astype(bool)
        c = reach + Hp // 2
        if not rows[c]:
            inside = np.where(rows[reach:reach + Hp])[0]
            if len(inside) == 0: return None
            c = reach + int(inside[np.argmin(np.abs(inside - Hp // 2))])
        top = c
        while top > 0 and rows[top - 1]: top -= 1
        bot = c
        while bot < len(rows) - 1 and rows[bot + 1]: bot += 1
        d_top, d_bot = top - reach, bot + 1 - (reach + Hp)
        return (float(d_top) if abs(d_top) <= reach else 0.0, float(d_bot) if abs(d_bot) <= reach else 0.0)
    offs = {}; med_cache = {}
    for k, t in enumerate(track):
        if t is None or t.get("H") is None or t["confidence"] < min_conf: continue
        af, aq = anchors[owner[k]]
        if af not in med_cache:
            pm = quad_mask(frames[af].shape, aq) > 0
            med_cache[af] = np.median(cv2.cvtColor(frames[af], cv2.COLOR_BGR2LAB).astype(np.float32)[pm], axis=0)
        med = med_cache[af]
        q = warp_quad(t["H"], aq).astype(np.float32)
        wq = float((np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2); hq = float((np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2)
        Wp, Hp = max(9, int(round(wq))), max(4, int(round(hq)))
        vax = ((q[3] - q[0]) + (q[2] - q[1])) / 2 / max(hq, 1e-6)
        src = np.array([q[0] - vax * reach, q[1] - vax * reach, q[2] + vax * reach, q[3] + vax * reach], np.float32)
        dst = np.array([[0, 0], [Wp, 0], [Wp, Hp + 2 * reach], [0, Hp + 2 * reach]], np.float32)
        rect = cv2.warpPerspective(frames[k], cv2.getPerspectiveTransform(src, dst), (Wp, Hp + 2 * reach), flags=cv2.INTER_LINEAR)
        lab = cv2.cvtColor(rect, cv2.COLOR_BGR2LAB).astype(np.float32)
        nearpx = np.sqrt(((lab - med) ** 2).sum(axis=2)) < tol
        L = band_run(nearpx[:, : Wp // 3].mean(axis=1), reach, Hp); R = band_run(nearpx[:, -(Wp // 3):].mean(axis=1), reach, Hp)
        if L is None or R is None: continue
        offs[k] = (L[0], R[0], R[1], L[1])                                     # TL, TR, BR, BL along the vertical axis
    if not offs: return track, {}, anchors
    ks = sorted(offs); sm = {}
    for i, k in enumerate(ks):
        win = np.array([offs[j] for j in ks[max(0, i - 2):i + 3]]); sm[k] = tuple(float(x) for x in np.median(win, axis=0))
    out = list(track); snapped = {}
    for k, d in sm.items():
        t = track[k]; af, aq = anchors[owner[k]]; q = warp_quad(t["H"], aq).astype(np.float32)
        hq = float((np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2)
        vax = ((q[3] - q[0]) + (q[2] - q[1])) / 2 / max(hq, 1e-6)
        snapped[k] = np.array([q[i] + vax * d[i] for i in range(4)], np.float32)
    # the anchors' own quads snap too (their frame's snapped plane), and every H is re-derived from
    # the snapped anchor quad: the occluder test warps the anchor's texture by H, so anchor and
    # frame must be snapped alike or the offset itself reads as an occluder
    new_anchors = list(anchors)
    for i, (af, aq) in enumerate(anchors):
        if af in snapped and owner[af] == i: new_anchors[i] = (af, snapped[af])
    for k, q2 in snapped.items():
        t = track[k]; af, aq2 = new_anchors[owner[k]]
        out[k] = {**t, "H": cv2.getPerspectiveTransform(aq2.astype(np.float32), q2), "quad": q2, "snap": list(sm[k])}
    for k, t in enumerate(out):
        if k in snapped or t is None or t.get("H") is None: continue
        af, aq2 = new_anchors[owner[k]]; q = warp_quad(t["H"], anchors[owner[k]][1]).astype(np.float32)
        out[k] = {**t, "H": cv2.getPerspectiveTransform(aq2.astype(np.float32), q), "quad": q}
    return out, sm, new_anchors

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True); ap.add_argument("--graphic", required=True); ap.add_argument("--out-dir", required=True)
    ap.add_argument("--anchor-frame", type=int, default=None); ap.add_argument("--anchor-quad", default=None, help="x1,y1,x2,y2,x3,y3,x4,y4 (TL,TR,BR,BL); omit to locate the graphic on the anchor frame automatically")
    ap.add_argument("--anchors", default=None, help="several anchors 'frame:x1,y1,...,x4,y4;frame:...' — each frame uses whichever anchor's track is most confident there (re-anchoring across occlusions/turns)")
    ap.add_argument("--matte", default=None); ap.add_argument("--opaque", action="store_true")
    ap.add_argument("--min-confidence", type=float, default=0.35); ap.add_argument("--max-occlusion", type=float, default=0.5, help="a frame whose plane is more than this fraction occluded gets no graphic"); ap.add_argument("--edge-feather", type=float, default=1.2)
    ap.add_argument("--resid-thresh", type=float, default=34.0); ap.add_argument("--min-occluder-frac", type=float, default=0.15, help="an occluder blob must cover at least this fraction of the plane (and enter from its border); the generator's lettering at the plane's edge is smaller"); ap.add_argument("--name", default=None)
    ap.add_argument("--skin-occluder", action="store_true", help="also treat YCrCb skin as occluder (only for garments far from skin tones)")
    ap.add_argument("--motion-model", choices=("similarity", "affine", "homography"), default="affine")
    ap.add_argument("--track-expand", type=float, default=1.0, help="track the texture of a quad this many times larger (about the same centre) than the graphic's quad — for a graphic on a plain panel surrounded by trackable garment structure")
    ap.add_argument("--snap-reach", type=int, default=0, help="px: after tracking, move the plane's top and bottom edges onto the band-coloured row run they sit in (a band segment whose lettering the generator redraws is a weak tracking target; its edges are not); 0 = off"); ap.add_argument("--snap-tol", type=float, default=22.0, help="Lab distance to the anchor plane's median colour that counts as the band"); ap.add_argument("--handover", type=int, default=4, help="frames on each side of an anchor-ownership change over which the plane blends from the old track to the new one"); ap.add_argument("--proximity-weight", type=float, default=0.01, help="multi-anchor ownership: confidence penalty per frame of distance from the anchor, so the nearest anchor wins ties")
    ap.add_argument("--max-shape-drift", type=float, default=1.3, help="a tracked quad whose edge lengths (scale-normalised) drift more than this factor from the anchor's is degenerate and gets confidence 0")
    ap.add_argument("--erase-above", type=float, default=0.0, help="fraction of the plane height ABOVE the plane to repaint with the surrounding garment colour before compositing — removes stray marks a generator drew next to the true graphic (0 = off)")
    ap.add_argument("--erase-below", type=float, default=0.0, help="same, below the plane")
    ap.add_argument("--erase-beside", default="0,0", help="stray-mark eraser LEFT,RIGHT of the plane in its own rows, as fractions of the plane width (marks mode only: islands enclosed by band colour)")
    ap.add_argument("--erase-extend", default="0,0", help="widen the erase bands sideways: 'left,right' fractions of the plane width (stray marks often sit beside the graphic's column)")
    ap.add_argument("--plane-mode", choices=["band", "opaque"], default="band", help="band: keep the footage's own band texture, inpaint the generator's lettering inside the plane from the band and paint only the graphic's mark, never outside the band-coloured region; opaque: paint the whole graphic plane")
    ap.add_argument("--band-min-frac", type=float, default=0.6, help="band mode: below this band-coloured share of the plane (a white or fully lettered generator band) the frame falls back to the opaque plane")
    ap.add_argument("--band-dab", type=float, default=12.0, help="band mode: a and b (Lab) tolerance for band / body membership (chroma-led, shading-invariant)")
    ap.add_argument("--band-dl", type=float, default=45.0, help="band mode: L tolerance for band membership (white lettering on a navy band is far in L, the band's own shading is not)")
    ap.add_argument("--mark-thresh", type=float, default=60.0, help="band mode: summed BGR difference from the graphic's background colour above which a graphic pixel is the mark")
    ap.add_argument("--erase-mode", choices=["marks", "flat"], default="marks", help="marks: inpaint only off-colour ISLANDS inside the band (occluder-safe — anything touching the band edge is left alone); flat: repaint the whole band")
    ap.add_argument("--erase-thresh", type=float, default=16.0, help="marks mode: Lab distance from the band's garment colour that counts as off-colour")
    ap.add_argument("--erase-max-blob", type=float, default=0.25, help="marks mode: an off-colour blob larger than this fraction of the band is an occluder, not a mark")
    ap.add_argument("--extend", default="0,0,0,0", help="grow the plane beyond the anchor quad by fractions left,right,top,bottom (the graphic is padded with its edge colour) — covers what the generator drew past the true graphic extent")
    ap.add_argument("--match-anchor", action="store_true", help="colour-match the graphic once to the anchor plane (product-photo lighting → footage lighting)")
    ap.add_argument("--soften", type=float, default=0.0, help="Gaussian sigma applied to the graphic so it matches the footage resolution")
    ap.add_argument("--shading", type=float, default=0.7, help="0..1: how much of the footage's low-frequency shading under the plane is transferred onto the graphic")
    ap.add_argument("--smooth", type=float, default=1.0, help="temporal Gaussian sigma (frames) on the tracked corners; 0 = off")
    ap.add_argument("--fit", choices=("stretch", "contain"), default="contain", help="contain: keep the graphic's proportions inside the plane, padding with its own edge colour")
    a = ap.parse_args()
    name = a.name or os.path.splitext(os.path.basename(a.video))[0]
    os.makedirs(a.out_dir, exist_ok=True)
    frames, fps = read_frames(a.video); h, w = frames[0].shape[:2]
    if a.anchors is None and (a.anchor_frame is None or not (0 <= a.anchor_frame < len(frames))): raise SystemExit("anchor frame out of range (pass --anchor-frame or --anchors)")
    gbgr, galpha = load_graphic(a.graphic, a.opaque); gh, gw = galpha.shape
    anchors = []   # list of (frame, quad)
    anchor_score = None
    if a.anchors:
        for item in a.anchors.split(";"):
            fr, q = item.split(":", 1); anchors.append((int(fr), quad_array([float(x) for x in q.split(",")])))
    elif a.anchor_quad:
        anchors.append((a.anchor_frame, quad_array([float(x) for x in a.anchor_quad.split(",")])))
    else:
        quad, anchor_score = auto_anchor(frames[a.anchor_frame], gbgr)
        if quad is None: raise SystemExit(f"auto-anchor: graphic not found on frame {a.anchor_frame} (best NCC {anchor_score:.2f}); pass --anchor-quad")
        print(f"auto-anchor: NCC {anchor_score:.2f} at {quad.round(1).tolist()}", flush=True); anchors.append((a.anchor_frame, quad))
    if any(not (0 <= f < len(frames)) for f, _ in anchors): raise SystemExit("anchor frame out of range")
    a.anchor_frame, quad = anchors[0]
    matte = read_frames(a.matte)[0] if a.matte else None

    print(f"tracking plane from anchor frame(s) {[f for f, _ in anchors]} over {len(frames)} frames …", flush=True)
    tracks = [track_plane(frames, f, q, model=a.motion_model, smooth_sigma=a.smooth, track_quad=expand_quad(q, a.track_expand) if a.track_expand != 1.0 else None) for f, q in anchors]
    # shape sanity: a tracked quad whose edges have collapsed or stretched relative to the anchor's
    # (beyond --max-shape-drift, after removing the mean scale) is a degenerate fit, however many
    # inliers it kept — its confidence goes to 0 so a healthier anchor takes the frame
    for (f0, q0), tr in zip(anchors, tracks):
        for k, t in enumerate(tr):
            if t is None or t.get("quad") is None: continue
            ok, ratio = quad_shape_ok(q0, t["quad"], a.max_shape_drift)
            if not ok: t["confidence"] = 0.0; t["shape_ratio"] = ratio
    # per frame: the anchor whose track is most confident there; among near-equal confidences the
    # NEAREST anchor wins (tracks drift with distance even while their inlier confidence stays high)
    # ...and a track that had to COAST through an occlusion between its anchor and this frame is
    # worth less than one that saw the plane all the way: the path minimum of its confidence
    # counts as much as its confidence here (a wrong re-acquisition after a full occlusion can be
    # confident again, and it would otherwise steal frames from the anchor that never lost sight)
    def path_min(i, k):
        f0 = anchors[i][0]; lo, hi = (f0, k) if k >= f0 else (k, f0)
        vals = [tracks[i][j]["confidence"] if tracks[i][j] is not None else 0.0 for j in range(lo, hi + 1)]
        return min(vals) if vals else 0.0
    owner = []
    for k in range(len(frames)):
        def score(i):
            t = tracks[i][k]
            return -1.0 if t is None else 0.5 * (t["confidence"] + path_min(i, k)) - a.proximity_weight * abs(k - anchors[i][0])
        owner.append(max(range(len(anchors)), key=score))
    track = [tracks[owner[k]][k] for k in range(len(frames))]
    # handover: two anchors' tracks disagree by a few tens of pixels where ownership changes (each
    # drifts with distance from its anchor); the plane crosses from one to the other over
    # --handover frames instead of jumping — the incoming anchor owns the window, its plane is the
    # blend of both tracks' quads, so the graphic slides rather than snaps
    if a.handover > 0 and len(anchors) > 1:
        switches = [k for k in range(1, len(frames)) if owner[k] != owner[k - 1]]
        for k in switches:
            ia, ib = owner[k - 1], owner[k]
            for j in range(max(0, k - a.handover), min(len(frames), k + a.handover)):
                ta, tb = tracks[ia][j], tracks[ib][j]
                if ta is None or tb is None or ta.get("H") is None or tb.get("H") is None: continue
                wt = (j - (k - a.handover) + 0.5) / (2 * a.handover)                    # 0 → 1 across the window
                qa_, qb_ = warp_quad(ta["H"], anchors[ia][1]), warp_quad(tb["H"], anchors[ib][1])
                # only two tracks that both see the plane and roughly agree are blended; when they
                # disagree by more than half a plane width one of them is wrong (a coasted track
                # re-acquired on the wrong texture) and the frame keeps its plain owner
                if ta["confidence"] < a.min_confidence or tb["confidence"] < a.min_confidence: continue
                pw_ = np.linalg.norm(qa_[1] - qa_[0])
                if np.linalg.norm(qa_.mean(axis=0) - qb_.mean(axis=0)) > 0.5 * pw_: continue
                q = (1 - wt) * qa_ + wt * qb_
                # the frame is owned by whichever anchor's plane the blend is nearer to, so the
                # occluder test compares against a texture that is nearly where it should be
                io = ia if wt < 0.5 else ib
                Ho = cv2.getPerspectiveTransform(anchors[io][1].astype(np.float32), q.astype(np.float32))
                track[j] = {**tracks[io][j], "H": Ho, "quad": q, "confidence": max(ta["confidence"], tb["confidence"])}; owner[j] = io
    snap_offsets = {}
    if a.snap_reach > 0:
        track, snap_offsets, anchors = snap_to_band(frames, track, anchors, owner, a.snap_reach, a.snap_tol, a.min_confidence)
        if snap_offsets:
            v = np.array(list(snap_offsets.values())); print(f"band snap: {len(snap_offsets)} frames, mean corner offsets TL/TR/BR/BL {np.round(v.mean(axis=0), 1).tolist()} px, p95 |offset| {np.percentile(np.abs(v), 95):.1f} px")
    anchor = frames[a.anchor_frame]
    if a.fit == "contain":
        # the plane's aspect from the anchor quad (mean of opposite edges); pad the graphic to it
        pw = (np.linalg.norm(quad[1] - quad[0]) + np.linalg.norm(quad[2] - quad[3])) / 2
        ph = (np.linalg.norm(quad[3] - quad[0]) + np.linalg.norm(quad[2] - quad[1])) / 2
        target_h = int(round(gw * ph / max(pw, 1e-6)))
        border = np.concatenate([gbgr[:3].reshape(-1, 3), gbgr[-3:].reshape(-1, 3), gbgr[:, :3].reshape(-1, 3), gbgr[:, -3:].reshape(-1, 3)])
        pad_col = [int(v) for v in np.median(border, axis=0)]
        if target_h > gh:
            top = (target_h - gh) // 2; bot = target_h - gh - top
            gbgr = cv2.copyMakeBorder(gbgr, top, bot, 0, 0, cv2.BORDER_CONSTANT, value=pad_col); galpha = cv2.copyMakeBorder(galpha, top, bot, 0, 0, cv2.BORDER_REPLICATE)
        elif target_h < gh:
            target_w = int(round(gh * pw / max(ph, 1e-6))); left = (target_w - gw) // 2; right = target_w - gw - left
            gbgr = cv2.copyMakeBorder(gbgr, 0, 0, left, right, cv2.BORDER_CONSTANT, value=pad_col); galpha = cv2.copyMakeBorder(galpha, 0, 0, left, right, cv2.BORDER_REPLICATE)
        gh, gw = galpha.shape
    if a.match_anchor:
        # one-time colour match: the graphic's MEDIAN Lab → the anchor plane's median Lab, so the
        # canonical asset (product photo lighting) sits in the footage's lighting from frame one.
        # Medians, not means: the plane on the footage carries whatever lettering the generator
        # drew (often large and bright) and the graphic carries the true mark — both are the
        # minority of their plane, and the surface colour is what must agree
        pm = quad_mask(anchor.shape, quad) > 0
        la = cv2.cvtColor(anchor, cv2.COLOR_BGR2LAB).astype(np.float32); lg = cv2.cvtColor(gbgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        for ch in range(3):
            lg[..., ch] = np.clip(lg[..., ch] + (np.median(la[..., ch][pm]) - np.median(lg[..., ch])), 0, 255)
        gbgr = cv2.cvtColor(lg.astype(np.uint8), cv2.COLOR_LAB2BGR)
    if a.soften > 0: gbgr = cv2.GaussianBlur(gbgr, (0, 0), a.soften)
    # plane extension comes AFTER the colour match so the match sees only the true graphic plane
    a.erase_extend = [float(x) for x in a.erase_extend.split(",")][:2] + [0.0, 0.0]
    a.erase_beside = ([float(x) for x in a.erase_beside.split(",")] + [0.0, 0.0])[:2]
    ext = [float(x) for x in a.extend.split(",")]
    if any(e > 0 for e in ext):
        el, er, et, eb = ext
        u = (quad[1] - quad[0] + quad[2] - quad[3]) / 2; v = (quad[3] - quad[0] + quad[2] - quad[1]) / 2   # plane axes in pixels
        quad = quad_array([quad[0] - u * el - v * et, quad[1] + u * er - v * et, quad[2] + u * er + v * eb, quad[3] - u * el + v * eb])
        border = np.concatenate([gbgr[:3].reshape(-1, 3), gbgr[-3:].reshape(-1, 3), gbgr[:, :3].reshape(-1, 3), gbgr[:, -3:].reshape(-1, 3)])
        pad_col = [int(x) for x in np.median(border, axis=0)]
        L, R, T, B = int(round(gw * el)), int(round(gw * er)), int(round(gh * et)), int(round(gh * eb))
        gbgr = cv2.copyMakeBorder(gbgr, T, B, L, R, cv2.BORDER_CONSTANT, value=pad_col); galpha = cv2.copyMakeBorder(galpha, T, B, L, R, cv2.BORDER_REPLICATE)
        gh, gw = galpha.shape
    Hg = graphic_to_plane_h(gw, gh, quad)   # graphic → anchor plane
    # soft edge on the graphic so the warped patch never shows a hard rectangle
    galpha_f = galpha.astype(np.float32) / 255.0
    # the graphic's MARK: pixels that differ from the graphic's own background colour (its median)
    g_bg = np.median(gbgr[galpha > 127].reshape(-1, 3), axis=0)
    gmark = (np.abs(gbgr.astype(np.float32) - g_bg[None, None, :]).sum(axis=2) > a.mark_thresh).astype(np.uint8) * 255
    gmark = cv2.dilate(gmark, np.ones((3, 3), np.uint8)); gmark_f = cv2.GaussianBlur(gmark.astype(np.float32) / 255.0, (0, 0), 0.8)
    if a.edge_feather > 0:
        er = cv2.erode(galpha, np.ones((3, 3), np.uint8)); galpha_f = cv2.GaussianBlur(er.astype(np.float32) / 255.0, (0, 0), a.edge_feather)

    out_frames, per = [], []
    # per-CLIP plane mode: whether the generator's band under the plane is band-coloured is judged
    # once, on the measured anchor frames (the plane's colour matched to the graphic's background),
    # so the mode never flips frame to frame (a flip would read as the patch flickering)
    clip_band = a.plane_mode == "band"
    if a.plane_mode == "band":
        fr_ = []
        for af_, aq_ in anchors:
            pl_ = quad_mask(frames[af_].shape, aq_) > 0
            if pl_.sum() < 50: continue
            lab_ = cv2.GaussianBlur(cv2.cvtColor(frames[af_], cv2.COLOR_BGR2LAB), (0, 0), 1.0).astype(np.float32)
            g_ref = cv2.cvtColor(np.uint8([[np.median(gbgr[galpha > 127].reshape(-1, 3), axis=0)]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
            def near_to(ref__): return (np.abs(lab_[..., 1] - ref__[1]) < a.band_dab) & (np.abs(lab_[..., 2] - ref__[2]) < a.band_dab) & (np.abs(lab_[..., 0] - ref__[0]) < a.band_dl)
            pre_ = near_to(g_ref) & pl_; ref__ = np.median(lab_[pre_].reshape(-1, 3), axis=0) if pre_.sum() > 50 else g_ref
            fr_.append(float(near_to(ref__)[pl_].mean()))                              # share of the anchor plane that is band-coloured (chroma-led, re-centred: the same rule as per frame)
        clip_band = bool(fr_) and float(np.median(fr_)) >= a.band_min_frac
        print(f"plane mode: {'band-integrated' if clip_band else 'opaque (fallback)'} — anchor band share {[round(x, 2) for x in fr_]}", flush=True)
    for k, f in enumerate(frames):
        t = track[k]; rec = {"frame": k, "confidence": 0.0 if t is None else t["confidence"], "applied": False, "occlusion": None, "gain": None}
        if t is None or t["H"] is None or t["confidence"] < a.min_confidence:
            out_frames.append(f); per.append(rec); continue
        af, aq = anchors[owner[k]]; anchor = frames[af]; quad = aq
        Hg_k = graphic_to_plane_h(gw, gh, aq)
        H = t["H"] @ Hg_k                                       # graphic → this frame
        extra = None
        if matte is not None and k < len(matte):
            extra = (cv2.cvtColor(matte[k], cv2.COLOR_BGR2GRAY) < 128).astype(np.uint8) * 255
        occ, plane = occlusion_mask(f, anchor, t["H"], quad, extra_mask=extra, resid_thresh=a.resid_thresh, use_skin=a.skin_occluder, min_blob_frac=a.min_occluder_frac)
        # a plane that is MOSTLY hidden (an arm sweeping across it) is not drawn at all: the part
        # the occluder test leaves "visible" is motion blur and skin the residual missed, and a
        # graphic painted on a forearm is worse than the generator's lettering under it
        if (plane > 0).any() and float(occ[plane > 0].mean()) > a.max_occlusion:
            rec["occlusion"] = float(occ[plane > 0].mean()); out_frames.append(f); per.append(rec); continue
        gain, da, db = illumination(f, anchor, t["H"], quad, occ)
        g_lit = apply_illumination(gbgr, gain, da, db)
        # stray-mark eraser (before the graphic goes on): bands above/below the tracked plane,
        # optionally widened sideways. Mode "marks" (default) only repaints pixels whose colour
        # is far from the surrounding garment (the generator's stray glyphs), inpainting them from
        # their neighbourhood; a LARGE off-colour blob is an occluder (hand, tie, hair) and is left
        # alone. Mode "flat" repaints the whole band with the ring median shaded by the footage.
        if a.erase_above > 0 or a.erase_below > 0 or any(x > 0 for x in a.erase_beside):
            pq = warp_quad(t["H"], quad); v = (pq[3] - pq[0] + pq[2] - pq[1]) / 2   # plane vertical axis (px)
            uax = (pq[1] - pq[0] + pq[2] - pq[3]) / 2; ul, ur = uax * a.erase_extend[0], uax * a.erase_extend[1]
            erase_quads = []
            for frac, sign in ((a.erase_above, -1), (a.erase_below, +1)):
                if frac <= 0: continue
                top = (pq[0] - v * frac if sign < 0 else pq[3]) - ul
                topr = (pq[1] - v * frac if sign < 0 else pq[2]) + ur
                bot = (pq[0] if sign < 0 else pq[3] + v * frac) - ul
                botr = (pq[1] if sign < 0 else pq[2] + v * frac) + ur
                erase_quads.append(quad_array([top, topr, botr, bot]))
            # BESIDE the plane, in its own rows: the generator's lettering that the plane does not
            # cover (a mark drawn nearer the zip than the true one) is an island on the band there
            bl, br = a.erase_beside
            if bl > 0: erase_quads.append(quad_array([pq[0] - uax * bl, pq[0], pq[3], pq[3] - uax * bl]))
            if br > 0: erase_quads.append(quad_array([pq[1], pq[1] + uax * br, pq[2] + uax * br, pq[2]]))
            n_ab = sum(1 for frac in (a.erase_above, a.erase_below) if frac > 0)
            for qi, eq in enumerate(erase_quads):
                beside = qi >= n_ab
                em = quad_mask(f.shape, eq) > 0
                ring = (quad_mask(f.shape, eq, dilate_px=10) > 0) & ~(quad_mask(f.shape, eq, dilate_px=2) > 0) & ~(quad_mask(f.shape, pq, dilate_px=4) > 0)
                if em.sum() < 20 or ring.sum() < 50: continue
                if a.erase_mode == "marks":
                    lab_f = cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_BGR2LAB), (0, 0), 1.2).astype(np.float32)
                    ref = np.median(lab_f[em].reshape(-1, 3), axis=0)   # the band's own dominant colour: marks are the minority
                    dist = np.sqrt(0.25 * (lab_f[..., 0] - ref[0]) ** 2 + (lab_f[..., 1] - ref[1]) ** 2 + (lab_f[..., 2] - ref[2]) ** 2)
                    cand = ((dist > a.erase_thresh) & em).astype(np.uint8) * 255
                    cand = cv2.morphologyEx(cand, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
                    cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))   # break thin bridges to the tie / zip / shadows
                    n_lab, lab_img, stats, _ = cv2.connectedComponentsWithStats(cand)
                    marks = np.zeros_like(cand); band_area = max(1, int(em.sum()))
                    # a stray mark is an ISLAND: an off-colour blob fully enclosed by garment colour. Anything
                    # touching the band's edge (tie, hand, the real stripe, a fold) continues outside it
                    # and is not a mark, whatever its size (the edge shared with the plane is exempt).
                    edge = (em & ~cv2.erode(em.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)) & ~(quad_mask(f.shape, pq, dilate_px=8) > 0)   # the side shared with the plane doesn't count: marks sit right next to the graphic
                    if beside:
                        # a region in the band's own rows: lettering fills the band's height, so its top and
                        # bottom edges are not evidence of an occluder — only the outer side edge is
                        top_e, bot_e = eq[:2], eq[2:]
                        strip = np.zeros(f.shape[:2], np.uint8)
                        cv2.line(strip, tuple(np.round(eq[0]).astype(int)), tuple(np.round(eq[1]).astype(int)), 255, 7); cv2.line(strip, tuple(np.round(eq[3]).astype(int)), tuple(np.round(eq[2]).astype(int)), 255, 7)
                        edge = edge & ~(strip > 0)
                    for i in range(1, n_lab):
                        blob = lab_img == i
                        if stats[i, cv2.CC_STAT_AREA] < a.erase_max_blob * band_area and not (blob & edge).any(): marks[blob] = 255
                    if marks.any():
                        marks = cv2.dilate(marks, np.ones((7, 7), np.uint8)) & (em.astype(np.uint8) * 255)
                        f = cv2.inpaint(f, marks, 5, cv2.INPAINT_TELEA)
                    continue
                col = np.median(f[ring].reshape(-1, 3), axis=0)
                fill = np.empty_like(f); fill[:] = col.astype(np.uint8)
                L = cv2.cvtColor(f, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32); low = cv2.GaussianBlur(L, (0, 0), 6)
                mod = np.clip(low / max(1.0, low[ring].mean()), 0.6, 1.4)
                fill = np.clip(fill.astype(np.float32) * mod[..., None], 0, 255)
                ea = cv2.GaussianBlur(em.astype(np.float32), (0, 0), 2.0)[..., None] * (1.0 - occ)[..., None]
                f = np.clip(f.astype(np.float32) * (1 - ea) + fill * ea, 0, 255).astype(np.uint8)
        wg = cv2.warpPerspective(g_lit, H, (w, h), flags=cv2.INTER_LINEAR)
        wa = cv2.warpPerspective(galpha_f, H, (w, h), flags=cv2.INTER_LINEAR)
        if a.shading > 0:
            # folds and self-shadowing: modulate the graphic by the footage's own low-frequency
            # luminance under the plane, normalised to its mean (non-occluded pixels only)
            L = cv2.cvtColor(f, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
            pl0 = (plane > 0) & (occ < 0.3)
            if pl0.sum() > 50:
                low = cv2.GaussianBlur(L, (0, 0), 6); mod = np.clip(low / max(1.0, low[pl0].mean()), 0.5, 1.5)
                mod = 1.0 + a.shading * (mod - 1.0)
                wg = np.clip(wg.astype(np.float32) * mod[..., None], 0, 255).astype(np.uint8)
        pl = plane > 0
        if clip_band and pl.sum() > 50:
            # BAND-INTEGRATED plane: the footage's own band (its weave, folds and shading) stays; only
            # the generator's lettering inside the plane is inpainted from the band around it, and
            # only the graphic's MARK (pixels that differ from the graphic's background) is painted
            # on. The plane never paints outside the band it sits on: the band region is the
            # band-coloured component around the plane, so an edge that overshoots onto the body
            # colour leaves the body untouched.
            lab_f = cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_BGR2LAB), (0, 0), 1.0).astype(np.float32)
            # the EXPECTED band colour is the illuminated graphic's own background (what the plane
            # would paint), not the frame's median: a generator band that is white or lettered
            # under the plane must not be mistaken for the band
            g_bg_lit = cv2.cvtColor(np.uint8([[np.median(g_lit[galpha > 127].reshape(-1, 3), axis=0)]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
            # band membership is CHROMA-led (a/b within --band-dab of the expected colour, L within a
            # loose --band-dl): the band's own shading and folds change L, not chroma, and the
            # reference is then re-centred on the pixels that qualified so the frame's own band
            # colour, not the graphic's, is the standard
            def chroma_near(ref_, dab, dl):
                return (np.abs(lab_f[..., 1] - ref_[1]) < dab) & (np.abs(lab_f[..., 2] - ref_[2]) < dab) & (np.abs(lab_f[..., 0] - ref_[0]) < dl)
            pre = chroma_near(g_bg_lit, a.band_dab, a.band_dl) & pl & (occ < 0.3)
            ref = np.median(lab_f[pre].reshape(-1, 3), axis=0) if pre.sum() > 50 else g_bg_lit
            band_like_full = chroma_near(ref, a.band_dab, a.band_dl)
            near = cv2.dilate(plane, np.ones((21, 21), np.uint8)) > 0
            band_like = band_like_full & near
            band_frac = float(band_like[pl & (occ < 0.3)].mean()) if (pl & (occ < 0.3)).any() else 0.0
            rec["band_frac"] = band_frac
        if clip_band and pl.sum() > 50:
            # three kinds of pixel under the plane: BAND-like (the footage's band stays, the mark goes
            # on top), BODY-like (the garment colour around the band: the plane overshot the band's
            # edge, leave it alone) and everything else (the generator's lettering, a white or
            # off-colour band segment: paint the opaque plane there). Occluders are already excluded
            # through (1 - occ).
            ring = (cv2.dilate(plane, np.ones((41, 41), np.uint8)) > 0) & ~(cv2.dilate(plane, np.ones((9, 9), np.uint8)) > 0) & ~band_like_full
            body_ref = np.median(lab_f[ring].reshape(-1, 3), axis=0) if ring.sum() > 50 else None
            # the body is also chroma-led, with no L bound at all: the same mastic in shadow is the body
            body_like = ((np.abs(lab_f[..., 1] - body_ref[1]) < a.band_dab) & (np.abs(lab_f[..., 2] - body_ref[2]) < a.band_dab) & ~band_like) if body_ref is not None else np.zeros_like(band_like)
            mark_alpha = cv2.warpPerspective(gmark_f, H, (w, h), flags=cv2.INTER_LINEAR)
            paint = ((cv2.dilate((pl & ~band_like & ~body_like).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0) & pl).astype(np.float32)   # lettering edges are half band-coloured
            paint = cv2.GaussianBlur(paint, (0, 0), 1.0)                                   # soft edge between kept band and painted plane
            alpha = np.clip(np.maximum(mark_alpha * (~body_like).astype(np.float32), paint) * wa * (1.0 - occ), 0, 1)   # the mark never lands on the body beyond the band's end
            rec["band_region_frac"] = float(band_like[pl].mean()); rec["painted_frac"] = float((paint[pl] > 0.5).mean())
            alpha = alpha[..., None]
        else:
            alpha = np.clip(wa * (1.0 - occ), 0, 1)[..., None]
        comp = (f.astype(np.float32) * (1 - alpha) + wg.astype(np.float32) * alpha).astype(np.uint8)
        rec.update({"applied": True, "occlusion": float(occ[pl].mean()) if pl.any() else None, "gain": round(gain, 3), "chroma": [round(da, 2), round(db, 2)]})
        out_frames.append(comp); per.append(rec)

    # write video (keep the source audio if any)
    tmp = os.path.join(a.out_dir, f"_{name}_gfx_video.mp4")
    vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for fr in out_frames: vw.write(fr)
    vw.release()
    final = os.path.join(a.out_dir, f"{name}_graphic.mp4")
    has_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", a.video], capture_output=True, text=True).stdout.strip() != ""
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", tmp] + (["-i", a.video, "-map", "0:v", "-map", "1:a", "-c:a", "copy"] if has_audio else []) + ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", final]
    subprocess.run(cmd, check=True); os.remove(tmp)

    qa = temporal_qa(track, fps)
    qa["frames_not_applied"] = [p["frame"] for p in per if not p["applied"]]
    qa["occlusion_mean"] = float(np.mean([p["occlusion"] for p in per if p["occlusion"] is not None])) if any(p["occlusion"] is not None for p in per) else None
    json.dump({"video": a.video, "graphic": a.graphic, "anchors": [{"frame": f, "quad": q.tolist()} for f, q in anchors], "ownerPerFrame": owner, "anchorAuto": (a.anchor_quad is None and a.anchors is None), "anchorScore": anchor_score, "minConfidence": a.min_confidence,
               "qa": qa, "frames": per, "track": to_jsonable(track)}, open(os.path.join(a.out_dir, f"{name}_track.json"), "w"), indent=1)

    # QA sheet: 8 samples, original | composite | occlusion overlay, cropped around the plane
    idxs = np.linspace(0, len(frames) - 1, 8).round().astype(int); tiles = []
    for k in idxs:
        t = track[k]; q = None if t is None else t["quad"]
        cx, cy = (w // 2, h // 2) if q is None else (int(q[:, 0].mean()), int(q[:, 1].mean()))
        x0, y0 = max(0, cx - 160), max(0, cy - 120); x1, y1 = min(w, x0 + 320), min(h, y0 + 240)
        o = frames[k][y0:y1, x0:x1].copy(); c = out_frames[k][y0:y1, x0:x1].copy()
        if q is not None: cv2.polylines(o, [np.round(q - [x0, y0]).astype(np.int32)], True, (0, 255, 0), 1)
        cv2.putText(c, f"f{k} c={per[k]['confidence']:.2f}" + ("" if per[k]["applied"] else " DROPPED"), (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        tile = np.hstack([o, c]); tiles.append(cv2.copyMakeBorder(tile, 0, 240 - tile.shape[0], 0, 640 - tile.shape[1], cv2.BORDER_CONSTANT))   # a plane at the frame edge gives a short crop
    sheet = np.vstack([np.hstack(tiles[:4]), np.hstack(tiles[4:])])
    cv2.imwrite(os.path.join(a.out_dir, f"{name}_qa_sheet.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(json.dumps(qa, indent=1)); print(f"wrote {final}")

if __name__ == "__main__":
    main()
