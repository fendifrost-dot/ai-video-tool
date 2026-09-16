# Locked surfaces (Lane R)

Sprint 2 freeze. Re-run with `npm run test:regression`. Manifest: `tests/regression/locked-surfaces.json`.

`paidCalls=false` on every path below. No Fal / Grok / Control Center.

## Chest 1m CLEARED 11/11 — Lane A

| | |
|--|--|
| Asset | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50` |
| Method | `architecture_c_still_repair_1m` |
| Still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Quad | `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` |
| Evidence | PR #73; `src/lib/eval/stage1mEvidence.ts` |

**Suite:** `src/lib/garment/architectureCStillRepairGolden.test.ts`  
**Identity:** `src/lib/heroFrame/architectureCStillRepair.test.ts`

If red → Lane A. Do not edit `logoComposite` / `stillRepairOcclusion` / still-repair proxy from Lane R.

## Sleeve 1c CLEARED 6/6 — Lane B

| | |
|--|--|
| Asset | `fdb86b18-d4aa-465e-b73f-1d252709739c` |
| Method | `architecture_c_sleeve_still_1c` |
| Seeds | left `[[0.03,0.50],[0.26,0.505],[0.25,0.615],[0.03,0.61]]`, right `[[0.88,0.505],[0.99,0.50],[0.99,0.615],[0.88,0.61]]` |
| Evidence | PR #86; `src/lib/eval/sleeveStill1cEvidence.ts` |

**Suites:** `src/lib/sleevePanel/liveScore.test.ts`, `liveStill.test.ts`, `contract.test.ts`

If red → Lane B. Do not edit sleeve paint.

## Temporal auth / dispatch — Lane C

Locked contract:

1. `TEMPORAL_LIVE_ACTIVATION_ARMED === true`
2. `authorizeTemporalEdgeRequest` refuses without `explicitArm`
3. Armed + CLEARED chest/sleeve + `explicitArm` authorizes
4. `dispatchTemporalPropagate` returns `paidCalls=false`, `grokPerFrame=false`, `provider=none`
5. Product `ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled === true`
6. Still-repair **edge mirror** of that flag stays **false** (proxy 500 guard)

**Suites:** `src/lib/temporal/livePrep.test.ts`, `liveSmoke.test.ts`, `src/lib/heroFrame/temporalDispatch.test.ts`, `temporalRunControl.test.ts`

If red → Lane C / Hero Frame owner. Do not edit `authorizeTemporalEdgeRequest` from Lane R.

## Reconstruct unit proofs — Lane D (+ Lane E eval)

Locked contract:

1. `α === 0` → original-master RGB bytes (Grok still cannot become the master)
2. `RECONSTRUCT_LIVE_WIRING_ARMED === true`; dispatch still needs `explicitArm`
3. E2E $0 uses fixture/caller temporal jobs; no SAM-3 live fetch; `paidCalls=false`
4. Lane E reconstruct-video 9/9 PASS does **not** reopen still goldens (`stillGoldensReopened=false`)

**Suites:** `src/lib/reconstruct/originalMasterReconstruct.test.ts`, `liveWiring.test.ts`, `adapters.test.ts`, `dispatch.test.ts`, `e2e.test.ts`, `heroFrameRun.test.ts`, `src/lib/eval/reconstructVideoEvaluator.test.ts`

If red → Lane D (composite) or Lane E (evaluator). Do not reopen chest/sleeve paint.

## Cross-copy freeze — Lane R

Temporal and reconstruct **copy** CLEARED IDs instead of importing paint owners. `tests/regression/locked-lineage.contract.test.ts` asserts those copies still match each other and the Lane R freeze.

If red because one copy drifted → assign the lane that changed its table. Do not merge the modules.

## Real-media gates — UNCLAIMED (not a PASS)

Sprint 2 still has **no** Real-Media-Benchmark. Placeholders live in [`REAL_MEDIA_LOCKS.md`](REAL_MEDIA_LOCKS.md) / `tests/regression/real-media-locks.json`.

| Lock | Owner | Status |
|------|-------|--------|
| Full-clip temporal QA | C2 #107 | **UNCLAIMED** |
| Original-master preservation video | D2 #108 | **UNCLAIMED** |
| Playable MP4 provenance to `76fe7438` | H #111 | **UNCLAIMED** |
| SAM-3 consume evidence (`liveFetch=false`) | D2 #108 / H #111 | **UNCLAIMED** |
| E2 video QA JSON | E2 #105 | **UNCLAIMED** |

Do not treat #96 click-smoke, #100 5-frame E2E, or the #133 live WebCodecs sample E2 PASS (`frames=8` of 72, not full-clip) as these locks. Do not invent PASS from Lane R.

## Full deterministic suite

Not a locked subset. Still required for the Sprint 2 report:

```bash
npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'
```

Report counts **by category** (`docs/TEST_TAXONOMY.md`). Provider-live / real-media / deployment-smoke remain 0 unless a new file actually opens a socket or hits a deployed edge.
