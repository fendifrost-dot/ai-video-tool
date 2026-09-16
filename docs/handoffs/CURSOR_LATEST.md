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
| Hero Frame `temporalTrackingEnabled` | YES (`true` when armed) | frontend Publish | **YES** — product dispatch uses `explicitArm` |
| Hero Frame §7 Temporal Run control | this PR (#94) | frontend Publish | **YES** after Publish — button gated on canDispatch / armed / tracking |
| Lane D original-master live wiring | YES (PR #92) | **n/a — no edge function** | **YES** as `$0` in-lib dispatch (`explicitArm` required) |

## HERO FRAME TEMPORAL FLAG — product dispatch with explicitArm

Work-order: GitHub **#90** (lineage **#87** / PR #88, parent **#50**). Hero Frame owner only. **Do not reopen chest 1m or sleeve paint.**

`ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled = true`  
`prepareHeroFrameTemporalDispatch()` sets `explicitArm: true` when armed.  
Still-repair edge mirror stays **false** — no `architecture-c-still-repair-proxy` redeploy.

Parent deploy from #91: **none** (frontend-only). The #88 `temporal-propagate-proxy` Lovable redeploy is unchanged.

## HERO FRAME §7 — Temporal Run control

Work-order: GitHub **#94** (lineage **#90** / PR #91, parent **#50**). Hero Frame owner only. **Do not reopen chest 1m or sleeve paint.**

§7 now has **Run temporal propagate**. It calls `prepareHeroFrameTemporalDispatch` / `buildHeroFrameTemporalPropagateBody` then `callTemporalPropagate` with the canonical luma fixture + CLEARED chest/sleeve quads (`explicitArm: true`). Button is disabled unless `canDispatch` + armed + `temporalTrackingEnabled`. Still-repair hard-stop copy that says `temporalTrackingEnabled=false` or "temporal propagation is disabled" is dropped when the product flag is true.

Parent deploy from this PR: **Lovable frontend Publish only**. No edge redeploy. The #88 `temporal-propagate-proxy` Lovable redeploy is unchanged.

## LANE D — Original-master live wiring (Architecture C gate 4)

Work-order: GitHub **#89** (lineage **#55** / PR #58, parent **#50**). Prerequisites: chest CLEARED (#73), sleeve CLEARED (#86), temporal ARMED (#88). Lane D only.

**Do not reopen chest 1m or sleeve paint. Do not edit temporal authorize constants.**

`RECONSTRUCT_LIVE_WIRING_ARMED = true`  
Dispatch still requires `explicitArm: true`.  
SAM-3 is caller-supplied / fixture (`liveFetch: false`). No CC. No Grok / Fal. No new JWT edge.

### Parent deploy

**None.** Do **not** Lovable-redeploy any edge function from this lane.

**Do not** redeploy `architecture-c-still-repair-proxy`, `temporal-propagate-proxy`, or `sam3-segment-proxy` from Lane D.

Publish ≠ edge redeploy. Frontend Publish is not this lane.

### What landed

- Copied canonical IDs (project `764a63d2`, master clip `76fe7438`, chest `9ed83c01`, sleeve `fdb86b18`)
- Adapters: stamp CLEARED stills → merge SAM-3 ∪ trusted temporal masks → `reconstructOriginalMaster` per frame
- `dispatchOriginalMasterReconstruct` wire protocol (in-lib only)
- `$0` 4-frame fixture proofs of original-pixel preservation

Full notes: `docs/reconstruct/LIVE_WIRING.md`

## TEMPORAL LIVE ACTIVATION — ready for one edge redeploy (Lane C, unchanged)

Work-order: GitHub **#87** (lineage **#76** / PR #78, parent **#50**). Sleeve prerequisite: PR **#86**.

Redeploy **only** `temporal-propagate-proxy` via Lovable → Edge Functions → redeploy. That is **not** this Lane D PR.

## Canonical IDs (unchanged)

- project `764a63d2-93cd-44f3-905f-292f14ab2f51`
- original master clip `76fe7438-671d-4428-a7f6-17a45e98c16f`
- still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
- keyframe `v2-still-0.785`
- chest `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11
- sleeve `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6
