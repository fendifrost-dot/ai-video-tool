# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-10 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1h** | YES (`9b5f90c` / PR #48) | YES — scored **NOT CLEARED** 4/11 (`39c4a842`, evidence `df64344`) | done |
| Stage **1i** code | **YES** — `main` @ `cc5b796` (PR #49 FF-merged) | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |
| Sleeve / temporal / paid xAI | blocked | — | **NO** |

## STAGE 1I ON MAIN — ready for edge redeploy

`repair_method_version: architecture_c_still_repair_1i`  
**PR:** https://github.com/fendifrost-dot/ai-video-tool/pull/49  
**Tip:** `cc5b796`

Evidence read + independently verified: `df64344` + handoff `fa55102`.

### Approved rulings implemented

| # | Ruling | Code |
|---|--------|------|
| 1 | Chest-local occlusion inside verified band: `α = 1 − dilate(hands ∪ face)`; outside keep outfit-based α | `applyChestLocalOcclusionSemantics` + `bandAuthorityMask` from `coverTargetQuad`; SAM-3 returns raw hands/face |
| 2 | Withdraw `y > bandMidY && luma > 180` hard lock | Removed from paint pass |
| 3 | Top absorb from fixed component-top origin; ridge+AA; no cream-body raise | `absorbTopPinstripeLocal` — dark-above-ridge signature; no re-climb |
| 4 | Close must not pull shadowed cream sleeve/forearm | Close-added non-navy with luma ≤ 180 rejected |

### Regression (mandatory)

- Fixture: `src/lib/garment/fixtures/architectureCStill1hSam3Evidence.ts` — evidence-derived Stage 1h α (crease coverage profile + wedge hole + hand window); no binary dump in `df64344`
- Golden runs **paint → illumination → zip → chest-local occlusion composite** (not pre-occlusion only)

### Deploy

Redeploy **only** `architecture-c-still-repair-proxy`. No frontend Publish.

### Claude next (after merge)

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Canonical $0 still on `2aa1a44c` + measured quad; expect `architecture_c_still_repair_1i`
3. Score 11 chest criteria — no Publish · no sleeve · no temporal · no V3 · no prompt · no paid xAI
