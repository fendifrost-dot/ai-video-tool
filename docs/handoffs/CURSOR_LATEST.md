# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73, `e206d3c`) | YES (asset `9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B isolated sleeve engine | YES (PR #60) | n/a (fixtures) | landed |
| Lane B sleeve still **1a** live | YES (PR #75 wiring, PR #80 score) | YES (asset `fde270bf`) | **NOT CLEARED 5/6** (FAIL #6 cream fill) — historical lock |
| Lane B sleeve still **1b** live | YES (PR #82 paint) | YES (asset `a4dc7f47`) | **NOT CLEARED 5/6** (FAIL #6 right luma rose) — this score PR |
| Temporal live activation | YES (prep only, PR #78) | `TEMPORAL_LIVE_ACTIVATION_ARMED = false` | **wait — sleeve not CLEARED** |

## SLEEVE STILL 1b — live score (authoritative)

Work-order: GitHub **#81** (lineage **#74** / **#54**, parent **#50**). Lane B score-only. **Do not reopen chest 1m. Do not arm temporal. Do not change paint.**

`repair_method_version: architecture_c_sleeve_still_1b`  
`claim: visible_geometry_only`  
`hidden_shoulder_to_cuff_validated: false`  
`navy_fill_mode: warp`

| Field | Value |
|-------|--------|
| Asset | **`a4dc7f47-a08d-46e5-b279-ae53fd81e37c`** |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` (preferred `9ed83c01` not used) |
| Gate | **NOT CLEARED 5/6** |
| Criterion 6 left | luma **202.24→160.90** navyLike **5301/22794** PASS |
| Criterion 6 right | luma **133.56→157.51** navyLike **2636/11139** FAIL |
| C5 / C11 / chest reserved | **0 / 0 / 0** PASS |
| Latency / spend | ~5.2 s / $0 |

Full scorecard: `docs/sleeve-panel/LANE_B_SLEEVE_STILL_1B_LIVE_RESULT_2026-09-15.md`  
Crops: `docs/sleeve-panel/live-1b/`

1a `fde270bf` stays historical NOT CLEARED 5/6 (both sides cream). 1b moved left navy-ward and found a navy stripe, but the right paste is still cream-majority over the dark ring so mean luma rose.

### Claude / Fendi next

1. Keep `TEMPORAL_LIVE_ACTIVATION_ARMED = false`
2. Do **not** start temporal
3. Next paint (separate Class C) if product wants another still: navy-majority warp (0.18 threshold accepted ~23% navy + cream body); optionally tighten left quad off the wall; prefer `9ed83c01` after frontend Publish
4. Re-score a new `$0` row on `lane-b-sleeve-live-v1`. Do not mint from the score agent

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
