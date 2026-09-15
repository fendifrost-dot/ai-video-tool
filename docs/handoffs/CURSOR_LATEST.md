# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1i** occlusion | YES | YES — **LOCKED** | do not reopen |
| Stage **1j** ROI compute | YES | YES — **LOCKED** | do not reopen |
| Stage **1k** enclosure / absorb / right-end | YES | YES — scored live (PR #66) | **NOT CLEARED 7/11** — historical |
| Stage **1l** remaining C2/C4/C6/C9 | YES (PR #68) | YES — **scored live** | **NOT CLEARED 10/11** — C9 remains |

## STAGE 1L — live score (this PR)

`repair_method_version: architecture_c_still_repair_1l`

Work-order: GitHub **#67** (lineage **#52**, parent **#50**). Lane E score-only. No paint change. No redeploy. $0.

### Canonical live (asset `9eaf0c55`)

| Field | Value |
|-------|--------|
| Asset | **`9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75`** |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Latency | ~13 646 ms |
| Gate | **NOT CLEARED — 10 / 11** |
| PASS | 1, 2, 3, 4, 5, 6, 7, 8, 10, 11 |
| FAIL | **9 only** |
| Decoder | ImageScript 1.3.0; `bandAuthorityMaskUsed: false` |

### vs 1k leftovers (PR #66, `c9c4efee`, 7/11)

| # | 1k live | 1l live |
|---|---------|---------|
| C2 remnants | 6 | **0 PASS** |
| C4 cream→navy / raise | 19 / 1-px | **0 / 0 PASS** |
| C6 right-end cream→navy | 41 | **0 PASS** |
| C9 ghost (combined / left / right) | 0.195 / 0.042 / 0.273 | **0.172 / 0.000 / 0.261 FAIL** |

C9: 84 / 488 mid-luma ghosts, all in the wordmark-right window (x 462–500 / y 713–723). Left window cleared. 1k rescore of `c9c4efee` on this ruler is still 7/11.

Full scorecard: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1L_RESULT_2026-09-15.md`

### Claude next

C9-right is the remaining gate. Do not claim CLEARED. Do not reopen C2/C4/C6 without new live pixels. Hold 1i occlusion and 1j ROI. No paid Grok.
