"""Orchestrator / CLI for the gated garment-detail propagation prototype.

ONE approved 2-4s shot. Wires: source load -> per-step dense flow +
occlusion/confidence -> region masks + brand track -> per-frame FlowMetrics ->
re-anchor GATE -> bidirectional anchor propagation -> region composite ->
persisted status + QA report + side-by-side.

Resumable: re-running skips frames already marked ``done`` in status.json.

Run:
    workers/.venv/bin/python -m workers.warp_worker.run \
        --source <frames_dir> --shot-id oneshot \
        --start 48 --count 120 --stride 1 --work-width 540 \
        --out-heavy <T7 dir> --out-artifacts workers/warp_worker/artifacts/oneshot
"""
from __future__ import annotations

import argparse
import json
import os
from typing import Dict, List, Optional

import cv2
import numpy as np

from . import __version__
from .brand import render_brand_layer, stripe_width_stability, synthetic_brand_asset, track_brand
from .config import GARMENT_REGIONS, WorkerConfig
from .composite import composite_frame, edge_halo_metric
from .flow import (
    estimate_rotation_deg,
    make_flow_engine,
    compute_consistency,
    region_confidence,
    region_occlusion_ratio,
)
from .frameio import ensure_dir, frame_path, load_bgr, load_gray, save_bgr
from .gate import Thresholds, plan_reanchors
from .interfaces import FlowMetrics, ShotSpec
from .keyframe_plan import assign_segments, plan_keyframes
from .masks import RegionMaskSet, derive_heuristic, load_mask_dir, region_geometry
from .qa import QAMetrics, build_sidebyside, identity_drift_outside, temporal_diff, write_report
from .status import (
    ANCHOR,
    BLOCKED_REANCHOR,
    DONE,
    FAILED,
    PROPAGATED,
    FrameStatus,
    JobStatus,
)
from .warp import blend_bidirectional, chain_flow, warp_anchor, warp_scalar


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Warp-worker gated propagation prototype (one shot)")
    p.add_argument("--source", required=True, help="dir of source frame_%05d.png")
    p.add_argument("--shot-id", default="oneshot")
    p.add_argument("--start", type=int, default=0)
    p.add_argument("--count", type=int, default=120)
    p.add_argument("--stride", type=int, default=1)
    p.add_argument("--work-width", type=int, default=540)
    p.add_argument("--cadence", type=int, default=18, help="anchor cadence (frames, clamped 12..24)")
    p.add_argument("--base", default=None, help="dir of BASE garment frames (Kolors); optional")
    p.add_argument("--anchors", default=None, help="JSON {index:path} of correction anchors; optional")
    p.add_argument("--mask-dir-json", default=None, help='JSON {region:dir} of provided masks; optional')
    p.add_argument("--brand-asset", default=None, help="RGBA brand asset PNG; else synthetic")
    p.add_argument("--out-heavy", required=True, help="dir for heavy per-frame outputs (T7)")
    p.add_argument("--out-artifacts", required=True, help="dir for committed small artifacts")
    p.add_argument("--sample-every", type=int, default=None, help="side-by-side sample cadence")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    cfg = WorkerConfig(work_width=args.work_width, cadence_frames=args.cadence)

    # Resolve the working frame index list.
    indices = list(range(args.start, args.start + args.count * args.stride, args.stride))
    n = len(indices)
    if n < 2:
        print("need >=2 frames")
        return 2

    spec = ShotSpec(
        shot_id=args.shot_id,
        frame_count=n,
        source_dir=args.source,
        base_dir=args.base,
        anchors=_load_json(args.anchors) or {},
        mask_dirs=_load_json(args.mask_dir_json) or {},
        brand_asset_path=args.brand_asset,
    )

    heavy = ensure_dir(args.out_heavy)
    art = ensure_dir(args.out_artifacts)
    comp_dir = ensure_dir(os.path.join(heavy, "composite"))

    status = JobStatus.load_or_create(os.path.join(art, "status.json"), spec.shot_id, n)
    repro = {
        "shot_id": spec.shot_id,
        "worker_version": __version__,
        "flow_engine": cfg.flow_engine,
        "work_width": cfg.work_width,
        "cadence_frames": cfg.clamp_cadence(),
        "source_dir": spec.source_dir,
        "source_index_start": args.start,
        "source_index_count": args.count,
        "source_index_stride": args.stride,
        "geometry_authority": cfg.geometry_authority,
        "detail_authority": cfg.detail_authority,
        "base_provided": bool(spec.base_dir),
        "anchors_provided": sorted(int(k) for k in spec.anchors) if spec.anchors else [],
        "masks_provided": sorted(spec.mask_dirs.keys()) if spec.mask_dirs else [],
        "brand_asset": "provided" if spec.brand_asset_path else "synthetic",
        "transfer_mode": "gated_flow_propagation_prototype",
    }
    status.set_repro(repro)
    status.flush()

    print(f"[load] {n} source frames @ width {cfg.work_width} ...")
    src_bgr: List[np.ndarray] = [load_bgr(frame_path(spec.source_dir, i), cfg.work_width) for i in indices]
    src_gray: List[np.ndarray] = [cv2.cvtColor(b, cv2.COLOR_BGR2GRAY) for b in src_bgr]
    H, W = src_bgr[0].shape[:2]
    base_bgr = None
    if spec.base_dir:
        base_bgr = [load_bgr(frame_path(spec.base_dir, i), cfg.work_width) for i in indices]

    # --- per-step flow + consistency (real DIS) -----------------------------
    print("[flow] forward/backward dense flow + fwd-bwd consistency ...")
    engine = make_flow_engine(cfg.flow_engine)
    step_bwd: List[Optional[np.ndarray]] = [None] * n   # step_bwd[k] = flow_{k -> k-1}
    step_fwd: List[Optional[np.ndarray]] = [None] * n   # step_fwd[k] = flow_{k -> k+1}
    conf_at: List[np.ndarray] = [np.ones((H, W), np.float32)] * n
    occ_at: List[np.ndarray] = [np.zeros((H, W), np.uint8)] * n
    for k in range(n - 1):
        cons = compute_consistency(engine, src_gray[k], src_gray[k + 1], cfg.fb_consistency_px)
        # flow_{k->k+1} = cons.flow_fwd ; flow_{k+1->k} = cons.flow_bwd
        step_fwd[k] = cons.flow_fwd
        step_bwd[k + 1] = cons.flow_bwd
        # confidence/occlusion for the transition attributed to frame k+1
        occ_at[k + 1] = cons.occlusion
        conf_at[k + 1] = cons.confidence

    # --- masks + brand geometry per frame -----------------------------------
    print("[masks] region masks + brand track ...")
    mask_sets: List[RegionMaskSet] = []
    geoms = []
    for k in range(n):
        ms = _masks_for(spec, indices[k], src_bgr[k], (H, W))
        mask_sets.append(ms)
        geoms.append(region_geometry(k, ms.get("torso", (H, W))))
    brand_track = track_brand(geoms, smooth=3)
    brand_asset = _load_brand_asset(spec.brand_asset_path)
    stripe_cv = stripe_width_stability(brand_track)

    # --- per-frame FlowMetrics -> gate --------------------------------------
    print("[gate] per-frame FlowMetrics + re-anchor decision ...")
    metrics: List[FlowMetrics] = []
    for k in range(n):
        gmask = mask_sets[k].garment_union((H, W))
        fmask = mask_sets[k].get("hands_arms", (H, W))
        conf = region_confidence(conf_at[k], gmask)
        # occlusion of garment specifically by the foreground (hands/arms).
        occ_by_fg = float(((fmask > 0) & (gmask > 0)).sum() / max(1, (gmask > 0).sum()))
        occ_flow = region_occlusion_ratio(occ_at[k], gmask)
        occ = max(occ_by_fg, occ_flow)
        rot = estimate_rotation_deg(src_gray[k - 1], src_gray[k], None) if k > 0 else 0.0
        metrics.append(FlowMetrics(index=k, confidence=conf, rotationDeg=rot, occlusionRatio=occ))

    # Anchors: provided indices (mapped into local space) + cadence ends.
    forced = _provided_anchor_local_indices(spec, indices)
    keyframes = plan_keyframes(n, cfg.clamp_cadence(), forced_anchors=forced)
    gate = plan_reanchors(
        metrics,
        existing_keyframes=keyframes,
        t=Thresholds(cfg.min_confidence, cfg.max_rotation_deg, cfg.max_occlusion_ratio),
    )
    status.set_reanchor(gate.reanchor_at, gate.reasons)
    segments = assign_segments(keyframes, n)
    anchor_imgs = _anchor_images(spec, indices, src_bgr, keyframes, cfg.work_width)
    with open(os.path.join(art, "flow_metrics.json"), "w") as f:
        json.dump([m.to_json() for m in metrics], f, indent=2)
    print(f"[gate] anchors={keyframes}  gate_reanchor_at={gate.reanchor_at}")

    # --- composite each frame ----------------------------------------------
    print("[composite] propagate + composite ...")
    composites: List[Optional[np.ndarray]] = [None] * n
    prop_residual: List[Optional[float]] = [None] * n   # anchor-warp vs truth
    for seg in segments:
        k = seg.index
        if status.is_done(k):
            composites[k] = load_bgr(os.path.join(comp_dir, f"frame_{k:05d}.png"))
            continue
        fs = FrameStatus(index=k)
        try:
            garment = _propagate_garment(
                seg, k, anchor_imgs, base_bgr, src_bgr, step_bwd, step_fwd, conf_at, keyframes
            )
            if garment is None:
                # gate says re-anchor here and no anchor covers -> BLOCK, do not fake.
                fs.status = BLOCKED_REANCHOR
                fs.reasons = gate.reasons.get(k, ["flow_break"])
                status.set_frame(fs)
                status.flush()
                continue
            ms = mask_sets[k]
            gmask = ms.garment_union((H, W))
            fmask = ms.get("hands_arms", (H, W))
            # Cumulative-propagation residual: how far the anchor-warped garment
            # is from the TRUE frame inside the garment region. This is the honest
            # trust signal the second-pass gate uses (per-step flow can't see it).
            if not seg.is_keyframe:
                gm = gmask > 0
                if gm.any():
                    d = cv2.absdiff(garment, src_bgr[k]).astype(np.float32).mean(axis=2)
                    prop_residual[k] = float(d[gm].mean())
            brand_layer = render_brand_layer(H, W, brand_track[k], brand_asset)
            comp = composite_frame(
                source_bgr=src_bgr[k],
                garment_bgr=garment,
                garment_mask=gmask,
                foreground_mask=fmask,
                brand_layer_rgba=brand_layer,
                patch_mask=gmask,  # suppress original patch across whole garment region
                feather_px=cfg.feather_px,
            )
            out_path = save_bgr(os.path.join(comp_dir, f"frame_{k:05d}.png"), comp)
            composites[k] = comp
            fs.status = DONE
            fs.kind = ANCHOR if seg.is_keyframe else PROPAGATED
            fs.artifacts = {"composite": out_path}
            status.set_frame(fs)
        except Exception as e:  # per-frame failure never kills the job
            fs.status = FAILED
            fs.attempts += 1
            fs.error = f"{type(e).__name__}: {e}"[:200]
            status.set_frame(fs)
        status.flush()

    # --- second-pass gate on CUMULATIVE propagation residual ----------------
    # The re-anchor LOOP (arch §3 step 3): now that propagation has run, convert
    # each intermediate frame's residual into a confidence and re-run the SAME
    # gate. Frames it flags are where warping from the bracketing anchors has
    # drifted too far and a fresh anchor is required — the signal per-step flow
    # could not provide.
    resid_metrics: List[FlowMetrics] = []
    for k in range(n):
        r = prop_residual[k]
        if r is None:
            continue
        conf = max(0.0, min(1.0, 1.0 - r / cfg.residual_conf_scale))
        resid_metrics.append(FlowMetrics(index=k, confidence=conf, occlusionRatio=metrics[k].occlusionRatio))
    gate2 = plan_reanchors(
        resid_metrics,
        existing_keyframes=keyframes,
        t=Thresholds(cfg.min_confidence, cfg.max_rotation_deg, cfg.max_occlusion_ratio),
    )
    # Merge both gate passes; record which frames the loop would re-anchor next.
    all_reanchor = sorted(set(gate.reanchor_at) | set(gate2.reanchor_at))
    merged_reasons = dict(gate.reasons)
    merged_reasons.update(gate2.reasons)
    status.set_reanchor(all_reanchor, merged_reasons)
    with open(os.path.join(art, "propagation_residual.json"), "w") as f:
        json.dump({str(k): (None if prop_residual[k] is None else round(prop_residual[k], 3))
                   for k in range(n)}, f, indent=2)
    print(f"[gate2] residual-based reanchor_at={gate2.reanchor_at}")

    # --- QA -----------------------------------------------------------------
    print("[qa] metrics + side-by-side ...")
    qa = _qa_pass(src_bgr, composites, mask_sets, (H, W), all_reanchor, stripe_cv, prop_residual)
    sample_every = args.sample_every or max(1, n // 6)
    rows = []
    for k in range(0, n, sample_every):
        if composites[k] is None:
            continue
        rows.append({
            "source": src_bgr[k],
            "prototype": composites[k],
            "kolors_only": (base_bgr[k] if base_bgr else None),
            "grok_only": None,
        })
    columns = ["source", "kolors_only", "grok_only", "prototype"]
    grid_path = os.path.join(art, "sidebyside.png")
    build_sidebyside(rows, columns, grid_path)
    cols_present = {"source": True, "kolors_only": bool(base_bgr), "grok_only": False, "prototype": True}
    write_report(os.path.join(art, "qa_report.md"), qa, repro, cols_present, "sidebyside.png")

    # a few small sample composites for the repo
    sdir = ensure_dir(os.path.join(art, "samples"))
    for k in range(0, n, sample_every):
        if composites[k] is not None:
            small = cv2.resize(composites[k], (270, int(270 * H / W)), interpolation=cv2.INTER_AREA)
            save_bgr(os.path.join(sdir, f"frame_{k:05d}.png"), small)

    status.rollup()
    status.flush()
    with open(os.path.join(art, "qa_metrics.json"), "w") as f:
        json.dump(qa.as_dict(), f, indent=2)
    print(f"[done] rollup={status.data['rollup']}")
    print(f"[done] artifacts -> {art}")
    return 0


# --- helpers -----------------------------------------------------------------

def _load_json(path):
    if not path:
        return None
    with open(path) as f:
        raw = json.load(f)
    return {int(k) if str(k).lstrip("-").isdigit() else k: v for k, v in raw.items()} if isinstance(raw, dict) else raw


def _masks_for(spec: ShotSpec, src_index: int, bgr, shape) -> RegionMaskSet:
    if spec.mask_dirs:
        masks = {}
        provided = 0
        for region, d in spec.mask_dirs.items():
            m = load_mask_dir(d, src_index, shape)
            if m is not None:
                masks[region] = m
                provided += 1
        if provided:
            from .config import ALL_REGIONS
            missing = [r for r in ALL_REGIONS if r not in masks]
            if missing:
                # fill only the missing regions heuristically
                heur = derive_heuristic(bgr)
                for r in missing:
                    if r in heur.masks:
                        masks[r] = heur.masks[r]
            return RegionMaskSet(masks=masks, source="mixed" if missing else "provided")
    return derive_heuristic(bgr)


def _provided_anchor_local_indices(spec: ShotSpec, indices: List[int]) -> List[int]:
    if not spec.anchors:
        return []
    pos = {src: k for k, src in enumerate(indices)}
    out = []
    for src_idx in spec.anchors:
        if int(src_idx) in pos:
            out.append(pos[int(src_idx)])
    return out


def _anchor_images(spec, indices, src_bgr, keyframes, work_width) -> Dict[int, np.ndarray]:
    """Anchor garment images by LOCAL index. Provided anchor path if given, else
    the source frame at that index (identity anchor — the honest one-shot
    stand-in when no external Grok/Kolors correction artifact is supplied)."""
    pos = {src: k for k, src in enumerate(indices)}
    provided = {}
    if spec.anchors:
        for src_idx, path in spec.anchors.items():
            if int(src_idx) in pos:
                provided[pos[int(src_idx)]] = load_bgr(path, work_width)
    out = {}
    for k in keyframes:
        out[k] = provided.get(k, src_bgr[k].copy())
    return out


def _propagate_garment(seg, k, anchor_imgs, base_bgr, src_bgr, step_bwd, step_fwd, conf_at, keyframes):
    """Bidirectional propagation of anchor garment into frame k. Returns the
    garment BGR to composite, or None when the gate blocks this frame."""
    if seg.is_keyframe:
        return anchor_imgs[seg.index]
    prev_k, next_k = seg.prev_keyframe, seg.next_keyframe

    # Chain backward step flows k -> k-1 -> ... -> prev_k  (=> flow_{k->prev_k}).
    back_chain = [step_bwd[j] for j in range(k, prev_k, -1)]
    if any(f is None for f in back_chain):
        return None
    flow_k_to_prev = chain_flow(back_chain)
    warped_prev = warp_anchor(anchor_imgs[prev_k], flow_k_to_prev)

    warped_next = None
    conf_prev = warp_scalar(conf_at[prev_k], flow_k_to_prev)
    conf_next = None
    if next_k != prev_k:
        fwd_chain = [step_fwd[j] for j in range(k, next_k)]
        if any(f is None for f in fwd_chain):
            warped_next = None
        else:
            flow_k_to_next = chain_flow(fwd_chain)
            warped_next = warp_anchor(anchor_imgs[next_k], flow_k_to_next)
            conf_next = warp_scalar(conf_at[next_k], flow_k_to_next)

    garment = blend_bidirectional(warped_prev, warped_next, seg.t, conf_prev, conf_next)
    return garment


def _load_brand_asset(path):
    if path and os.path.exists(path):
        a = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if a is not None:
            if a.shape[2] == 3:
                a = cv2.cvtColor(a, cv2.COLOR_BGR2BGRA)
            return a
    return synthetic_brand_asset()


def _qa_pass(src_bgr, composites, mask_sets, shape, reanchor_at, stripe_cv, prop_residual=None) -> QAMetrics:
    n = len(src_bgr)
    H, W = shape
    id_drifts, halos, coverages = [], [], []
    flick_out, flick_src = [], []
    prev_c = prev_s = prev_mask = None
    done = 0
    for k in range(n):
        c = composites[k]
        if c is None:
            continue
        done += 1
        gmask = mask_sets[k].garment_union((H, W))
        coverages.append(float((gmask > 0).mean()))
        id_drifts.append(identity_drift_outside(src_bgr[k], c, gmask))
        from .composite import edge_halo_metric as _halo
        halos.append(_halo(src_bgr[k], c, gmask))
        if prev_c is not None:
            m = ((gmask > 0) | (prev_mask > 0)).astype(np.uint8) * 255
            flick_out.append(temporal_diff(prev_c, c, m))
            flick_src.append(temporal_diff(prev_s, src_bgr[k], m))
        prev_c, prev_s, prev_mask = c, src_bgr[k], gmask
    fo = float(np.mean(flick_out)) if flick_out else 0.0
    fscr = float(np.mean(flick_src)) if flick_src else 0.0
    qa = QAMetrics(
        frame_count=done,
        identity_drift_outside=float(np.mean(id_drifts)) if id_drifts else 0.0,
        flicker_output=fo,
        flicker_source=fscr,
        flicker_ratio=(fo / fscr) if fscr > 1e-6 else 0.0,
        edge_halo=float(np.mean(halos)) if halos else 0.0,
        stripe_width_cv=stripe_cv,
        garment_coverage=float(np.mean(coverages)) if coverages else 0.0,
        reanchor_count=len(reanchor_at),
        reanchor_indices=list(reanchor_at),
    )
    if prop_residual is not None:
        res = [r for r in prop_residual if r is not None]
        if res:
            qa.propagation_residual_mean = float(np.mean(res))
            qa.propagation_residual_max = float(np.max(res))
    qa.notes = _honest_notes(qa)
    return qa


def _honest_notes(qa: QAMetrics) -> List[str]:
    notes = []
    notes.append(
        "identity_drift_outside is the fidelity of compositing OUTSIDE the garment "
        "region back onto the original footage; near-zero confirms identity/pose/scene "
        "are the genuine source (capability #8)."
    )
    if qa.flicker_ratio and qa.flicker_ratio > 1.35:
        notes.append(
            f"flicker_ratio={qa.flicker_ratio:.2f} (>1.35): flow-propagated garment adds "
            "shimmer beyond real motion — the gate SHOULD be re-anchoring more aggressively "
            "or the shot needs a video-native engine. This is the kill-criterion signal."
        )
    else:
        notes.append(
            f"flicker_ratio={qa.flicker_ratio:.2f}: propagation adds little shimmer beyond "
            "the real motion on this window."
        )
    if qa.propagation_residual_max is not None:
        notes.append(
            f"propagation_residual max={qa.propagation_residual_max:.1f} / mean="
            f"{qa.propagation_residual_mean:.1f} gray levels: this is how far the anchor-warped "
            "garment drifts from the TRUE frame inside the garment mask. It is the CUMULATIVE "
            "trust signal — per-step (adjacent-frame) flow confidence stays ~0.95 even under "
            "occlusion because 60fps motion is sub-pixel, so the second-pass gate keys off this "
            "residual, not per-step flow. Frames where it exceeds the scale are flagged for re-anchor."
        )
    notes.append(
        "The garment masks here are the COARSE heuristic prototype masks (SAM plugs in via "
        "--mask-dir-json); garment-region numbers inherit that coarseness. hands_arms is a "
        "real YCrCb skin mask so the occlusion test is meaningful."
    )
    notes.append(
        "kolors_only / grok_only side-by-side columns are PENDING the frozen baseline "
        "artifacts (separate preflight/upload deploy). Drop those frame dirs in via --base "
        "and the anchors JSON to populate them; the machinery already consumes them."
    )
    return notes


if __name__ == "__main__":
    raise SystemExit(main())
