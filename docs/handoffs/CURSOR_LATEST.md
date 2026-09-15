# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73, `e206d3c`) | YES (asset `9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B isolated sleeve engine | YES (PR #60) | n/a (fixtures) | landed |
| Lane B sleeve still **1a** live | YES (PR #75 wiring, PR #80 score) | YES (asset `fde270bf`) | **NOT CLEARED 5/6** (FAIL #6 cream fill) — historical lock |
| Lane B sleeve still **1b** live | YES (PR #82 paint, PR #83 score) | YES (asset `a4dc7f47`) | **NOT CLEARED 5/6** — left PASS, right cream-majority over dark V2 ring |
| Lane B sleeve still **1c** navy-over-cream | YES (PR #85) | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |
| Temporal live activation | YES (prep only, PR #78) | `TEMPORAL_LIVE_ACTIVATION_ARMED = false` | **wait — sleeve not CLEARED** |

## SLEEVE STILL 1c — ready for edge redeploy

Work-order: GitHub **#84** (lineage **#81** / **#74** / **#54**, parent **#50**). Lane B only. **Do not reopen chest 1m. Do not arm temporal.**

`repair_method_version: architecture_c_sleeve_still_1c`  
`claim: visible_geometry_only`  
`hidden_shoulder_to_cuff_validated: false`  
`navy_fill_mode: warp` \| `median_navy` \| `navy_over_cream` \| `mixed`

### FAIL #6 (1b historical)

1b live `a4dc7f47` warped a ~0.23 navy crop as-is. Left luma 202→161 PASS. Right (already-dark V2 ring) 134→158 FAIL (need ≤125.6). 1c `preferProductNavyOverCream` replaces non-navy source pixels with median product navy so both quads drop luma.

Leftover fixture: 1b-style as-is warp FAILS criterion 6 on the dark right ring; 1c CLEARS 6/6. C5/C11/chest reserved stay 0.

## SLEEVE STILL 1b — live score (authoritative, historical)

Work-order: GitHub **#81** (lineage **#74** / **#54**, parent **#50**). Lane B score-only. **Do not reopen chest 1m. Do not arm temporal. Do not change 1b paint.**

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

### Deploy

Redeploy **only** `architecture-c-still-repair-proxy`. Frontend Publish optional for paint; required for the product-UI sleeve source resolver. No V3. No paid Grok. Parent owns Lovable after READY.

### Claude / Fendi next ($0)

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Hero Frame click path in `docs/sleeve-panel/LANE_B_SLEEVE_STILL_LIVE_WIRING.md`
3. Canonical sleeve run on **9ed83c01** (picker stays on clean `2aa1a44c`)
4. Expect `architecture_c_sleeve_still_1c`. Score `lane-b-sleeve-live-v1`. Criterion 6 must pass on **both** sides. Do **not** start temporal.
5. Do **not** flip `TEMPORAL_LIVE_ACTIVATION_ARMED`

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
