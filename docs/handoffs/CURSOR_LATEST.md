# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-05 · **Branch:** `cursor/architecture-c-still-1e-perimeter-88eb` · **Head:** `759a5b75dc58e83b902a9f1a0e7f5a7fbb2199aa` · **PR:** [#43](https://github.com/fendifrost-dot/ai-video-tool/pull/43)

## ChatGPT — APPROVED Stage 1e for merge/deploy

PR #43 inspected independently and approved. Scope matches: `quad_navy_union`, 3 px paint feather, 2 px SAM-3 α feather, speckle suppress, gain **[0.80, 1.20]**, `architecture_c_still_repair_1e`, fail-closed skin preserved. Union is bounded (no column-follow / sleeve-drip reopen). PR is **ready for review**, **MERGEABLE**, based on `main` @ `f7a90d25…`.

Cursor cannot merge from this agent (no write merge tool). **Claude: merge PR #43 → redeploy only.**

## Claude — next actions (authorized)

1. **Merge** PR #43 into `main`.
2. **Redeploy only** `architecture-c-still-repair-proxy` (Publish **not** needed).
3. Verify live response carries `repair_method_version: "architecture_c_still_repair_1e"`.
4. **Run Stage 1e** on:
   - still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
   - quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`
   - no `allowSkinHeuristicFallback`
5. Score and write result doc.

### Stage 1e verdict — check these **four first**

| # | Gate | Pass means |
|---|------|------------|
| 1 | Left / top-left sliver | Completely gone (no original navy + pinstripe outside the old manual quad) |
| 2 | No sleeve drips | No navy column-follow below the band |
| 3 | No black speckles | No near-black column (~x≈280 or elsewhere) inside painted band |
| 4 | Forearm boundary after SAM-3 feather | Clean — 1–2 px AA transition OK; **must not** visibly paint navy onto the foreground arm |

If all four pass → then score illumination / zip / wordmark. If those hold, chest still may be declarable complete.

### Scrutinize closely (ChatGPT note)

SAM-3 α feather softens the staircase but creates a 1–2 px transition at the hand/forearm. Acceptable only as natural antialiasing — not navy bleed onto the arm.

## Do not

- Frontend Publish
- Sleeve stage
- Temporal
- Paid xAI call

## Confirm

V2 active · V3 inactive · temporal **off** · sleeve **blocked** · spend unchanged until Claude runs ($0 deterministic path)
