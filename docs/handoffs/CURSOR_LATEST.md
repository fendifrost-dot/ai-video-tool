# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1i** occlusion | YES | YES — **LOCKED** | do not reopen |
| Stage **1j** ROI compute | YES | YES — **LOCKED** | do not reopen |
| Stage **1k** enclosure / absorb / right-end | YES | YES (live **NOT CLEARED 7/11**, PR #66) | do not reopen |
| Stage **1l** remaining C2/C4/C6/C9 | **this PR** | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |

## STAGE 1L — ready for edge redeploy

`repair_method_version: architecture_c_still_repair_1l`

Work-order: GitHub **#67** (lineage **#52**, parent **#50**). Lane A only.

### 1k live remaining FAILs (authoritative)

Asset `c9c4efee`, 7/11. PASS: C1, C3, C5, C7, C8, C10, C11.

| # | 1k live | 1l fixture |
|---|---------|------------|
| C2 | 6 remnants | **0** |
| C4 | 19 px / 1-px raise at x 290 | **0** |
| C6 | 41 cream→navy | **0** |
| C9 | 0.195 (right 0.273) | **0** |

### Fixes

| # | Defect | Fix |
|---|--------|-----|
| C2 | Isolated cool ridge AA beside column absorb | Lateral ridge walk (chebyshev 2) in the top strip; skip warm cream |
| C4 | 1-row cream raise with a later jacket shadow | Never absorb a single cream-body row at k=1 |
| C6 | Cool-white tongue (fails `isCreamBodyPixel`) kept as letter holes | Drop high-luma non-navy at x ≥ 576 + paint-time guard |
| C9 | Wordmark-edge AA rejected because it touched outside | Keep in-quad mid-luma on the boundary + adjacent fill |

### Preserved locks

chest-local α · crease/wedge ownership · hand/face protection · no midY luma>180 lock · left-third coverage · no global SAM-3 change · ROI `dilateAlphaRoi` (1j) · 1k closed-component enclosure (extended, not replaced) · 4×3 sleeve unpainted · C8 tapes navy

### Deploy

Redeploy **only** `architecture-c-still-repair-proxy`. No frontend Publish. No V3. No paid Grok.

### Claude next

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Canonical $0 still on `2aa1a44c` + measured quad; expect `architecture_c_still_repair_1l`
3. Score 11 chest criteria with Lane E unfiltered mid-luma (same ruler as PR #66). Target: C2 remnants 0, C4 cream→navy 0, C6 cream→navy 0, C9 combined < 0.05
