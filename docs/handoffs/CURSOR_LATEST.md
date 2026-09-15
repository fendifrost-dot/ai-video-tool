# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1i** occlusion | YES | YES — **LOCKED** | do not reopen |
| Stage **1j** ROI compute | YES | YES — **LOCKED** | do not reopen |
| Stage **1k** enclosure / absorb / right-end | **this PR** | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |

## STAGE 1K — ready for edge redeploy

`repair_method_version: architecture_c_still_repair_1k`

Work-order: GitHub **#52** (parent **#50**). Lane A only.

### Fixes

| # | Defect (1j live) | Fix |
|---|------------------|-----|
| 1 | ≥4 original-seed neighbours missed glyph/tape AA (ghosts 0.60 / 0.59) | Closed-component enclosure: keep close-added mid-luma iff not 8-adjacent to outside; reject cream-body bridges |
| 2 | Golden skipped rejected AA via `bandAuthorityMask` | Unfiltered mid-luma windows; target ghost ratio **< 0.05** |
| 3 | Right-end protrusion 114 px (x 580–616 / y 713–730) | Trim non-navy past solid navy run; residual navy-bounded cream holes **42** on fixture (was 114) |
| 4 | Ridge AA leftover + 3-px cream raise | Absorb AA (L≥90) immediately above component; stop when cream-body continues as a field |
| 5 | 1j 4×3 sleeve patch | Below-quad cream trim; enclosure rejects boundary cream |

### Fixture vs 1j (canonical crop `2aa1a44c`)

| Metric | 1j | 1k |
|--------|----|----|
| Left glyph ghost ratio | 0.596 | **0.042** |
| Right letter ghost ratio | 0.416 | **0.012** |
| Right-end cream→navy | 114 | **42** |
| Sleeve 4×3 | 8 | **0** |
| Left tape x399 y715 | unpainted (110) | **painted (34)** |
| Cream raise x280–330 y673–675 | 0 (fixture) | **0** |

### Preserved locks

chest-local α · crease/wedge ownership · hand/face protection · no midY luma>180 lock · left-third coverage · no global SAM-3 change · ROI `dilateAlphaRoi` (1j compute)

### Deploy

Redeploy **only** `architecture-c-still-repair-proxy`. No frontend Publish. No V3. No paid Grok.

### Claude next

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Canonical $0 still on `2aa1a44c` + measured quad; expect `architecture_c_still_repair_1k`
3. Score 11 chest criteria + unfiltered ghost ratios (target < 0.05), tape x399–401, right-end window, cream-body rows 673–675
