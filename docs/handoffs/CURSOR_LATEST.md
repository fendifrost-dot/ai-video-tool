# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-16 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73) | YES (`9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B sleeve still **1c** | YES (PR #85 / #86) | YES (`fdb86b18`) | **CLEARED 6/6 — LOCKED** |
| Temporal live activation | YES (`TEMPORAL_LIVE_ACTIVATION_ARMED = true`) | YES — `temporal-propagate-proxy` OPTIONS 200 / JWT only | **YES after owner JWT** |
| Hero Frame `temporalTrackingEnabled` | YES (`true` + `prepareHeroFrameTemporalDispatch` → `explicitArm`) | frontend Publish | **YES** — §7 shows gate; **no run button** |
| Lane D original-master live wiring | YES (`200bea9` / PR #92) | n/a — in-lib | **separate** — not this smoke POST |
| Temporal `$0` live smoke | this PR (docs + script) | edge live; **VM BLOCKED on JWT** | parent computerUse JWT POST |

## TEMPORAL $0 LIVE SMOKE — documented; JWT BLOCKED on this VM

Work-order: smoke / evidence on `main` @ `200bea9`. Lineage **#87** / **#90** / parent **#50**.

`TEMPORAL_LIVE_ACTIVATION_ARMED = true`  
Hero Frame `temporalTrackingEnabled = true` → `prepareHeroFrameTemporalDispatch()` sets `explicitArm: true`.  
`temporal-propagate-proxy` is live (OPTIONS **200**, anon POST **401** `unauthenticated` in 650 ms).  
This cloud VM has **no** `AVT_USER_ACCESS_TOKEN`. Same BLOCKED plane as chest 1m / sleeve 1c still verifies.

**Do not** reopen chest/sleeve paint. **Do not** redeploy `architecture-c-still-repair-proxy`. **Do not** include reconstruct in the smoke POST.

### Parent computerUse

1. Sign in as durable owner → Hero Frame  
   `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`
2. §7 gate: `temporalTrackingEnabled=true`, `armed=true`, `explicitArm=true`, `canDispatch=true`
3. Do **not** click chest or sleeve paint
4. Copy owner JWT from DevTools → Network → `Authorization: Bearer …`
5. `AVT_USER_ACCESS_TOKEN='<jwt>' ./scripts/temporal-live-smoke.sh`

Expected body: `explicitArm: true` + synthetic 80×128 × 5 luma + chest `9ed83c01` + sleeve `fdb86b18`.  
Full notes: `docs/temporal/LIVE_SMOKE.md`

## Canonical IDs (unchanged)

- project `764a63d2-93cd-44f3-905f-292f14ab2f51`
- original master clip `76fe7438-671d-4428-a7f6-17a45e98c16f` (Lane D — not this POST)
- still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
- keyframe `v2-still-0.785`
- chest `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11
- sleeve `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6
