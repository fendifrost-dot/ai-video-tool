# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-16 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73) | YES (asset `9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B sleeve still **1c** CLEARED 6/6 | paint YES (PR #85); score evidence PR #86 | live asset `fdb86b18` | **LOCKED — do not reopen sleeve paint** |
| Temporal live activation | this PR (`TEMPORAL_LIVE_ACTIVATION_ARMED = true`) | **NO — redeploy `temporal-propagate-proxy` only** | **YES after** that one edge redeploy |
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
