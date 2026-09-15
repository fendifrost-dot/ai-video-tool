# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1i** occlusion | YES | YES — **LOCKED** | do not reopen |
| Stage **1j** ROI compute | YES | YES — **LOCKED** | do not reopen |
| Stage **1k** enclosure / absorb / right-end | YES | YES — scored live (PR #66) | **NOT CLEARED 7/11** — do not reopen |
| Stage **1l** C2/C4/C6 + in-quad mid-luma | YES (PR #68) | YES — scored live (PR #70) | **NOT CLEARED 10/11** — C2/C4/C6 **LIVE CLEARED**; do not reopen |
| Stage **1m** C9-right wordmark-edge AA | this PR | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |

## STAGE 1M — ready for edge redeploy

`repair_method_version: architecture_c_still_repair_1m`

Work-order: GitHub **#71** (lineage **#67**, parent **#50**). Lane A only. **C9-right only.**

### 1l canonical live score (authoritative, PR #70 — score-only, repair not re-run)

| Field | Value |
|-------|--------|
| Asset | **`9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75`** |
| `repair_method_version` | `architecture_c_still_repair_1l` |
| Gate | **NOT CLEARED — 10 / 11** |
| PASS | 1, 2, 3, 4, 5, 6, 7, 8, 10, 11 |
| FAIL | **9 only** |
| Ghost ratios (unfiltered) | combined **0.172**, left **0.000**, right **0.261** (84/488 at x 462–500 / y 713–723) |
| Right-end cream→navy | **0** (1k 41) |
| Cream→navy C4 | **0** (1k 19 / 1-px raise) |
| C2 remnants | **0** (1k 6) |

1l vs 1k `c9c4efee` **7/11**: C2/C4/C6 now PASS. Fixture predicted 11/11 — live extra FAIL is C9-right wordmark-edge AA (`warpQuadAlpha` + live SAM-3; cover-only fixture does not reproduce it).

### Fix

| # | Defect | Fix |
|---|--------|-----|
| C9-right | Wordmark-edge AA re-lights source-mid-luma at x 462–500 / y 713–723 after 1l cover | Post-warp snap: in-quad C9-right mid-luma output (≤180, not glyph cores) → painted navy. C6 x≥576 and C4 cream-raise untouched. |

### Preserved locks

chest-local α · crease/wedge ownership · hand/face protection · no midY luma>180 lock · left-third coverage · no global SAM-3 change · ROI `dilateAlphaRoi` (1j) · 1k closed-component enclosure · 1l lateral ridge / 1-row cream raise / cool-white tongue / in-quad mid-luma keep · 4×3 sleeve unpainted · C8 tapes navy · C9-left 0

### Deploy

Redeploy **only** `architecture-c-still-repair-proxy`. No frontend Publish. No V3. No paid Grok.

### Claude next

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Canonical $0 still on `2aa1a44c` + measured quad; expect `architecture_c_still_repair_1m`
3. Score 11 chest criteria with Lane E unfiltered mid-luma (same ruler as PR #70). Target: C9 combined < 0.05 and right window < 0.05; C2 remnants 0, C4 cream→navy 0, C6 cream→navy 0

### Prior 1k live (PR #66, superseded as the remaining-FAIL table by PR #70)

Asset `c9c4efee`, `architecture_c_still_repair_1k`, **NOT CLEARED 7/11**. FAIL C2/C4/C6/C9. 1l cleared C2/C4/C6 live.
