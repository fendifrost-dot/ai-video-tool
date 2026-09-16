# AVT Pipeline / Product OS — Lane G

**Issue:** [#77](https://github.com/fendifrost-dot/ai-video-tool/issues/77) (**prefer this** for chest scaffolding) — lineage [#51](https://github.com/fendifrost-dot/ai-video-tool/issues/51), child of [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50) lane 7  
**Sprint 2 G2:** [#109](https://github.com/fendifrost-dot/ai-video-tool/issues/109) under [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) — see [`PIPELINE_G2_UNATTENDED.md`](PIPELINE_G2_UNATTENDED.md)  
**Owner:** Lane G / G2 — orchestration only (`src/lib/pipeline/**`)  
**Class:** C (orchestration: job graph, stage status/retry/resume). Architecture + product + security sign-off before merge.  
**Status:** scaffolding + **CLEARED chest stage wired** + **G2 unattended lifecycle / handoff / catalog binding**. Not a durable queue. Not a live production UI runner.  
**Control plane:** Lovable — https://aivideotool.lovable.app (SQL editor + Edge Functions redeploy). No standalone Supabase CLI/dashboard from this lane.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Mission

**[DECISION]** Build the layer that lets completed stages plug together instead of remaining isolated experiments.

Approximate model:

```
ingest
  → generation
  → keyframe repair          ← CLEARED chest (logo_chest / 9ed83c01)
  → sleeve/garment repair    ← Lane B stub/hook
  → temporal propagation     ← Lane C stub/hook (stillRepairApproved)
  → original-master reconstruction
  → deterministic branding
  → automated evaluation
  → review/export
```

**[DECISION]** Lane G owns contracts, statuses, artifacts, provenance, failure, retry, and the chest **query-client adapter**. It does **not** own Architecture C paint, Grok generation internals, proxy auth, Control Center, evaluation metric implementations, or Astra/Premiere.

---

## Chest integration (CLEARED 1m)

**[VERIFIED]** Stage 1m live chest still is **CLEARED 11/11** (PR #73). Product OS treats that row as the reference `keyframe_repair` output.

| Field                   | Value                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Gate                    | **CLEARED** 11/11                                                                                        |
| `repair_method_version` | `architecture_c_still_repair_1m`                                                                         |
| Asset                   | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50`                                                                   |
| Clean still             | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`                                                                   |
| Project                 | `764a63d2-93cd-44f3-905f-292f14ab2f51`                                                                   |
| Scorecard               | `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1M_RESULT_2026-09-15.md` |

**[DECISION]** `createClearedChestPipelineRun()` seeds that artifact. `reviews.chestStillCleared` becomes true. That does **not** set `stillRepairApproved` — Architecture C still requires a human still review before temporal.

**[DECISION]** Live chest compute is invoked only through `callArchitectureCStillRepair({ stage: "logo_chest" })` in `chestQueryAdapter.ts`. Default `createProductOsAdapters()` does **not** call the client (import / bind required) so tests stay $0. Use `createLiveProductOsAdapters()` when a later UI mounts a runner.

A new live `logo_chest` output that is not `9ed83c01` is stored as `gate: UNSCORED`. Do not auto-claim CLEARED.

**[DECISION]** Sleeve (`sleeve_stage_stub`, Lane B / #74) and temporal (`temporal_stage_stub`, Lane C / #56) are hooks. Lane G does not fill them.

---

## Hard locks (this lane)

| Lock                                           | Enforcement                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| No `fendi-control-center`                      | No CC files; no new proxy hops                                                                               |
| No proxy auth widening                         | No edge/auth edits                                                                                           |
| No PR #37                                      | Out of scope                                                                                                 |
| No V3 / paid Grok gens                         | `generation` is import-only; `paidCallSurfaces()` lists the forbidden entrypoints                            |
| Do not rewrite Architecture C                  | Still-repair / placement / occlusion modules are consume-only. Adapter calls the **query client** only       |
| Identify files before touching shared surfaces | This lane adds/updates `src/lib/pipeline/**` + this doc. It does not edit query/garment/edge algorithm files |
| Do not edit Lane B/C paint                     | `sleevePanel`, temporal, reconstruct modules stay on those lanes                                             |

---

## Why this exists

**[OBSERVED]** Orchestration today is fragmented: `project_assets.metadata_json` status keys (`extract_status`, `propagate_status`, …), `artist_looks.status`, `provider_jobs`, and imperative client sequences in `wardrobeVideoFrames.ts` / `heroFrame.ts`. There is no `pipeline_runs` table and no DAG.

**[VERIFIED]** `docs/ARCHITECTURE_C_CHATGPT_LOCK_2026-09-03.md` hard-stops temporal propagation and SAM-3 original-master composite until a repaired still passes human review. Gate 4 is explicitly “next architecture gate.”

**[DECISION]** Other lanes plug in by producing `ArtifactRef`s of named kinds. The orchestrator stores lane payloads opaquely and never imports algorithm modules. The chest adapter is the exception that **calls** the existing query entrypoint without owning paint.

---

## Module map

| Path                                    | Role                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/pipeline/types.ts`             | Stage ids, statuses, artifact kinds, provenance, failure, retry policy |
| `src/lib/pipeline/contract.ts`          | Per-stage consume/produce/gates + **lane surface registry**            |
| `src/lib/pipeline/adapters.ts`          | Plug-in `StageAdapter` / `StageHandler`                                |
| `src/lib/pipeline/chest.ts`             | CLEARED 1m identity (`9ed83c01`) + seed artifacts                      |
| `src/lib/pipeline/chestAdapter.ts`      | `keyframe_repair` handler (import CLEARED or call injected client)     |
| `src/lib/pipeline/chestQueryAdapter.ts` | Binds `callArchitectureCStillRepair` (logo_chest only)                 |
| `src/lib/pipeline/stageHooks.ts`        | Sleeve + temporal stub errors other lanes fill                         |
| `src/lib/pipeline/sleeve.ts`            | CLEARED 1c identity (`fdb86b18`) — IDs only, no paint                   |
| `src/lib/pipeline/lifecycle.ts`         | G2 states queued/running/passed/failed/blocked/retryable               |
| `src/lib/pipeline/stageVersion.ts`      | Consume-only version pins                                              |
| `src/lib/pipeline/handoff.ts`           | Kind-based artifact handoff to next compatible stage                   |
| `src/lib/pipeline/consumedContracts.ts` | E2 evaluator JSON + Lane H encoded_mp4 (consume, do not own)           |
| `src/lib/pipeline/catalog.ts`           | Canonical + second-clip catalogs; portable binding                     |
| `src/lib/pipeline/unattended.ts`        | Advance until G2 pause without per-stage dispatch                      |
| `src/lib/pipeline/productOs.ts`         | Graph nodes + default Product OS adapters                              |
| `src/lib/pipeline/orchestrator.ts`      | Create / advance / retry / review flags                                |
| `src/lib/pipeline/persistence.ts`       | JSON document + `metadata_json.pipeline_run` embed                     |
| `src/lib/pipeline/errors.ts`            | `PipelineError` + name-based classification of existing errors         |
| `src/lib/pipeline/retry.ts`             | Default policy + backoff                                               |
| `src/lib/pipeline/graph.ts`             | Topological order / cycle check                                        |

### Shared surfaces Lane G does **not** modify

Named so a later integration issue can grant access explicitly:

- `src/lib/queries/wardrobeVideoFrames.ts` — extract / Lane A propagate
- `src/lib/queries/architectureCStillRepair.ts` — `callArchitectureCStillRepair` (**called**, not edited)
- `src/lib/heroFrame/architectureCStillRepair.ts` — still-repair metadata helpers
- `src/lib/garment/placementEngine.ts`, `src/lib/garment/logoComposite.ts`
- `src/lib/sleevePanel/**` — Lane B
- `src/lib/queries/grokImageGarment.ts`, `src/lib/queries/grokVideoEdit.ts`
- `src/lib/providerJobs/api.ts`
- `src/lib/queries/clipReviews.ts`, `src/lib/clipReviews/driftFlags.ts`
- `src/lib/export/buildPackage.ts`
- `src/lib/video/scrubProxy.ts`
- `supabase/functions/_shared/{frameExtract,keyframePlan,propagation,placementEngine}.ts`
- `supabase/functions/architecture-c-still-repair-proxy/index.ts`
- `supabase/functions/wardrobe-video-propagate-proxy/index.ts`

---

## Semantics

### Status

Stage: `pending | ready | running | succeeded | failed | skipped | blocked | needs_review | retrying | cancelled`

G2 product lifecycle (Sprint 2): `queued | running | passed | failed | blocked | retryable`. Mapping: pending/ready → queued; succeeded/skipped → passed; retrying → retryable; blocked/needs_review → blocked; cancelled/failed → failed (failed+retryable lastError → retryable).

Run rolls up from stages: running if any stage is running/retrying; otherwise needs_review / blocked / failed win over succeeded.

**skipped** = downstream already satisfied (e.g. a `source_still` is seeded, so `generation` is not required).  
**succeeded** + provenance `imported_from_lane` = another lane already produced this stage’s output kinds.  
**needs_review** = a `StageGate.reviewKey` is not true (still-repair approval, export approval).  
**blocked** = upstream failed, or Architecture C gate 4 not authorized.

Known review keys: `chestStillCleared`, `stillRepairApproved`, `masterCompositeAuthorized`, `exportApproved`.

### Artifacts

An `ArtifactRef` is a pointer (`assetId` / `bucket`+`path` / `lookId` / `contentHash`) plus `kind` and optional opaque `lanePayload`. Lane G does not open bytes.

`repaired_still_logo_chest` with asset `9ed83c01-8c7d-4d1b-918f-87b0fc743c50` is the CLEARED chest reference.

### Provenance

Every satisfy path writes a `ProvenanceRecord`: adapter id, attempt, input/output artifact ids, timestamps, and a metadata bag for model/version/prompt/hash/seed when a lane supplies them.

### Failure + retry

Failures are classified `input | dependency | adapter | gate | timeout | cancelled`.

Default policy: 3 attempts, 1s × 2^n backoff, retry only `adapter` and `timeout` when `retryable` is true.

Name-based mapping (no imports of query error classes):

| `error.name`                | code                   | retryable           |
| --------------------------- | ---------------------- | ------------------- |
| `VideoNeedsProcessingError` | `needs_transcode`      | no (gate)           |
| `FalRunError`               | `fal_run_failed`       | yes (adapter)       |
| `ProviderCallError`         | `provider_call_failed` | honors `.retryable` |

Chest query `WORKER_RESOURCE_LIMIT` / HTTP 5xx / 546 maps to retryable `chest_query_failed`.

### Persistence

**[DECISION]** No new SQL table in this work-order (Lovable-managed SQL is out of band; this lane must not invent a migration). The run is a versioned JSON document (`contractVersion: 1.1.0`) that can live on `project_assets.metadata_json.pipeline_run` via `embedPipelineRun`. `1.0.0` documents migrate in `parsePipelineRun`.

**[RECOMMENDATION]** A future Class C issue may add a `pipeline_runs` table + durable worker. Until then this is in-process scaffolding. See RISK PIPELINE-1 / OPS-2.

---

## Plug-in contract (other lanes)

```ts
import {
  createClearedChestPipelineRun,
  createLiveProductOsAdapters,
  createStageAdapter,
  runPipelineToPause,
} from "@/lib/pipeline";

// Prefer the CLEARED 1m chest (no new paint, $0):
const run = createClearedChestPipelineRun();

// Live logo_chest via existing query client (still $0; no V3):
const live = createLiveProductOsAdapters({
  sleeveHandler: async (ctx) => {
    // Lane B fills this — call callArchitectureCStillRepair({ stage: "sleeve_panel" }).
    return {
      artifacts: [
        /* repaired_still_sleeve_panel */
      ],
    };
  },
});
```

Rules:

1. Produce the `ArtifactKind`s listed on your stage. Do not require the orchestrator to know your internals.
2. Do not attach `callGrokVideoEdit` / `applyGrokGarmentTruthAndWait` / `createGenerationJob` as the Lane G default. Generation is **import an existing artifact**.
3. Temporal propagation must not run unless `reviews.stillRepairApproved === true`. `chestStillCleared` is not a substitute.
4. Original-master reconstruction must not run unless `reviews.masterCompositeAuthorized === true` (gate 4).
5. Integration of sleeve / temporal happens only after those lanes meet their own acceptance criteria (#50).
6. Do not reopen chest paint. Do not redeploy `architecture-c-still-repair-proxy` from this lane.

---

## Deploy needs (no merge-wait gate)

**[DECISION]** GitHub merge is not a runtime gate. Report Lovable deploy needs instead.

| Action                                | Needed?                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lovable **Publish** (frontend)        | **No** — no product UI mounted on these contracts yet                                                                                                                                      |
| Lovable **Edge Functions → redeploy** | **No** — this lane did not change edge source. Chest compute remains `architecture-c-still-repair-proxy` already serving `architecture_c_still_repair_1m`. Do not redeploy it from Lane G. |
| Lovable SQL editor                    | **No** — run document embeds on existing `metadata_json`; no new table                                                                                                                     |

Machine-readable copy: `LANE_G_DEPLOY_NEEDS` in `src/lib/pipeline/ownership.ts`.

---

## What this work-order does not do

- No paid xAI / Fal / CC calls
- No rewrite of still-repair, placement, occlusion, or propagation engines
- No durable edge orchestrator / reaper (OPS-2 remains open)
- No product UI runner
- No V3 prompt work
- No sleeve / temporal paint (stubs only)

---

## Acceptance (this issue)

- **[VERIFIED in code]** Nine-stage contract + DAG
- **[VERIFIED in code]** Status / artifact / provenance / failure / retry
- **[VERIFIED in code]** Import-from-lane + skip-when-downstream-satisfied
- **[VERIFIED in code]** Still-repair review gate + gate-4 block
- **[VERIFIED in code]** Generation import-only (paid_generation_forbidden)
- **[VERIFIED in code]** JSON persistence + metadata embed helper
- **[VERIFIED in code]** CLEARED chest (`9ed83c01` / 1m) as first-class `keyframe_repair` artifact
- **[VERIFIED in code]** Chest adapter calls `callArchitectureCStillRepair` (logo_chest) without paint imports
- **[VERIFIED in code]** Sleeve + temporal stub hooks (Lane B / Lane C fill)
