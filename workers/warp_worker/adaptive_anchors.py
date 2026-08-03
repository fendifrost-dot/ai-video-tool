"""ADAPTIVE anchor placement (replaces fixed 12-24 cadence).

Fixed spacing is wrong: some sections deform fast and need an anchor every few
frames; others are stable for dozens. This places anchors from the measured
propagation window — start at shot boundaries, then walk forward, each time
jumping as far as that region's flow actually stays trustworthy (with a safety
margin), so the plan EXPRESSES "this section needs an anchor every 8 frames" vs
"this section is stable for 40".

The core planner is pure (consumes per-anchor reach, emits anchor indices) and
unit-tested. A thin CLI feeds it the propagation_window.json.
"""
from __future__ import annotations

import argparse
import json
import os
from typing import Dict, List, Optional, Sequence


def reach_lookup(per_anchor: Sequence[dict], frame_count: int) -> List[int]:
    """Dense per-frame forward-reach array from sparsely-sampled anchors
    (nearest-sample hold). reach[f] = max stable forward distance from frame f."""
    reach = [0] * frame_count
    samples = sorted(per_anchor, key=lambda w: w["anchor"])
    if not samples:
        return [1] * frame_count
    j = 0
    for f in range(frame_count):
        while j + 1 < len(samples) and abs(samples[j + 1]["anchor"] - f) <= abs(samples[j]["anchor"] - f):
            j += 1
        reach[f] = max(0, int(samples[j]["max_fwd"]))
    return reach


def plan_adaptive_anchors(
    per_frame_reach: Sequence[int],
    frame_count: int,
    shot_boundaries: Sequence[int] = (),
    min_gap: int = 4,
    max_gap: int = 48,
    safety: float = 0.8,
) -> List[int]:
    """Greedy adaptive placement.

    - Always anchors frame 0, the last frame, and every shot boundary.
    - From each anchor, jump forward by max(min_gap, min(max_gap, floor(reach*safety)))
      so the next anchor lands slightly BEFORE the predicted first failure.
    - Never leaves a gap > max_gap; never places closer than min_gap (except forced
      shot boundaries).
    """
    if frame_count <= 1:
        return [0]
    forced = sorted({0, frame_count - 1, *[b for b in shot_boundaries if 0 <= b < frame_count]})
    anchors = [0]
    cur = 0
    while cur < frame_count - 1:
        r = per_frame_reach[cur] if 0 <= cur < len(per_frame_reach) else max_gap
        step = max(min_gap, min(max_gap, int(r * safety)))
        nxt = cur + step
        # snap to the next forced boundary if one falls within [cur+1, nxt]
        upcoming = [b for b in forced if cur < b <= nxt]
        if upcoming:
            nxt = min(upcoming)
        nxt = min(nxt, frame_count - 1)
        if nxt <= cur:
            nxt = min(cur + min_gap, frame_count - 1)
        anchors.append(nxt)
        cur = nxt
    # merge in any forced boundaries missed, dedup, sort
    return sorted(set(anchors) | set(forced))


def compare_to_fixed(adaptive: Sequence[int], frame_count: int, fixed_cadence: int = 18) -> dict:
    fixed = sorted({0, frame_count - 1, *range(fixed_cadence, frame_count - 1, fixed_cadence)})
    gaps = [adaptive[i + 1] - adaptive[i] for i in range(len(adaptive) - 1)]
    return {
        "adaptive_anchor_count": len(adaptive),
        "fixed_anchor_count": len(fixed),
        "adaptive_min_gap": min(gaps) if gaps else 0,
        "adaptive_max_gap": max(gaps) if gaps else 0,
        "adaptive_mean_gap": round(sum(gaps) / len(gaps), 2) if gaps else 0,
        "note": "adaptive concentrates anchors where flow reach is short and spaces them "
                "where the shot is stable; fixed cadence cannot.",
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Adaptive anchor placement from the propagation window")
    p.add_argument("--window-json", required=True)
    p.add_argument("--min-gap", type=int, default=4)
    p.add_argument("--max-gap", type=int, default=48)
    p.add_argument("--safety", type=float, default=0.8)
    p.add_argument("--shot-boundaries", default="", help="comma-separated frame indices")
    p.add_argument("--out", required=True)
    args = p.parse_args(argv)

    dist = json.load(open(args.window_json))
    per_anchor = dist["per_anchor"]
    frame_count = max(w["anchor"] for w in per_anchor) + 1
    # frame_count from the window sampling is the last sampled anchor; use the flow
    # manifest's frame_count if available alongside.
    manifest_path = os.path.join(os.path.dirname(args.window_json), "..", "flow_manifest.json")
    if os.path.exists(manifest_path):
        frame_count = json.load(open(manifest_path))["frame_count"]

    reach = reach_lookup(per_anchor, frame_count)
    boundaries = [int(x) for x in args.shot_boundaries.split(",") if x.strip().isdigit()]
    anchors = plan_adaptive_anchors(reach, frame_count, boundaries, args.min_gap, args.max_gap, args.safety)
    cmp = compare_to_fixed(anchors, frame_count)

    out = {
        "kind": "adaptive_anchor_plan",
        "frame_count": frame_count,
        "min_gap": args.min_gap,
        "max_gap": args.max_gap,
        "safety": args.safety,
        "shot_boundaries": boundaries,
        "adaptive_anchors": anchors,
        "gaps": [anchors[i + 1] - anchors[i] for i in range(len(anchors) - 1)],
        "vs_fixed_cadence_18": cmp,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)
    print(f"[adaptive] {len(anchors)} anchors (fixed-18 would use {cmp['fixed_anchor_count']}); "
          f"gaps min={cmp['adaptive_min_gap']} max={cmp['adaptive_max_gap']} mean={cmp['adaptive_mean_gap']}")
    print(f"[adaptive] -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
