# Stage A rerun (step 6) — BLOCKED pending real Kolors sequence + SAM masks

The stakeholder's step 6 is: **rerun Stage A UNCHANGED against the real per-frame
Kolors sequence + real SAM masks; do not modify the pass criteria; if it still
fails, the propagation machinery — not the inputs — is the limiting factor.**

That rerun cannot execute in this environment because its two inputs are
**PENDING** (see `artifacts/temporal_benchmark_v2/BENCHMARK_TEMPORAL_MANIFEST.md`):

- `kolors_sequence` — per-frame Kolors VTON for the whole clip. Needs the AVT
  edge → Control Center → Fal path (`wardrobe-video-swap-proxy` with
  `FRAME_SWAP_FAL_MODEL=fal-ai/kling/v1-5/kolors-virtual-try-on`, `jacket_only`).
  **Not runnable from the local worker** — AVT holds no `FAL_KEY`; Fal is reached
  only through CC/edge with an authenticated user.
- `sam_mask_sequence` — per-frame per-region SAM-3 masks. Needs
  `sam3-segment-proxy` / `fal-ai/sam-3/video`, same authenticated path.

## What IS delivered now (locally, real)

- Full-clip **flow artifacts** (fwd/bwd/confidence, 956 files, checksummed) — so a
  later Stage B failure can be attributed to a bad correction **vs** an already-
  unreliable flow field, without recompute.
- **Propagation-window distribution** across the shot (quantifies the old "±15" as
  a property: stable span 11–41 frames, mean 26; forward reach 3–22).
- **Adaptive anchor placement** driven by that distribution (replaces fixed
  12–24 cadence — 29 anchors on this shot vs 15 for fixed-18, dense where reach is
  short, sparse where stable).
- **Versioned frozen temporal benchmark** (v2.0.0) with checksums; single-frame
  set kept immutable; Kolors/SAM slots PENDING with runbooks.

## The rerun command (once the two inputs exist)

The pass criteria are **UNCHANGED**; only the inputs get wired:

```bash
# real Kolors per-frame base + real SAM masks + the SAME gate
PYTHONPATH=$WT $VENV -m workers.warp_worker.run \
  --source <source frames> \
  --base   <kolors_sequence dir>            # real Kolors per-frame base \
  --mask-dir-json '{"torso":"<sam>/torso", "left_sleeve":"…", "right_sleeve":"…", \
                    "collar":"…", "stripe_logo":"…", "hands_arms":"…"}' \
  --anchors '{}'                            # Stage A adds NO Grok \
  --cadence <ignored: use adaptive plan>    # feed adaptive_anchor_plan.json anchors \
  --out-heavy <T7> --out-artifacts <art>

# then the UNCHANGED hard gate (temporal + garment-fidelity, two verdicts):
PYTHONPATH=$WT $VENV -m workers.warp_worker.stage_a_gate  … (same thresholds)
```

If Stage A **still fails** with real Kolors + real SAM masks + adaptive anchors,
that is the finding: the propagation machinery is the limiter, not the benchmark
inputs — and Stage B (single Grok correction) still does not begin.
