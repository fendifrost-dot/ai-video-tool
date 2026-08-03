"""Freeze the CANONICAL TEMPORAL BENCHMARK (versioned superset).

Supersedes the single-frame frozen set (benchmark_frozen_2026-08-01) additively:
that set stays immutable and is referenced here. The temporal benchmark =

    source clip · source frames · Kolors frame SEQUENCE · Grok anchor(s) ·
    SAM mask SEQUENCE · forward flow · backward flow · confidence maps ·
    propagation-window distribution · adaptive anchor plan · manifest · checksums

Every experiment from here uses exactly these assets. Version bumps ONLY when the
assets are regenerated. Assets that cannot be produced in this environment
(Kolors sequence, SAM sequence — both need Fal/edge compute) are recorded as
PENDING with the exact runbook, never fabricated.

This writer computes a top-level manifest + aggregate checksums over everything
that exists, and stamps each component present/pending.
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
from typing import Dict, List, Optional


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _component(present: bool, path: str, detail: str, runbook: Optional[str] = None) -> dict:
    c = {"status": "PRESENT" if present else "PENDING", "path": path, "detail": detail}
    if not present and runbook:
        c["runbook"] = runbook
    return c


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Freeze the versioned canonical temporal benchmark")
    p.add_argument("--root", required=True, help="benchmark_temporal_v2 dir (T7)")
    p.add_argument("--version", required=True, help="e.g. 2.0.0")
    p.add_argument("--source-clip", required=True)
    p.add_argument("--source-frames", required=True)
    p.add_argument("--frozen-v1", required=True, help="immutable single-frame frozen set dir")
    p.add_argument("--grok-anchor", required=True)
    p.add_argument("--kolors-seq", default=None, help="Kolors per-frame sequence dir (if produced)")
    p.add_argument("--sam-seq", default=None, help="SAM mask sequence dir (if produced)")
    args = p.parse_args(argv)

    root = args.root
    flow_manifest = os.path.join(root, "flow_manifest.json")
    flow_sums = os.path.join(root, "SHA256SUMS.txt")
    window_json = os.path.join(root, "analysis", "propagation_window.json")
    adaptive_json = os.path.join(root, "analysis", "adaptive_anchor_plan.json")

    has_flow = os.path.exists(flow_manifest)
    has_window = os.path.exists(window_json)
    has_adaptive = os.path.exists(adaptive_json)
    has_kolors = bool(args.kolors_seq and os.path.isdir(args.kolors_seq) and
                      len(glob.glob(os.path.join(args.kolors_seq, "*"))) > 1)
    has_sam = bool(args.sam_seq and os.path.isdir(args.sam_seq) and
                   len(glob.glob(os.path.join(args.sam_seq, "*"))) > 1)

    KOLORS_RUNBOOK = (
        "Generate per-frame Kolors: for each source frame, call the AVT edge fn "
        "wardrobe-video-swap-proxy (Phase-2b per-frame path) with FRAME_SWAP_FAL_MODEL="
        "fal-ai/kling/v1-5/kolors-virtual-try-on via CC switchx-restyle fal-run, transferMode "
        "jacket_only, the wardrobe feature = the SL bomber. Needs: authenticated Supabase user "
        "(bearer), benchmark clip uploaded as a project_asset, CC allowlist + SWITCHX_PROXY_SECRET, "
        "Fal account not blocked. Output = project-exports swapped frames -> download to "
        "benchmark_temporal_v2/kolors_seq/frame_%05d.png. NOT runnable from the local worker "
        "(AVT holds no FAL_KEY; Fal is reached only via CC/edge)."
    )
    SAM_RUNBOOK = (
        "Generate SAM-3 masks: call sam3-segment-proxy (fal-ai/sam-3/video) on the benchmark clip "
        "with prompts for each region (torso, left_sleeve, right_sleeve, collar, stripe_logo, "
        "hands_arms). Needs the same authenticated edge/CC/Fal path. Output = per-frame per-region "
        "masks -> benchmark_temporal_v2/sam_seq/<region>/frame_%05d.png. NOT runnable from the local "
        "worker."
    )

    components = {
        "source_clip": _component(os.path.exists(args.source_clip), args.source_clip, "1080p H.264 benchmark clip"),
        "source_frames": _component(os.path.isdir(args.source_frames), args.source_frames,
                                    "16-bit near-lossless source frame sequence"),
        "kolors_sequence": _component(has_kolors, args.kolors_seq or "benchmark_temporal_v2/kolors_seq/",
                                      "per-frame Kolors VTON output for the whole clip", KOLORS_RUNBOOK),
        "grok_anchors": _component(os.path.exists(args.grok_anchor), args.grok_anchor,
                                   "approved Grok garment-detail anchor(s) (frame 134 frozen)"),
        "sam_mask_sequence": _component(has_sam, args.sam_seq or "benchmark_temporal_v2/sam_seq/",
                                        "per-frame per-region SAM-3 masks for the whole clip", SAM_RUNBOOK),
        "forward_flow": _component(has_flow, os.path.join(root, "flow"), "per-step forward dense flow (float32)"),
        "backward_flow": _component(has_flow, os.path.join(root, "flow"), "per-step backward dense flow (float32)"),
        "confidence_maps": _component(has_flow, os.path.join(root, "flow"),
                                      "per-step fwd/bwd-consistency confidence + occlusion"),
        "propagation_window_distribution": _component(has_window, window_json,
                                                      "per-anchor reach + shot distribution"),
        "adaptive_anchor_plan": _component(has_adaptive, adaptive_json,
                                           "adaptive placement (replaces fixed cadence)"),
        "immutable_single_frame_frozen_set_v1": _component(os.path.isdir(args.frozen_v1), args.frozen_v1,
                                                           "superseded but kept immutable"),
    }

    # aggregate checksums over the analysis + manifest layer (flow has its own SHA file)
    agg = {}
    for pth in [flow_manifest, flow_sums, window_json, adaptive_json]:
        if os.path.exists(pth):
            agg[os.path.relpath(pth, root)] = _sha256(pth)

    all_present = all(c["status"] == "PRESENT" for c in components.values())
    manifest = {
        "benchmark": "avt_wardrobe_temporal",
        "version": args.version,
        "supersedes": "benchmark_frozen_2026-08-01 (single-frame; kept immutable)",
        "complete": all_present,
        "pending": [k for k, c in components.items() if c["status"] == "PENDING"],
        "components": components,
        "checksums": agg,
        "note": "Version bumps ONLY on regeneration. PENDING components are NOT fabricated; each "
                "carries the exact runbook. Experiments must use exactly these assets.",
    }
    with open(os.path.join(root, "BENCHMARK_TEMPORAL_MANIFEST.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    _write_md(os.path.join(root, "BENCHMARK_TEMPORAL_MANIFEST.md"), manifest)
    print(f"[freeze] version {args.version} complete={all_present} pending={manifest['pending']}")
    return 0


def _write_md(path, m):
    L = [f"# Canonical Temporal Benchmark — `avt_wardrobe_temporal` v{m['version']}\n"]
    L.append(f"Supersedes {m['supersedes']}. **Complete: {m['complete']}**.\n")
    L.append("Every experiment from here uses exactly these assets. Version bumps only on regeneration.\n")
    L.append("| component | status | path | detail |")
    L.append("|---|---|---|---|")
    for k, c in m["components"].items():
        L.append(f"| {k} | {'✅' if c['status']=='PRESENT' else '⛔ PENDING'} | `{c['path']}` | {c['detail']} |")
    L.append("")
    pend = [(k, c) for k, c in m["components"].items() if c["status"] == "PENDING"]
    if pend:
        L.append("## PENDING components — runbook (not fabricated)\n")
        for k, c in pend:
            L.append(f"### {k}\n{c.get('runbook','')}\n")
    L.append("## Checksums (analysis + manifest layer)\n")
    L.append("Flow artifacts have their own `SHA256SUMS.txt` (956 files). Aggregate here:\n")
    for rel, sha in m["checksums"].items():
        L.append(f"- `{rel}` — {sha[:16]}…")
    with open(path, "w") as f:
        f.write("\n".join(L))


if __name__ == "__main__":
    raise SystemExit(main())
