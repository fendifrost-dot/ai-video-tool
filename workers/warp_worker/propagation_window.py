"""Propagation-window DISTRIBUTION across the shot (quantify ±15 as a property).

The earlier single "±15" is one anchor's reach. This measures, for EVERY sampled
anchor, the propagation window as observed PROPERTIES of the flow field:

  * max_fwd / max_bwd            — furthest frame the anchor stays geometrically
                                    trustworthy (round-trip flow residual <= tol)
  * first_confidence_failure     — first distance the round-trip residual exceeds tol
  * first_visible_artifact       — first distance the RECONSTRUCTION residual (warp
                                    the anchor's own source content to the target
                                    and compare) exceeds an artifact tolerance
  * first_required_reanchor      — min(first_confidence_failure, first_visible_artifact)

Then it builds the DISTRIBUTION across the shot (per-anchor table + summary stats +
a rendered histogram). This is flow-only — it needs NO Kolors/SAM, so it runs on
the frozen flow artifacts and later drives ADAPTIVE anchor placement.
"""
from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional

import cv2
import numpy as np

from .frameio import frame_path, load_bgr
from .warp import compose_flow, remap_by_flow


@dataclass
class AnchorWindow:
    anchor: int              # source frame index
    max_fwd: int
    max_bwd: int
    first_conf_fail_fwd: Optional[int]
    first_conf_fail_bwd: Optional[int]
    first_artifact_fwd: Optional[int]
    first_artifact_bwd: Optional[int]
    first_reanchor_fwd: Optional[int]
    first_reanchor_bwd: Optional[int]
    stable_span: int         # max_bwd + max_fwd + 1 (frames one anchor covers)


def _load_step(flow_dir: str, si: int, kind: str) -> np.ndarray:
    return np.load(os.path.join(flow_dir, f"step_{si:05d}_{kind}.npy"))


def _center_box(h, w):
    return int(w * 0.20), int(h * 0.12), int(w * 0.80), int(h * 0.72)


def _measure_direction(flow_dir, source_dir, work_width, A, n_steps, direction,
                       resid_tol, artifact_tol, max_d):
    """Extend the anchor in one direction, returning the distance metrics.
    direction=+1 forward, -1 backward."""
    src_A = load_bgr(frame_path(source_dir, A), work_width)
    H, W = src_A.shape[:2]
    bx0, by0, bx1, by1 = _center_box(H, W)
    cum_to_A = None          # flow_{tgt -> A}
    cum_from_A = None        # flow_{A -> tgt}
    first_conf_fail = None
    first_artifact = None
    max_stable = 0
    d = 0
    while d < max_d:
        d += 1
        tgt = A + direction * d
        if tgt < 0 or tgt >= (n_steps + 1):
            break
        # step index between the two frames
        si = (A + (d - 1) * direction) if direction > 0 else (A - d)
        if si < 0 or si >= n_steps:
            break
        # flow_{tgt -> A}: prepend the step pointing back toward A.
        back_step = _load_step(flow_dir, si, "bwd" if direction > 0 else "fwd")
        cum_to_A = back_step if cum_to_A is None else compose_flow(back_step, cum_to_A)
        # flow_{A -> tgt}: append the step pointing toward tgt (for the round-trip).
        fwd_step = _load_step(flow_dir, si, "fwd" if direction > 0 else "bwd")
        cum_from_A = fwd_step if cum_from_A is None else compose_flow(cum_from_A, fwd_step)
        # round-trip residual A->tgt->A in the centre box
        rt = compose_flow(cum_from_A, cum_to_A)
        resid = np.sqrt(rt[..., 0] ** 2 + rt[..., 1] ** 2)[by0:by1, bx0:bx1].mean()
        # reconstruction residual: warp source_A into tgt geometry, compare to src_tgt
        warped = remap_by_flow(src_A, cum_to_A)
        src_tgt = load_bgr(frame_path(source_dir, tgt), work_width)
        rec = cv2.absdiff(warped, src_tgt).astype(np.float32).mean(axis=2)[by0:by1, bx0:bx1].mean()
        conf_ok = resid <= resid_tol
        art_ok = rec <= artifact_tol
        if not conf_ok and first_conf_fail is None:
            first_conf_fail = d
        if not art_ok and first_artifact is None:
            first_artifact = d
        if conf_ok and art_ok:
            max_stable = d
        else:
            break
    return max_stable, first_conf_fail, first_artifact


def measure_anchor(flow_dir, source_dir, work_width, A, n_steps, resid_tol, artifact_tol, max_d) -> AnchorWindow:
    mf, cff_f, art_f = _measure_direction(flow_dir, source_dir, work_width, A, n_steps, +1, resid_tol, artifact_tol, max_d)
    mb, cff_b, art_b = _measure_direction(flow_dir, source_dir, work_width, A, n_steps, -1, resid_tol, artifact_tol, max_d)

    def first_re(a, b):
        vals = [x for x in (a, b) if x is not None]
        return min(vals) if vals else None

    return AnchorWindow(
        anchor=A, max_fwd=mf, max_bwd=mb,
        first_conf_fail_fwd=cff_f, first_conf_fail_bwd=cff_b,
        first_artifact_fwd=art_f, first_artifact_bwd=art_b,
        first_reanchor_fwd=first_re(cff_f, art_f), first_reanchor_bwd=first_re(cff_b, art_b),
        stable_span=mf + mb + 1,
    )


def _hist_png(values: List[int], title: str, out_path: str, w=520, h=240):
    img = np.full((h, w, 3), 250, np.uint8)
    if values:
        vmax = max(values) or 1
        bins = np.bincount(values, minlength=vmax + 1)
        bw = max(1, (w - 40) // max(1, len(bins)))
        bmax = bins.max() or 1
        for i, c in enumerate(bins):
            x = 30 + i * bw
            bh = int((h - 50) * c / bmax)
            cv2.rectangle(img, (x, h - 30 - bh), (x + bw - 1, h - 30), (180, 120, 60), -1)
    cv2.putText(img, title, (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
    cv2.putText(img, "x = distance (frames), y = count", (10, h - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (80, 80, 80), 1)
    cv2.imwrite(out_path, img)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Propagation-window distribution across the shot")
    p.add_argument("--flow-dir", required=True, help="benchmark flow/ dir")
    p.add_argument("--source", required=True)
    p.add_argument("--work-width", type=int, default=540)
    p.add_argument("--stride", type=int, default=4, help="sample every Nth frame as an anchor")
    p.add_argument("--max-d", type=int, default=45)
    p.add_argument("--resid-tol", type=float, default=2.0, help="round-trip px residual tolerance")
    p.add_argument("--artifact-tol", type=float, default=18.0, help="reconstruction gray tolerance")
    p.add_argument("--out", required=True)
    args = p.parse_args(argv)

    manifest = json.load(open(os.path.join(os.path.dirname(args.flow_dir.rstrip("/")), "flow_manifest.json")))
    n_steps = manifest["step_count"]
    n_frames = manifest["frame_count"]
    anchors = list(range(0, n_frames, args.stride))
    print(f"[window] {len(anchors)} anchors, max_d={args.max_d}, resid_tol={args.resid_tol}px, artifact_tol={args.artifact_tol}")

    windows: List[AnchorWindow] = []
    for A in anchors:
        aw = measure_anchor(args.flow_dir, args.source, args.work_width, A, n_steps,
                            args.resid_tol, args.artifact_tol, args.max_d)
        windows.append(aw)
        if A % 20 == 0:
            print(f"  anchor {A}: fwd={aw.max_fwd} bwd={aw.max_bwd} span={aw.stable_span} "
                  f"first_reanchor(f/b)={aw.first_reanchor_fwd}/{aw.first_reanchor_bwd}")

    spans = [w.stable_span for w in windows]
    fwds = [w.max_fwd for w in windows]
    bwds = [w.max_bwd for w in windows]

    def stats(xs):
        a = np.array(xs, dtype=float)
        return {"min": int(a.min()), "max": int(a.max()), "mean": round(float(a.mean()), 2),
                "median": int(np.median(a)), "p10": int(np.percentile(a, 10)), "p90": int(np.percentile(a, 90))}

    dist = {
        "kind": "propagation_window_distribution",
        "anchors_sampled": len(anchors),
        "stride": args.stride,
        "resid_tol_px": args.resid_tol,
        "artifact_tol_gray": args.artifact_tol,
        "max_d": args.max_d,
        "stable_span": stats(spans),
        "max_fwd": stats(fwds),
        "max_bwd": stats(bwds),
        "note": "stable_span = frames a single anchor covers before re-anchor is required "
                "(round-trip flow residual OR reconstruction artifact exceeds tolerance). "
                "The earlier single '±15' is one point in this distribution.",
        "per_anchor": [asdict(w) for w in windows],
    }
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "propagation_window.json"), "w") as f:
        json.dump(dist, f, indent=2)
    _hist_png(spans, "stable span per anchor (frames covered before re-anchor)",
              os.path.join(args.out, "propagation_window_hist.png"))
    print(f"[window] stable_span stats: {dist['stable_span']}")
    print(f"[window] -> {args.out}/propagation_window.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
