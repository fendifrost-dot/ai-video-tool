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
from garment_track import (illumination, occlusion_mask, quad_array, quad_mask, read_frames, temporal_qa, to_jsonable, track_plane, warp_quad)

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

def graphic_to_plane_h(gw, gh, quad):
    src = np.array([[0, 0], [gw - 1, 0], [gw - 1, gh - 1], [0, gh - 1]], np.float32)
    return cv2.getPerspectiveTransform(src, quad_array(quad))

def apply_illumination(bgr, gain, da, db):
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab[..., 0] = np.clip(lab[..., 0] * gain, 0, 255); lab[..., 1] = np.clip(lab[..., 1] + da, 0, 255); lab[..., 2] = np.clip(lab[..., 2] + db, 0, 255)
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True); ap.add_argument("--graphic", required=True); ap.add_argument("--out-dir", required=True)
    ap.add_argument("--anchor-frame", type=int, required=True); ap.add_argument("--anchor-quad", required=True, help="x1,y1,x2,y2,x3,y3,x4,y4 (TL,TR,BR,BL)")
    ap.add_argument("--matte", default=None); ap.add_argument("--opaque", action="store_true")
    ap.add_argument("--min-confidence", type=float, default=0.35); ap.add_argument("--edge-feather", type=float, default=1.2)
    ap.add_argument("--resid-thresh", type=float, default=34.0); ap.add_argument("--name", default=None)
    ap.add_argument("--skin-occluder", action="store_true", help="also treat YCrCb skin as occluder (only for garments far from skin tones)")
    ap.add_argument("--motion-model", choices=("similarity", "affine", "homography"), default="affine")
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
    quad = quad_array([float(x) for x in a.anchor_quad.split(",")])
    if not (0 <= a.anchor_frame < len(frames)): raise SystemExit("anchor frame out of range")
    gbgr, galpha = load_graphic(a.graphic, a.opaque); gh, gw = galpha.shape
    matte = read_frames(a.matte)[0] if a.matte else None

    print(f"tracking plane from frame {a.anchor_frame} over {len(frames)} frames …", flush=True)
    track = track_plane(frames, a.anchor_frame, quad, model=a.motion_model, smooth_sigma=a.smooth)
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
        H = t["H"] @ Hg                                         # graphic → this frame
        extra = None
        if matte is not None and k < len(matte):
            extra = (cv2.cvtColor(matte[k], cv2.COLOR_BGR2GRAY) < 128).astype(np.uint8) * 255
        occ, plane = occlusion_mask(f, anchor, t["H"], quad, extra_mask=extra, resid_thresh=a.resid_thresh, use_skin=a.skin_occluder)
        gain, da, db = illumination(f, anchor, t["H"], quad, occ)
        g_lit = apply_illumination(gbgr, gain, da, db)
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
    json.dump({"video": a.video, "graphic": a.graphic, "anchorFrame": a.anchor_frame, "anchorQuad": quad.tolist(), "minConfidence": a.min_confidence,
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
