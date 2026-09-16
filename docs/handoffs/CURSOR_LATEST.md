# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-16 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73, `e206d3c`) | YES (asset `9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B isolated sleeve engine | YES (PR #60) | n/a (fixtures) | landed |
| Lane B sleeve still **1a** live | YES (PR #75 wiring, PR #80 score) | YES (asset `fde270bf`) | **NOT CLEARED 5/6** (FAIL #6 cream fill) — historical lock |
| Lane B sleeve still **1b** live | YES (PR #82 paint, PR #83 score) | YES (asset `a4dc7f47`) | **NOT CLEARED 5/6** — left PASS, right cream-majority over dark V2 ring |
| Lane B sleeve still **1c** live | paint YES (PR #85); score evidence PR #86 | YES (asset `fdb86b18`) | **CLEARED 6/6 — LOCKED, do not reopen sleeve paint** |
| Temporal live activation | YES (`TEMPORAL_LIVE_ACTIVATION_ARMED = true`) | **NO — redeploy `temporal-propagate-proxy` only** | **YES after** that one edge redeploy |
| Hero Frame `temporalTrackingEnabled` | stays **false** | n/a | Hero Frame owner — **not this PR** |

## TEMPORAL LIVE ACTIVATION — ready for one edge redeploy

Work-order: GitHub **#87** (lineage **#76** / PR #78, parent **#50**). Sleeve prerequisite: PR **#86** (`fdb86b18`, `architecture_c_sleeve_still_1c`, CLEARED 6/6). Lane C only. **Do not reopen chest 1m or sleeve paint.**

`TEMPORAL_LIVE_ACTIVATION_ARMED = true`  
Dispatch still requires `explicitArm: true`.  
No Grok / Fal / CC. No proxy-auth widen.

### Parent deploy

Redeploy **only** `temporal-propagate-proxy` via Lovable → Edge Functions → redeploy.

**Do not** redeploy `architecture-c-still-repair-proxy` from this lane.  
Publish ≠ edge redeploy. Frontend Publish optional for Hero Frame to call the new edge.

### Hero Frame owner (separate)

`ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled` stays **false**.  
File: `src/lib/heroFrame/architectureCStillRepair.ts`.  
Lane C does not flip it. After the temporal edge is live, Hero Frame owner may flip in a later change. Do not edit chest/sleeve paint as part of that flip.

### Canonical IDs (unchanged)

- project `764a63d2-93cd-44f3-905f-292f14ab2f51`
- still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
- keyframe `v2-still-0.785`
- chest `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11
- sleeve `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6
- chest quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`
- sleeve seeds left `[[0.03,0.50],[0.26,0.505],[0.25,0.615],[0.03,0.61]]` / right `[[0.88,0.505],[0.99,0.50],[0.99,0.615],[0.88,0.61]]`

Full notes: `docs/temporal/LIVE_PREP.md`

## SLEEVE STILL 1c — live score (authoritative)

Work-order: GitHub **#84** (lineage **#81** / **#74** / **#54**, parent **#50**). Lane B score-only. **Do not reopen chest 1m. Do not change 1c paint.**

`repair_method_version: architecture_c_sleeve_still_1c`  
`claim: visible_geometry_only`  
`hidden_shoulder_to_cuff_validated: false`  
`navy_fill_mode: navy_over_cream`

| Field | Value |
|-------|--------|
| Asset | **`fdb86b18-d4aa-465e-b73f-1d252709739c`** |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` (preferred `9ed83c01` not used) |
| Gate | **CLEARED 6/6** |
| Criterion 6 left | luma **202.24→39.93** navyLike **22730/22794** PASS |
| Criterion 6 right | luma **133.56→39.96** navyLike **11104/11139** PASS |
| C5 / C11 / chest reserved | **0 / 0 / 0** PASS |
| Latency / spend | ~5735 ms / $0 |

Full scorecard: `docs/sleeve-panel/LANE_B_SLEEVE_STILL_1C_LIVE_RESULT_2026-09-16.md`  
Crops: `docs/sleeve-panel/live-1c/`

1a `fde270bf` stays historical NOT CLEARED 5/6 (both sides cream). 1b `a4dc7f47` stays historical NOT CLEARED 5/6 (right luma rose). 1c replaced cream with product navy (`source_navy_fraction: 1`) so **both** quads drop.

## SLEEVE STILL 1b — live score (historical)

| Field | Value |
|-------|--------|
| Asset | **`a4dc7f47-a08d-46e5-b279-ae53fd81e37c`** |
| Gate | **NOT CLEARED 5/6** |
| Criterion 6 left | luma **202.24→160.90** PASS |
| Criterion 6 right | luma **133.56→157.51** FAIL |

Full scorecard: `docs/sleeve-panel/LANE_B_SLEEVE_STILL_1B_LIVE_RESULT_2026-09-15.md`

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
