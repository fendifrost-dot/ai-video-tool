"""Persist the FLOW artifacts for a whole clip (new benchmark requirement).

Forward flow, backward flow, and the confidence map per adjacent frame pair are
EXPENSIVE and now as valuable as the masks: storing them lets a later stage answer
"did Stage B fail because the correction was bad, or because the underlying flow
field was already unreliable?" without recomputing.

Layout (heavy, lives on T7):
    <out>/flow/step_XXXXX_fwd.npy   float32 (H,W,2)  flow_{k -> k+1}
    <out>/flow/step_XXXXX_bwd.npy   float32 (H,W,2)  flow_{k+1 -> k}
    <out>/flow/conf_XXXXX.npy       float32 (H,W)    fwd/bwd-consistency confidence 0..1
    <out>/flow/occ_XXXXX.png        uint8            occlusion (255 = unreliable)
    <out>/flow_manifest.json        shapes, engine, work_width, per-step confidence stats
    <out>/SHA256SUMS.txt            checksum of every artifact file

Real OpenCV DIS flow (the same engine the prototype uses); resumable
(skip-existing); no fabrication.
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
from typing import List

import cv2
import numpy as np

from .flow import forward_backward_consistency, make_flow_engine
from .frameio import frame_path, list_frames, load_gray


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Persist fwd/bwd/confidence flow artifacts for a clip")
    p.add_argument("--source", required=True, help="dir of source frame_%05d.png")
    p.add_argument("--start", type=int, default=0)
    p.add_argument("--count", type=int, default=None, help="frames (default: all found)")
    p.add_argument("--work-width", type=int, default=540)
    p.add_argument("--fb-tol", type=float, default=1.5)
    p.add_argument("--engine", default="opencv-dis-medium")
    p.add_argument("--out", required=True, help="output dir (T7)")
    args = p.parse_args(argv)

    all_frames = list_frames(args.source)
    if args.count is None:
        indices = list(range(args.start, len(all_frames)))
    else:
        indices = list(range(args.start, args.start + args.count))
    n = len(indices)
    flow_dir = os.path.join(args.out, "flow")
    os.makedirs(flow_dir, exist_ok=True)
    print(f"[flow-artifacts] {n} frames -> {n-1} steps @ width {args.work_width}, engine {args.engine}")

    engine = make_flow_engine(args.engine)
    conf_stats = {}
    prev_gray = load_gray(frame_path(args.source, indices[0]), args.work_width)
    H, W = prev_gray.shape[:2]
    for si in range(n - 1):
        k = indices[si]
        fwd_p = os.path.join(flow_dir, f"step_{si:05d}_fwd.npy")
        bwd_p = os.path.join(flow_dir, f"step_{si:05d}_bwd.npy")
        conf_p = os.path.join(flow_dir, f"conf_{si:05d}.npy")
        occ_p = os.path.join(flow_dir, f"occ_{si:05d}.png")
        cur_gray = load_gray(frame_path(args.source, indices[si + 1]), args.work_width)
        if all(os.path.exists(x) for x in (fwd_p, bwd_p, conf_p, occ_p)):
            # resume: still load confidence stat cheaply
            try:
                c = np.load(conf_p)
                conf_stats[si] = {"mean": round(float(c.mean()), 4), "min": round(float(c.min()), 4)}
            except Exception:
                pass
            prev_gray = cur_gray
            continue
        fwd = engine.calc(prev_gray, cur_gray, None)
        bwd = engine.calc(cur_gray, prev_gray, None)
        occ, conf = forward_backward_consistency(fwd, bwd, args.fb_tol)
        np.save(fwd_p, fwd.astype(np.float32))
        np.save(bwd_p, bwd.astype(np.float32))
        np.save(conf_p, conf.astype(np.float32))
        cv2.imwrite(occ_p, occ)
        conf_stats[si] = {"mean": round(float(conf.mean()), 4), "min": round(float(conf.min()), 4)}
        if si % 20 == 0:
            print(f"  step {si}/{n-1} conf_mean={conf_stats[si]['mean']}")
        prev_gray = cur_gray

    manifest = {
        "kind": "flow_artifacts",
        "engine": args.engine,
        "work_width": args.work_width,
        "fb_tol": args.fb_tol,
        "shape": [H, W],
        "source_dir": args.source,
        "source_index_start": indices[0],
        "frame_count": n,
        "step_count": n - 1,
        "dtype": "float32",
        "layout": {
            "fwd": "step_XXXXX_fwd.npy  flow_{k->k+1}",
            "bwd": "step_XXXXX_bwd.npy  flow_{k+1->k}",
            "conf": "conf_XXXXX.npy  fwd/bwd-consistency confidence 0..1",
            "occ": "occ_XXXXX.png  255=unreliable",
        },
        "confidence_stats": conf_stats,
    }
    with open(os.path.join(args.out, "flow_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    # checksums of every artifact file
    files = sorted(glob.glob(os.path.join(flow_dir, "*")))
    with open(os.path.join(args.out, "SHA256SUMS.txt"), "w") as f:
        for fp in files:
            f.write(f"{_sha256(fp)}  flow/{os.path.basename(fp)}\n")
    print(f"[flow-artifacts] wrote {len(files)} files + manifest + checksums -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
