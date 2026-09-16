# Lane C2 — Temporal video QA (full canonical clip)

**Work-order:** [#107](https://github.com/fendifrost-dot/ai-video-tool/issues/107) under sprint [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) / umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50).  
**Class:** **A** (measurement modules + fixtures + tests + docs). Does not change `propagateRepair`, authorize, paint, or Lovable-managed edge source.  
**Status:** **READY** in-lib. Authenticated 5-frame click smoke remains SUCCESS (#96). Full-clip metrics are **not** a live 1080×1920 ingest.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## What this lane owns

Exercise temporal propagation across the **full canonical clip duration** (master `76fe7438-671d-4428-a7f6-17a45e98c16f`, 241 frames @ 59.94 fps, 4.0207 s), measure **drift / flicker / coverage / occlusion continuity**, auto-identify bad frames, and emit machine-readable JSON (`temporal-video-qa-v1`). Contribute SAM-3 continuity evidence because the temporal path uses masks.

Click-smoke SUCCESS (#96) dispatched 3 jobs on a **5-frame** synthetic body. That path stays regression-locked. This lane does not stop there.

## What this lane does not own

- Hero Frame export / MP4 (Lane H)
- Reconstruct paint / original-master composite (Lane D2)
- Eval core `src/lib/eval/**` (Lane E2) — consume this schema
- Pipeline OS (Lane G2)
- Chest 1m / sleeve 1c paint
- Lovable `temporal-propagate-proxy` source / redeploy

---

## Canonical clip (frozen)

| Field | Value | Label |
|-------|--------|--------|
| Asset | `76fe7438-671d-4428-a7f6-17a45e98c16f` | **VERIFIED** (lineage / player) |
| Native raster | 1080×1920 | **VERIFIED** (IMG_5633 H.264 cloud copy) |
| Native fps / frames / duration | 59.94 / **241** / 4.0207 s | **VERIFIED** |
| Keyframe | `v2-still-0.785` at t=0.785 → frame **47** | **VERIFIED** (`round(0.785×59.94)`) |
| QA raster | 80×128 synthetic luma | **DECISION** — live 1080×1920 ingest is later Class C |
| Chest / sleeve | CLEARED 11/11 `9ed83c01` / CLEARED 6/6 `fdb86b18` | **VERIFIED** — not rescored here |

---

## How full-clip QA runs

```
canonical 241-frame synthetic luma (clean or injected-defect)
  → buildPropagationJobsFromApprovedSet (chest + sleeve_left + sleeve_right)
  → propagateRepair (in-lib, provider none, paidCalls=false)
  → drift / flicker / coverage / occlusion metrics
  → SAM-3-shaped continuity on caller-supplied / synthetic masks
  → automatic bad-frame tokens
  → temporal-video-qa-v1 JSON
```

**[DECISION]** Full-clip does **not** POST `temporal-propagate-proxy`. The authenticated proxy still caps `clip.frames` at **24** (5-frame smoke / Reconstruct E2E). Raising that cap is a **YELLOW** shared contract.

## Metrics

| Metric | What is measured |
|--------|------------------|
| **Drift** | \|measured translation − expected dx\| per frame (px) |
| **Flicker** | consecutive propagated-mask IoU |
| **Coverage** | mask area / canonical-keyframe area |
| **Occlusion continuity** | declared-window flags, recovery lag, centroid jumps |
| **SAM-3 continuity** | consecutive IoU of SAM-3-shaped masks + overlap with repair-mask union |

Bad-frame tokens (stable): `low_confidence`, `reanchor_recommended`, `hold`, `failed_match`, `scene_cut`, `drift_exceeded`, `flicker_iou`, `coverage_hole`, `coverage_overflow`, `occlusion_discontinuity`, `sam3_discontinuity`.

## Fixtures

| Fixture | Purpose |
|---------|---------|
| `canonicalFullClipCleanFixture` | 241 stationary hops; **PASS** iff 0 bad frames |
| `canonicalFullClipDefectFixture` | Same clip + occlusion 100–115, flicker 150–154, coverage hole 190–198, drift jump 210–240; **PASS** iff each window produces ≥1 chest bad frame |

Both stamp `paidCalls=false`, `grokPerFrame=false`, `sam3LiveFetch=false`, `stillGoldensReopened=false`.

## Dispatch path (regression-locked)

| Lock | Value |
|------|--------|
| `paidCalls` | `false` |
| `grokPerFrame` | `false` |
| `provider` | `none` |
| `explicitArm` | required |
| JWT proxy | unchanged (`temporal-propagate-proxy`) |
| `TEMPORAL_PROPAGATE_LIMITS.maxFrames` | **24** |
| 241-frame wire clip | **rejected** at parse |
| 5-frame live-smoke body | still dispatches in-lib |

## YELLOW contracts (do not silently decide)

1. **`edge_max_frames_24_vs_canonical_241`** — proxy cannot ingest the full clip. ChatGPT / architecture before raising `maxFrames`.
2. **`live_1080x1920_ingest_of_76fe7438_not_this_lane`** — same not-claimed as Reconstruct E2E. Later Class C.
3. **`lane_e2_should_consume_temporal-video-qa-v1`** — do not re-implement drift/flicker inside `src/lib/eval/**` from this lane.
4. **`sam3_continuity_is_caller_supplied_not_live_fetch`** — no `sam3-segment-proxy` / CC.

## Schema / evidence

- Schema: [`video-qa/schema.json`](./video-qa/schema.json)
- Clean evidence: [`video-qa/full-clip-clean.json`](./video-qa/full-clip-clean.json)
- Defect evidence: [`video-qa/full-clip-defects.json`](./video-qa/full-clip-defects.json)
- Types: `src/lib/temporal/qa/report.ts`
- Emit: `npx tsx scripts/temporal-video-qa.mts`

## Hard locks honored

No paid Grok. No chest 1m / sleeve 1c paint. No Lovable code edits. No Hero Frame MP4. No reconstruct paint. No eval-core edits. No pipeline OS.
