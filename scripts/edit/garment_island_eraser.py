#!/usr/bin/env python3
"""
GARMENT ISLAND ERASER — deterministic removal of foreign islands inside a wardrobe edit's garment:
source leaks (a patch, badge or print of the ORIGINAL garment that the generator left in place)
and generator hallucinations (a badge, a stray mark) that are not any of the Look's own colours.

  python3 scripts/edit/garment_island_eraser.py --master cuts/S09_master.mp4 --edit s09_roll.mp4 \\
      --anchor heroes/anchor.jpg --anchor-master heroes/anchor_master.jpg --out s09_roll_clean.mp4 [--qa-dir qa/]

An island is erased when ALL of these hold (nothing shot-specific; the anchor defines the Look,
the stripe landmark defines the band, the performer's own skin defines anatomy):
  1. it is made of ISLAND MATERIAL: pixels inside the garment region (what the edit changed vs
     the master, plus its small enclosed holes — a leaked badge is unchanged — and --edge-pad px
     beyond the silhouette) whose chroma is NOT the body fabric's; never the Look's own structure:
     a connected region of one non-body Look class larger than --structure-frac (the band, the
     tie), the stripe class within --stripe-pad rows of the stripe landmark, the neck zone laid out
     from that landmark, the face box (--face-scale) or the hand discs;
  2. it grew from SEEDS: a SOURCE LEAK (edit ≈ master, Lab < --leak-thresh) or an OTHER colour (no
     Look class within its Lab radius, or a class whose chroma is farther than --chroma-tol); the
     seed grows --grow-px through connected non-body pixels so a badge whose navy/white parts are
     Look colours is taken whole, and at least 25 % of the island must be seed;
  3. it is ENCLOSED by painted body: of the ring --enclose-margin px around it, at least
     --ring-in-min lies on strongly changed pixels (a re-rendered wall does not count) and of those
     at least --enclose-min carry the body's chroma (--ring-dab); so the wordmark on the stripe,
     the collar's inside, the shirt hem and the trousers are never touched;
  4. it is NOT skin: the performer's skin is --skin-clusters Lab clusters sampled from the master's
     own face and hands; an island with ≥ --skin-share of its pixels within --skin-de (L weighted
     --skin-lw) of any cluster is anatomy; the part under a hand disc is cut out, an island mostly
     under a disc IS the hand, and one hanging from the face box is the collar or the tie;
  5. its area is between --min-frac and --max-frac of the frame.
The mask is unioned over ±1 frame (so a flickering detection does not flicker the repair) and the
island is inpainted from the GARMENT side (Telea; background around the mask pre-set to the
garment ring's colour), then feathered. QA json lists per frame the islands erased (area, centre,
reason, the measurements every rule saw) and, with --debug, every rejected candidate and the rule
that rejected it; a sheet shows before/after crops.
"""
import argparse, json, os, sys
import cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "qa"))
from propagate_keyframe import decode  # noqa: E402
from construction_score import build_anchor_model, garment_mask, classify, landmark, zones_for  # noqa: E402
from hero_gate import PoseModel, hand_patches, face_box, torso_scale  # noqa: E402

def write(path, frames, fps):
    import subprocess
    H, W = frames[0].shape[:2]
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", path], stdin=subprocess.PIPE)
    for f in frames: p.stdin.write(f.tobytes())
    p.stdin.close(); p.wait()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True); ap.add_argument("--edit", required=True)
    ap.add_argument("--anchor", required=True); ap.add_argument("--anchor-master", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--qa-dir", default=None)
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--leak-thresh", type=float, default=14.0); ap.add_argument("--skin-de", type=float, default=20.0, help="Lab distance (L down-weighted) to the nearest skin cluster below which a pixel is skin"); ap.add_argument("--skin-share", type=float, default=0.3, help="an island with at least this share of skin pixels (edit or master) is anatomy"); ap.add_argument("--skin-clusters", type=int, default=4); ap.add_argument("--skin-lw", type=float, default=0.5, help="weight of the L difference in skin distances (skin varies most in L)"); ap.add_argument("--debug", action="store_true", help="also list the rejected candidates and why in the QA json"); ap.add_argument("--skin-spread", type=float, default=60.0, help="sampled face/hand pixels farther than this (L half-weighted) from their median are not skin (glasses, cap, collar)"); ap.add_argument("--ring-change", type=float, default=30.0, help="Lab change vs the master a ring pixel needs to count as painted garment"); ap.add_argument("--ring-dab", type=float, default=9.0, help="chroma distance to the body colour a ring pixel may have and still count as body")
    ap.add_argument("--chroma-tol", type=float, default=10.0, help="a pixel farther than this in ab from its Look class's chroma is not that colour"); ap.add_argument("--structure-frac", type=float, default=0.005, help="a connected region of one non-body Look class larger than this fraction of the frame is the Look's own structure (band, tie), never island material"); ap.add_argument("--face-scale", type=float, default=1.6, help="face box scale (about the face landmarks) that is never island material"); ap.add_argument("--face-share", type=float, default=0.3, help="an island with more than this share inside the face box hangs from the face (collar, tie) and is never touched; a smaller overlap is cut out of the island"); ap.add_argument("--edge-pad", type=int, default=4, help="pixels beyond the changed region that still count as garment for island material (silhouette-edge marks)"); ap.add_argument("--zone-stripe-max", type=float, default=-1.0, help="a zone whose anchor histogram has at most this share of the stripe class is stripe-free in the Look: stripe-class pixels there are island seeds; -1 = off (default: on S06 collar-3 the sleeve stripes were only partly taken — the band rows and the zone boxes cut them into pieces — so this stays opt-in until a stripe is handled as one structure)"); ap.add_argument("--line-max-thick", type=float, default=7.0, help="an island whose maximal inscribed radius is at most this (px) and whose extent is 16× it is a line (a stripe, a seam), which the skin test never claims"); ap.add_argument("--stripe-pad", type=int, default=6, help="rows above and below the stripe landmark in which the stripe class is structure"); ap.add_argument("--hole-max", type=float, default=0.03, help="an unchanged hole in the changed region larger than this fraction of the frame is background, not a leak"); ap.add_argument("--min-frac", type=float, default=0.0002); ap.add_argument("--max-frac", type=float, default=0.006, help="an island is small by nature; a region larger than this fraction of the frame is a garment part, not a mark")
    ap.add_argument("--enclose-margin", type=int, default=6); ap.add_argument("--grow-px", type=int, default=12, help="how far a seed grows through connected non-body pixels (a badge's Look-coloured parts)"); ap.add_argument("--body-dab", type=float, default=6.0, help="chroma radius around the body class that counts as the same fabric (its shadows/highlights)"); ap.add_argument("--enclose-min", type=float, default=0.6, help="fraction of the in-garment ring around an island that must be garment body"); ap.add_argument("--ring-in-min", type=float, default=0.15, help="fraction of the ring that must lie inside the garment at all (an island at the silhouette edge)"); ap.add_argument("--feather", type=float, default=2.0)
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x"))
    master = decode(a.master, W, H, a.fps); edit = decode(a.edit, W, H, a.fps); n = min(len(master), len(edit)); master, edit = master[:n], edit[:n]
    anchor = cv2.resize(cv2.imread(a.anchor), (W, H), interpolation=cv2.INTER_AREA); amaster = cv2.resize(cv2.imread(a.anchor_master), (W, H), interpolation=cv2.INTER_AREA)
    model = build_anchor_model(anchor, amaster); k = len(model["centres"])
    # "body-like" classes: every anchor class with the body's CHROMA (its shadows and highlights are
    # the same fabric); the stripe, a white shirt collar or the trousers have another chroma
    bc = model["centres"][model["body_class"]]
    body_like = np.array([np.linalg.norm(np.array(c[1:]) - np.array(bc[1:])) <= a.body_dab for c in model["centres"]] + [False])
    print(f"body-like classes: {[i for i, b in enumerate(body_like) if b]} of {k}", flush=True)
    pose = PoseModel()
    # the performer's skin chroma, from the master's own face box and hand discs across the clip
    # (median of per-frame medians): the ONE anatomy colour model every island is tested against
    # skin is not one colour: lit knuckles are warmer and brighter than a shaded palm, so the model
    # is a few Lab clusters of the sampled pixels and an island is skin when enough of its pixels
    # sit near ANY cluster
    skin_px = []
    for i in range(0, n, max(1, n // 12)):
        lm = pose.detect(master[i])
        if lm is None: continue
        Lm = cv2.cvtColor(master[i], cv2.COLOR_BGR2LAB).astype(np.float32)
        x0, y0, x1, y1 = face_box(lm, W, H, 1.0); fb = Lm[y0:y1, x0:x1].reshape(-1, 3)
        if len(fb) > 100: skin_px.append(fb[:: max(1, len(fb) // 400)])
        for _, disc in hand_patches(lm, W, H, 0.06):
            if disc.sum() > 50: skin_px.append(Lm[disc][:: max(1, int(disc.sum()) // 200)])
    skin_lab = None
    if skin_px:
        px = np.concatenate(skin_px).astype(np.float32)
        # the boxes also hold glasses, a cap brim, a collar: keep the majority around the median only
        med = np.median(px, axis=0); dm = np.sqrt(a.skin_lw * (px[:, 0] - med[0]) ** 2 + ((px[:, 1:] - med[1:]) ** 2).sum(axis=1))
        px = px[dm <= a.skin_spread]
        _, _, skin_lab = cv2.kmeans(px, a.skin_clusters, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    print(f"performer skin clusters (Lab, OpenCV scale): {None if skin_lab is None else [[round(float(x), 1) for x in c] for c in skin_lab]} from {0 if skin_lab is None else len(px)} px", flush=True)
    body_ab = np.array(model["centres"][model["body_class"]][1:], np.float32)
    masks, fills, records, rejected = [], [], [], []
    # pose landmarks per frame, a missing detection taking the nearest frame's (anatomy ownership
    # must not lapse for one frame)
    lms = [pose.detect(master[i]) for i in range(n)]
    have = [i for i in range(n) if lms[i] is not None]
    lms = [lms[min(have, key=lambda j: abs(j - i))] if have else None for i in range(n)]
    last_lmk = None
    for i in range(n):
        m, e = master[i], edit[i]
        gm = garment_mask(m, e); gm = cv2.morphologyEx(gm, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
        # the garment region = what the edit changed, plus the HOLES in it (a leaked badge is unchanged,
        # so it is a hole) — but only holes that are enclosed and small; the wall between an arm and
        # the torso, or beyond the hem, reaches the frame border or is large and stays background
        nh, hl, hs, _ = cv2.connectedComponentsWithStats((gm == 0).astype(np.uint8), connectivity=4)
        filled = gm.copy()
        for hj in range(1, nh):
            x, y, w, h, ar = hs[hj]
            if ar <= a.hole_max * H * W and x > 0 and y > 0 and x + w < W and y + h < H: filled[hl == hj] = 255
        Lm, Le = (cv2.cvtColor(x, cv2.COLOR_BGR2LAB).astype(np.float32) for x in (m, e))
        cls = classify(e, model["centres"], model["class_radius"])
        # a Look colour is a Look colour in CHROMA too: the nearest class by full Lab distance can be
        # the white shirt for a pale-blue patch (their L agree, their chroma does not) — a pixel whose
        # chroma is farther than --chroma-tol from its class's chroma is "other"
        cab = np.array([c[1:] for c in model["centres"]] + [[0.0, 0.0]], np.float32)
        dab = np.sqrt(((Le[..., 1:] - cab[cls]) ** 2).sum(axis=2))
        cls = np.where((cls < k) & (dab > a.chroma_tol), k, cls)
        dchange = np.sqrt(((Lm - Le) ** 2).sum(axis=2)); leak = dchange < a.leak_thresh
        foreign = (cls == k)
        # an island can only be made of pixels that are NOT the garment body's own fabric: a source
        # leak that happens to be the body colour (a tan blotch of the original print) is invisible,
        # and the body itself is never an island
        # a mark at the silhouette edge is half outside the changed region (the edit's silhouette is
        # a few pixels off the master's), so the region is widened a little for island material
        wide = cv2.dilate(filled, np.ones((2 * a.edge_pad + 1,) * 2, np.uint8))
        nonbody = (~body_like[cls]) & (wide > 0)
        # the Look's own STRUCTURE is never island material: a large connected region of one Look
        # class (the chest band, the tie, the shirt tail) — an island is small by definition, and a
        # seed on the band's end would otherwise grow into the band
        for cid in range(k):
            if body_like[cid]: continue
            ncc, ccl, ccs, _ = cv2.connectedComponentsWithStats(((cls == cid) & (filled > 0)).astype(np.uint8), connectivity=8)
            big = np.zeros(ncc, bool); big[1:] = ccs[1:, cv2.CC_STAT_AREA] > a.structure_frac * H * W
            nonbody &= ~big[ccl]
        # ...and the stripe where the Look's stripe landmark finds it in this frame: its class in those
        # rows is the band even where an arm cuts it into small pieces (or where the master happened
        # to be the same navy underneath, which would otherwise read as a source leak)
        lmk = landmark(cls, filled, model["stripe_ids"], model["max_stripe_frac"], model["min_stripe_peak"], model["band"]) or last_lmk
        last_lmk = lmk
        if lmk is not None:
            rows = np.zeros((H, W), bool); rows[max(0, lmk["top"] - a.stripe_pad):min(H, lmk["bottom"] + a.stripe_pad + 1)] = True
            nonbody &= ~(rows & np.isin(cls, model["stripe_ids"]))
        seed = (nonbody & (leak | foreign)).astype(np.uint8)
        # a Look colour where the Look has none of it: in every zone whose ANCHOR histogram holds
        # (almost) no stripe class — plain sleeves on this jacket — a run of stripe-class pixels is
        # a generator's stripe, not the garment's (the chest band and the tie live in other zones)
        if lmk is not None and a.zone_stripe_max >= 0:
            zs = zones_for(filled, lmk)
            for zn, hist in model["hists"].items():
                if zn in ("chest", "neck") or hist is None or any(hist[c] > a.zone_stripe_max for c in model["stripe_ids"]): continue
                seed |= ((zs[zn] > 0) & np.isin(cls, model["stripe_ids"]) & nonbody).astype(np.uint8)
        seed = cv2.morphologyEx(seed, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        # a leaked patch is partly made of Look colours (a navy or white part of a badge classifies
        # as the stripe or the collar): grow each seed through connected NON-body pixels, a bounded
        # distance, so the whole patch is taken and not just the pixels that betrayed it
        grown = seed.copy()
        for _ in range(a.grow_px): grown = cv2.dilate(grown, np.ones((3, 3), np.uint8)) & nonbody.astype(np.uint8)
        cand = grown
        # anatomy: hands and face discs from the master's own landmarks, and the performer's skin chroma
        lm = lms[i]; protect = np.zeros((H, W), bool); facep = np.zeros((H, W), bool)
        if lm is not None:
            for _, disc in hand_patches(lm, W, H, 0.16): protect |= disc
            x0, y0, x1, y1 = face_box(lm, W, H, a.face_scale); facep[y0:y1, x0:x1] = True
        # the Look's NECK zone (collar, its inside, the shirt collar, the tie knot — laid out from the
        # stripe landmark as construction_score does) is never island material either
        if lmk is not None: facep |= zones_for(filled, lmk)["neck"] > 0
        nlab, lab, stats, cents = cv2.connectedComponentsWithStats(cand, connectivity=8)
        out = np.zeros((H, W), np.uint8); recs = []
        for j in range(1, nlab):
            area = stats[j, cv2.CC_STAT_AREA] / (H * W)
            sel = lab == j; sd = sel & (seed > 0)
            rec = {"frame": i, "area_frac": float(area), "centre": [float(cents[j][0]), float(cents[j][1])], "seed_share": float(sd.sum() / max(1, sel.sum()))}
            def reject(why):
                if a.debug: rejected.append({**rec, "rejected": why})
            if area < a.min_frac: continue
            if area > a.max_frac: reject("too large for an island"); continue
            if sd.sum() < 0.25 * sel.sum(): reject("mostly grown, hardly betrayed"); continue   # not an island
            ring = cv2.dilate(sel.astype(np.uint8), np.ones((2 * a.enclose_margin + 1,) * 2, np.uint8)).astype(bool) & ~sel
            # ring pixels the edit actually PAINTED: strongly changed vs the master (a re-rendered wall
            # moves a little, a garment painted over the original moves a lot)
            ring_in = ring & (gm > 0) & (dchange >= a.ring_change)
            # enclosed by the garment BODY specifically: an island sitting on the stripe is the wordmark,
            # one bordered by the shirt hem, the tie or the trousers is a construction edge, neither is
            # foreign. A patch at the silhouette edge is judged on the part of its ring that is garment,
            # provided at least --ring-in-min of the ring is garment at all
            rec["ring_in_share"] = float(ring_in.sum() / max(1, ring.sum()))
            if rec["ring_in_share"] < a.ring_in_min: reject("ring not painted garment"); continue
            # ...and painted in the BODY's own chroma (its class may be the highlight class, which a
            # bright wall also lands in; the chroma tells them apart)
            rec["enclosure"] = float((body_like[cls[ring_in]] & (np.sqrt(((Le[ring_in][:, 1:] - body_ab) ** 2).sum(axis=1)) <= a.ring_dab)).mean())
            if rec["enclosure"] < a.enclose_min: reject("not enclosed by body"); continue
            # what hangs from the face box (collar, tie, the collar's inside) is never an island; the
            # part of an island under a hand disc is never touched, and if that is most of it, it IS
            # the hand and nothing is touched at all
            rec["face_share"] = float(facep[sel].mean()); rec["protect_share"] = float(protect[sel].mean())
            if rec["face_share"] > a.face_share: reject("hangs from the face box"); continue
            if rec["protect_share"] > 0.5: reject("is a hand"); continue
            sel = sel & ~protect & ~facep; sd = sd & ~protect & ~facep
            if sd.sum() < 20: reject("nothing left outside the hand disc"); continue
            def skin_share(X):
                v = X[sd]; d = np.sqrt(a.skin_lw * (v[:, None, 0] - skin_lab[None, :, 0]) ** 2 + ((v[:, None, 1:] - skin_lab[None, :, 1:]) ** 2).sum(axis=2)).min(axis=1)
                return float((d <= a.skin_de).mean())
            # judged on the EDIT only: where the master had bare skin the edit may legitimately have
            # painted a sleeve, and a badge hallucinated on that sleeve is not anatomy
            rec["skin_share_edit"] = skin_share(Le) if skin_lab is not None else None
            rec["edit_lab"] = [float(x) for x in np.median(Le[sd], axis=0)]
            # a LINE is never skin: a run whose thickest point is ≤ --line-max-thick px and whose
            # extent is ≥ 8× that (a piped seam, a stripe drawn along a sleeve) has no anatomy of that
            # shape — dark navy and dark skin share a colour, they do not share a shape
            dt = cv2.distanceTransform(sel.astype(np.uint8), cv2.DIST_L2, 3); thick = float(dt.max())
            ext = float(np.hypot(stats[j, cv2.CC_STAT_WIDTH], stats[j, cv2.CC_STAT_HEIGHT])); rec["thickness"] = thick; rec["extent"] = ext
            linear = thick <= a.line_max_thick and ext >= 8 * max(1.0, thick) * 2
            if skin_lab is not None and rec["skin_share_edit"] >= a.skin_share and not linear: reject("skin"); continue
            rec["reason"] = "source_leak" if leak[sd].mean() > 0.5 else "foreign_colour"
            if rec["reason"] == "foreign_colour":
                # a badge has a pale rim the highlight class absorbs: take the thin ring of brightest-class
                # pixels around a foreign island with it (the ring only — never the body proper)
                bright = int(np.argmax([c[0] for c in model["centres"]]))
                rim = cv2.dilate(sel.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & ~sel & (cls == bright)
                sel = sel | rim
            out[sel] = 255; recs.append(rec)
        masks.append(out); fills.append(filled); records.extend(recs)
    # temporal union ±1 and repair
    outs = []
    for i in range(n):
        mk = masks[i].copy()
        if i > 0: mk |= masks[i - 1]
        if i + 1 < n: mk |= masks[i + 1]
        if mk.any():
            mk = cv2.dilate(mk, np.ones((5, 5), np.uint8)) & cv2.dilate(fills[i], np.ones((2 * a.edge_pad + 3,) * 2, np.uint8))   # never repaint far beyond the garment
            # fill from the GARMENT side only: an island at the silhouette edge would otherwise pull the
            # background in, so the background around the mask is pre-set to the garment ring's colour
            near = cv2.dilate(mk, np.ones((13, 13), np.uint8)).astype(bool) & (mk == 0)
            gar = near & (fills[i] > 0); bg = near & ~(fills[i] > 0)
            src = edit[i].copy()
            if bg.any() and gar.sum() > 20: src[bg] = np.median(edit[i][gar], axis=0)
            rep = cv2.inpaint(src, mk, 7, cv2.INPAINT_TELEA)
            w = cv2.GaussianBlur(mk.astype(np.float32) / 255.0, (0, 0), a.feather)[..., None]
            outs.append(np.clip(edit[i] * (1 - w) + rep * w, 0, 255).astype(np.uint8))
        else: outs.append(edit[i])
    write(a.out, outs, a.fps)
    frames_touched = sorted({r["frame"] for r in records})
    qa = {"frames": n, "islands": len(records), "frames_touched": len(frames_touched), "by_reason": {r: sum(1 for x in records if x["reason"] == r) for r in ("source_leak", "foreign_colour")}, "records": records, "rejected": rejected}
    if a.qa_dir:
        os.makedirs(a.qa_dir, exist_ok=True); json.dump(qa, open(os.path.join(a.qa_dir, "island_qa.json"), "w"), indent=1)
        pick = frames_touched[:: max(1, len(frames_touched) // 6)][:6] if frames_touched else []
        tiles = []
        for i in pick:
            ys, xs = np.where(masks[i] > 0)
            cy, cx = (int(np.median(ys)), int(np.median(xs))) if len(ys) else (H // 2, W // 2)
            y0, x0 = max(0, cy - 150), max(0, cx - 150); y1, x1 = min(H, y0 + 300), min(W, x0 + 300)
            t = np.hstack([edit[i][y0:y1, x0:x1], outs[i][y0:y1, x0:x1]]); cv2.putText(t, f"f{i}", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1); tiles.append(t)
        if tiles:
            hmax = max(t.shape[0] for t in tiles); wmax = max(t.shape[1] for t in tiles)
            tiles = [cv2.copyMakeBorder(t, 0, hmax - t.shape[0], 0, wmax - t.shape[1], cv2.BORDER_CONSTANT) for t in tiles]
            cv2.imwrite(os.path.join(a.qa_dir, "island_sheet.jpg"), np.vstack(tiles), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(json.dumps({k: v for k, v in qa.items() if k not in ("records", "rejected")}))

if __name__ == "__main__":
    main()
