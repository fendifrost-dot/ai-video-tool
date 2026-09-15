# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73, `e206d3c`) | YES (asset `9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B isolated sleeve engine | YES (PR #60) | n/a (fixtures) | landed |
| Lane B **sleeve still live wiring** | YES (PR #75) | YES — live row `fde270bf` | **scored NOT CLEARED 5/6** |
| Temporal live activation | YES (prep only, PR #78) | `TEMPORAL_LIVE_ACTIVATION_ARMED = false` | **wait — sleeve not CLEARED** |

## SLEEVE STILL 1A — live score (authoritative)

Work-order: GitHub **#74** (lineage **#54**, parent **#50**). Lane B score-only. **Do not reopen chest 1m. Do not arm temporal.**

`repair_method_version: architecture_c_sleeve_still_1a`  
`claim: visible_geometry_only`  
`hidden_shoulder_to_cuff_validated: false`

| Field | Value |
|-------|--------|
| Asset | **`fde270bf-63f2-44ff-a76b-4129a0248708`** |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` (preferred `9ed83c01` UI-disabled) |
| `chest_output_asset_id` | `null` (reserved slot still applied) |
| Gate | **NOT CLEARED — 5 / 6** |
| PASS | 1 identity, 2 geometry (no 400), 3 C5, 4 C11, 5 chest reserved |
| FAIL | **6 visible navy-ward repair** — cream/white fill; left luma 202→227, right 134→226 |
| Temporal | **`TEMPORAL_LIVE_ACTIVATION_ARMED` still false** |

Paint was **not** re-run. Scorecard: `docs/sleeve-panel/LANE_B_SLEEVE_STILL_1A_LIVE_RESULT_2026-09-15.md`. Crops: `docs/sleeve-panel/live-1a/`.

### Claude / Fendi next ($0)

1. Do **not** flip `TEMPORAL_LIVE_ACTIVATION_ARMED`
2. Next paint (separate Class C): correct flat-ref navy `sourceBboxNorm`; optionally prefer `9ed83c01` after frontend Publish
3. Re-score a new sleeve row on this same 6-point table

## STAGE 1M — live score (authoritative, PR #73)

`repair_method_version: architecture_c_still_repair_1m`

| Field | Value |
|-------|--------|
| Asset | **`9ed83c01-8c7d-4d1b-918f-87b0fc743c50`** |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Gate | **CLEARED 11/11** |
| C9 combined / left / right | **0.002 / 0.000 / 0.003 PASS** |

Full scorecard: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1M_RESULT_2026-09-15.md`
