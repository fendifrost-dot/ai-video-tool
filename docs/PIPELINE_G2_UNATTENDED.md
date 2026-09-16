# Lane G2 — Unattended Product OS

**Issue:** [#109](https://github.com/fendifrost-dot/ai-video-tool/issues/109) (work order; stub [#106](https://github.com/fendifrost-dot/ai-video-tool/issues/106))  
**Parent:** [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) Sprint 2  
**Umbrella:** [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50)  
**Lineage:** [#77](https://github.com/fendifrost-dot/ai-video-tool/issues/77) / [#51](https://github.com/fendifrost-dot/ai-video-tool/issues/51)  
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
  → automated_evaluation       consume E2 report JSON
  → review_export              consume Lane H encoded_mp4; do not encode
```

Unattended runner (`runUnattendedPipeline`) loops `advancePipeline` until a G2 pause: complete pass, blocked (review/gate), failed, or retryable backoff.

**[DECISION]** Human review flags are **not** auto-set. Unattended means no per-stage *dispatch*, not skipping Architecture C still-repair / gate-4 / export approvals.

Canonical catalog pause (default reviews): sleeve imported **passed** → temporal **blocked** (`stillRepairApproved`).

---

## Consume-only contracts

**[DECISION]** G2 does not own:

- Chest 1m / sleeve 1c paint (locked). Import CLEARED artifacts.
- **Lane H MP4 encode.** Artifact kind `encoded_mp4`. Pointer only.
- **Lane E2 metrics.** `consumeEvaluatorReport` structurally reads `lane-e-reconstruct-video-v1` JSON. `stillGoldensReopened: false`. Does not import `src/lib/eval` implementations.

---

## Second-clip portability

**[DECISION]** Orchestrator, handoff, lifecycle, graph, and adapters key on `ArtifactKind` + stage id. Clip/project ids live only in catalog/seed modules:

| ID-aware | Shared (no clip switch) |
|----------|-------------------------|
| `catalog.ts` | `orchestrator.ts` |
| `chest.ts` | `unattended.ts` |
| `sleeve.ts` | `handoff.ts`, `lifecycle.ts`, `graph.ts`, `contract.ts` |

Catalogs:

1. **`canonical-ysl-ice-on`** — original master `76fe7438` + CLEARED chest/sleeve (existing).
2. **`ysl-ice-on-v2-edited-clip`** — existing V2 `generation_clip` `f31bd0f2` (parent `76fe7438`). Same graph, different seeds.

Any third existing project uses `portableBinding({ projectId, clipId, seedArtifacts })` — no new orchestration code.

---

## Persistence

Contract version **1.1.0**. `1.0.0` documents migrate (lifecycle/stageVersion/evaluatorResult/retryReason/handoffs/paidCalls). Still a JSON embed on `metadata_json.pipeline_run` — **PIPELINE-1 / OPS-2 remain open**. No new SQL table.

---

## Deploy needs

| Action | Needed? |
|--------|---------|
| Lovable Publish | **No** |
| Edge redeploy | **No** |
| Lovable SQL | **No** |

`paidCalls=false`. Do not redeploy `architecture-c-still-repair-proxy`.
