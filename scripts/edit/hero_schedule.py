#!/usr/bin/env python3
"""
HERO SCHEDULER — where the pose-locked canonical heroes must sit in a shot, derived from the
carrier's MEASURED reach on this footage (not from a fixed cadence).

  python3 scripts/edit/hero_schedule.py --master cuts/S08_master.mp4 [--edit s08_e1.mp4] \\
      --out-dir sched/S08 [--trial-step 6 --min-coverage 0.8 --conf 0.75 --max-reach 24]

Method
  1. The region that has to be carried is the garment: from an accepted edit of the same
     footage (what it changed vs the master) when one exists, otherwise the performer's torso
     (RVM silhouette between the shoulders and the hips of the pose landmarks).
  2. Every --trial-step-th frame is tried as a hero: the propagator's own flow chain
     (`propagate_keyframe.chain`, forward-backward drift → confidence) is run outward until the
     fraction of the garment region with confidence ≥ --conf falls below --min-coverage, in both
     directions. That reach, per trial hero, is the measurement (rev 31: ≈ ±8 frames on S08).
  3. Greedy set cover: heroes are chosen so that every frame lies inside the reach of at least
     one hero — fewest heroes first, then the ones with the largest reach. Frames no trial hero
     reaches (fast motion, occlusion) are reported as `uncovered` with the nearest hero.
  4. Each scheduled hero is exported as a PNG of the MASTER frame (the pose-locked source the
     generator must edit) plus the region mask, so the provider lane can mint candidates and the
     hero gate can score them against exactly this frame.
Outputs schedule.json (heroes, per-hero reach and coverage curve, uncovered frames, trial table)
and sched_sheet.jpg (the scheduled hero frames with their reach). Nothing here is shot-specific.
"""
import argparse, json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from propagate_keyframe import decode, garment_mask_from_edit, chain, person_alpha  # noqa: E402

def torso_region(master, k, pose):
    lm = pose.detect(master[k])
    alpha = person_alpha([master[k]])[0] > 0.5
    if lm is None: return alpha.astype(np.uint8) * 255
    H, W = alpha.shape
    ys = [lm[i, 1] for i in (11, 12)]; yh = [lm[i, 1] for i in (23, 24) if lm[i, 3] >= 0.5] or [H * 0.85]
    top = int(max(0, min(ys) - 0.05 * H)); bot = int(min(H, max(yh) + 0.05 * H))
    reg = np.zeros((H, W), np.uint8); reg[top:bot] = 255
    return reg & (alpha.astype(np.uint8) * 255)

def reach_from(grays, region_masks, hero, direction, conf, min_cov, max_reach, ds=4):
    """Chain outward from `hero`; per reached frame keep the confident-pixel mask (downsampled
    ds×) so heroes can be combined later: the carrier blends the two nearest heroes, so a frame
    is carried when the UNION of their confident pixels covers the region, not one alone.
    Stops when a single hero's coverage falls under min_cov/2 (nothing useful beyond)."""
    n = len(grays); lo = max(0, hero - max_reach) if direction < 0 else hero; hi = hero + 1 if direction < 0 else min(n, hero + max_reach + 1)
    maps = chain(grays[lo:hi], hero - lo, direction)
    curve = []; masks = {}; r = 0
    for j in sorted(maps, reverse=(direction < 0)):
        k = j + lo; mapx, mapy, cf = maps[j]
        m = region_masks[k] > 0
        if m.sum() < 500: break
        ok = (cf >= conf) & m; cov = float(ok[m].mean()); curve.append((k, cov))
        masks[k] = ok[::ds, ::ds]
        if cov >= min_cov: r += 1
        if cov < min_cov / 2: break
    return r, curve, masks

def union_coverage(chosen, trials, region_ds, k, min_cov):
    r = region_ds[k]; tot = r.sum()
    if tot < 50: return None
    u = np.zeros_like(r)
    for h in chosen:
        m = trials[h]["masks"].get(k)
        if m is not None: u |= m
    return float((u & r).sum() / tot)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True); ap.add_argument("--edit", default=None, help="accepted edit of the same footage: its garment region is what must be carried")
    ap.add_argument("--out-dir", required=True); ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--trial-step", type=int, default=6); ap.add_argument("--min-coverage", type=float, default=0.8); ap.add_argument("--conf", type=float, default=0.75)
    ap.add_argument("--max-reach", type=int, default=24); ap.add_argument("--speed-ok", type=float, default=10.0); ap.add_argument("--speed-w", type=float, default=0.5)
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x")); os.makedirs(a.out_dir, exist_ok=True)
    master = decode(a.master, W, H, a.fps); n = len(master)
    grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in master]
    if a.edit:
        edit = decode(a.edit, W, H, a.fps); n = min(n, len(edit)); master, grays = master[:n], grays[:n]
        region = [garment_mask_from_edit(master[k], edit[k]) for k in range(n)]; region_src = "edit garment mask"
    else:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "qa"))
        from hero_gate import PoseModel
        pose = PoseModel(); region = [torso_region(master, k, pose) for k in range(n)]; region_src = "RVM torso (shoulders to hips)"
    import propagate_keyframe as PK
    _chain = PK.chain; PK.chain = lambda g, h_, d, **kw: _chain(g, h_, d, speed_ok=a.speed_ok, speed_w=a.speed_w, **kw)
    globals()["chain"] = PK.chain
    ds = 4; region_ds = [(r[::ds, ::ds] > 0) for r in region]
    trials = {}
    for h in range(0, n, a.trial_step):
        rb, cb, mb = reach_from(grays, region, h, -1, a.conf, a.min_coverage, a.max_reach)
        rf, cf_, mf = reach_from(grays, region, h, +1, a.conf, a.min_coverage, a.max_reach)
        masks = dict(mb); masks.update(mf); masks[h] = region_ds[h].copy()
        trials[h] = {"back": rb, "fwd": rf, "masks": masks, "curve": [(k, c) for k, c in cb[::-1] + [(h, 1.0)] + cf_]}
        print(f"trial hero {h}: single-hero reach -{rb}/+{rf} at coverage ≥ {a.min_coverage}", flush=True)
    # greedy cover on UNION coverage (the two-hero blend is what the carrier runs)
    def covered_set(chosen):
        return {k for k in range(n) if (union_coverage(chosen, trials, region_ds, k, a.min_coverage) or 0.0) >= a.min_coverage}
    heroes = []; covered = set()
    while True:
        best, gain = None, 0
        for h in trials:
            if h in heroes: continue
            g = len(covered_set(heroes + [h]) - covered)
            if g > gain or (g == gain and best is not None and trials[h]["back"] + trials[h]["fwd"] > trials[best]["back"] + trials[best]["fwd"]): best, gain = h, g
        if best is None or gain == 0: break
        heroes.append(best); covered = covered_set(heroes)
        print(f"  + hero {best}: {len(covered)}/{n} frames carried", flush=True)
    heroes.sort(); uncovered = set(range(n)) - covered
    per_frame = {k: union_coverage(heroes, trials, region_ds, k, a.min_coverage) for k in range(n)}
    nearest = {k: min(heroes, key=lambda h: abs(h - k)) for k in sorted(uncovered)} if heroes else {}
    for h in heroes:
        cv2.imwrite(os.path.join(a.out_dir, f"hero_source_{h:05d}.png"), master[h]); cv2.imwrite(os.path.join(a.out_dir, f"hero_region_{h:05d}.png"), region[h])
    sched = {"master": a.master, "frames": n, "region": region_src, "conf": a.conf, "min_coverage": a.min_coverage, "trial_step": a.trial_step, "max_reach": a.max_reach,
             "heroes": [{"frame": h, "reach_back": trials[h]["back"], "reach_fwd": trials[h]["fwd"], "source_png": f"hero_source_{h:05d}.png", "region_png": f"hero_region_{h:05d}.png"} for h in heroes],
             "uncovered_frames": sorted(uncovered), "uncovered_nearest_hero": nearest, "union_coverage_per_frame": per_frame,
             "union_coverage_mean": float(np.mean([v for v in per_frame.values() if v is not None])),
             "reach_stats": {"mean_back": float(np.mean([t["back"] for t in trials.values()])), "mean_fwd": float(np.mean([t["fwd"] for t in trials.values()])), "min_total": int(min(t["back"] + t["fwd"] for t in trials.values())), "max_total": int(max(t["back"] + t["fwd"] for t in trials.values()))},
             "trials": {int(h): {"back": t["back"], "fwd": t["fwd"], "curve": t["curve"]} for h, t in trials.items()}}
    json.dump(sched, open(os.path.join(a.out_dir, "schedule.json"), "w"), indent=1)
    tiles = []
    for h in heroes:
        t = cv2.resize(master[h], None, fx=0.3, fy=0.3); ov = cv2.resize(region[h], None, fx=0.3, fy=0.3) > 0
        t[ov] = (0.6 * t[ov] + 0.4 * np.array([0, 200, 0])).astype(np.uint8)
        cv2.putText(t, f"hero f{h} reach -{trials[h]['back']}/+{trials[h]['fwd']}", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1); tiles.append(t)
    if tiles:
        rows = [np.hstack(tiles[i:i + 6] + [np.zeros_like(tiles[0])] * (6 - len(tiles[i:i + 6]))) for i in range(0, len(tiles), 6)]
        cv2.imwrite(os.path.join(a.out_dir, "sched_sheet.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(json.dumps({"heroes": heroes, "count": len(heroes), "uncovered": len(uncovered), "reach_stats": sched["reach_stats"]}))

if __name__ == "__main__":
    main()
