# Lane B — Sleeve still live score (`architecture_c_sleeve_still_1a`, `fde270bf`)

**Historical lock (PR #80).** Paint was **not** changed here. Stage 1b (`architecture_c_sleeve_still_1b`, #81 / PR #82) owns FAIL #6.

**Date:** 2026-09-15 · **Author:** Cursor (Lane B, score-only) · **Spend:** $0 · **Issue:** [#74](https://github.com/fendifrost-dot/ai-video-tool/issues/74) (lineage [#54](https://github.com/fendifrost-dot/ai-video-tool/issues/54), parent [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))  
**Code under test:** live edge serving `architecture_c_sleeve_still_1a` (PR #75 on `main`). **Repair not re-run. Paint not changed.**  
**Run:** authenticated AVT product UI (Hero Frame Studio), $0. Input still `2aa1a44c` (preferred chest-cleared `9ed83c01` was UI-disabled as a `[repair:logo_chest]` option). Seeded visible-upper-arm quads. No HTTP 400.  
**Scorer:** `lane-b-sleeve-live-v1` (`src/lib/sleevePanel/liveScore.ts`) + ImageScript 1.3.0 (same JPEG decoder as Stage 1m / edge).

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

---

## Verdict — **SLEEVE STILL GATE: NOT CLEARED** (5 / 6)

| # | Criterion | Live | Evidence |
|---|-----------|------|----------|
| 1 | Identity `architecture_c_sleeve_still_1a` + `visible_geometry_only` | **PASS** | Lovable SQL `metadata_json` |
| 2 | Seeded visible-upper-arm quads accepted (no HTTP 400) | **PASS** | painted 22 777 / 11 128; rejected hidden 0; rejected chest 0 |
| 3 | C5 forearm / 4×3 zip-corner not wrecked | **PASS** | 653 bright skin bytes identical; patch darkened 0 |
| 4 | C11 outside-region (y&lt;600 / y≥800) | **PASS** | 0 px changed |
| 5 | Chest reserved band byte-identical to **input** | **PASS** | 27 282 reserved px, 0 changed |
| 6 | Visible upper-arm repaired navy-ward | **FAIL** | cream/white fill; luma **rose** (left 202.2→227.0, right 133.6→225.9) |

`TEMPORAL_LIVE_ACTIVATION_ARMED` stays **false**. Temporal live must not start.

---

## Runtime identity [V]

| Field | Value |
|---|---|
| `assetId` | **`fde270bf-63f2-44ff-a76b-4129a0248708`** |
| Created | **2026-09-15 05:46:25Z** |
| Spend | **$0** — no V3 / paid Grok |
| HTTP 400 geometry reject | **no** (row saved) |
| `repair_stage` | `sleeve_panel` |
| `repair.repair_method_version` | **`architecture_c_sleeve_still_1a`** |
| `repair.claim` | **`visible_geometry_only`** |
| `repair.contract_version` | `1.0.0` |
| `repair.geometry_note` | `visible_upper_arm_only` |
| `repair.hidden_shoulder_to_cuff_validated` | **`false`** |
| `repair.consumed_chest_output` | `true` (default reserved slot) |
| `repair.chest_output_asset_id` | **`null`** |
| `repair.keyframe_id` | `v2-still-0.785` |
| `temporal_tracking_enabled` | **`false`** |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Preferred chest input | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50` — **not used** |
| `storedPath` | `…/architecture-c-repair/sleeve_panel_2aa1a44c-…_1789451185112.png` (720×1280 PNG, 1 183 248 bytes) |
| Decoder | ImageScript 1.3.0 |

### Quads used (pixel → norm on 720×1280) [V]

| Side | TL | TR | BR | BL |
|------|----|----|----|----|
| Left | 22,640 (0.031,0.500) | 187,646 (0.260,0.505) | 180,787 (0.250,0.615) | 22,781 (0.031,0.610) |
| Right | 634,646 (0.881,0.505) | 713,640 (0.990,0.500) | 713,787 (0.990,0.615) | 634,781 (0.881,0.610) |

Matches `SEEDED_VISIBLE_SLEEVE_QUADS` within 0.012. Hidden-shoulder→cuff / face-high placeholders were not used.

### Why `9ed83c01` was not the input [O]

Hero Frame §7 still selector **disables** `[repair:…]` options (chaining hazard for `logo_chest`). Until frontend Publish, `handleSleeve` falls back to the selected clean still. The live adapter still applied `LIVE_CHEST_RESERVED_QUAD_NORM` (hence `consumed_chest_output: true` with `chest_output_asset_id: null`).

---

## Pixel probes vs clean `2aa1a44c` [V]

Changed vs clean: **33 905 px** (= 22 777 + 11 128 painted). 0 px above y 600 or below y 800. Abs-diff is two lateral blobs only (`live-1a/abs_diff.jpg`).

| Probe | Result |
|-------|--------|
| C5 x 330–380 / y 738–755 bright skin | 0 / 653 changed |
| C5 4×3 x 389–392 / y 746–748 | 0 darkened ≥40 luma |
| C11 y&lt;600 | 0 |
| C11 y≥800 | 0 |
| Chest reserved quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` | 0 / 27 282 |
| Hidden face box | 0 |
| Crossed-forearm C5 pocket | 0 |
| vs CLEARED chest still `9ed83c01` | 55 169 px (expected: input was unrepaired V2 chest, not 1m) |

Chest **CLEARED 11/11** on `9ed83c01` is **not wrecked in storage**. This sleeve row did not overwrite it. Criterion 5 scores reserved pixels vs **this run's input**.

---

## Criterion 6 — visible repair FAIL [V]

Contract (fixtures): visible quads receive the **vertical navy panel** from the flat ref; luma should drop navy-ward.

Live:

| Side | Changed / checked | Mean luma in | Mean luma out | Navy-like out |
|------|-------------------|--------------|---------------|---------------|
| Left | 22 755 / 22 794 | 202.24 | **227.01** | 296 |
| Right | 11 124 / 11 139 | 133.56 | **225.90** | 157 |

Crops (`left_upper_arm.jpg`, `right_upper_arm.jpg`): cream/white trapezoids with a navy triangle, pasted over wall + existing **horizontal** navy ring. That is the opposite of the fixture pass (horizontal ring → vertical panel).

**[H]** `DEFAULT_FLAT_SLEEVE_SOURCE_BBOX = [0.05, 0.35, 0.12, 0.35]` sampled cream body on this flat, not the vertical navy panel. Left quad also covers door/wall (x≈0.03) rather than only the visible sleeve. Paint change is **out of scope** for this score PR.

---

## Scorecard (`lane-b-sleeve-live-v1`) [D]

There was no live sleeve Lane E table. This PR defines a 6-point gate:

1. Identity (method / claim / hidden unvalidated / temporal off)
2. Geometry (seeded quads, no 400, both sides painted)
3. C5 windows (Lane E chest C5, vs input)
4. C11 outside-region
5. Chest reserved band vs input
6. Visible navy-ward repair + hidden face/C5 pocket untouched

Synthetic 720×1280 adapter fixture is **6/6 CLEARED** (unit test). Live is **5/6 NOT CLEARED** on #6 only.

---

## Temporal [D]

`TEMPORAL_LIVE_ACTIVATION_ARMED` remains **false** on `main`. Sleeve CLEARED is a prerequisite for arming (`docs/temporal/LIVE_PREP.md`). This live row is **not** that CLEARED. Do not flip the const. Do not enable Hero Frame tracking.

---

## Hard locks [V]

Score-only. No production paint/occlusion change, no proxy auth widen, no Control Center, no V3, no paid Grok, no PR #37, no repair re-run, no redeploy, no temporal arm.

---

## Recommended next [R]

1. Keep temporal disarmed.
2. Next paint work (separate Class C): correct flat-ref navy-panel `sourceBboxNorm`; optionally tighten left quad off the wall; prefer `9ed83c01` as sleeve input after frontend Publish.
3. Re-score a new `$0` sleeve row with this same 6-point table. Do not mint from this agent.

## Evidence files

- `docs/sleeve-panel/live-1a/live_asset.json` — identity
- `docs/sleeve-panel/live-1a/live_score.json` — full table
- `docs/sleeve-panel/live-1a/left_upper_arm.jpg` / `right_upper_arm.jpg`
- `docs/sleeve-panel/live-1a/chest_reserved.jpg` / `c5_forearm.jpg` / `c11_face_belt.jpg`
- `docs/sleeve-panel/live-1a/abs_diff.jpg`
- `scripts/scoreSleeveStill1aLive.mts` — ImageScript 1.3.0 scorer
