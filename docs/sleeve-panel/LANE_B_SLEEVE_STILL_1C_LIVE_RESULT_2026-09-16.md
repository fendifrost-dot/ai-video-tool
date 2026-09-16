# Lane B — Sleeve still live score (`architecture_c_sleeve_still_1c`, `fdb86b18`)

**Score-only.** Paint was **not** changed here. Stage 1a (`fde270bf`, PR #80) and Stage 1b (`a4dc7f47`, PR #83) stay **NOT CLEARED 5/6** as history. This PR scores the already-minted 1c live row.

**Date:** 2026-09-16 · **Author:** Cursor (Lane B, score-only) · **Spend:** $0 · **Issue:** [#84](https://github.com/fendifrost-dot/ai-video-tool/issues/84) (lineage [#81](https://github.com/fendifrost-dot/ai-video-tool/issues/81) / [#74](https://github.com/fendifrost-dot/ai-video-tool/issues/74) / [#54](https://github.com/fendifrost-dot/ai-video-tool/issues/54), parent [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))  
**Code under test:** live edge serving `architecture_c_sleeve_still_1c` (PR #85 on `main`). **Repair not re-run. Paint not changed. No redeploy. No Lovable code.**  
**Run:** authenticated AVT product UI (Hero Frame Studio), $0, latency ~5735 ms. Input still `2aa1a44c`. Seeded visible-upper-arm quads. No HTTP 400.  
**Scorer:** `lane-b-sleeve-live-v1` (`src/lib/sleevePanel/liveScore.ts`) + ImageScript 1.3.0 — **same ruler as PR #80 / #83**.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

---

## Verdict — **SLEEVE STILL GATE: CLEARED** (6 / 6)

| # | Criterion | Live | Evidence |
|---|-----------|------|----------|
| 1 | Identity `architecture_c_sleeve_still_1c` + `visible_geometry_only` | **PASS** | Lovable SQL `metadata_json` |
| 2 | Seeded visible-upper-arm quads accepted (no HTTP 400) | **PASS** | painted 22 777 / 11 128; rejected hidden 0; rejected chest 0 |
| 3 | C5 forearm / 4×3 zip-corner not wrecked | **PASS** | 653 bright skin bytes identical; patch darkened 0 |
| 4 | C11 outside-region (y&lt;600 / y≥800) | **PASS** | 0 px changed |
| 5 | Chest reserved band byte-identical to **input** | **PASS** | 27 282 reserved px, 0 changed |
| 6 | Visible upper-arm repaired navy-ward **both sides** | **PASS** | left 202.24→39.93; right 133.56→39.96 |

`TEMPORAL_LIVE_ACTIVATION_ARMED` stays **false** in this PR. Sleeve CLEARED is the prerequisite; **parent owns the arm**. Do not flip the const here.

---

## Runtime identity [V]

| Field | Value |
|---|---|
| `assetId` | **`fdb86b18-d4aa-465e-b73f-1d252709739c`** |
| Created | **2026-09-15 23:54:54Z** |
| Spend | **$0** — no V3 / paid Grok |
| Latency | **~5735 ms** [O] (not a gate criterion) |
| HTTP 400 geometry reject | **no** (row saved) |
| `repair_stage` | `sleeve_panel` |
| `repair.repair_method_version` | **`architecture_c_sleeve_still_1c`** |
| `repair.claim` | **`visible_geometry_only`** |
| `repair.contract_version` | `1.0.0` |
| `repair.geometry_note` | `visible_upper_arm_only` |
| `repair.hidden_shoulder_to_cuff_validated` | **`false`** |
| `repair.navy_fill_mode` | **`navy_over_cream`** (both sides) |
| `repair.consumed_chest_output` | `true` (default reserved slot) |
| `repair.chest_output_asset_id` | **`null`** |
| `repair.keyframe_id` | `v2-still-0.785` |
| `temporal_tracking_enabled` | **`false`** |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Preferred chest input | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50` — **not used** |
| `storedPath` | `…/architecture-c-repair/sleeve_panel_2aa1a44c-…_1789516494410.png` (720×1280 PNG, 1 173 495 bytes) |
| Decoder | ImageScript 1.3.0 |

### Quads used (pixel → norm on 720×1280) [V]

| Side | TL | TR | BR | BL |
|------|----|----|----|----|
| Left | 22,640 (0.031,0.500) | 187,646 (0.260,0.505) | 180,787 (0.250,0.615) | 22,781 (0.031,0.610) |
| Right | 634,646 (0.881,0.505) | 713,640 (0.990,0.500) | 713,787 (0.990,0.615) | 634,781 (0.881,0.610) |

Matches `SEEDED_VISIBLE_SLEEVE_QUADS` within 0.012. Hidden-shoulder→cuff / face-high placeholders were not used. Same quads as 1a `fde270bf` and 1b `a4dc7f47`.

### Navy-fill metadata [V]

Requested bbox is still the 1a default `[0.05, 0.35, 0.12, 0.35]`. 1c resolved the same vertical navy strips as 1b, then `preferProductNavyOverCream` (`source_navy_fraction: 1`):

| Side | `navy_fill_mode` | `source_navy_fraction` | `resolved_source_bbox_norm` |
|------|------------------|------------------------|-----------------------------|
| Left | `navy_over_cream` | **1.0** | `[0.188, 0.378, 0.067, 0.35]` |
| Right | `navy_over_cream` | **1.0** | `[0.760, 0.380, 0.059, 0.35]` |

---

## Pixel probes vs clean `2aa1a44c` [V]

Changed vs clean: **33 905 px** (= 22 777 + 11 128 painted). 0 px above y 600 or below y 800. Abs-diff is two lateral blobs only (`live-1c/abs_diff.jpg`).

Changed vs 1a `fde270bf`: **33 905 px** — 1c did not re-save the cream/white 1a paste.  
Changed vs 1b `a4dc7f47`: **25 949 px** — 1c replaced the cream-majority remainder of the 1b warp.

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

## Criterion 6 — visible repair PASS (both sides) [V]

Contract (fixtures): visible quads receive the **vertical navy panel** from the flat ref; luma should drop navy-ward (`meanOut + 8 < meanSrc` **and** `navyLikeOut > 0`) on **both** sides.

| Side | 1a luma in→out | 1b luma in→out | 1c luma in→out | 1c navyLike | 1c sub-verdict |
|------|----------------|----------------|----------------|-------------|----------------|
| Left | 202.24→**227.01** FAIL | 202.24→**160.90** PASS | 202.24→**39.93** | **22 730** / 22 794 | **PASS** (drop 162.3; need ≤194.24) |
| Right | 133.56→**225.90** FAIL | 133.56→**157.51** FAIL | 133.56→**39.96** | **11 104** / 11 139 | **PASS** (drop 93.6; need ≤125.56) |

Crops (`left_upper_arm.jpg`, `right_upper_arm.jpg`): solid navy trapezoids over wall (left) and over the existing **horizontal** navy ring (right). 1a was cream/white. 1b was cream-majority + navy stripe (right luma rose). 1c `navy_over_cream` replaced non-navy source pixels so **both** quads drop.

**[O]** Left PASS is a luma-drop against the bright door/wall inside the left quad, not a vertical navy panel covering only the visible sleeve. The fill is product-navy, not a reconstructed cream pinstripe.

**[O]** Right PASS is the 1b leftover: the already-dark V2 ring (src luma 133.56) is now darker still (39.96), not raised by cream.

---

## Scorecard (`lane-b-sleeve-live-v1`) [D]

Same 6-point gate as PR #80 / #83:

1. Identity (method / claim / hidden unvalidated / temporal off)
2. Geometry (seeded quads, no 400, both sides painted)
3. C5 windows (Lane E chest C5, vs input)
4. C11 outside-region
5. Chest reserved band vs input
6. Visible navy-ward repair + hidden face/C5 pocket untouched

Synthetic 720×1280 adapter fixture is **6/6 CLEARED** (unit test). Live 1c is **6/6 CLEARED**. Live 1a / 1b remain **5/6 NOT CLEARED** as history.

---

## Temporal [D]

`TEMPORAL_LIVE_ACTIVATION_ARMED` remains **false** on `main`. Sleeve CLEARED is now the recorded prerequisite (`docs/temporal/LIVE_PREP.md`). **Parent owns the arm** — this score PR does not flip the const, does not enable Hero Frame tracking, and does not redeploy a temporal edge. Noted only — no temporal code change.

---

## Hard locks [V]

Score-only. No production paint/occlusion change, no proxy auth widen, no Control Center, no V3, no paid Grok, no PR #37, no repair re-run, no redeploy, no temporal arm, no Lovable agent code edits.

---

## Recommended next [R]

1. Parent may arm temporal after Class C sign-off. Do not flip `TEMPORAL_LIVE_ACTIVATION_ARMED` from this score PR.
2. Prefer `9ed83c01` as sleeve input after frontend Publish (picker stays on clean `2aa1a44c`).
3. Hidden shoulder→cuff stays unvalidated. Do not read this CLEARED as armhole→cuff.

## Evidence files

- `docs/sleeve-panel/live-1c/live_asset.json` — identity
- `docs/sleeve-panel/live-1c/live_score.json` — full table
- `docs/sleeve-panel/live-1c/left_upper_arm.jpg` / `right_upper_arm.jpg`
- `docs/sleeve-panel/live-1c/chest_reserved.jpg` / `c5_forearm.jpg` / `c11_face_belt.jpg`
- `docs/sleeve-panel/live-1c/abs_diff.jpg`
- `scripts/scoreSleeveStill1cLive.mts` — ImageScript 1.3.0 scorer
