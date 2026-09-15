# Temporal propagation — I/O contract (v1.0.0)

**Lane:** C (umbrella #50, work-order #56)
**Module:** `src/lib/temporal/**`
**Status:** isolated infra — no chest/sleeve/product activation, no Fal/CC, no Grok

Machine-readable types live in `contract.ts`. `TEMPORAL_PROPAGATION_CONTRACT_VERSION` is `"1.0.0"`.

---

## Target shape

```
source clip + canonical repaired keyframe/mask + anchors
  → temporally propagated repair masks/transforms
```

This engine does **not** generate garments, call providers, or composite onto a master.
It carries a **canonical repair mask** (and optional quad) across a discrete clip
using estimated or anchored affine transforms.

---

## Input (`PropagationInput`)

| Field       | Type                | Meaning                                                                                                                                                                                      |
| ----------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clip`      | `SourceClip`        | Ordered discrete frames. Each frame is **luma only** (`Uint8Array`, 0–255), plus `index`, `width`, `height`. `clip.id` is a fixture/run label. `fps` is metadata (not used to decode video). |
| `canonical` | `CanonicalKeyframe` | One repaired keyframe: `index` (must exist in `clip.frames`), `mask` (`BinaryMask`, same size as that frame), optional `quadNorm` (TL/TR/BR/BL, 0..1).                                       |
| `anchors`   | `Anchor[]`          | Sparse constraints. `kind`: `keyframe` \| `pose_change` \| `scene_cut` \| `manual`. Optional `transform` snaps that frame to a known canonical→frame affine.                                 |

**Validation (throws):**

- clip has ≥ 1 frame; indices unique, finite, ≥ 0
- every frame has matching `luma.length === width * height` and consistent size across the clip
- canonical index is present; mask size matches the clip
- mask `data.length === width * height` and values are 0 or 1
- optional quads are four finite points in [0, 1] (tiny epsilon allowed)

Callers may pass **static fixtures** (`fixtures.ts`) — no live footage required.

---

## Output (`PropagationOutput`)

| Field             | Meaning                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `contractVersion` | `"1.0.0"`                                                                |
| `clipId`          | Echo of `clip.id`                                                        |
| `canonicalIndex`  | Echo of `canonical.index`                                                |
| `frames`          | One `PropagatedFrame` per input frame, **same order as the sorted clip** |

Each `PropagatedFrame`:

| Field                 | Meaning                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `index`               | Frame index                                                                                         |
| `transform`           | Affine mapping **canonical pixel space → this frame** (`kind: "affine"`, 2×3 matrix)                |
| `mask`                | Canonical mask warped by that transform (nearest-neighbour, clipped)                                |
| `quadNorm`            | Canonical quad warped then re-normalized, when a canonical quad was supplied                        |
| `confidence`          | 0..1 forward–backward consistency of the last hop (1.0 on the canonical frame and on `anchor_snap`) |
| `source`              | `canonical` \| `propagated` \| `anchor_snap` \| `hold`                                              |
| `reanchorRecommended` | True on scene-cut anchors, low confidence, or failed match                                          |
| `reanchorReasons`     | Stable tokens: `scene_cut`, `low_confidence(...)`, `failed_match`, `pose_change`                    |

`source = hold` means the hop was untrusted; the previous transform is reused so
downstream still gets a mask, but `reanchorRecommended` is true.

---

## What this is not

- Not `supabase/functions/_shared/propagation.ts` (Fal engine selector / CC `fal-run`).
- Not Architecture C chest/sleeve repair.
- Not original-master compositing.
- Not a paid Grok / V3 generation path.

---

## Downstream plug-in

A later lane may feed `frames[].mask` / `frames[].transform` / `frames[].quadNorm`
into compositing. This contract stays luma + mask + affine; it does not own pixels
of a garment render.

---

## Live-prep (v1.0.0, not activated)

**Work-order:** [#76](https://github.com/fendifrost-dot/ai-video-tool/issues/76) (lineage #56, umbrella #50)

Isolated adapters so activation is one edge redeploy away **after sleeve still CLEARED**.
They do **not** flip Hero Frame `temporalTrackingEnabled`, do **not** call Grok, and
do **not** touch chest/sleeve paint.

| Module                   | Role                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `canonicalLineage.ts`    | Frozen project / still / keyframe / CLEARED chest quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` |
| `approvedQuad.ts`        | Chest CLEARED slot + PENDING sleeve_left / sleeve_right slots                                                  |
| `quadAdapter.ts`         | CLEARED quads → `PropagationInput` jobs (`provider: "none"`, `grokPerFrame: false`)                            |
| `livePrep.ts`            | `TEMPORAL_LIVE_ACTIVATION_ARMED = false` + `evaluateTemporalLiveActivation`                                    |
| `heroFrameHook.ts`       | `prepareHeroFrameTemporalHook` — tracking stays `false`                                                        |
| `edgeAdapter.ts`         | Future edge request body + `authorizeTemporalEdgeRequest` (refuses until armed)                                |
| `clearedChestFixture.ts` | Synthetic proof the CLEARED chest quad propagates without per-frame Grok                                       |

`TEMPORAL_LIVE_PREP_CONTRACT_VERSION` is `"1.0.0"`. The core propagation contract
stays `"1.0.0"`; live-prep is an additive adapter layer.

**Hard stop:** `evaluateTemporalLiveActivation()` with the compile-time const is
`allowed: false` until sleeve CLEARED + Class C sign-off + `explicitArm`. See
[`docs/temporal/LIVE_PREP.md`](../../docs/temporal/LIVE_PREP.md).
