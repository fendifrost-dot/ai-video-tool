# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1i** occlusion | YES | YES — **LOCKED** | do not reopen |
| Stage **1j** ROI compute | YES | YES — **LOCKED** | do not reopen |
| Stage **1k** enclosure / absorb / right-end | YES | YES — **scored live** (PR #66) | **NOT CLEARED 7/11** — do not reopen |
| Stage **1l** remaining C2/C4/C6/C9 | YES (PR #68) | **YES — live asset minted** | **identity confirmed; Lane E score is a follow-up** |

## STAGE 1L — live asset (identity only, not scored)

`repair_method_version: architecture_c_still_repair_1l`

Work-order: GitHub **#67** (lineage **#52**, parent **#50**). Lane A only.

| Field | Value |
|-------|--------|
| Asset | **`9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75`** |
| `repair_method_version` | **`architecture_c_still_repair_1l`** |
| Clean still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Quad | `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` |
| SAM-3 | `occlusion_source: sam3`, `sam3_ok: true`, fallback `false` |
| Created | 2026-09-15 04:32:47Z |
| Gate | **NOT SCORED** |

This cloud VM had no `AVT_USER_ACCESS_TOKEN`. Anon POST is still 401. The 1l row was produced by a signed-in owner session (same body as `callArchitectureCStillRepair`). Repair was **not** re-run from this agent.

Full identity + UI path: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1L_LIVE_ASSET_2026-09-15.md`

One-shot (only if minting a replacement; JWT required):

```bash
AVT_USER_ACCESS_TOKEN='<owner JWT>' ./scripts/architecture-c-stage1l-live-verify.sh
```

UI: `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame` → **7 · Architecture C — still-first deterministic repair** → ★ clean still → override chest quad (do not Reset to measured band) → **1 · Repair chest_band + logo_zone**.

### Claude next

Score `9eaf0c55` with Lane E unfiltered mid-luma (same ruler as PR #66). Target: C2 remnants 0, C4 cream→navy 0, C6 cream→navy 0, C9 combined < 0.05. Do not mint another 1l row. No V3, no paid Grok, no CC.

### 1k canonical live score (authoritative, PR #66 — historical)

| Field | Value |
|-------|--------|
| Asset | **`c9c4efee-6bd2-450f-a9e4-b70fb9b722bb`** |
| `repair_method_version` | `architecture_c_still_repair_1k` |
| Gate | **NOT CLEARED — 7 / 11** |
| PASS | 1, 3, 5, 7, 8, 10, 11 |
| FAIL | 2, 4, 6, 9 |

Full scorecard: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1K_RESULT_2026-09-15.md`
