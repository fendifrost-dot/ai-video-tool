#!/usr/bin/env python3
"""
Deterministic garment CONSTRUCTION score against an approved anchor — the selection rule for
best-of-N wardrobe rolls (canonical-Look lane), so choosing a roll is a measurement, not taste.

  python3 scripts/qa/construction_score.py --anchor heroes/anchor.jpg --anchor-master heroes/anchor_master.jpg \\
      --candidate "S08_e1=s08_e1.mp4" --candidate "S08_r2=s08_r2.mp4" … --master "cuts/S08_master_*.mp4" \\
      [--reference "S06=s06_e1.mp4:cuts/S06_master_*.mp4" …] --out qa/construction_S08/

How it works (nothing project-specific: the anchor defines everything)
  1. Colour classes are learned from the ANCHOR's garment region (k-means in Lab on the pixels the
     wardrobe edit changed vs its master frame). Every candidate pixel is assigned to the nearest
     anchor class (or "other" beyond --class-radius).
  2. The anchor's vertical reference is its horizontal STRIPE landmark: the class whose row profile
     has the strongest NARROW peak (a chest band, a yoke seam, a placket stripe — never trousers or
     a shirt, which are tall). Its height h is the half-height run around the peak. ZONES are laid out
     relative to that landmark and to the garment's width at that row, so they follow the garment,
     not the frame: neck (above the landmark, centre), chest (the landmark rows), lower-front (below,
     centre), hem (the closure / hem / shirt-tail region further down), sleeves (below, lateral). The same landmark is found on each candidate frame.
  3. Each zone's class histogram is compared with the anchor's (1 − ½·L1). The construction score
     is the weighted mean over zones; `worst_zone` names the zone that differs most. Per candidate
     the median over sampled frames and the 10th percentile (bad frames) are reported, plus each
     zone's p90 INTRUSION: the share taken by classes the anchor's zone lacks (a shirt through a
     split front, a stripe on a plain sleeve), which shading shifts cannot mask.
  4. Optional --reference shots (accepted anchored rolls of other shots) give the score range a
     candidate must reach: `pass` = median ≥ min(reference medians) − --tolerance AND every zone's
     median ≥ that zone's reference minimum − tolerance. Frames where no stripe landmark is found
     (the band occluded by arms) are reported as unscored, not as zero.
Outputs scores.json and a contact sheet (anchor with zones | each candidate's median frame with
zones and class map).
"""
import argparse, glob, json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "edit"))
from propagate_keyframe import decode, garment_mask_from_edit  # noqa: E402

ZONES = ["neck", "chest", "lower_front", "hem", "sleeve_left", "sleeve_right"]
WEIGHTS = {"neck": 0.2, "chest": 0.25, "lower_front": 0.2, "hem": 0.15, "sleeve_left": 0.1, "sleeve_right": 0.1}

def lab(im): return cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)

def garment_mask(master, edit, lo=18.0, hi=36.0, reach=25, min_frac=0.004):
    """What the edit changed, with hysteresis: strong changes (Lab distance > hi) seed the mask,
    weaker ones (> lo) join only within `reach` px of a seed. A clean edit (xAI lane) gives the
    same mask as the plain threshold; a provider that re-renders the whole frame (Runway) shifts
    the face, cap and hands by a few Lab units with sharp edges above `lo`, which the plain
    threshold admits and which then drag the neck/sleeve zones onto skin."""
    a = cv2.GaussianBlur(cv2.cvtColor(master, cv2.COLOR_BGR2LAB), (0, 0), 2).astype(np.float32)
    b = cv2.GaussianBlur(cv2.cvtColor(edit, cv2.COLOR_BGR2LAB), (0, 0), 2).astype(np.float32)
    d = np.sqrt(((a - b) ** 2).sum(axis=2))
    core = cv2.morphologyEx((d > hi).astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab_, stats, _ = cv2.connectedComponentsWithStats(core); keep = np.zeros_like(core); area = core.size
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_frac * area: keep[lab_ == i] = 255
    grow = cv2.dilate(keep, np.ones((2 * reach + 1, 2 * reach + 1), np.uint8))
    m = ((d > lo).astype(np.uint8) * 255) & grow
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    ff = m.copy(); h, w = ff.shape; mm = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mm, (0, 0), 255)
    return m | cv2.bitwise_not(ff)

def learn_classes(anchor, mask, k):
    px = lab(anchor)[mask > 0].reshape(-1, 3)
    if len(px) > 60000: px = px[np.random.default_rng(0).choice(len(px), 60000, replace=False)]
    _, labels, centres = cv2.kmeans(px.astype(np.float32), k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5), 4, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)
    order = np.argsort(-counts)
    return centres[order], counts[order] / counts.sum()

def classify(im, centres, radius):
    L = lab(im).reshape(-1, 3)
    d = np.stack([np.sqrt(0.5 * (L[:, 0] - c[0]) ** 2 + (L[:, 1] - c[1]) ** 2 + (L[:, 2] - c[2]) ** 2) for c in centres], axis=1)
    cls = d.argmin(axis=1); cls[d.min(axis=1) > radius] = len(centres)   # "other"
    return cls.reshape(im.shape[:2])

def row_profile(cls_map, mask, cid):
    hit = (cls_map == cid) & (mask > 0)
    width = np.maximum(1, (mask > 0).sum(axis=1)); frac = hit.sum(axis=1) / width; frac[width < 20] = 0
    return cv2.GaussianBlur(frac.reshape(-1, 1).astype(np.float32), (0, 0), 3).flatten()

def run_around(sm, r, rel=0.5):
    thr = rel * sm[r]; top = r
    while top > 0 and sm[top - 1] >= thr: top -= 1
    bot = r
    while bot < len(sm) - 1 and sm[bot + 1] >= thr: bot += 1
    return top, bot

def landmark(cls_map, mask, stripe_ids, max_height_frac=0.12, min_peak=0.25, band=(0.12, 0.7), min_width_frac=0.25):
    """The garment's horizontal STRIPE landmark: over the candidate classes and over EVERY local
    peak of each class's row profile, the narrow peak (half-height run at most max_height_frac of
    the garment's height) with the highest row fraction. A class that is also a large region
    elsewhere (a navy band on a jacket over black trousers) still yields its narrow peak. Only rows
    inside `band` (fractions of the changed region's height) qualify: a chest stripe is never at the
    very top or bottom of the garment, and a provider that re-renders the whole frame puts the cap
    and glasses into the edit-vs-master mask, where a dark cap row would otherwise win. Returns
    row/top/bottom/height, class id and peak, or None."""
    ys = np.where((mask > 0).any(axis=1))[0]
    if len(ys) < 40: return None
    gh = ys.max() - ys.min(); best = None
    r_lo, r_hi = ys.min() + band[0] * gh, ys.min() + band[1] * gh
    # the garment's width = its widest row; a chest stripe spans most of it, a cap visor or a
    # zip pull (also dark, also narrow in height) spans a small fraction and is rejected
    gw = max(1, int((mask > 0).sum(axis=1).max()))
    for cid in stripe_ids:
        sm = row_profile(cls_map, mask, cid)
        peaks = [r for r in range(1, len(sm) - 1) if r_lo <= r <= r_hi and sm[r] >= min_peak and sm[r] >= sm[r - 1] and sm[r] > sm[r + 1]]
        for r in peaks:
            top, bot = run_around(sm, r)
            if (bot - top + 1) > max_height_frac * gh: continue
            cols = np.where((cls_map[r] == cid) & (mask[r] > 0))[0]
            if len(cols) < 2 or (cols.max() - cols.min()) < min_width_frac * gw: continue
            if best is None or sm[r] > best["peak"]: best = {"row": r, "top": top, "bottom": bot, "height": max(6, bot - top + 1), "class": cid, "peak": float(sm[r])}
    return best

def zones_for(mask, lm):
    """Zone masks laid out from the landmark row/height and the garment's extent at that row."""
    H, W = mask.shape
    r, h = lm["row"], lm["height"]
    cols = np.where(mask[max(0, min(H - 1, r))] > 0)[0]
    if len(cols) < 10:
        band = np.where(mask[max(0, r - h):r + h].any(axis=0))[0]; cols = band if len(band) else np.array([0, W - 1])
    x0, x1 = int(cols.min()), int(cols.max()); w = max(20, x1 - x0); cx = (x0 + x1) // 2
    def box(y0, y1, xa, xb):
        z = np.zeros_like(mask); z[max(0, y0):min(H, y1), max(0, xa):min(W, xb)] = 255; return z & mask
    return {
        "neck": box(r - int(3.0 * h), r - int(0.8 * h), cx - int(0.25 * w), cx + int(0.25 * w)),
        "chest": box(lm["top"] - 2, lm["bottom"] + 3, x0, x1),
        "lower_front": box(r + int(1.0 * h), r + int(4.5 * h), cx - int(0.18 * w), cx + int(0.18 * w)),
        "hem": box(r + int(4.5 * h), r + int(8.0 * h), cx - int(0.3 * w), cx + int(0.3 * w)),   # closure / hem / shirt-tail region
        "sleeve_left": box(r + int(0.5 * h), r + int(5.5 * h), x0 - int(0.15 * w), x0 + int(0.2 * w)),
        "sleeve_right": box(r + int(0.5 * h), r + int(5.5 * h), x1 - int(0.2 * w), x1 + int(0.15 * w)),
    }

def zone_hist(cls_map, zone, k):
    """Class histogram of a zone over the GARMENT SURFACE only: pixels that match none of the
    anchor's colour classes ("other" — skin, hair, background bleeding into the changed-region
    mask when a provider re-renders the whole frame) are not garment and are left out, so a
    zone is compared on what the garment is made of, not on how much of the frame changed."""
    v = cls_map[zone > 0]; v = v[v < k]
    if len(v) < 40: return None
    return np.bincount(v, minlength=k)[:k] / len(v)

def compare(hist_a, hist_c):
    return None if (hist_a is None or hist_c is None) else float(1.0 - 0.5 * np.abs(hist_a - hist_c).sum())

def intrusion(hist_a, hist_c, absent=0.05):
    """Share of the candidate zone taken by classes the ANCHOR's zone (almost) lacks — a shirt
    showing through a split front, a stripe on a plain sleeve — independent of shading shifts
    between the classes the zone legitimately contains."""
    if hist_a is None or hist_c is None: return None
    return float(sum(c for a_, c in zip(hist_a, hist_c) if a_ < absent))

def score_frame(im, mask, centres, radius, stripe_ids, anchor_hists, max_stripe_frac, min_stripe_peak, band=(0.12, 0.7)):
    cls = classify(im, centres, radius); lm = landmark(cls, mask, stripe_ids, max_stripe_frac, min_stripe_peak, band)
    if lm is None: return {"score": 0.0, "landmark": None, "zones": {z: 0.0 for z in ZONES}, "note": "no stripe landmark found"}, cls, None
    zs = zones_for(mask, lm); per = {}; intr = {}
    for z in ZONES:
        hc = zone_hist(cls, zs[z], len(centres)); s = compare(anchor_hists[z], hc); i = intrusion(anchor_hists[z], hc)
        per[z] = s if s is not None else 0.0; intr[z] = i if i is not None else 0.0
    total = sum(WEIGHTS[z] * per[z] for z in ZONES) / sum(WEIGHTS.values())
    worst = min(ZONES, key=lambda z: per[z])
    return {"score": float(total), "landmark": lm, "zones": per, "intrusion": intr, "worst_zone": worst}, cls, zs

def build_anchor_model(anchor, amaster, classes=6, class_radius=28.0, max_stripe_frac=0.12, min_stripe_peak=0.25, band=(0.12, 0.7)):
    """Everything the score needs, learned from the anchor alone (reused by hero_gate.py):
    colour classes, the stripe landmark, the body class, the anchor's zone histograms."""
    amask = garment_mask(amaster, anchor)
    centres, shares = learn_classes(anchor, amask, classes)
    acls = classify(anchor, centres, class_radius)
    # the stripe landmark is searched over EVERY learned class; the body is whatever dominates the
    # torso window around it (so trousers, shirt or skin never masquerade as the garment body)
    alm = landmark(acls, amask, list(range(len(centres))), max_stripe_frac, min_stripe_peak, band)
    if alm is None: raise SystemExit("anchor: no horizontal stripe landmark found — the score needs one (chest band / yoke / placket stripe)")
    r, h = alm["row"], alm["height"]
    win = np.zeros_like(amask); win[max(0, r - 3 * h):r + 5 * h] = 255; win &= amask
    counts = np.bincount(acls[win > 0], minlength=len(centres) + 1)[: len(centres)]; counts[alm["class"]] = 0
    body_id = int(counts.argmax())
    azs = zones_for(amask, alm); ahists = {z: zone_hist(acls, azs[z], len(centres)) for z in ZONES}
    return {"anchor": anchor, "master": amaster, "mask": amask, "centres": centres, "shares": shares, "cls": acls, "landmark": alm, "body_class": body_id,
            "stripe_ids": [alm["class"]], "zones": azs, "hists": ahists, "class_radius": class_radius, "max_stripe_frac": max_stripe_frac, "min_stripe_peak": min_stripe_peak, "band": band}

def score_with_model(model, im, mask):
    return score_frame(im, mask, model["centres"], model["class_radius"], model["stripe_ids"], model["hists"], model["max_stripe_frac"], model["min_stripe_peak"], model["band"])

def draw(im, zs, lm):
    ov = im.copy()
    colours = {"neck": (0, 255, 255), "chest": (0, 0, 255), "lower_front": (0, 255, 0), "hem": (0, 165, 255), "sleeve_left": (255, 0, 255), "sleeve_right": (255, 128, 0)}
    if zs:
        for z, m in zs.items():
            ys, xs = np.where(m > 0)
            if len(ys): cv2.rectangle(ov, (xs.min(), ys.min()), (xs.max(), ys.max()), colours[z], 2)
    if lm: cv2.line(ov, (0, lm["row"]), (ov.shape[1] - 1, lm["row"]), (255, 255, 255), 1)
    return ov

def load_clip(spec, W, H, fps, masters_pat):
    """'name=edit.mp4[:master_glob]' → (name, frames, masks)."""
    name, rest = spec.split("=", 1)
    edit_path, _, master_glob = rest.partition(":")
    frames = decode(edit_path, W, H, fps)
    mg = master_glob or (masters_pat.format(shot=name.split("_")[0]) if masters_pat else "")
    g = sorted(glob.glob(mg)) if mg else []
    if not g: raise SystemExit(f"{name}: no master cut for the garment mask ({mg})")
    masters = decode(g[0], W, H, fps); n = min(len(frames), len(masters))
    return name, frames[:n], masters[:n]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anchor", required=True); ap.add_argument("--anchor-master", required=True)
    ap.add_argument("--candidate", action="append", default=[], help='"name=edit.mp4[:master_glob]"')
    ap.add_argument("--reference", action="append", default=[], help='"name=edit.mp4[:master_glob]" accepted rolls of other shots (score range)')
    ap.add_argument("--master", default=None, help='glob with {shot} for masters when not given per clip, e.g. "cuts/{shot}_master_*.mp4"')
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24); ap.add_argument("--step", type=int, default=4)
    ap.add_argument("--classes", type=int, default=6); ap.add_argument("--class-radius", type=float, default=28.0)
    ap.add_argument("--max-stripe-frac", type=float, default=0.12, help="a stripe landmark's half-height run may be at most this fraction of the garment's height")
    ap.add_argument("--min-stripe-peak", type=float, default=0.25, help="minimum row fraction at the stripe's peak")
    ap.add_argument("--landmark-band", default="0.12,0.7", help="rows eligible for the stripe landmark, as fractions of the changed region's height (top,bottom)")
    ap.add_argument("--tolerance", type=float, default=0.02); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x")); os.makedirs(a.out, exist_ok=True)
    anchor = cv2.resize(cv2.imread(a.anchor), (W, H), interpolation=cv2.INTER_AREA); amaster = cv2.resize(cv2.imread(a.anchor_master), (W, H), interpolation=cv2.INTER_AREA)
    band = tuple(float(x) for x in a.landmark_band.split(","))
    model = build_anchor_model(anchor, amaster, a.classes, a.class_radius, a.max_stripe_frac, a.min_stripe_peak, band)
    amask, centres, shares, acls, alm, body_id, stripe_ids, azs, ahists = (model[k] for k in ("mask", "centres", "shares", "cls", "landmark", "body_class", "stripe_ids", "zones", "hists"))
    report = {"anchor": a.anchor, "classes": [{"lab": [round(float(x), 1) for x in c], "share": round(float(s), 3)} for c, s in zip(centres, shares)], "stripe_class": alm["class"], "body_class": body_id,
              "anchor_landmark": alm, "anchor_zone_hists": {z: (None if h is None else [round(float(x), 3) for x in h]) for z, h in ahists.items()}, "weights": WEIGHTS, "candidates": {}, "references": {}}
    tiles = [cv2.resize(draw(anchor, azs, alm), None, fx=0.35, fy=0.35)]
    cv2.putText(tiles[0], "ANCHOR", (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)

    def run(spec, bucket):
        name, frames, masters = load_clip(spec, W, H, a.fps, a.master)
        per = []; unscored = 0
        for k in range(0, len(frames), a.step):
            m = garment_mask(masters[k], frames[k])
            if (m > 0).sum() < 2000: continue
            r, cls, zs = score_frame(frames[k], m, centres, a.class_radius, stripe_ids, ahists, a.max_stripe_frac, a.min_stripe_peak, band); r["frame"] = k
            if r["landmark"] is not None: per.append((r, cls, zs))
            else: unscored += 1
        if not per: report[bucket][name] = {"error": "no frames scored (stripe landmark never found)", "frames_unscored": unscored}; return
        scores = np.array([p[0]["score"] for p in per]); zone_med = {z: float(np.median([p[0]["zones"][z] for p in per])) for z in ZONES}
        intr_p90 = {z: float(np.percentile([p[0]["intrusion"][z] for p in per], 90)) for z in ZONES}
        # stability across the WHOLE shot (not hero frames): std of the total score over time and the
        # mean per-zone temporal std — a garment that is one persistent object scores low here
        zone_std = {z: float(np.std([p[0]["zones"][z] for p in per])) for z in ZONES}
        rec = {"file": spec.split("=", 1)[1].split(":")[0], "frames_scored": len(per), "frames_unscored": unscored, "median": float(np.median(scores)), "p10": float(np.percentile(scores, 10)), "min": float(scores.min()),
               "zones_median": zone_med, "intrusion_p90": intr_p90, "worst_zone": min(ZONES, key=lambda z: zone_med[z]),
               "score_std": float(scores.std()), "zone_std": zone_std, "zone_std_mean": float(np.mean(list(zone_std.values()))),
               "per_frame": [{"frame": p[0]["frame"], "score": round(float(p[0]["score"]), 4), "zones": {z: round(float(p[0]["zones"][z]), 4) for z in ZONES}, "intrusion": {z: round(float(p[0]["intrusion"][z]), 4) for z in ZONES}} for p in per]}
        report[bucket][name] = rec
        mid = per[int(np.argsort(scores)[len(scores) // 2])]
        t = cv2.resize(draw(frames[mid[0]["frame"]], mid[2], mid[0]["landmark"]), None, fx=0.35, fy=0.35)
        cv2.putText(t, f"{name} {rec['median']:.3f} (p10 {rec['p10']:.3f}) worst={rec['worst_zone']}", (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1); tiles.append(t)
        print(json.dumps({name: rec}), flush=True)
    for spec in a.reference: run(spec, "references")
    for spec in a.candidate: run(spec, "candidates")
    refs = [r for r in report["references"].values() if "median" in r]
    floor = (min(r["median"] for r in refs) - a.tolerance) if refs else None
    zone_floor = {z: (min(r["zones_median"][z] for r in refs) - a.tolerance) for z in ZONES} if refs else None
    intr_ceiling = {z: (max(r["intrusion_p90"][z] for r in refs) + a.tolerance) for z in ZONES} if refs else None
    def passes(rec):
        if floor is None: return None
        return bool(rec["median"] >= floor and all(rec["zones_median"][z] >= zone_floor[z] for z in ZONES) and all(rec["intrusion_p90"][z] <= intr_ceiling[z] for z in ZONES))
    ranked = sorted(((n, r) for n, r in report["candidates"].items() if "median" in r), key=lambda x: -x[1]["median"])
    for n, r in ranked:
        r["passes"] = passes(r)
        r["failing_zones"] = [z for z in ZONES if zone_floor and r["zones_median"][z] < zone_floor[z]]
        r["intruding_zones"] = [z for z in ZONES if intr_ceiling and r["intrusion_p90"][z] > intr_ceiling[z]]
    report["decision"] = {"reference_floor": floor, "zone_floors": zone_floor, "intrusion_ceilings": intr_ceiling, "ranked": [n for n, _ in ranked], "best": ranked[0][0] if ranked else None,
                          "best_passes": ranked[0][1]["passes"] if ranked else None, "passing": [n for n, r in ranked if r.get("passes")],
                          "rule": "pass = candidate median ≥ min(reference medians) − tolerance AND every zone median ≥ that zone's reference minimum − tolerance AND every zone's p90 foreign-class intrusion ≤ the references' maximum + tolerance; best = highest median"}
    json.dump(report, open(os.path.join(a.out, "scores.json"), "w"), indent=1)
    rows = [np.hstack(tiles[i:i + 4] + [np.zeros_like(tiles[0])] * (4 - len(tiles[i:i + 4]))) for i in range(0, len(tiles), 4)]
    cv2.imwrite(os.path.join(a.out, "construction_sheet.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(json.dumps(report["decision"], indent=1))

if __name__ == "__main__":
    main()
