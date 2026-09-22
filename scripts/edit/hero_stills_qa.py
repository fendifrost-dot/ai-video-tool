#!/usr/bin/env python3
"""
QA for minted hero stills before they are propagated (canonical-Look lane, step E2).

  python3 scripts/edit/hero_stills_qa.py --master cuts/S06_master.mp4 --anchor anchor.jpg \\
      --stills "6:stills/S06_f0006.png,18:stills/S06_f0018.png,…" --out-dir heroes/S06/qa

Per still (aligned to master frame k, resized to the master raster):
  garment_frac      what the still changed vs the master (Lab diff mask) as a fraction of frame
  outside_change    mean Lab distance OUTSIDE the garment mask, dilated (face/background drift —
                    the identity lock: should be near the JPEG floor)
  face_change       the same restricted to the top 30 % of the garment's bounding box and above
                    (head region), so a regenerated face is caught even if it is inside the mask
  anchor_similarity per-still garment colour histogram vs the anchor's garment (Bhattacharyya
                    coefficient on Lab a/b) — one realisation should score high and FLAT
                    across stills; a drifting generator shows a spread
Outputs qa.json and a contact sheet: master | still | changed-mask overlay, one row per still.
Fails closed: a still whose outside_change or face_change exceeds --max-drift is marked
REJECT and should not be used as a hero.
"""
import argparse, json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from propagate_keyframe import decode, garment_mask_from_edit

def lab(im): return cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)

def ab_hist(im, mask):
    l = cv2.cvtColor(im, cv2.COLOR_BGR2LAB)
    h = cv2.calcHist([l], [1, 2], (mask > 0).astype(np.uint8), [32, 32], [0, 256, 0, 256])
    return cv2.normalize(h, None).flatten()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True); ap.add_argument("--stills", required=True); ap.add_argument("--anchor", default=None)
    ap.add_argument("--anchor-master", default=None, help="the master frame the anchor was made from (to mask its garment); if absent the anchor's centre region is used")
    ap.add_argument("--out-dir", required=True); ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--max-drift", type=float, default=9.0)
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x")); os.makedirs(a.out_dir, exist_ok=True)
    master = decode(a.master, W, H, a.fps)
    items = []
    for it in a.stills.split(","):
        fr, path = it.split(":", 1); items.append((int(fr), path))
    anchor_hist = None
    if a.anchor:
        an = cv2.resize(cv2.imread(a.anchor), (W, H), interpolation=cv2.INTER_AREA)
        if a.anchor_master:
            am = cv2.resize(cv2.imread(a.anchor_master), (W, H)); amask = garment_mask_from_edit(am, an)
        else:
            amask = np.zeros((H, W), np.uint8); amask[int(H * 0.3):int(H * 0.75), int(W * 0.2):int(W * 0.8)] = 255
        anchor_hist = ab_hist(an, amask)
    rows, tiles = [], []
    for fr, path in items:
        st = cv2.imread(path)
        if st is None: rows.append({"frame": fr, "path": path, "error": "unreadable"}); continue
        st = cv2.resize(st, (W, H), interpolation=cv2.INTER_AREA); m = master[fr]
        gm = garment_mask_from_edit(m, st)
        d = np.sqrt(((lab(m) - lab(st)) ** 2).sum(axis=2))
        outside = cv2.dilate(gm, np.ones((25, 25), np.uint8)) == 0
        ys, xs = np.where(gm > 0)
        if len(ys):
            top = ys.min(); head = np.zeros_like(gm, bool); head[:max(0, top + int(0.3 * (ys.max() - top))), :] = True
            head &= ~(gm > 0)
        else:
            head = np.zeros_like(gm, bool)
        rec = {"frame": fr, "path": path, "garment_frac": float((gm > 0).mean()),
               "outside_change": float(d[outside].mean()) if outside.any() else None,
               "face_change": float(d[head].mean()) if head.any() else None}
        if anchor_hist is not None and (gm > 0).sum() > 500:
            rec["anchor_similarity"] = float(cv2.compareHist(anchor_hist, ab_hist(st, gm), cv2.HISTCMP_BHATTACHARYYA))
            rec["anchor_similarity"] = 1.0 - rec["anchor_similarity"]  # 1 = identical distributions
        rec["verdict"] = "REJECT" if ((rec["outside_change"] or 0) > a.max_drift or (rec["face_change"] or 0) > a.max_drift) else "OK"
        rows.append(rec)
        ov = st.copy(); ov[gm > 0] = (0.55 * ov[gm > 0] + 0.45 * np.array([0, 200, 0])).astype(np.uint8)
        t = np.hstack([m, st, ov]); t = cv2.resize(t, None, fx=0.3, fy=0.3)
        cv2.putText(t, f"f{fr} {rec['verdict']} out={rec['outside_change'] or 0:.1f} face={rec['face_change'] or 0:.1f} sim={rec.get('anchor_similarity', 0):.2f}", (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        tiles.append(t)
    sims = [r["anchor_similarity"] for r in rows if r.get("anchor_similarity") is not None]
    summary = {"stills": len(rows), "ok": sum(r.get("verdict") == "OK" for r in rows), "reject": [r["frame"] for r in rows if r.get("verdict") == "REJECT"],
               "anchor_similarity_mean": float(np.mean(sims)) if sims else None, "anchor_similarity_spread": float(np.max(sims) - np.min(sims)) if sims else None,
               "outside_change_mean": float(np.mean([r["outside_change"] for r in rows if r.get("outside_change") is not None])) if rows else None}
    json.dump({"summary": summary, "stills": rows}, open(os.path.join(a.out_dir, "qa.json"), "w"), indent=1)
    if tiles:
        rows_img = [np.hstack(tiles[i:i + 2]) if i + 1 < len(tiles) else np.hstack([tiles[i], np.zeros_like(tiles[i])]) for i in range(0, len(tiles), 2)]
        cv2.imwrite(os.path.join(a.out_dir, "stills_sheet.jpg"), np.vstack(rows_img), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(json.dumps(summary, indent=1))

if __name__ == "__main__":
    main()
