# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-16 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73) | YES (`9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B sleeve still **1c** | YES (PR #85 / #86) | YES (`fdb86b18`) | **CLEARED 6/6 — LOCKED** |
| Temporal live activation | YES (`TEMPORAL_LIVE_ACTIVATION_ARMED = true`) | YES — `temporal-propagate-proxy` OPTIONS 200 / JWT only | **YES** |
| Hero Frame `temporalTrackingEnabled` | YES (`true` + `prepareHeroFrameTemporalDispatch` → `explicitArm`) | frontend Publish | **YES** |
| Hero Frame §7 Temporal Run control | YES (PR #95, `782adac`) | frontend Publish | **YES** |
| Temporal `$0` **click** smoke | YES (PR #97) | live product UI | **SUCCESS** — 3 jobs, `paidCalls=false` |
| Lane D original-master live wiring | YES (PR #92) | n/a — in-lib | YES (library) |
| **RECONSTRUCT-1 E2E $0** | this PR (#98) | **Publish after merge** | **READY** — parent signed-in click |

## RECONSTRUCT-1 E2E $0 — READY for parent live verify

Work-order: GitHub **#98** (lineage **#89** / PR **#92**, temporal **#95** / **#97**, parent **#50**). Isolated reconstruct E2E + Lane E video eval + Hero Frame §7 button. **Do not reopen chest 1m or sleeve paint.**

**Click path** (after merge + Lovable frontend **Publish**):

1. Sign in at https://aivideotool.lovable.app
2. `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`
3. §7 · Architecture C — still-first deterministic repair
4. Do **not** click chest or sleeve paint
5. Click **Run reconstruct E2E $0** once

Expected toast: `RECONSTRUCT-1 PASS 9/9 frames=<n> paidCalls=false grokPerFrame=false.`

Write-up: `docs/reconstruct/E2E_LIVE.md`

**Publish ≠ edge redeploy.** No still-repair / temporal / SAM-3 redeploy from this lane.

**Not claimed:** live 720×1280 pixels of master `76fe7438`, live SAM-3 fetch, still-golden rescore, MP4 encode.

## Canonical IDs (unchanged)

- project `764a63d2-93cd-44f3-905f-292f14ab2f51`
- garment `0feb028f-dc4d-45dc-82ac-e4bbd16054b0`
- original master clip `76fe7438-671d-4428-a7f6-17a45e98c16f`
- still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
- keyframe `v2-still-0.785`
- chest `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11
- sleeve `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6
