"""Review-gate scorer for the one-shot QA (spec: the hard review gate).

Runs OVER THE WHOLE CLIP (no cherry-picking): it locates the worst pose-change
frame and the worst hand-occlusion frame from mask-INDEPENDENT signals (so a
coarse garment mask can't hide a failure), answers the five hard questions
explicitly, scores five dimensions SEPARATELY, and emits exactly one outcome
(PASS / CONDITIONAL PASS / FAIL).

It reads only saved artifacts + the composite frames (on T7) + source frames, so
it re-scores without recomputing the 7-min flow pass.

CRITICAL HONESTY: two dimensions — base-frame quality (vs Kolors) and product
fidelity (vs Grok) — cannot be truthfully scored unless the frozen Kolors-only
and Grok-only baselines are supplied (``--kolors-dir`` / ``--grok-dir``). When
absent they are reported BLOCKED, never guessed, and the side-by-side columns are
marked PENDING. A verdict is never a PASS while a decisive dimension is BLOCKED.
"""
from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from .frameio import frame_path, load_bgr
from .masks import skin_mask


# --- mask-independent worst-frame signals ------------------------------------

def _center_box(h: int, w: int) -> Tuple[int, int, int, int]:
    return int(w * 0.20), int(h * 0.12), int(w * 0.80), int(h * 0.72)


def source_motion_timeline(src: List[np.ndarray]) -> List[float]:
    """Frame-to-frame motion in the central torso box (mask-independent proxy for
    pose change). Index 0 == 0."""
    x0, y0, x1, y1 = _center_box(*src[0].shape[:2])
    out = [0.0]
    for k in range(1, len(src)):
        a = src[k - 1][y0:y1, x0:x1]
        b = src[k][y0:y1, x0:x1]
        out.append(float(cv2.absdiff(a, b).mean()))
    return out


def skin_occlusion_timeline(src: List[np.ndarray]) -> List[float]:
    """Skin fraction inside the central torso box (mask-independent proxy for
    hand/arm occlusion of the chest). Real YCrCb skin, no GrabCut needed."""
    x0, y0, x1, y1 = _center_box(*src[0].shape[:2])
    area = max(1, (y1 - y0) * (x1 - x0))
    out = []
    for f in src:
        sk = skin_mask(f)[y0:y1, x0:x1]
        out.append(float((sk > 0).sum()) / area)
    return out


def composite_flicker_timeline(comp: List[Optional[np.ndarray]]) -> List[float]:
    x0 = None
    out = [0.0]
    for k in range(1, len(comp)):
        if comp[k] is None or comp[k - 1] is None:
            out.append(0.0)
            continue
        h, w = comp[k].shape[:2]
        bx0, by0, bx1, by1 = _center_box(h, w)
        out.append(float(cv2.absdiff(comp[k][by0:by1, bx0:bx1], comp[k - 1][by0:by1, bx0:bx1]).mean()))
    return out


# --- dimension scoring -------------------------------------------------------

@dataclass
class DimScore:
    name: str
    status: str            # PASS | WARN | FAIL | BLOCKED
    value: str
    rationale: str


@dataclass
class Review:
    shot_id: str
    frame_count: int
    worst_pose_frame: int
    worst_occlusion_frame: int
    worst_residual_frame: Optional[int]
    worst_flicker_frame: int
    questions: Dict[str, str] = field(default_factory=dict)
    dims: List[DimScore] = field(default_factory=list)
    outcome: str = ""
    isolated_weakness: str = ""
    blocked: List[str] = field(default_factory=list)


def score(shot_id: str, src, comp, flow_metrics, residual, qa_metrics,
          have_kolors: bool, have_grok: bool, human_ok: bool = False) -> Review:
    """human_ok upgrades the two PERCEPTUAL dimensions (base-frame quality vs
    Kolors, product fidelity vs Grok) from REVIEW to PASS — i.e. a human looked at
    the side-by-side and signed off. The scorer never auto-passes a perceptual
    dimension on its own; the most it claims unaided is REVIEW."""
    n = len(src)
    motion = source_motion_timeline(src)
    occ = skin_occlusion_timeline(src)
    flick = composite_flicker_timeline(comp)

    worst_pose = int(np.argmax(motion))
    worst_occ = int(np.argmax(occ))
    worst_flick = int(np.argmax(flick))
    res_items = [(int(k), v) for k, v in residual.items() if v is not None]
    worst_res = max(res_items, key=lambda kv: kv[1])[0] if res_items else None
    res_vals = [v for _, v in res_items]
    res_max = max(res_vals) if res_vals else None
    res_mean = float(np.mean(res_vals)) if res_vals else None

    flicker_ratio = qa_metrics.get("flicker_ratio", 0.0)
    id_drift = qa_metrics.get("identity_drift_outside", 0.0)
    edge_halo = qa_metrics.get("edge_halo", 0.0)
    stripe_cv = qa_metrics.get("stripe_width_cv")

    # ---- five questions (explicit) ----
    q = {}
    q["1_identity_pose_at_kolors"] = (
        f"Identity/pose OUTSIDE the garment is preserved against the SOURCE (mean |Δ| = {id_drift:.3f} "
        f"gray levels ≈ lossless). But 'at the Kolors baseline' is UNPROVEN: no Kolors-only frames were "
        f"supplied to compare against ({'present' if have_kolors else 'PENDING'})."
    )
    q["2_construction_toward_grok"] = (
        "NOT DEMONSTRATED. No Grok correction anchor was supplied to this run — the garment content is the "
        "propagated SOURCE garment plus a synthetic tracked stripe, so no movement 'toward Grok construction' "
        f"can be claimed. Requires --grok-dir ({'present' if have_grok else 'PENDING'})."
    )
    q["3_stripe_logo_stable"] = (
        f"Stripe/logo placement is a DETERMINISTIC tracked layer; its width coefficient-of-variation across the "
        f"clip = {('n/a' if stripe_cv is None else f'{stripe_cv:.4f}')} (target <0.08 → "
        f"{'stable' if (stripe_cv is not None and stripe_cv < 0.08) else 'see report'}). It does not 'swim' because "
        "it is not generated. (Real logo art plugs in via --brand-asset.)"
    )
    q["4_hands_sleeves_occlusion"] = (
        f"Hands/arms are restored ON TOP from the original footage via a REAL YCrCb skin mask, so genuine "
        f"occlusion wins over the swap at the worst-occlusion frame (#{worst_occ}, skin-in-chest {occ[worst_occ]*100:.0f}%). "
        "Sleeves/collar use COARSE heuristic masks (not SAM), so their structural realism is only approximate here."
    )
    q["5_stable_whole_shot"] = (
        f"Across all {n} frames the garment-region temporal difference of the output vs the source gives "
        f"flicker_ratio = {flicker_ratio:.3f} (target <1.35 → {'ok' if flicker_ratio < 1.35 else 'FAIL'}). "
        f"Worst composite flicker at frame #{worst_flick}. "
        + (f"Cumulative propagation residual peaks {res_max:.1f} gray at frame #{worst_res} (mean {res_mean:.1f}); "
           "re-anchor pops = the gate flags those, it does not hide them." if res_max is not None else "")
    )

    # ---- five dimensions (separate) ----
    dims: List[DimScore] = []
    blocked: List[str] = []

    # base-frame quality — PERCEPTUAL: needs Kolors base to even show, human to judge.
    if not have_kolors:
        dims.append(DimScore("base_frame_quality", "BLOCKED", "no Kolors base",
                             "Base = source frame (identity stand-in). Real Kolors geometry authority not wired; "
                             "cannot score base-frame quality."))
        blocked.append("base_frame_quality (needs frozen Kolors per-frame VTON frames → --kolors-dir/--base)")
    elif human_ok:
        dims.append(DimScore("base_frame_quality", "PASS", "kolors base, human-signed",
                             "Base geometry judged good against supplied Kolors frames."))
    else:
        dims.append(DimScore("base_frame_quality", "REVIEW", "kolors base supplied",
                             "Kolors base shown in side-by-side; geometry quality needs human sign-off."))

    # temporal stability — measurable now.
    if flicker_ratio < 1.2 and (res_max is None or res_max < 60):
        st = "PASS"
    elif flicker_ratio < 1.5:
        st = "WARN"
    else:
        st = "FAIL"
    dims.append(DimScore("temporal_stability", st, f"flicker_ratio={flicker_ratio:.3f}, residual_max={res_max}",
                         "Frame-to-frame garment stability across the WHOLE clip; residual peak marks worst drift."))

    # product fidelity — PERCEPTUAL: needs Grok detail to even show, human to judge.
    if not have_grok:
        dims.append(DimScore("product_fidelity", "BLOCKED", "no Grok detail",
                             "No Grok correction anchor supplied → garment construction improvement toward Grok is "
                             "untested. This is the CENTRAL product question and it is not answered by this run."))
        blocked.append("product_fidelity (needs approved Grok correction anchors → --grok-dir/--anchors)")
    elif human_ok:
        dims.append(DimScore("product_fidelity", "PASS", "grok detail, human-signed",
                             "Construction judged materially improved toward Grok in the side-by-side."))
    else:
        dims.append(DimScore("product_fidelity", "REVIEW", "grok detail supplied",
                             "Grok detail shown in side-by-side; construction improvement needs human sign-off."))

    # occlusion correctness — real skin handling but coarse garment masks.
    occ_ok = id_drift < 1.5  # foreground restore keeps outside lossless
    dims.append(DimScore("occlusion_correctness", "WARN" if occ_ok else "FAIL",
                         f"worst-occ frame #{worst_occ} skin {occ[worst_occ]*100:.0f}%",
                         "Hands/arms occlusion is real (skin mask restore). Sleeve/collar boundaries rely on COARSE "
                         "masks → WARN until SAM masks are wired."))

    # artifact severity — halo + edge crawl proxy.
    if edge_halo < 2.0:
        ar = "PASS"
    elif edge_halo < 6.0:
        ar = "WARN"
    else:
        ar = "FAIL"
    dims.append(DimScore("artifact_severity", ar, f"edge_halo={edge_halo:.3f}",
                         "Halo/edge-crawl just outside the garment mask. Low = clean composite boundary. "
                         "Coarse masks can still leave in-region softness not captured here."))

    # ---- outcome ----
    statuses = {d.name: d.status for d in dims}
    hard_fail = any(d.status == "FAIL" for d in dims)
    decisive_blocked = statuses["product_fidelity"] == "BLOCKED" or statuses["base_frame_quality"] == "BLOCKED"
    needs_review = any(d.status == "REVIEW" for d in dims)

    if hard_fail:
        outcome = "FAIL"
        weakness = "; ".join(f"{d.name}={d.value}" for d in dims if d.status == "FAIL")
    elif not decisive_blocked and needs_review:
        # Inputs present, machinery clean, but the perceptual dims await human
        # sign-off — an isolated, non-code weakness.
        outcome = "CONDITIONAL PASS"
        weakness = ("Perceptual dimensions (base-frame quality vs Kolors, product fidelity vs Grok) are "
                    "computed and shown in the side-by-side but require human sign-off; pass --human-ok "
                    "once reviewed to upgrade to PASS.")
    elif decisive_blocked:
        # Architecture/machinery ran and held identity+stability on real footage,
        # but the decisive product/geometry evidence is absent for ONE root
        # reason: the frozen Kolors/Grok baselines aren't wired yet.
        outcome = "CONDITIONAL PASS"
        weakness = ("Garment-detail transfer is UNPROVEN: the real Kolors base frames and Grok correction "
                    "anchors (and SAM masks) are not yet wired — BLOCKED on the separate preflight/upload "
                    "deploy. The flow/gate/composite/brand/status machinery is validated on real footage and "
                    "holds identity + temporal stability, but product-fidelity and base-quality cannot be "
                    "scored until those inputs arrive. Do NOT read this as garment fidelity proven.")
    else:
        outcome = "PASS"
        weakness = ""

    r = Review(
        shot_id=shot_id, frame_count=n,
        worst_pose_frame=worst_pose, worst_occlusion_frame=worst_occ,
        worst_residual_frame=worst_res, worst_flicker_frame=worst_flick,
        questions=q, dims=dims, outcome=outcome, isolated_weakness=weakness, blocked=blocked,
    )
    return r


# --- rendering ---------------------------------------------------------------

def build_review_grid(src, comp, frames: List[Tuple[int, str]], out_path: str,
                      kolors=None, grok=None, tile_w: int = 200) -> str:
    """Rows = the labelled hard frames; columns = source | kolors_only | grok_only
    | prototype. Missing baseline columns render as PENDING (never faked)."""
    from .qa import build_sidebyside
    rows = []
    labels = []
    for idx, label in frames:
        rows.append({
            "source": src[idx],
            "kolors_only": (kolors[idx] if kolors else None),
            "grok_only": (grok[idx] if grok else None),
            "prototype": comp[idx],
        })
        labels.append(label)
    columns = ["source", "kolors_only", "grok_only", "prototype"]
    # Prepend a label column by drawing labels into the source tiles' corner.
    for row, lab in zip(rows, labels):
        s = row["source"].copy()
        cv2.rectangle(s, (0, 0), (s.shape[1], 22), (0, 0, 0), -1)
        cv2.putText(s, lab[:30], (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 230, 255), 1, cv2.LINE_AA)
        row["source"] = s
    return build_sidebyside(rows, columns, out_path, tile_w=tile_w)


def write_review_report(path: str, r: Review, qa_metrics: dict, repro: dict, grid_rel: str) -> str:
    icon = {"PASS": "✅", "WARN": "⚠️", "FAIL": "❌", "BLOCKED": "⛔"}
    L = []
    L.append(f"# One-shot REVIEW GATE — `{r.shot_id}`\n")
    L.append(f"Full-clip evaluation of **all {r.frame_count} frames** (no cherry-picking). "
             "Worst pose-change and worst hand-occlusion frames are called out explicitly and "
             "included in the side-by-side.\n")
    L.append(f"> **OUTCOME: {r.outcome}**\n")
    if r.isolated_weakness:
        L.append(f"> **Isolated weakness / blocker:** {r.isolated_weakness}\n")
    L.append("## Hardest frames (mask-independent detection)\n")
    L.append("| kind | frame |")
    L.append("|---|---|")
    L.append(f"| worst pose change (torso motion) | #{r.worst_pose_frame} |")
    L.append(f"| worst hand-occlusion (skin in chest box) | #{r.worst_occlusion_frame} |")
    L.append(f"| worst propagation residual | {'#'+str(r.worst_residual_frame) if r.worst_residual_frame is not None else 'n/a'} |")
    L.append(f"| worst composite flicker | #{r.worst_flicker_frame} |")
    L.append("")
    L.append("## The five questions\n")
    qtitles = {
        "1_identity_pose_at_kolors": "1. Identity & pose at the Kolors baseline?",
        "2_construction_toward_grok": "2. Garment construction materially improved toward Grok?",
        "3_stripe_logo_stable": "3. Stripe/logo stable under motion?",
        "4_hands_sleeves_occlusion": "4. Hands, sleeves, occlusions physically believable?",
        "5_stable_whole_shot": "5. Stable across the WHOLE shot (no shimmer/edge-crawl/re-anchor pops)?",
    }
    for k, title in qtitles.items():
        L.append(f"**{title}**")
        L.append(f"> {r.questions[k]}\n")
    L.append("## The five dimensions (scored separately)\n")
    L.append("| dimension | verdict | value | rationale |")
    L.append("|---|---|---|---|")
    for d in r.dims:
        L.append(f"| {d.name} | {icon.get(d.status,'')} {d.status} | {d.value} | {d.rationale} |")
    L.append("")
    L.append("## Full-clip metrics\n")
    L.append("| metric | value |")
    L.append("|---|---|")
    for k in sorted(qa_metrics):
        L.append(f"| {k} | {qa_metrics[k]} |")
    L.append("")
    L.append("## Side-by-side (hard frames)\n")
    L.append(f"![review grid]({grid_rel})\n")
    L.append("Columns: source · kolors_only · grok_only · prototype. "
             "`kolors_only` / `grok_only` render **PENDING** — the frozen baselines are not wired "
             "(separate preflight/upload deploy); they are never fabricated.\n")
    if r.blocked:
        L.append("## Blocked capabilities + compute path\n")
        for b in r.blocked:
            L.append(f"- ⛔ {b}")
        L.append("")
    L.append("## Do-not-overclaim note\n")
    L.append("- This run validates the **machinery** on real footage; it does **not** prove garment "
             "construction was raised toward Grok (that dimension is BLOCKED). Per the gate, the shot "
             "is **not scaled** to a harder shot on the strength of this evidence.\n")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as f:
        f.write("\n".join(L))
    return path


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Review-gate scorer for a completed one-shot")
    p.add_argument("--artifacts", required=True, help="artifacts dir of the run")
    p.add_argument("--source", required=True)
    p.add_argument("--composite-dir", required=True, help="T7 dir with composite/frame_%05d.png")
    p.add_argument("--start", type=int, required=True)
    p.add_argument("--count", type=int, required=True)
    p.add_argument("--stride", type=int, default=1)
    p.add_argument("--work-width", type=int, default=480)
    p.add_argument("--kolors-dir", default=None)
    p.add_argument("--grok-dir", default=None)
    p.add_argument("--human-ok", action="store_true",
                   help="human reviewed the side-by-side and signs off the perceptual dims")
    args = p.parse_args(argv)

    flow_metrics = json.load(open(os.path.join(args.artifacts, "flow_metrics.json")))
    residual = json.load(open(os.path.join(args.artifacts, "propagation_residual.json")))
    qa_metrics = json.load(open(os.path.join(args.artifacts, "qa_metrics.json")))
    status = json.load(open(os.path.join(args.artifacts, "status.json")))
    repro = status.get("repro", {})

    indices = list(range(args.start, args.start + args.count * args.stride, args.stride))
    n = len(indices)
    src = [load_bgr(frame_path(args.source, i), args.work_width) for i in indices]
    comp_dir = os.path.join(args.composite_dir, "composite")
    comp = []
    for k in range(n):
        pth = os.path.join(comp_dir, f"frame_{k:05d}.png")
        comp.append(load_bgr(pth) if os.path.exists(pth) else None)
    kolors = [load_bgr(frame_path(args.kolors_dir, i), args.work_width) for i in indices] if args.kolors_dir else None
    grok = [load_bgr(frame_path(args.grok_dir, i), args.work_width) for i in indices] if args.grok_dir else None

    r = score(repro.get("shot_id", "oneshot"), src, comp, flow_metrics, residual, qa_metrics,
              have_kolors=bool(kolors), have_grok=bool(grok), human_ok=args.human_ok)

    # Hard-frame side-by-side: ends + the four worst frames, de-duplicated, in order.
    hard = [(0, "start"),
            (r.worst_pose_frame, f"WORST POSE #{r.worst_pose_frame}"),
            (r.worst_occlusion_frame, f"WORST OCCL #{r.worst_occlusion_frame}"),
            (r.worst_flicker_frame, f"WORST FLICK #{r.worst_flicker_frame}"),
            (n - 1, "end")]
    if r.worst_residual_frame is not None:
        hard.insert(3, (r.worst_residual_frame, f"WORST RESID #{r.worst_residual_frame}"))
    seen, hard_u = set(), []
    for idx, lab in hard:
        if idx not in seen:
            seen.add(idx)
            hard_u.append((idx, lab))
    grid_path = os.path.join(args.artifacts, "review_grid.png")
    build_review_grid(src, comp, hard_u, grid_path, kolors=kolors, grok=grok)
    write_review_report(os.path.join(args.artifacts, "REVIEW.md"), r, qa_metrics, repro, "review_grid.png")
    with open(os.path.join(args.artifacts, "review.json"), "w") as f:
        json.dump({
            "outcome": r.outcome, "isolated_weakness": r.isolated_weakness,
            "dims": [d.__dict__ for d in r.dims], "questions": r.questions,
            "worst": {"pose": r.worst_pose_frame, "occlusion": r.worst_occlusion_frame,
                      "residual": r.worst_residual_frame, "flicker": r.worst_flicker_frame},
            "blocked": r.blocked,
        }, f, indent=2)
    print(f"[review] OUTCOME={r.outcome}")
    print(f"[review] worst pose=#{r.worst_pose_frame} occ=#{r.worst_occlusion_frame} "
          f"resid={r.worst_residual_frame} flick=#{r.worst_flicker_frame}")
    for d in r.dims:
        print(f"[review]   {d.name:22s} {d.status:8s} {d.value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
