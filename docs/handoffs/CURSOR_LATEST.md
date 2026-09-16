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
| Temporal `$0` **click** smoke | YES (this evidence) | live product UI | **SUCCESS** — 3 jobs, `paidCalls=false` |
| Temporal `$0` **script** smoke | YES (PR #93) | edge live; **VM BLOCKED on JWT** | optional fallback |
| Lane D original-master live wiring | YES (`200bea9` / PR #92) | n/a — in-lib | **separate** — not this smoke POST |

## TEMPORAL RUN CLICK SMOKE — SUCCESS

Work-order: GitHub **#96** (lineage **#94** / PR **#95**, **#93**, parent **#50**). Docs/evidence only. **Do not reopen chest 1m or sleeve paint.**

**When:** 2026-09-15 ~19:51 America/Chicago (~2026-09-16 00:51 UTC)  
**App:** https://aivideotool.lovable.app (signed-in AVT owner)  
**Code:** `main` @ `782adac` (PR #95) + Lovable frontend **Publish**

| Field | Value |
|-------|--------|
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Garment | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Clip (UI player) | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| UI | **Run temporal propagate** visible in Hero Frame §7 |
| Click | once |
| Toast | `Dispatched 3 job(s). paidCalls=false grokPerFrame=false.` |
| 401 / paid generation / asset IDs in toast | **none** |

Write-up: `docs/temporal/LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md`  
JSON: `docs/temporal/live-smoke/click-smoke.json`  
Screenshots: `temporal-smoke-evidence/before-run.png` + `after-run.png` (described in the write-up; binaries not hydrated onto this VM)

**Not claimed:** live footage CLEARED, reconstruct composite, per-frame Grok, new edge redeploy.

## Canonical IDs (unchanged)

- project `764a63d2-93cd-44f3-905f-292f14ab2f51`
- garment `0feb028f-dc4d-45dc-82ac-e4bbd16054b0`
- original master clip `76fe7438-671d-4428-a7f6-17a45e98c16f` (Lane D — player only for this smoke)
- still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
- keyframe `v2-still-0.785`
- chest `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11
- sleeve `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6
