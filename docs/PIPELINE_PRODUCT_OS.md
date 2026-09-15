# AVT Pipeline / Product OS — Lane G

**Issue:** [#51](https://github.com/fendifrost-dot/ai-video-tool/issues/51) (child of [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50) lane 7)  
**Owner:** Lane G — orchestration only  
**Class:** C (orchestration: job graph, stage status/retry/resume). Architecture + product + security sign-off before merge.  
**Status:** scaffolding. Not a durable queue. Not a live production runner.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Mission

**[DECISION]** Build the layer that lets completed stages plug together instead of remaining isolated experiments.

Approximate model:

```
ingest
  → generation
  → keyframe repair
  → sleeve/garment repair
  → temporal propagation
  → original-master reconstruction
  → deterministic branding
  → automated evaluation
  → review/export
```

**[DECISION]** Lane G owns contracts, statuses, artifacts, provenance, failure, and retry. It does **not** own Architecture C algorithms, Grok generation internals, proxy auth, Control Center, evaluation metric implementations, or Astra/Premiere.

---

## Hard locks (this lane)

| Lock | Enforcement |
|------|-------------|
| No `fendi-control-center` | No CC files; no new proxy hops |
| No proxy auth widening | No edge/auth edits |
| No PR #37 | Out of scope |
| No V3 / paid Grok gens | `generation` is import-only; `paidCallSurfaces()` lists the forbidden entrypoints |
| Do not rewrite Architecture C | Still-repair / placement / occlusion modules are consume-only lane surfaces |
| Identify files before touching shared surfaces | This lane adds `src/lib/pipeline/**` + this doc + a RISK_REGISTER pointer. It does not edit query/garment/edge algorithm files |

---

## Why this exists

**[OBSERVED]** Orchestration today is fragmented: `project_assets.metadata_json` status keys (`extract_status`, `propagate_status`, …), `artist_looks.status`, `provider_jobs`, and imperative client sequences in `wardrobeVideoFrames.ts` / `heroFrame.ts`. There is no `pipeline_runs` table and no DAG.

**[VERIFIED]** `docs/ARCHITECTURE_C_CHATGPT_LOCK_2026-09-03.md` hard-stops temporal propagation and SAM-3 original-master composite until a repaired still passes human review. Gate 4 is explicitly “next architecture gate.”

**[DECISION]** Other lanes plug in by producing `ArtifactRef`s of named kinds. The orchestrator stores lane payloads opaquely and never imports algorithm modules.

---

## Module map (intended files)

| Path | Role |
|------|------|
| `src/lib/pipeline/types.ts` | Stage ids, statuses, artifact kinds, provenance, failure, retry policy |
| `src/lib/pipeline/contract.ts` | Per-stage consume/produce/gates + **lane surface registry** |
| `src/lib/pipeline/adapters.ts` | Plug-in `StageAdapter` / `StageHandler` |
| `src/lib/pipeline/orchestrator.ts` | Create / advance / retry / review flags |
| `src/lib/pipeline/persistence.ts` | JSON document + `metadata_json.pipeline_run` embed |
| `src/lib/pipeline/errors.ts` | `PipelineError` + name-based classification of existing errors |
| `src/lib/pipeline/retry.ts` | Default policy + backoff |
| `src/lib/pipeline/graph.ts` | Topological order / cycle check |

### Shared surfaces Lane G does **not** modify

Named so a later integration issue can grant access explicitly:

- `src/lib/queries/wardrobeVideoFrames.ts` — extract / Lane A propagate
- `src/lib/queries/architectureCStillRepair.ts` — `callArchitectureCStillRepair`
- `src/lib/heroFrame/architectureCStillRepair.ts` — still-repair metadata helpers
- `src/lib/garment/placementEngine.ts`, `src/lib/garment/logoComposite.ts`
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

Run rolls up from stages: running if any stage is running/retrying; otherwise needs_review / blocked / failed win over succeeded.

**skipped** = downstream already satisfied (e.g. a `source_still` is seeded, so `generation` is not required).  
**succeeded** + provenance `imported_from_lane` = another lane already produced this stage’s output kinds.  
**needs_review** = a `StageGate.reviewKey` is not true (still-repair approval, export approval).  
**blocked** = upstream failed, or Architecture C gate 4 not authorized.

### Artifacts

An `ArtifactRef` is a pointer (`assetId` / `bucket`+`path` / `lookId` / `contentHash`) plus `kind` and optional opaque `lanePayload`. Lane G does not open bytes.

### Provenance

Every satisfy path writes a `ProvenanceRecord`: adapter id, attempt, input/output artifact ids, timestamps, and a metadata bag for model/version/prompt/hash/seed when a lane supplies them.

### Failure + retry

Failures are classified `input | dependency | adapter | gate | timeout | cancelled`.

Default policy: 3 attempts, 1s × 2^n backoff, retry only `adapter` and `timeout` when `retryable` is true.

Name-based mapping (no imports of query error classes):

| `error.name` | code | retryable |
|--------------|------|-----------|
| `VideoNeedsProcessingError` | `needs_transcode` | no (gate) |
| `FalRunError` | `fal_run_failed` | yes (adapter) |
| `ProviderCallError` | `provider_call_failed` | honors `.retryable` |

### Persistence

**[DECISION]** No new SQL table in this work-order (Lovable-managed SQL is out of band; this lane must not invent a migration). The run is a versioned JSON document (`contractVersion: 1.0.0`) that can live on `project_assets.metadata_json.pipeline_run` via `embedPipelineRun`.

**[RECOMMENDATION]** A future Class C issue may add a `pipeline_runs` table + durable worker. Until then this is in-process scaffolding. See RISK PIPELINE-1 / OPS-2.

---

## Plug-in contract (other lanes)

```ts
import { createStageAdapter, createPipelineRun, runPipelineToPause } from "@/lib/pipeline";

const keyframeRepair = createStageAdapter("keyframe_repair", async (ctx) => {
  // Call callArchitectureCStillRepair HERE from the still-repair lane — not from Lane G defaults.
  return { artifacts: [/* repaired_still_logo_chest */], metadata: { /* repro */ } };
});
```

Rules:

1. Produce the `ArtifactKind`s listed on your stage. Do not require the orchestrator to know your internals.
2. Do not attach `callGrokVideoEdit` / `applyGrokGarmentTruthAndWait` / `createGenerationJob` as the Lane G default. Generation is **import an existing artifact**.
3. Temporal propagation must not run unless `reviews.stillRepairApproved === true`.
4. Original-master reconstruction must not run unless `reviews.masterCompositeAuthorized === true` (gate 4).
5. Integration happens only after your lane’s own acceptance criteria are met (#50).

---

## What this work-order does not do

- No paid xAI / Fal / CC calls
- No rewrite of still-repair, placement, occlusion, or propagation engines
- No durable edge orchestrator / reaper (OPS-2 remains open)
- No product UI runner
- No V3 prompt work

---

## Acceptance (this issue)

- **[VERIFIED in code]** Nine-stage contract + DAG
- **[VERIFIED in code]** Status / artifact / provenance / failure / retry
- **[VERIFIED in code]** Import-from-lane + skip-when-downstream-satisfied
- **[VERIFIED in code]** Still-repair review gate + gate-4 block
- **[VERIFIED in code]** Generation import-only (paid_generation_forbidden)
- **[VERIFIED in code]** JSON persistence + metadata embed helper
