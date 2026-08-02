"""STAGE A hard gate — head-to-head + two independent scorecards + frozen grid.

Applies the tightened Stage A rules:

  * Question: does the machinery remain STABLE on ACTUAL Kolors output — no
    regression vs the current baseline? (Garment IMPROVEMENT is not evaluated in A.)
  * Isolate the Kolors effect with a CONTROLLED head-to-head: identical window,
    identical masks, identical single-anchor structure, changing ONLY the anchor
    content (source-stand-in vs real Kolors). Common-mode single-anchor decay
    cancels; the delta is the Kolors effect.
  * NON-NEGOTIABLE #1: never average away a severe failure — per-dimension, worst
    frame called out, any single severe failure => stage does not PASS.
  * NON-NEGOTIABLE #2: compare against the LITERAL frozen baselines in the grid.
  * NON-NEGOTIABLE #3: temporal verdict and garment-fidelity verdict are separate.

Consumes the two stage_a runs' per_frame.json + composite frames, plus the frozen
canonical artifacts. Emits STAGE_A_GATE.md, stage_a_gate.json, and the grid.
"""
from __future__ import annotations

import argparse
import json
import os
from typing import Dict, List, Optional

import cv2
import numpy as np

from .frameio import frame_path, load_bgr
from .garment_fidelity import measure_stripe, score_fidelity
from .masks import derive_heuristic
from .qa import build_sidebyside


def _load_run(art_dir: str) -> dict:
    return {
        "per_frame": json.load(open(os.path.join(art_dir, "stage_a_per_frame.json"))),
        "result": json.load(open(os.path.join(art_dir, "stage_a_result.json"))),
    }


def _pf(run, k) -> dict:
    return run["per_frame"][str(k)]


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Stage A hard gate")
    p.add_argument("--kolors-run", required=True)
    p.add_argument("--source-run", required=True)
    p.add_argument("--kolors-heavy", required=True)
    p.add_argument("--source-heavy", required=True)
    p.add_argument("--source-frames", required=True)
    p.add_argument("--frozen", required=True, help="frozen canonical dir")
    p.add_argument("--anchor-index", type=int, default=134)
    p.add_argument("--half-window", type=int, default=60)
    p.add_argument("--out", required=True, help="artifacts dir")
    args = p.parse_args(argv)

    kol = _load_run(args.kolors_run)
    src = _load_run(args.source_run)
    n = kol["result"]["frame_count"]
    a_local = kol["result"]["anchor_local"]
    reach = kol["result"]["single_anchor_reach_frames"]
    indices = list(range(args.anchor_index - args.half_window, args.anchor_index + args.half_window + 1))

    # ---- head-to-head temporal, WITHIN REACH and WHOLE-WINDOW ----
    def series(run, key, within_reach):
        out = []
        for k in range(n):
            if within_reach and abs(k - a_local) > reach:
                continue
            out.append(_pf(run, k)[key])
        return out

    def stat(xs):
        xs = [x for x in xs if x is not None]
        return {"mean": round(float(np.mean(xs)), 3), "max": round(float(np.max(xs)), 3)} if xs else {"mean": None, "max": None}

    temporal = {}
    for key in ["flicker", "edge_halo", "identity_drift_outside", "roundtrip_confidence"]:
        temporal[key] = {
            "kolors_reach": stat(series(kol, key, True)),
            "source_reach": stat(series(src, key, True)),
            "kolors_window": stat(series(kol, key, False)),
            "source_window": stat(series(src, key, False)),
        }

    # worst garment-flicker frame for Kolors (non-negotiable #1: call it out)
    worst_flick_k = max(range(1, n), key=lambda k: _pf(kol, k)["flicker"])
    worst_flick_val = _pf(kol, worst_flick_k)["flicker"]

    # ---- regression test: Kolors vs source-anchor WITHIN REACH ----
    # "no regression" = Kolors flicker/halo not materially worse than the source
    # stand-in on the same structure (tolerance 15%).
    def regress(metric):
        km = temporal[metric]["kolors_reach"]["mean"]
        sm = temporal[metric]["source_reach"]["mean"]
        if km is None or sm is None or sm == 0:
            return None
        return (km - sm) / sm

    flick_reg = regress("flicker")
    halo_reg = regress("edge_halo")
    id_reg = regress("identity_drift_outside")

    # ---- garment-fidelity scorecard (Kolors garment, within reach) ----
    # Measure the Kolors navy stripe on the propagated composites within reach.
    kol_comp_dir = os.path.join(args.kolors_heavy, "composite")
    src_frames = [load_bgr(frame_path(args.source_frames, i), 480) for i in indices]
    measures = []
    for k in range(n):
        if abs(k - a_local) > reach:
            continue
        cp = os.path.join(kol_comp_dir, f"frame_{k:05d}.png")
        if not os.path.exists(cp):
            continue
        comp = load_bgr(cp)
        gm = derive_heuristic(src_frames[k]).garment_union(comp.shape)
        measures.append(measure_stripe(comp, gm, index=k))
    fid = score_fidelity(measures, label="kolors_propagated_within_reach")

    # Also measure the frozen Kolors-only baseline stripe (single frame @134).
    frozen_kolors = load_bgr(os.path.join(args.frozen, "kolors_keyframe_00134.jpg"), 480)
    fk_mask = derive_heuristic(frozen_kolors).garment_union(frozen_kolors.shape)
    frozen_kolors_stripe = measure_stripe(frozen_kolors, fk_mask, index=args.anchor_index)

    # ---- frozen-baseline grid (non-negotiable #2) ----
    from .review import skin_occlusion_timeline, source_motion_timeline
    motion = source_motion_timeline(src_frames)
    occ = skin_occlusion_timeline(src_frames)
    worst_pose = int(np.argmax(motion))
    worst_occ = int(np.argmax(occ))
    frozen_grok = load_bgr(os.path.join(args.frozen, "grok_anchor_frame_00134.jpg"), 480)
    hard = _dedup([(0, "start"), (worst_pose, f"WORST POSE #{worst_pose}"),
                   (a_local, f"ANCHOR #{a_local}=f134"),
                   (worst_flick_k, f"WORST FLICKER #{worst_flick_k}"),
                   (worst_occ, f"WORST OCCL #{worst_occ}"), (n - 1, "end")])
    rows = []
    for idx, lab in hard:
        s = src_frames[idx].copy()
        cv2.rectangle(s, (0, 0), (s.shape[1], 22), (0, 0, 0), -1)
        cv2.putText(s, lab[:32], (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 230, 255), 1, cv2.LINE_AA)
        kc = os.path.join(kol_comp_dir, f"frame_{idx:05d}.png")
        rows.append({
            "source": s,
            "FROZEN kolors@134": (frozen_kolors if idx == a_local else None),
            "FROZEN grok@134": (frozen_grok if idx == a_local else None),
            "stageA(Kolors prop)": load_bgr(kc) if os.path.exists(kc) else None,
        })
    os.makedirs(args.out, exist_ok=True)
    build_sidebyside(rows, ["source", "FROZEN kolors@134", "FROZEN grok@134", "stageA(Kolors prop)"],
                     os.path.join(args.out, "stage_a_gate_grid.png"), tile_w=200)

    # ---- verdicts ----
    TOL = 0.15
    severe = []
    if reach < n // 2:
        severe.append(f"single-anchor reach only ±{reach} of ±{args.half_window} frames — "
                      f"garment smears badly beyond it (worst flicker frame #{worst_flick_k}={worst_flick_val:.1f})")
    temporal_regressions = []
    for name, val in [("flicker", flick_reg), ("edge_halo", halo_reg), ("identity_drift", id_reg)]:
        if val is not None and val > TOL:
            temporal_regressions.append(f"{name} +{val*100:.0f}% vs source-anchor baseline")

    # Temporal verdict: within reach Kolors must not regress vs source stand-in.
    if temporal_regressions:
        temporal_verdict = "FAIL"
    elif severe:
        # machinery is stable where the single anchor reaches, but the stage
        # cannot claim whole-clip stability on a real base.
        temporal_verdict = "INCOMPLETE (stable within reach; whole-clip BLOCKED on per-frame Kolors base)"
    else:
        temporal_verdict = "PASS (within reach)"

    fidelity_verdict = ("DEFERRED — Stage A introduces no Grok; baseline garment-fidelity numbers recorded "
                        "(this is the Kolors-only floor Stage B must beat).")

    blocked = [
        "real per-frame Kolors base — frozen set has ONE Kolors frame (134); needs Kolors VTON per-frame "
        "via Fal fal-ai/kling/v1-5/kolors-virtual-try-on (edge/Fal deploy). WITHOUT it, whole-clip Stage A "
        "cannot be run and single-anchor reach caps stable coverage at ±%d frames." % reach,
        "real SAM-3 masks — none frozen; needs sam3-segment-proxy / fal-ai/sam-3/video. Garment/sleeve/collar "
        "boundaries here are COARSE heuristic; occlusion-correctness + edge-crawl claims inherit that.",
    ]

    overall = ("STAGE A DOES NOT PASS — required inputs (per-frame Kolors base, SAM masks) are BLOCKED and the "
               "runnable single-anchor substitute exhibits a severe beyond-reach garment failure. Do NOT "
               "introduce Grok / proceed to Stage B until the real per-frame Kolors base + SAM masks are wired.")

    out = {
        "stage": "A",
        "question": "does the machinery remain stable on ACTUAL Kolors output (no regression)?",
        "window": [indices[0], indices[-1]],
        "anchor_frame": args.anchor_index,
        "single_anchor_reach_frames": reach,
        "temporal_scorecard": temporal,
        "regression_vs_source_anchor": {"flicker": flick_reg, "edge_halo": halo_reg, "identity_drift": id_reg,
                                        "tolerance": TOL},
        "worst_flicker_frame": {"local": worst_flick_k, "source_index": indices[worst_flick_k], "value": worst_flick_val},
        "severe_failures": severe,
        "temporal_verdict": temporal_verdict,
        "garment_fidelity_scorecard": {
            "kolors_propagated_within_reach": fid.as_dict(),
            "frozen_kolors_at_anchor": {
                "stripe_width_norm": round(frozen_kolors_stripe.width_norm, 4),
                "stripe_cy_norm": round(frozen_kolors_stripe.cy_norm, 4),
                "present": frozen_kolors_stripe.present,
            },
        },
        "fidelity_verdict": fidelity_verdict,
        "blocked": blocked,
        "overall": overall,
    }
    with open(os.path.join(args.out, "stage_a_gate.json"), "w") as f:
        json.dump(out, f, indent=2)
    _write(os.path.join(args.out, "STAGE_A_GATE.md"), out)
    print("[gate] temporal_verdict:", temporal_verdict)
    print("[gate] regression vs source-anchor (within reach):",
          {k: (None if v is None else round(v, 3)) for k, v in
           [("flicker", flick_reg), ("edge_halo", halo_reg), ("identity_drift", id_reg)]})
    print("[gate] severe:", severe)
    print("[gate] overall:", overall)
    return 0


def _dedup(items):
    seen, out = set(), []
    for idx, lab in items:
        if idx not in seen:
            seen.add(idx)
            out.append((idx, lab))
    return out


def _write(path, o):
    L = []
    L.append("# STAGE A — HARD GATE\n")
    L.append(f"**Question (Stage A only):** {o['question']}\n")
    L.append(f"> **OVERALL: {o['overall']}**\n")
    L.append("## Two independent verdicts (never averaged)\n")
    L.append(f"- **Temporal:** {o['temporal_verdict']}")
    L.append(f"- **Garment-fidelity:** {o['fidelity_verdict']}\n")
    L.append("## Controlled head-to-head (Kolors anchor vs source-stand-in anchor)\n")
    L.append("Identical window, masks, single-anchor structure — only the anchor CONTENT differs, so the "
             "delta isolates the Kolors effect (single-anchor decay is common-mode and cancels).\n")
    L.append(f"Window {o['window'][0]}..{o['window'][1]}, anchor frame {o['anchor_frame']}, "
             f"single-anchor reach ±{o['single_anchor_reach_frames']} frames.\n")
    L.append("| metric (within reach) | Kolors | source-anchor | regression |")
    L.append("|---|---|---|---|")
    t = o["temporal_scorecard"]
    reg = o["regression_vs_source_anchor"]
    for key, rk in [("flicker", "flicker"), ("edge_halo", "edge_halo"),
                    ("identity_drift_outside", "identity_drift")]:
        km = t[key]["kolors_reach"]["mean"]
        sm = t[key]["source_reach"]["mean"]
        rv = reg.get(rk)
        rs = "n/a" if rv is None else f"{rv*100:+.0f}%"
        L.append(f"| {key} | {km} | {sm} | {rs} (tol ±{int(reg['tolerance']*100)}%) |")
    L.append("")
    L.append("## Severe failures (NOT averaged away)\n")
    if o["severe_failures"]:
        for s in o["severe_failures"]:
            L.append(f"- ❌ {s}")
    else:
        L.append("- none")
    wf = o["worst_flicker_frame"]
    L.append(f"\n**Worst garment-flicker frame:** local #{wf['local']} (source #{wf['source_index']}), "
             f"value {wf['value']:.1f}. See grid.\n")
    L.append("## Garment-fidelity scorecard (NEW benchmark axis)\n")
    fd = o["garment_fidelity_scorecard"]["kolors_propagated_within_reach"]
    L.append("| component | value | notes |")
    L.append("|---|---|---|")
    L.append(f"| stripe_width_variance (CV) | {fd['stripe_width_variance']} | auto; lower=steadier thickness |")
    L.append(f"| stripe_position_variance (std, norm) | {fd['stripe_position_variance']} | auto; lower=less swim |")
    L.append(f"| stripe_x_variance (std, norm) | {fd['stripe_x_variance']} | auto |")
    L.append(f"| stripe_presence_rate | {fd['stripe_presence_rate']} | auto |")
    L.append(f"| logo_alignment | {fd['logo_alignment']} | {fd['methods']['logo_alignment']} |")
    L.append(f"| logo_legibility | {fd['logo_legibility']} | {fd['methods']['logo_legibility']} |")
    L.append(f"| zipper_alignment | {fd['zipper_alignment']} | {fd['methods']['zipper_alignment']} |")
    L.append(f"| collar_geometry | {fd['collar_geometry']} | {fd['methods']['collar_geometry']} |")
    fk = o["garment_fidelity_scorecard"]["frozen_kolors_at_anchor"]
    L.append(f"\nFrozen Kolors@134 stripe (baseline floor): width_norm={fk['stripe_width_norm']}, "
             f"cy_norm={fk['stripe_cy_norm']}.\n")
    L.append("These are the Kolors-only fidelity floor; Stage B must MEASURABLY beat them.\n")
    L.append("## Frozen-baseline grid (literal artifacts, non-negotiable #2)\n")
    L.append("![stage A gate grid](stage_a_gate_grid.png)\n")
    L.append("Columns: source · FROZEN kolors@134 · FROZEN grok@134 · stageA(Kolors propagated). "
             "Frozen columns are the literal `benchmark_frozen_2026-08-01/` artifacts (real only at frame 134).\n")
    L.append("## Blocked inputs (with compute path)\n")
    for b in o["blocked"]:
        L.append(f"- ⛔ {b}")
    L.append("")
    with open(path, "w") as f:
        f.write("\n".join(L))


if __name__ == "__main__":
    raise SystemExit(main())
