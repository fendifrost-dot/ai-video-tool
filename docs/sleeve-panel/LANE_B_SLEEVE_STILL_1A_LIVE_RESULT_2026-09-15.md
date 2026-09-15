# Lane B — Sleeve still live score (`architecture_c_sleeve_still_1a`, `fde270bf`)

**Date:** 2026-09-15 · **Author:** Cursor (Lane B, score-only) · **Spend:** $0  
**Issue:** [#74](https://github.com/fendifrost-dot/ai-video-tool/issues/74) (parent [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))  
**Evidence PR:** [#80](https://github.com/fendifrost-dot/ai-video-tool/pull/80)

Historical lock. Paint was **not** changed in that PR. Stage 1b (`architecture_c_sleeve_still_1b`, #81) owns FAIL #6.

## Verdict — **SLEEVE STILL GATE: NOT CLEARED** (5 / 6)

| # | Criterion | Live |
|---|-----------|------|
| 1 | Identity `architecture_c_sleeve_still_1a` + `visible_geometry_only` | **PASS** |
| 2 | Seeded visible-upper-arm quads accepted (no HTTP 400) | **PASS** |
| 3 | C5 forearm / 4×3 zip-corner not wrecked | **PASS** |
| 4 | C11 outside-region (y&lt;600 / y≥800) | **PASS** |
| 5 | Chest reserved band byte-identical to input | **PASS** (0 / 27 282) |
| 6 | Visible upper-arm repaired navy-ward | **FAIL** — cream/white fill; left luma 202.2→227.0, right 133.6→225.9 |

Asset: `fde270bf-63f2-44ff-a76b-4129a0248708`. Input: clean still `2aa1a44c` (preferred chest CLEARED `9ed83c01` was UI-disabled as `[repair:logo_chest]`).

`TEMPORAL_LIVE_ACTIVATION_ARMED` stays **false**.

Full crops / JSON: PR #80 (`docs/sleeve-panel/live-1a/` on that branch).
