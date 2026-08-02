# warp_worker — architecture & interfaces

Prototype of the LOCKED garment-swap propagation step
([`docs/VIDEO_SWAP_ARCHITECTURE.md`](../../docs/VIDEO_SWAP_ARCHITECTURE.md) §3).
Read that doc and the `CLAUDE.md` "LOCKED" section first — this worker
implements the **fallback / likely-primary** design it describes, not a literal
Grok→Kolors warp.

## Roles (do not drift)

- **Kolors = geometry + identity authority.** Provides the per-frame BASE garment
  whose pose/occlusion already matches the original body.
- **Grok = garment-detail reference / correction anchor.** Supplies approved
  construction/branding detail at a few indices — **not** a literal full-frame
  donor. Its pixels are used to *derive corrections*, propagated locally.
- **The original footage is the identity/pose/scene truth.** Everything outside
  the garment region is composited straight from it.

## Pipeline

```
source frames ─┬─► dense flow (fwd+bwd, DIS)  ─► occlusion + confidence maps
               │                                        │
               ├─► region masks (torso/sleeves/collar/  │
               │    stripe_logo/hands_arms)             ▼
               │        │                        per-frame FlowMetrics
               │        │                        (confidence, rotationDeg,
               │        ▼                         occlusionRatio)
               │   brand track (navy stripe+logo)       │
               │        │                               ▼
               │        │                        RE-ANCHOR GATE  ──► blocked_reanchor
               │        │                        (flowBreak thresholds)   (no fake)
               │        ▼                               │
               └─► bidirectional anchor propagation ◄───┘
                        │  (chain per-step flows to each bracketing anchor,
                        │   warp anchor garment, blend by t × confidence)
                        ▼
                 region composite onto ORIGINAL footage
                   • garment only inside feathered garment mask
                   • suppress original patch/branding leakage
                   • deterministic brand layer (clipped to garment)
                   • restore hands/arms on top (natural occlusion)
                        │
                        ▼
        persisted status  +  QA report  +  side-by-side vs baselines
```

## Module map

| Module | Heavy deps | Responsibility |
|---|---|---|
| `interfaces.py` | none | model-agnostic data contracts (`ShotSpec`, `Anchor`, `FlowMetrics`, `FrameArtifacts`) |
| `config.py` | none | thresholds/cadence mirrored from the TS edge helpers; `WorkerConfig` |
| `gate.py` | none | re-anchor GATE — Python port of `_shared/flowBreak.ts` |
| `keyframe_plan.py` | none | anchor cadence + bracketing — port of `_shared/keyframePlan.ts` |
| `status.py` | none | persisted job/frame/retry/artifact status; resume; atomic writes |
| `brand.py` | numpy (raster only) | deterministic tracked brand layer geometry + raster |
| `frameio.py` | cv2, numpy | 16-bit PNG load, working-res downscale, artifact I/O |
| `flow.py` | cv2, numpy | dense DIS flow, fwd/bwd consistency → occlusion + confidence, rotation est |
| `masks.py` | cv2, numpy | region masks (real skin + coarse garment); SAM plug-in point |
| `warp.py` | cv2, numpy | flow composition/chaining, warp, bidirectional blend |
| `composite.py` | cv2, numpy | region composite, patch suppression, brand overlay, halo metric |
| `qa.py` | cv2, numpy | metrics, side-by-side grid, markdown report |
| `run.py` | cv2, numpy | orchestrator / CLI |

The four `none`-dep modules are the contract shared with the edge function and
are unit-tested without any CV stack. `gate.py`/`keyframe_plan.py` are literal
ports of the TypeScript so both sides of the boundary decide identically.

## Model-agnostic interfaces (swap points)

Everything keys off *data*, never a specific engine:

| Interface | Prototype provider | Production provider |
|---|---|---|
| `ShotSpec.source_dir` | benchmark 16-bit PNG frames | same |
| `ShotSpec.base_dir` (geometry) | source frames (identity) | **Kolors** per-frame VTON frames |
| `ShotSpec.anchors` (detail) | source frames at anchor indices | **Grok** approved correction anchors |
| `ShotSpec.mask_dirs` | coarse heuristic + real skin | **SAM-3 video** masks |
| flow engine (`config.flow_engine`) | `opencv-dis-medium` | `raft`/`gmflow` (GPU) — same `(fwd,bwd,occ,conf)` |
| `ShotSpec.brand_asset_path` | synthetic navy stripe+logo | real tracked brand asset |
| `FlowMetrics[]` out | consumed locally by `gate.py` | POSTed to `wardrobe-video-propagate-proxy` re-anchor loop |

Better models change a *provider*, not the flow/gate/composite core.

## The 12 capabilities → where they live

| # | Capability | Module | Status |
|---|---|---|---|
| 1 | Kolors as base geometry/identity | `interfaces.ShotSpec.base_dir`, `run._propagate_garment` | interface built; real Kolors frames = external |
| 2 | Grok as garment-detail reference (not literal donor) | `interfaces.ShotSpec.anchors`, `run._anchor_images` | interface built; real Grok anchors = external |
| 3 | Separate region masks | `masks.py` | real skin (hands/arms) + coarse garment; SAM plug-in |
| 4 | Forward + backward dense flow | `flow.compute_consistency` | **built (real DIS)** |
| 5 | Occlusion + confidence maps | `flow.forward_backward_consistency` | **built (real)** |
| 6 | Bidirectional propagation from anchors | `warp.py`, `run._propagate_garment` | **built (real)** |
| 7 | Automatic re-anchoring on flow/geometry break | `gate.py` | **built (real)** |
| 8 | Original-frame compositing outside garment | `composite.composite_frame` | **built (real)** |
| 9 | Deterministic patch/branding suppression | `composite.suppress_original_patch` | **built (real)** |
| 10 | Tracked deterministic brand layer | `brand.py`, `composite` | **built (real, synthetic asset)** |
| 11 | Persisted job/frame/retry/artifact status | `status.py` | **built (real)** |
| 12 | QA report + side-by-side vs baselines | `qa.py` | **built**; baseline columns PENDING frozen artifacts |

## Compute reality

Dense flow + warp + composite **cannot** run on Fal video ops or Deno edge.
Prototype compute = local ffmpeg + python/opencv on the T7 benchmark set.
Production compute = a dedicated GPU worker (RAFT/GMFlow, full-res, SAM masks)
exposing the identical interfaces above and returning `FlowMetrics[]` +
composited frames to `wardrobe-video-propagate-proxy`.

## One-shot result

Full review-gate output (five questions, five separately-scored dimensions, worst-frame
call-outs, single outcome) is in
[`artifacts/oneshot_2s_arm_cross/REVIEW.md`](artifacts/oneshot_2s_arm_cross/REVIEW.md);
the raw metric report is
[`artifacts/oneshot_2s_arm_cross/qa_report.md`](artifacts/oneshot_2s_arm_cross/qa_report.md).

**Outcome: CONDITIONAL PASS.** The flow/gate/composite/brand/status machinery is
validated on the real benchmark footage (frames 48–167, the arm-cross occlusion
window): identity/pose preserved outside the garment (drift ≈ 0.02), temporal
stability holds (flicker ratio 0.955, propagation residual ≤ 7.7 gray), the tracked
navy brand stripe is stable (width CV 0.026) and visibly composites onto the chest,
and hands occlude the garment via a real skin mask. The **single isolated blocker**:
the real Kolors base + Grok correction anchors + SAM masks are not yet wired
(separate preflight/upload deploy), so `base_frame_quality` and `product_fidelity`
are **BLOCKED**, not passed — garment construction toward Grok is *not* demonstrated.
Per the gate, **do not scale**.

Regenerate the review from saved artifacts (no 7-min recompute):

```bash
PYTHONPATH=. workers/.venv/bin/python -m workers.warp_worker.review \
  --artifacts workers/warp_worker/artifacts/oneshot_2s_arm_cross \
  --source "<frames>" --composite-dir "<T7 heavy dir>" \
  --start 48 --count 120 --stride 1 --work-width 480 \
  [--kolors-dir <dir> --grok-dir <dir>]   # populates the PENDING columns
```
