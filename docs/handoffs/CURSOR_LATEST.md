# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1i** occlusion | YES | YES — **LOCKED** | do not reopen |
| Stage **1j** ROI compute | YES | YES — **LOCKED** | do not reopen |
| Stage **1k** enclosure / absorb / right-end | YES | YES — scored live (PR #66) | **NOT CLEARED 7/11** — historical |
| Stage **1l** C2/C4/C6 + in-quad mid-luma | YES (PR #68) | YES — scored live (PR #70) | **NOT CLEARED 10/11** — historical; C2/C4/C6 **LIVE CLEARED** |
| Stage **1m** C9-right wordmark-edge AA | YES (PR #72) | YES — scored live (this PR) | **CLEARED 11/11** |

## STAGE 1M — live score (canonical)

`repair_method_version: architecture_c_still_repair_1m`

Work-order: GitHub **#71** (lineage **#67**, parent **#50**). Lane E score-only. No paint change. No redeploy. No spend.

### Canonical live verdict (asset `9ed83c01`)

| Field | Value |
|-------|--------|
| Asset | **`9ed83c01-8c7d-4d1b-918f-87b0fc743c50`** |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Latency | ~16 550 ms |
| Gate | **CLEARED — 11 / 11** |
| PASS | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 |
| FAIL | none |
| Decoder | ImageScript 1.3.0; `bandAuthorityMaskUsed: false` |
| Ghost ratios (unfiltered) | combined **0.002**, left **0.000**, right **0.003** (1/488; leftover box 1/119 at (463, 714)) |

### vs 1l leftovers (PR #70, `9eaf0c55`, 10/11)

| # | 1l live | 1m live |
|---|---------|---------|
| C2 remnants | 0 | **0 PASS** |
| C4 cream→navy / raise | 0 / 0 | **0 / 0 PASS** |
| C6 right-end cream→navy | 0 | **0 PASS** |
| C9 ghost (combined / left / right) | 0.172 / 0.000 / 0.261 | **0.002 / 0.000 / 0.003 PASS** |

C9: 84 → **1** mid-luma ghost. Right window 0.261 → **0.003**. The 1 leftover is (463, 714), output luma 186.5 — above the 1m snap's ≤180 AA cap (C7 glyph-core lock). Combined and right stay under 0.05.

Full scorecard: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1M_RESULT_2026-09-15.md`

### Claude next

Chest still gate is **CLEARED**. Do not reopen C9-right paint for the 1 leftover glyph-core pixel. Next is a product decision (human review of `9ed83c01`, then temporal / original-master lanes) — not another chest-paint stage. No proxy redeploy required for this score.

## STAGE 1L — live score (historical, PR #70) + identity / UI path (PR #69)

`repair_method_version: architecture_c_still_repair_1l`

Work-order: GitHub **#67** (lineage **#52**, parent **#50**). Lane E score-only. No paint change. Historical 10/11 evidence — do not mint another 1l row.

### Canonical live verdict (asset `9eaf0c55`, PR #70)

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
| Ghost ratios (unfiltered) | combined **0.172**, left **0.000**, right **0.261** (84/488 at x 462–500 / y 713–723) |

### vs 1k leftovers (PR #66, `c9c4efee`, 7/11)

| # | 1k live | 1l live |
|---|---------|---------|
| C2 remnants | 6 | **0 PASS** |
| C4 cream→navy / raise | 19 / 1-px | **0 / 0 PASS** |
| C6 right-end cream→navy | 41 | **0 PASS** |
| C9 ghost (combined / left / right) | 0.195 / 0.042 / 0.273 | **0.172 / 0.000 / 0.261 FAIL** |

C9: 84 / 488 mid-luma ghosts, all in the wordmark-right window (x 462–500 / y 713–723). Left window cleared. 1k rescore of `c9c4efee` on this ruler is still 7/11. Fixture predicted 11/11 — live extra FAIL is C9-right wordmark-edge AA (`warpQuadAlpha` + live SAM-3; cover-only fixture does not reproduce it).

Full scorecard: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1L_RESULT_2026-09-15.md`

### Identity / UI path (PR #69 — do not mint a second 1l row)

| Field | Value |
|-------|--------|
| `repair_method_version` | **`architecture_c_still_repair_1l`** |
| Clean still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Quad | `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` |
| SAM-3 | `occlusion_source: sam3`, `sam3_ok: true`, fallback `false` |
| Created | 2026-09-15 04:32:47Z |

This cloud VM had no `AVT_USER_ACCESS_TOKEN`. Anon POST is still 401. The 1l row was produced by a signed-in owner session (same body as `callArchitectureCStillRepair`). Repair was **not** re-run from the identity or score agents.

Full identity + UI path: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1L_LIVE_ASSET_2026-09-15.md`

UI: `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame` → **7 · Architecture C — still-first deterministic repair** → ★ clean still → override chest quad (do not Reset to measured band) → **1 · Repair chest_band + logo_zone**.

### 1k canonical live score (authoritative, PR #66 — historical)

| Field | Value |
|-------|--------|
| Asset | **`c9c4efee-6bd2-450f-a9e4-b70fb9b722bb`** |
| `repair_method_version` | `architecture_c_still_repair_1k` |
| Gate | **NOT CLEARED — 7 / 11** |
| PASS | 1, 3, 5, 7, 8, 10, 11 |
| FAIL | 2, 4, 6, 9 |

Full scorecard: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1K_RESULT_2026-09-15.md`
