# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-10 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1g** | YES (`1e3ac2a` + Lovable restore) | YES — scored **NOT CLEARED** 5/11 (`2d110d13`) | done |
| Stage **1h** code | **YES** — `main` @ `86372e6` (PR #48) | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |
| Sleeve / temporal / paid xAI | blocked | — | **NO** |

## STAGE 1H ON MAIN — ready for edge redeploy

`repair_method_version: architecture_c_still_repair_1h`  
**PR:** https://github.com/fendifrost-dot/ai-video-tool/pull/48  
**Implementation:** `bd4262d` · **Handoff tip:** `86372e65e13cfd3914ec6bbeaef7537a8ae3a59d`

### Lovable commits inspected (pre-1h)

| SHA | Content |
|-----|---------|
| `f5723c4` | `roadmap.md` only |
| `0b264bf` / `81580f7` | Restored edge-only exports (`decodeToRgba`, `encodePng`, `resolveLogoAssets`, `parseLogoPlacement`) + `Float32Array` annotation after 1g mirror overwrite. **Paint logic untouched.** Preserved in this branch. |

### Causal traces verified against source (Claude 1g evidence)

| Defect | Cause confirmed in code | 1h fix |
|--------|-------------------------|--------|
| Top-edge cream raise | `absorbTopPinstripeLocal` claimed any luma>140 for full 6px | Thickness-capped ridge (3px) + `maxAbsY = quadTop − 3` |
| Hard staircase | α re-assert on full `stripeAbsorb` cancelled feather | Solid only on `core ∪ absorb`; expansion keeps inward feather |
| Sleeve smear | Expansion admitted bare `luma < 140` | Expansion: `isChestBandCandidate` only |
| Crease re-imprint | Illumination gain floor 0.80 + trough fill | `navyFloor = max(0.55·med, med−6)`; gain floor **0.95** |
| Center wedge | Zip overlay restored mid-tone wedge | Restore bright zip only (`luma ≥ 150`), narrow core, no feather restore |
| Cream speck bridge | Dark cream-body speckles seeded candidates above quad | Reject non-navy candidates above `quadTop − 1` |

### Preserved 1g wins

bandCandidate / close(6) / largest CC / left-third coverage / SAM-3 fail-closed / wordmark path / global `isNavyPixel` unchanged.

### Verification

- Vitest **715** passed
- Production build passed
- `deno check` on changed edge `logoComposite.ts` + `placementEngine.ts` passed
- Edge-only exports retained

### Claude next (after merge)

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Canonical $0 still on `2aa1a44c` + measured quad; expect `architecture_c_still_repair_1h`
3. Score 11 chest criteria — no Publish · no sleeve · no temporal · no V3 · no prompt · no paid xAI
