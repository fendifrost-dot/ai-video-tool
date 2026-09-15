# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73, `e206d3c`) | YES (asset `9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B isolated sleeve engine | YES (PR #60) | n/a (fixtures) | landed |
| Lane B **sleeve still live wiring** | this PR | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |

## SLEEVE STILL — ready for edge redeploy

Work-order: GitHub **#74** (lineage **#54**, parent **#50**). Lane B only. **Do not reopen chest 1m.**

`repair_method_version: architecture_c_sleeve_still_1a`  
`claim: visible_geometry_only`  
`hidden_shoulder_to_cuff_validated: false`

### Wiring

`compositeSleevePanelsOntoStill` now calls `src/lib/sleevePanel/liveStill.ts` (`repairVisibleSleevePanelsOnStill`). Edge mirror lives in `supabase/functions/_shared/sleevePanel/**`. Chest reserved mask defaults to the live 1m band quad. Detection stays `detectStub`. Temporal stays off.

### Preserved locks

logoComposite C2/C4/C6/C9 1m · 1i chest-local α · 1j ROI · 1k enclosure · 1l C2/C4/C6 · 4×3 sleeve unpainted on **chest** path · no CC · no proxy-auth widen · no PR #37 · no V3 / paid Grok

### Deploy

Redeploy **only** `architecture-c-still-repair-proxy`. Frontend Publish optional (seeds visible-upper-arm quads + prefers `9ed83c01`). No V3. No paid Grok.

### Claude / Fendi next ($0)

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Hero Frame click path in `docs/sleeve-panel/LANE_B_SLEEVE_STILL_LIVE_WIRING.md`
3. Canonical sleeve run on the **same still lineage** as chest (`2aa1a44c` / chest output `9ed83c01`)
4. Expect `architecture_c_sleeve_still_1a`. Do **not** start temporal.

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
