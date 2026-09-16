# Lane G2 — Unattended Product OS

**Issue:** [#122](https://github.com/fendifrost-dot/ai-video-tool/issues/122) (this increment) · core [#109](https://github.com/fendifrost-dot/ai-video-tool/issues/109) (stub [#106](https://github.com/fendifrost-dot/ai-video-tool/issues/106))  
**Parent:** [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) Sprint 2  
**Umbrella:** [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50)  
**Lineage:** [#77](https://github.com/fendifrost-dot/ai-video-tool/issues/77) / [#51](https://github.com/fendifrost-dot/ai-video-tool/issues/51) · E2 [#116](https://github.com/fendifrost-dot/ai-video-tool/pull/116)  
**Class:** C (orchestration)  
**paidCalls:** `false`  
**Owner:** `src/lib/pipeline/**` + `docs/PIPELINE*`

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Mission

**[DECISION]** Wire stage states so the canonical Architecture C pipeline advances without Fendi dispatching each step. A **passed** stage hands its artifacts to the next **compatible** stage (artifact kind match, not clip id).

Required G2 states: `queued` · `running` · `passed` · `failed` · `blocked` · `retryable`.

Each stage record also carries:

| Field | Owner |
|-------|--------|
| artifact provenance | Lane G2 stores; lanes supply metadata |
| stage version | consume-only pin (`STAGE_VERSIONS`) |
| evaluator result | **consumed** Lane E2 JSON — G2 does not compute metrics |
| retry reason | set on `retryable` / `blocked` |

---

## Stage graph

```
ingest
  → generation                 (import-only; paid generation forbidden)
  → keyframe_repair            CLEARED chest 1m (9ed83c01) — paint locked
  → sleeve_garment_repair      CLEARED sleeve 1c (fdb86b18) import / Lane B hook
  → temporal_propagation       Lane C hook; gate stillRepairApproved
  → original_master_reconstruction   consume RECONSTRUCT-1; gate masterCompositeAuthorized
  → deterministic_branding     consume placement; do not rewrite
  → automated_evaluation       consume E2 `video_qa_report` (`lane-e2-video-qa-v1`)
  → review_export              consume Lane H `encoded_mp4` provenance (not_claimed stub until H merges)
```

Unattended runner (`runUnattendedPipeline`) loops `advancePipeline` until a G2 pause: complete pass, blocked (review/gate), failed, or retryable backoff.

**[DECISION]** Product-safe **$0 canonical auto-run** sets `stillRepairApproved=true` **only** when the seed already holds CLEARED chest 1m **and** CLEARED sleeve 1c identities (Fendi already signed those stills). It does **not** dispatch live paint.

### Flags this lane will NOT auto-set

| Flag | Class | Why |
|------|-------|-----|
| `masterCompositeAuthorized` | **RED** | Architecture C gate 4 / live SAM-3. RECONSTRUCT-1 fixture ≠ live authorization. |
| `exportApproved` | **YELLOW** | Human export. Unattended dispatch ≠ ship. |
| `stillRepairApproved` for UNSCORED / non-CLEARED live outputs | **YELLOW** | Only locked 1m+1c identities qualify. |
| paid generation | **RED** | Import-only. No Grok / V3 / Fal from G2. |

Canonical catalog pause after auto-review: temporal **failed** on Lane C stub (`temporal_stage_stub`) — past `stillRepairApproved`, not past gate 4.

Chest-only `createClearedChestPipelineRun()` still leaves `stillRepairApproved=false`.

---

## Consume-only contracts

**[DECISION]** G2 does not own:

- Chest 1m / sleeve 1c paint (locked). Import CLEARED artifacts.
- **Lane H MP4 encode.** Artifact kind `encoded_mp4`. Default handler is a `encodeStatus: "not_claimed"` provenance stub until H merges. Pointer only; no FFmpeg.
- **Lane E2 metrics.** `consumeVideoQaReport` structurally reads `lane-e2-video-qa-v1` (`video_qa_report`). Also accepts reconstruct-video JSON. `stillGoldensReopened: false`, `blockingArtifactProducer: false`. Does not import `src/lib/eval` implementations.

---

## Second-clip portability

**[DECISION]** Orchestrator, handoff, lifecycle, graph, and adapters key on `ArtifactKind` + stage id. Clip/project ids live only in catalog/seed modules:

| ID-aware | Shared (no clip switch) |
|----------|-------------------------|
| `catalog.ts` / `autoReviews.ts` | `orchestrator.ts` |
| `chest.ts` | `unattended.ts` |
| `sleeve.ts` | `handoff.ts`, `lifecycle.ts`, `graph.ts`, `contract.ts` |
| | `fixtureSeeds.ts` (ids derived from catalogId, never CLEARED 1m/1c) |

Catalogs:

1. **`canonical-ysl-ice-on`** — original master `76fe7438` + CLEARED chest/sleeve (existing).
2. **`ysl-ice-on-v2-edited-clip`** — existing V2 `generation_clip` `f31bd0f2` (parent `76fe7438`). Same graph, different seeds.

Any third existing project uses `portableBinding({ projectId, clipId, seedArtifacts })` — no new orchestration code.

---

## Persistence

Contract version **1.2.0**. `1.0.0` / `1.1.0` documents migrate. Still a JSON embed on `metadata_json.pipeline_run` — **PIPELINE-1 / OPS-2 remain open**. No new SQL table.

---

## Deploy needs

| Action | Needed? |
|--------|---------|
| Lovable Publish | **No** |
| Edge redeploy | **No** |
| Lovable SQL | **No** |

`paidCalls=false`. Do not redeploy `architecture-c-still-repair-proxy`.
