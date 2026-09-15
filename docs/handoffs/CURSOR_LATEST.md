# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1i** occlusion | YES | YES — **LOCKED** | do not reopen |
| Stage **1j** ROI compute | YES | YES — **LOCKED** | do not reopen |
| Stage **1k** enclosure / absorb / right-end | YES | YES — scored live (PR #66) | **NOT CLEARED 7/11** — historical |
| Stage **1l** C2/C4/C6 + in-quad mid-luma | YES (PR #68) | YES — scored live (PR #70) | **NOT CLEARED 10/11** — historical; C2/C4/C6 **LIVE CLEARED** |
| Stage **1m** C9-right wordmark-edge AA | YES (PR #72) | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |

## STAGE 1M — ready for edge redeploy

`repair_method_version: architecture_c_still_repair_1m`

Work-order: GitHub **#71** (lineage **#67**, parent **#50**). Lane A only. **C9-right only.**

### Fix

| # | Defect | Fix |
|---|--------|-----|
| C9-right | Wordmark-edge AA re-lights source-mid-luma at x 462–500 / y 713–723 after 1l cover | Post-warp snap: in-quad C9-right mid-luma output (≤180, not glyph cores) → painted navy. C6 x≥576 and C4 cream-raise untouched. |

### Preserved locks

chest-local α · crease/wedge ownership · hand/face protection · no midY luma>180 lock · left-third coverage · no global SAM-3 change · ROI `dilateAlphaRoi` (1j) · 1k closed-component enclosure · 1l lateral ridge / 1-row cream raise / cool-white tongue / in-quad mid-luma keep · 4×3 sleeve unpainted · C8 tapes navy · C9-left 0

### Deploy

Redeploy **only** `architecture-c-still-repair-proxy`. No frontend Publish. No V3. No paid Grok.

### Claude next

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Canonical $0 still on `2aa1a44c` + measured quad; expect `architecture_c_still_repair_1m`
3. Score 11 chest criteria with Lane E unfiltered mid-luma (same ruler as PR #70). Target: C9 combined < 0.05 and right window < 0.05; C2 remnants 0, C4 cream→navy 0, C6 cream→navy 0

## STAGE 1L — live score (historical, PR #70) + identity / UI path (PR #69)

`repair_method_version: architecture_c_still_repair_1l`

Work-order: GitHub **#67** (lineage **#52**, parent **#50**). Lane E score-only. No paint change. Historical 10/11 evidence — do not mint another 1l row.

### Canonical live verdict (asset `9eaf0c55`, PR #70)

| Field | Value |
|-------|--------|
| Asset | **`9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75`** |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Latency | ~13 646 ms |
| Gate | **NOT CLEARED — 10 / 11** |
| PASS | 1, 2, 3, 4, 5, 6, 7, 8, 10, 11 |
| FAIL | **9 only** |
| Decoder | ImageScript 1.3.0; `bandAuthorityMaskUsed: false` |
| Ghost ratios (unfiltered) | combined **0.172**, left **0.000**, right **0.261** (84/488 at x 462–500 / y 713–723) |

### vs 1k leftovers (PR #66, `c9c4efee`, 7/11)

| # | 1k live | 1l live |
|---|---------|---------|
| C2 remnants | 6 | **0 PASS** |
| C4 cream→navy / raise | 19 / 1-px | **0 / 0 PASS** |
| C6 right-end cream→navy | 41 | **0 PASS** |
| C9 ghost (combined / left / right) | 0.195 / 0.042 / 0.273 | **0.172 / 0.000 / 0.261 FAIL** |

C9: 84 / 488 mid-luma ghosts, all in the wordmark-right window (x 462–500 / y 713–723). Left window cleared. 1k rescore of `c9c4efee` on this ruler is still 7/11. Fixture predicted 11/11 — live extra FAIL is C9-right wordmark-edge AA (`warpQuadAlpha` + live SAM-3; cover-only fixture does not reproduce it).

Full scorecard: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1L_RESULT_2026-09-15.md`

### Identity / UI path (PR #69 — do not mint a second 1l row)

| Field | Value |
|-------|--------|
| `repair_method_version` | **`architecture_c_still_repair_1l`** |
| Clean still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Quad | `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` |
| SAM-3 | `occlusion_source: sam3`, `sam3_ok: true`, fallback `false` |
| Created | 2026-09-15 04:32:47Z |

This cloud VM had no `AVT_USER_ACCESS_TOKEN`. Anon POST is still 401. The 1l row was produced by a signed-in owner session (same body as `callArchitectureCStillRepair`). Repair was **not** re-run from the identity or score agents.

Full identity + UI path: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1L_LIVE_ASSET_2026-09-15.md`

One-shot (only if minting a replacement; JWT required):

```bash
AVT_USER_ACCESS_TOKEN='<owner JWT>' ./scripts/architecture-c-stage1l-live-verify.sh
```

UI: `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame` → **7 · Architecture C — still-first deterministic repair** → ★ clean still → override chest quad (do not Reset to measured band) → **1 · Repair chest_band + logo_zone**.

### 1k canonical live score (authoritative, PR #66 — historical)

| Field | Value |
|-------|--------|
| Asset | **`c9c4efee-6bd2-450f-a9e4-b70fb9b722bb`** |
| `repair_method_version` | `architecture_c_still_repair_1k` |
| Gate | **NOT CLEARED — 7 / 11** |
| PASS | 1, 3, 5, 7, 8, 10, 11 |
| FAIL | 2, 4, 6, 9 |

Full scorecard: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1K_RESULT_2026-09-15.md`
