# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-07 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1f** | YES | YES — scored **FAIL** 7/10 (`88a73cae`) | done |
| Stage **1g** code | **PR #47** (this land) | **NO — merge + redeploy needed** | **YES after** merge to `main` + `architecture-c-still-repair-proxy` redeploy |
| Sleeve / temporal / paid xAI | blocked | — | **NO** |

## Landed — Stage 1g (band component correction)

`repair_method_version: architecture_c_still_repair_1g`

Root cause of 1f FAIL: `isNavyPixel()` was sole paint authority (~35% of real band). Not feathering / SAM-3.

1. **Chest-path only** `isChestBandCandidate = isNavyPixel || (luma < 60 && chroma < 32)` — `isNavyPixel` unchanged globally
2. **Band component:** candidates → **close(6)** → largest CC overlapping measured quad → top-normal pinstripe absorb ≤6 px (luma > 140)
3. Paint preserved from 1f: `component ∪ (quad ∩ dilate(component, 4))` + inward feather + single pass + luma clamp + SAM-3 fail-closed
4. **Tie/zip wedge absorbed** into closed band; zip line redrawn by existing overlay stage
5. Real-pixel canonical crop regression (shadowed left third + crease x≈279–283)
6. Close runs *before* CC so thin pinstripe/shadow gaps cannot split left/right into two components

### Claude next
1. Merge 1g PR to `main`
2. Redeploy **only** `architecture-c-still-repair-proxy`
3. Verify `architecture_c_still_repair_1g` by behaviour on still `2aa1a44c` + measured quad
4. Score: left third painted, pinstripe covered, crease ≥ median−6, cream/forearm hold, no drips, wordmark/zip hold

No Publish · no sleeve · no temporal · no V3 · no prompt changes · no paid xAI
