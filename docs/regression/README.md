# Lane R — Reliability / regression

**Lane:** R (Sprint 2 child [#104](https://github.com/fendifrost-dot/ai-video-tool/issues/104), parent [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) / umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))  
**Class:** A (docs + tests only). `paidCalls=false`. No provider calls.  
**Owns:** `tests/regression/**`, this folder, `scripts/run-regression-locked.mjs`, `package.json` `test:regression`.

This lane re-runs existing deterministic suites so concurrent Sprint 2 work cannot silently break CLEARED chest/sleeve goldens, the temporal auth path, or reconstruct unit proofs.

It does **not** edit product paint. If a locked suite is red, write evidence and assign the owning lane.

## Re-run

```bash
# Locked surfaces only (chest/sleeve CLEARED goldens, temporal auth, reconstruct proofs)
npm run test:regression

# Full deterministic Vitest suite (report by category — see docs/TEST_TAXONOMY.md)
npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'
```

Machine-readable file list + owning lanes: [`tests/regression/locked-surfaces.json`](../../tests/regression/locked-surfaces.json).

Human inventory: [`LOCKED_SURFACES.md`](LOCKED_SURFACES.md).  
Escalation protocol: [`OWNERSHIP.md`](OWNERSHIP.md).  
Sprint 2 baseline: [`SPRINT2_LANE_R_REPORT.md`](SPRINT2_LANE_R_REPORT.md).  
Real-media placeholders (all **UNCLAIMED**): [`REAL_MEDIA_LOCKS.md`](REAL_MEDIA_LOCKS.md).  
Follow-up report: [`SPRINT2_LANE_R_REAL_MEDIA.md`](SPRINT2_LANE_R_REAL_MEDIA.md).

## What this is not

- Not a CI gate (none exists today — `TEST_TAXONOMY.md`).
- Not a paid Grok / Fal / Control Center path.
- Not permission to reopen chest 1m or sleeve 1c paint.
- Not permission to widen `grok-video-research-proxy` auth or touch PR #37.
