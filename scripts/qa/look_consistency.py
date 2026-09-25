#!/usr/bin/env python3
"""
CROSS-SHOT LOOK CONSISTENCY — the QA dimension the hero gate does not measure.

The hero gate (hero_gate.py) judges ONE frame against its source and the anchor: local validity.
A section fails product truth when every shot is a locally plausible but DIFFERENT realisation
of the same Look (Astra v8–v11: collar facing/height S06 vs S08 vs S11, band position, cuff
exposure, sleeve tone, hem band). This script measures that: per clip, the garment's
REALISATION FEATURES (from construction_score's anchor model, so the same classes and the same
stripe landmark define everything), then the distance of every clip to the anchor and the
spread ACROSS clips per feature — so the offending shots and the offending features are named.

  python3 scripts/qa/look_consistency.py --anchor heroes/anchor.jpg --anchor-master heroes/anchor_master.jpg \\
      --clip "S06=gfx/s06_e1_graphic.mp4:cuts/S06_master_*.mp4" --clip "S08=…" … [--step 4] --out qa/look_consistency/

Features per clip (median over scored frames; all relative to the garment, never to the frame):
  body_lab            median Lab of the body class inside the garment
  stripe_lab          median Lab of the stripe class
  sleeve_minus_body_L median L of body-class pixels in the sleeve zones minus in the chest/lower-front zones
                      (S08's "sleeves lighter than the body")
  stripe_height_ratio stripe half-height run / garment width at the stripe row
  stripe_pos_ratio    (stripe row − garment top) / garment height   (band sits higher/lower)
  neck_navy_share, neck_white_share, neck_body_share
  collar_navy_share   stripe-class share over the OUTER thirds of the neck zone with the tie's
                      region removed: the colour the stand collar is lined with (Astra v13 found
                      S06's collar inside tan where the Look says navy; the plain neck shares
                      missed it)
                      class shares in the neck zone: a navy exterior collar, a spread white shirt
                      collar outside the jacket, or a mastic stand collar are different numbers
  hem_hist_dist       neck/hem zone histogram distance to the anchor (construction_score's compare)
  texture_body        Laplacian energy of the body class (knit vs ribbed vs smooth)
  garment_len_ratio   (garment bottom − stripe row) / garment width   (body length below the band)
Per feature: value per clip, |Δ| to the anchor, cross-clip std; a clip is flagged on a feature when
its |Δ| to the anchor exceeds the tolerance (data, --tolerances json) — tolerances default to
what the accepted E1 shots that Astra did NOT flag on that feature stay within.
Outputs consistency.json and a sheet (one median frame per clip with zones drawn).
"""
import argparse, glob, json, os, sys
import cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "edit"))
from construction_score import build_anchor_model, score_with_model, garment_mask, classify, compare, ZONES, draw  # noqa: E402
from propagate_keyframe import decode  # noqa: E402

DEFAULT_TOL = {"body_lab_de": 6.0, "stripe_lab_de": 12.0, "sleeve_minus_body_L": 8.0, "stripe_height_ratio": 0.35, "stripe_pos_ratio": 0.08,
               "neck_navy_share": 0.20, "neck_white_share": 0.15, "neck_body_share": 0.25, "collar_navy_share": 0.10, "hem_hist_dist": 0.30, "texture_ratio": 1.0, "garment_len_ratio": 0.25}

def lab_median(im, sel):
    if sel.sum() < 100: return None
    return [float(x) for x in np.median(cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)[sel], axis=0)]

def de(a, b): return float(np.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))) if a and b else None

def nearest_class(centres, lab):
    d = [np.sqrt(0.5 * (lab[0] - c[0]) ** 2 + (lab[1] - c[1]) ** 2 + (lab[2] - c[2]) ** 2) for c in centres]
    return int(np.argmin(d)), float(min(d))

def frame_features(model, im, gm):
    r, cls, zs = score_with_model(model, im, gm)
    if r["landmark"] is None or zs is None: return None, r, cls, zs
    k = len(model["centres"]); body, stripe = model["body_class"], model["stripe_ids"][0]
    g = gm > 0; L = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)[..., 0]
    f = {"score": r["score"]}
    f["body_lab"] = lab_median(im, (cls == body) & g); f["stripe_lab"] = lab_median(im, (cls == stripe) & g)
    sl = ((zs["sleeve_left"] > 0) | (zs["sleeve_right"] > 0)) & (cls == body) & g; tr = ((zs["chest"] > 0) | (zs["lower_front"] > 0)) & (cls == body) & g
    f["sleeve_minus_body_L"] = float(np.median(L[sl]) - np.median(L[tr])) if sl.sum() > 200 and tr.sum() > 200 else None
    lm = r["landmark"]; ys, xs = np.where(g); top, bot = ys.min(), ys.max()
    band = g[max(0, lm["row"] - lm["height"]):lm["row"] + lm["height"] + 1]; cols = np.where(band.max(axis=0))[0]
    width = float(cols.max() - cols.min()) if len(cols) else None
    f["stripe_height_ratio"] = (lm["height"] / width) if width else None
    f["stripe_pos_ratio"] = float((lm["row"] - top) / max(1, bot - top))
    f["garment_len_ratio"] = float((bot - lm["row"]) / width) if width else None
    neck = (zs["neck"] > 0) & g
    if neck.sum() > 200:
        shares = np.bincount(cls[neck], minlength=k + 1)[:k + 1] / neck.sum()
        f["neck_body_share"] = float(shares[body]); f["neck_navy_share"] = float(shares[stripe])
        # "white" = the lightest anchor class other than body (shirt collar), if there is one
        light = sorted(range(k), key=lambda c: -model["centres"][c][0]); white = next((c for c in light if c != body and model["centres"][c][0] > model["centres"][body][0] + 15), None)
        f["neck_white_share"] = float(shares[white]) if white is not None else 0.0
        # the collar's INSIDE: seen from the front, a stand collar's visible surfaces at the SIDES of
        # the neck opening are its inner faces (the tie and shirt sit in the middle). The neck zone
        # box from the stripe landmark ends at the shoulder line, so per column of its outer thirds
        # the garment pixels ABOVE the box, up to the collar's top edge (at most 90 px, gaps ≤ 3 px
        # bridged), are the collar; the stripe-class share of those pixels says what it is lined with
        nys, nxs = np.where(zs["neck"] > 0); x0, x1 = nxs.min(), nxs.max(); y0 = nys.min(); third = max(1, (x1 - x0) // 3)
        hit = tot = 0
        for x in [x for x in range(x0, x1 + 1) if x < x0 + third or x > x1 - third]:
            y = y0; gap = 0
            while y > 0 and y0 - y < 90:
                if g[y, x]: gap = 0; hit += int(cls[y, x] == stripe); tot += 1
                else:
                    gap += 1
                    if gap > 3: break
                y -= 1
        f["collar_navy_share"] = float(hit / tot) if tot > 200 else None
    else:
        f["neck_body_share"] = f["neck_navy_share"] = f["neck_white_share"] = f["collar_navy_share"] = None
    f["hem_hist_dist"] = float(1.0 - r["zones"]["hem"]); f["neck_hist_dist"] = float(1.0 - r["zones"]["neck"])
    lap = cv2.Laplacian(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), cv2.CV_32F); bsel = (cls == body) & g
    f["texture_body"] = float((lap[bsel] ** 2).mean() / max(1.0, float(L[bsel].mean())) ** 2 * 1e4) if bsel.sum() > 200 else None
    return f, r, cls, zs

def median_feat(rows):
    out = {}
    for key in rows[0]:
        vals = [r[key] for r in rows if r.get(key) is not None]
        if not vals: out[key] = None
        elif isinstance(vals[0], list): out[key] = [float(np.median([v[i] for v in vals])) for i in range(3)]
        else: out[key] = float(np.median(vals))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anchor", required=True); ap.add_argument("--anchor-master", required=True)
    ap.add_argument("--clip", action="append", default=[], help='"name=clip.mp4:master_glob"')
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24); ap.add_argument("--step", type=int, default=4)
    ap.add_argument("--tolerances", default=None); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x")); os.makedirs(a.out, exist_ok=True)
    tol = dict(DEFAULT_TOL)
    if a.tolerances: tol.update(json.load(open(a.tolerances)))
    anchor = cv2.resize(cv2.imread(a.anchor), (W, H), interpolation=cv2.INTER_AREA); amaster = cv2.resize(cv2.imread(a.anchor_master), (W, H), interpolation=cv2.INTER_AREA)
    model = build_anchor_model(anchor, amaster)
    af, ar, acls, azs = frame_features(model, anchor, model["mask"])
    report = {"anchor": {"file": a.anchor, "features": af}, "tolerances": tol, "clips": {}}
    tiles = [cv2.resize(draw(anchor, azs, ar["landmark"]), None, fx=0.3, fy=0.3)]; cv2.putText(tiles[0], "ANCHOR", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
    for spec in a.clip:
        name, rest = spec.split("=", 1); cpath, mglob = rest.split(":", 1)
        frames = decode(cpath, W, H, a.fps); masters = decode(sorted(glob.glob(mglob))[0], W, H, a.fps); n = min(len(frames), len(masters))
        rows = []; best = None
        for k in range(0, n, a.step):
            gm = garment_mask(masters[k], frames[k])
            if (gm > 0).sum() < 2000: continue
            f, r, cls, zs = frame_features(model, frames[k], gm)
            if f is None: continue
            f["frame"] = k; rows.append(f)
            if best is None or abs(f["score"] - np.median([x["score"] for x in rows])) < abs(best[0]["score"] - np.median([x["score"] for x in rows])): best = (f, r, zs, k)
        if not rows: report["clips"][name] = {"error": "no scored frames"}; continue
        med = median_feat(rows)
        delta = {"body_lab_de": de(med["body_lab"], af["body_lab"]), "stripe_lab_de": de(med["stripe_lab"], af["stripe_lab"]),
                 "sleeve_minus_body_L": (abs(med["sleeve_minus_body_L"] - (af["sleeve_minus_body_L"] or 0.0)) if med.get("sleeve_minus_body_L") is not None else None),
                 "stripe_height_ratio": (abs(med["stripe_height_ratio"] / af["stripe_height_ratio"] - 1.0) if med.get("stripe_height_ratio") and af.get("stripe_height_ratio") else None),
                 "stripe_pos_ratio": (abs(med["stripe_pos_ratio"] - af["stripe_pos_ratio"]) if med.get("stripe_pos_ratio") is not None else None),
                 "neck_navy_share": (abs(med["neck_navy_share"] - af["neck_navy_share"]) if med.get("neck_navy_share") is not None and af.get("neck_navy_share") is not None else None),
                 "neck_white_share": (abs(med["neck_white_share"] - af["neck_white_share"]) if med.get("neck_white_share") is not None and af.get("neck_white_share") is not None else None),
                 "neck_body_share": (abs(med["neck_body_share"] - af["neck_body_share"]) if med.get("neck_body_share") is not None and af.get("neck_body_share") is not None else None),
                 "collar_navy_share": (abs(med["collar_navy_share"] - af["collar_navy_share"]) if med.get("collar_navy_share") is not None and af.get("collar_navy_share") is not None else None),
                 "hem_hist_dist": med.get("hem_hist_dist"), "texture_ratio": (abs(np.log(med["texture_body"] / af["texture_body"])) if med.get("texture_body") and af.get("texture_body") else None),
                 "garment_len_ratio": (abs(med["garment_len_ratio"] - af["garment_len_ratio"]) if med.get("garment_len_ratio") is not None and af.get("garment_len_ratio") is not None else None)}
        flagged = [k for k, v in delta.items() if v is not None and v > tol[k]]
        report["clips"][name] = {"file": cpath, "frames_scored": len(rows), "features": med, "delta_to_anchor": delta, "flagged": flagged,
                                 "per_frame_std": {k: float(np.std([r[k] for r in rows if r.get(k) is not None])) for k in ("stripe_pos_ratio", "stripe_height_ratio", "sleeve_minus_body_L", "neck_navy_share") if any(r.get(k) is not None for r in rows)}}
        f, r, zs, k = best
        t = cv2.resize(draw(frames[k], zs, r["landmark"]), None, fx=0.3, fy=0.3); cv2.putText(t, f"{name} f{k} {'/'.join(flagged) or 'consistent'}", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1); tiles.append(t)
        print(json.dumps({name: {"flagged": flagged, "delta": {k: (round(v, 3) if v is not None else None) for k, v in delta.items()}}}), flush=True)
    # cross-clip spread per feature
    feats = [c["features"] for c in report["clips"].values() if "features" in c]
    spread = {}
    for key in ("sleeve_minus_body_L", "stripe_height_ratio", "stripe_pos_ratio", "neck_navy_share", "neck_white_share", "neck_body_share", "collar_navy_share", "hem_hist_dist", "texture_body", "garment_len_ratio"):
        vals = [f[key] for f in feats if f.get(key) is not None]
        if len(vals) >= 2: spread[key] = {"std": float(np.std(vals)), "min": float(min(vals)), "max": float(max(vals))}
    report["cross_clip_spread"] = spread
    report["summary"] = {n: c.get("flagged") for n, c in report["clips"].items()}
    json.dump(report, open(os.path.join(a.out, "consistency.json"), "w"), indent=1)
    if tiles:
        rows_img = [np.hstack(tiles[i:i + 4] + [np.zeros_like(tiles[0])] * (4 - len(tiles[i:i + 4]))) for i in range(0, len(tiles), 4)]
        cv2.imwrite(os.path.join(a.out, "consistency_sheet.jpg"), np.vstack(rows_img), [cv2.IMWRITE_JPEG_QUALITY, 86])
    print(json.dumps({"summary": report["summary"], "spread": {k: round(v["std"], 3) for k, v in spread.items()}}))

if __name__ == "__main__":
    main()
