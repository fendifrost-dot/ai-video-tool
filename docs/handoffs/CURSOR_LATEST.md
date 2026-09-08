# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-08 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1f** | YES | YES — scored **FAIL** 7/10 (`88a73cae`) | done |
| Stage **1g** code | **PR #47** (readiness fix on branch) | **NO — merge + redeploy needed** | **YES after** merge to `main` + `architecture-c-still-repair-proxy` redeploy |
| Sleeve / temporal / paid xAI | blocked | — | **NO** |

## STAGE 1G READY FOR LIVE VERIFICATION

`repair_method_version: architecture_c_still_repair_1g`

### Checklist (review pass)

1. `isNavyPixel` unchanged globally; chest-only `isChestBandCandidate`
2. `bandCandidate = isNavyPixel || (luma < 60 && chroma < 32)`
3. Candidates gated to search-shell `invBilinear`
4. Close(6) before CC; re-gated to search shell; lower-half cream fills rejected
5. Largest CC overlapping measured quad
6. Real crop from still `2aa1a44c` (not procedural) — 1f navy-only CC leaves left third + crease at 0
7. Top-normal pinstripe absorb; solid alpha after feather (thin ridge not eroded)
8. 1f paint union + cream-safe expansion + inward feather + single pass + luma clamp + SAM-3 / fail-closed skin default
9. Tie/zip wedge absorbed; zip overlay restores line
10. Fixture = lossless RGBA crop from live hero frame; golden asserts 1f would fail on it

### Claude next
1. Merge PR #47 to `main`
2. Redeploy **only** `architecture-c-still-repair-proxy`
3. Evidence-only live score on `2aa1a44c` + measured quad
4. No Publish · no sleeve · no temporal · no V3 · no prompt · no paid xAI
