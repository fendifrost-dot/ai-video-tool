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

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True); ap.add_argument("--graphic", required=True); ap.add_argument("--out-dir", required=True)
    ap.add_argument("--anchor-frame", type=int, default=None); ap.add_argument("--anchor-quad", default=None, help="x1,y1,x2,y2,x3,y3,x4,y4 (TL,TR,BR,BL); omit to locate the graphic on the anchor frame automatically")
    ap.add_argument("--anchors", default=None, help="several anchors 'frame:x1,y1,...,x4,y4;frame:...' — each frame uses whichever anchor's track is most confident there (re-anchoring across occlusions/turns)")
    ap.add_argument("--matte", default=None); ap.add_argument("--opaque", action="store_true")
    ap.add_argument("--min-confidence", type=float, default=0.35); ap.add_argument("--edge-feather", type=float, default=1.2)
    ap.add_argument("--resid-thresh", type=float, default=34.0); ap.add_argument("--name", default=None)
    ap.add_argument("--skin-occluder", action="store_true", help="also treat YCrCb skin as occluder (only for garments far from skin tones)")
    ap.add_argument("--motion-model", choices=("similarity", "affine", "homography"), default="affine")
    ap.add_argument("--track-expand", type=float, default=1.0, help="track the texture of a quad this many times larger (about the same centre) than the graphic's quad — for a graphic on a plain panel surrounded by trackable garment structure")
    ap.add_argument("--proximity-weight", type=float, default=0.01, help="multi-anchor ownership: confidence penalty per frame of distance from the anchor, so the nearest anchor wins ties")
    ap.add_argument("--max-shape-drift", type=float, default=1.3, help="a tracked quad whose edge lengths (scale-normalised) drift more than this factor from the anchor's is degenerate and gets confidence 0")
    ap.add_argument("--erase-above", type=float, default=0.0, help="fraction of the plane height ABOVE the plane to repaint with the surrounding garment colour before compositing — removes stray marks a generator drew next to the true graphic (0 = off)")
    ap.add_argument("--erase-below", type=float, default=0.0, help="same, below the plane")
    ap.add_argument("--erase-extend", default="0,0", help="widen the erase bands sideways: 'left,right' fractions of the plane width (stray marks often sit beside the graphic's column)")
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
    owner = []
    for k in range(len(frames)):
        def score(i):
            t = tracks[i][k]
            return -1.0 if t is None else t["confidence"] - a.proximity_weight * abs(k - anchors[i][0])
        owner.append(max(range(len(anchors)), key=score))
    track = [tracks[owner[k]][k] for k in range(len(frames))]
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
        # one-time colour match: the graphic's mean Lab → the anchor plane's mean Lab, so the
        # canonical asset (product photo lighting) sits in the footage's lighting from frame one
        pm = quad_mask(anchor.shape, quad) > 0
        la = cv2.cvtColor(anchor, cv2.COLOR_BGR2LAB).astype(np.float32); lg = cv2.cvtColor(gbgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        for ch in range(3):
            lg[..., ch] = np.clip(lg[..., ch] + (la[..., ch][pm].mean() - lg[..., ch].mean()), 0, 255)
        gbgr = cv2.cvtColor(lg.astype(np.uint8), cv2.COLOR_LAB2BGR)
    if a.soften > 0: gbgr = cv2.GaussianBlur(gbgr, (0, 0), a.soften)
    # plane extension comes AFTER the colour match so the match sees only the true graphic plane
    a.erase_extend = [float(x) for x in a.erase_extend.split(",")][:2] + [0.0, 0.0]
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
    if a.edge_feather > 0:
        er = cv2.erode(galpha, np.ones((3, 3), np.uint8)); galpha_f = cv2.GaussianBlur(er.astype(np.float32) / 255.0, (0, 0), a.edge_feather)

    out_frames, per = [], []
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
        occ, plane = occlusion_mask(f, anchor, t["H"], quad, extra_mask=extra, resid_thresh=a.resid_thresh, use_skin=a.skin_occluder)
        gain, da, db = illumination(f, anchor, t["H"], quad, occ)
        g_lit = apply_illumination(gbgr, gain, da, db)
        # stray-mark eraser (before the graphic goes on): bands above/below the tracked plane,
        # optionally widened sideways. Mode "marks" (default) only repaints pixels whose colour
        # is far from the surrounding garment (the generator's stray glyphs), inpainting them from
        # their neighbourhood; a LARGE off-colour blob is an occluder (hand, tie, hair) and is left
        # alone. Mode "flat" repaints the whole band with the ring median shaded by the footage.
        if a.erase_above > 0 or a.erase_below > 0:
            pq = warp_quad(t["H"], quad); v = (pq[3] - pq[0] + pq[2] - pq[1]) / 2   # plane vertical axis (px)
            uax = (pq[1] - pq[0] + pq[2] - pq[3]) / 2; ul, ur = uax * a.erase_extend[0], uax * a.erase_extend[1]
            for frac, sign in ((a.erase_above, -1), (a.erase_below, +1)):
                if frac <= 0: continue
                top = (pq[0] - v * frac if sign < 0 else pq[3]) - ul
                topr = (pq[1] - v * frac if sign < 0 else pq[2]) + ur
                bot = (pq[0] if sign < 0 else pq[3] + v * frac) - ul
                botr = (pq[1] if sign < 0 else pq[2] + v * frac) + ur
                eq = quad_array([top, topr, botr, bot])
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
        alpha = np.clip(wa * (1.0 - occ), 0, 1)[..., None]
        comp = (f.astype(np.float32) * (1 - alpha) + wg.astype(np.float32) * alpha).astype(np.uint8)
        pl = plane > 0
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
        tiles.append(np.hstack([o, c]))
    sheet = np.vstack([np.hstack(tiles[:4]), np.hstack(tiles[4:])])
    cv2.imwrite(os.path.join(a.out_dir, f"{name}_qa_sheet.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(json.dumps(qa, indent=1)); print(f"wrote {final}")

if __name__ == "__main__":
    main()
