# Sprint 2 Lane R baseline — 2026-09-16

**Issue:** [#104](https://github.com/fendifrost-dot/ai-video-tool/issues/104) (child of [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) / umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))  
**Class:** A (docs + tests). `paidCalls=false`. No provider calls, no edge redeploy, no Publish.  
**Baseline SHA:** `988af29` (`main` = Merge PR #101 reconstruct E2E) plus this harness.  
**Host:** cloud agent VM. Vitest 4.1.6. `STAGE1K_HARNESS` unset.

## Suite status

### Locked subset (`npm run test:regression`)

**VERIFIED:** 17 files, 199 passed, 0 failed, ~6.1s.

| Suite id | Lane | Status |
|----------|------|--------|
| chest-cleared-golden | A | PASS |
| chest-identity | A | PASS |
| sleeve-cleared-live-score | B | PASS |
| sleeve-cleared-live-still | B | PASS |
| sleeve-contract | B | PASS |
| temporal-auth-prep | C | PASS |
| temporal-auth-smoke | C | PASS |
| temporal-hero-dispatch | C / Hero Frame | PASS |
| reconstruct-unit | D | PASS |
| reconstruct-wiring | D | PASS |
| reconstruct-e2e | D | PASS |
| reconstruct-video-eval | E | PASS |
| lane-r-cross-copy | R | PASS (11 new contract cases) |

Chest 1m CLEARED 11/11 goldens green. Sleeve 1c CLEARED 6/6 goldens green. Temporal auth path (`explicitArm` required, `paidCalls=false`) green. Reconstruct unit + E2E $0 proofs green.

### Full deterministic Vitest

**VERIFIED** (same SHA, `npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'`):

| Category | Count | Notes |
|----------|------:|-------|
| **Unit** | **946** | No I/O double (`vi.mock` / `vi.stubGlobal` of supabase/storage/fetch). Includes the 11 Lane R contract cases. |
| **Integration (mocked)** | **37** | Same four files as `docs/TEST_TAXONOMY.md`: `providerJobs/api.test.ts` (18), `dispatchScrubProxy.test.ts` (11), `MultiAngleGallery.test.tsx` (2), `wardrobeVideoFramesGate.test.ts` (6). |
| **Provider-Live** | **0** | `src/lib/eval/liveVerify.runner.test.ts` is `describe.skipIf(!STAGE1K_HARNESS)` — 1 file / 1 test skipped. Lane R did **not** set the env (would invoke still-repair). |
| **Real-Media-Benchmark** | **0** | |
| **Deployment-Smoke** | **0** | No CI gate (`TEST_TAXONOMY.md`). |
| **TOTAL run** | **983 passed + 1 skipped** | **90 files passed + 1 skipped (91).** |

Headline, stated correctly:

> **983 automated tests passed across 90 files, plus 1 skipped live-harness file: 946 unit, 37 mocked-integration, 0 provider-live, 0 real-media-benchmark, 0 deployment-smoke.**

`docs/TEST_TAXONOMY.md` last verified 2026-08-27 still prints 50 files / 623 tests. That document is **stale vs this recount**. Lane R did not rewrite it (outside `docs/regression/` ownership). Future agents should use this snapshot until taxonomy is updated.

No red locked suite. No paint fix.

## Conflicts escalated (YELLOW, not a failing test)

### 1. Lane C deploy-notes copy vs product tracking flag

| Copy | Value | Owner |
|------|-------|-------|
| `ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled` | **true** | Hero Frame (PR #91 / #95) |
| `TEMPORAL_LIVE_DEPLOY_NOTES.heroFrameOwnerFlip.current` | **false** | Lane C (`livePrep.ts` + Deno vendor). `livePrep.test.ts` **locks** `current` to false. |
| Still-repair edge mirror | **false** | Intentional — proxy 500 guard |

**HYPOTHESIS:** notes field is a collision-policy leftover ("Lane C does not flip Hero Frame"), not an auth-path bug. Auth/dispatch uses `TEMPORAL_LIVE_ACTIVATION_ARMED` + product flag + `explicitArm`.

**Assign:** Lane C may update the notes copy after ChatGPT YELLOW if they want docs parity. Lane R will **not** edit `src/lib/temporal/livePrep.ts` or the Deno vendor.

Follow-up: RISK_REGISTER **REL-2** (docs-only, issue #115). Still not a failing suite.

### 2. Still-output metadata still stamps `temporalTrackingEnabled: false`

`STAGE1M_LIVE_VERIFIED` and `SLEEVE_STILL_1C_LIVE_VERIFIED` record `temporalTrackingEnabled: false` (still-repair / sleeve-still live rows). Product tracking is independently true. **OBSERVED**, not a gate reopen. Do not treat as CLEARED-still regression.

## What Lane R did not do

- No edits to `logoComposite`, `sleevePanel` paint, `authorizeTemporalEdgeRequest`, reconstruct composite, Hero Frame product flag, CC, Grok proxies, PR #37, auth/RLS.
- No paid Grok. No Lovable Publish. No edge redeploy.
- No `STAGE1K_HARNESS=1` live invoke.

## Re-run

```bash
npm run test:regression
npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'
```

See [`README.md`](README.md) and [`LOCKED_SURFACES.md`](LOCKED_SURFACES.md).
