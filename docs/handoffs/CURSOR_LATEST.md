# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73, `e206d3c`) | YES (asset `9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B isolated sleeve engine | YES (PR #60) | n/a (fixtures) | landed |
| Lane B sleeve still **1a** live | YES (PR #75 wiring, PR #80 score) | YES (asset `fde270bf`) | **NOT CLEARED 5/6** (FAIL #6 cream fill) — historical lock |
| Lane B sleeve still **1b** navy-ward | YES (PR #82) | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |
| Temporal live activation | YES (prep only, PR #78) | `TEMPORAL_LIVE_ACTIVATION_ARMED = false` | **wait — sleeve not CLEARED** |

## SLEEVE STILL 1b — ready for edge redeploy

Work-order: GitHub **#81** (lineage **#74** / **#54**, parent **#50**). Lane B only. **Do not reopen chest 1m. Do not arm temporal.**

`repair_method_version: architecture_c_sleeve_still_1b`  
`claim: visible_geometry_only`  
`hidden_shoulder_to_cuff_validated: false`

### FAIL #6 (1a historical)

1a live `fde270bf` painted cream/white (left luma 202→227, right 134→226). Scorecard: `docs/sleeve-panel/LANE_B_SLEEVE_STILL_1A_LIVE_RESULT_2026-09-15.md`. Crops: `docs/sleeve-panel/live-1a/`. Root cause: `DEFAULT_FLAT_SLEEVE_SOURCE_BBOX` is cream on the SL flat. 1b `resolveNavyPanelSource` warps a navy-majority crop, else a vertical navy strip, else median product navy.

### Lineage

`9ed83c01` stays **disabled** in the chest still picker (logo_chest chaining lock). Sleeve sends it via `resolvePreferredSleeveStillSource` without selecting it there.

### Deploy

Redeploy **only** `architecture-c-still-repair-proxy`. Frontend Publish optional for paint; required for the product-UI sleeve source resolver. No V3. No paid Grok.

### Claude / Fendi next ($0)

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Hero Frame click path in `docs/sleeve-panel/LANE_B_SLEEVE_STILL_LIVE_WIRING.md`
3. Canonical sleeve run on **9ed83c01** (picker stays on clean `2aa1a44c`)
4. Expect `architecture_c_sleeve_still_1b`. Score `lane-b-sleeve-live-v1`. Criterion 6 must pass. Do **not** start temporal.
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
