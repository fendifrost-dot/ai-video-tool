# Architecture C — Stage 1m canonical live verification (`logo_chest`, `9ed83c01`)

**Date:** 2026-09-15 · **Author:** Cursor (Lane E, score-only) · **Spend:** $0 · **Issue:** #71 (lineage #67, parent #50)
**Code under test:** live edge serving `architecture_c_still_repair_1m` (PR #72 on `main` @ `a968088`). **Repair not re-run. Paint not changed.**
**Run:** authenticated AVT product UI (Fendi / Hero Frame Studio), clean still `2aa1a44c`, keyframe `v2-still-0.785`, stage `logo_chest`, quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`
**Scorer:** Lane E `evaluateChestStill` (`src/lib/eval/*`, spec `lane-e-chest-eval-v1`) + Stage 1d–1l forensic windows. **Unfiltered mid-luma** (`bandAuthorityMaskUsed: false`). Authority mask is accepted only so tests can prove it is ignored.
**Compared against:** clean still `2aa1a44c` (ImageScript 1.3.0, same decoder as the edge), Stage 1l live `9eaf0c55` (PR #70, **NOT CLEARED 10/11**), Stage 1k live `c9c4efee` (PR #66, **NOT CLEARED 7/11**), 1m fixture prediction (11/11)

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## Runtime preflight [V]

| Field | Value |
|---|---|
| HTTP / attempts | 200, single attempt (repair already succeeded in Hero Frame Studio; this session did not invoke the proxy) |
| Latency | **~16 550 ms** [O] (1l ~13.6 s; 1k ~56.6 s). Not a chest-gate criterion. |
| Spend | **$0** — no V3 / paid Grok |
| `assetId` | **`9ed83c01-8c7d-4d1b-918f-87b0fc743c50`** |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789448897690.png` (720×1280 PNG, 1 174 186 bytes, etag `c22e3e5b01f11f977ce5c1e4d1b4cdc0`) |
| `repair_method_version` | **`architecture_c_still_repair_1m`** |
| `occlusion_source` / `sam3_attempted` / `sam3_ok` / `sam3_reason` | `sam3` / `true` / `true` / `null` |
| `allow_skin_heuristic_fallback` | `false` |
| `requested_band_quad_norm` | echoed unchanged; `logo_zone_quad_provided: true`; `keyframe_id: v2-still-0.785` |
| `effective_band_bbox` | `{216,678,621,749, pixel_count 27 394}` (1l 27 390; 1k 27 307) |
| `temporalTrackingEnabled` | `false` |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Created | **2026-09-15 05:08:18Z** |
| Decoder | JPEG source decoded with **ImageScript 1.3.0** (edge `decodeToRgba`). 1m/1l/1k/1j PNGs decoded with the same library. 1l rescore of `9eaf0c55` is **10/11** — identical to PR #70. 1k rescore of `c9c4efee` is **7/11** — identical to PR #66. |

Changed vs clean: x 201–618, y 666–761, **21 264 px**. 0 px changed above y 600 or below y 800. Band-core sample luma (450,700) **31.6**.

## 1m vs 1l leftovers [V]

**154 px differ** vs 1l `9eaf0c55` (83 by > 8). Delta bbox x 302–608 / y 673–759 — inside the chest belt (wordmark-edge snap + neighborhood).

| Metric | 1l live `9eaf0c55` (PR #70) | 1m live `9ed83c01` | 1m fixture |
|---|---|---|---|
| Lane E score | **10 / 11** | **11 / 11** | 11 / 11 |
| C2 remnants | 0 | **0** | 0 |
| C4 cream→navy / raise at x 290 | 0 / 0 | **0 / 0** | 0 |
| C6 right-end cream→navy | 0 | **0** | 0 |
| C9 ghost ratio (combined / left / right) | 0.172 / 0.000 / 0.261 | **0.002 / 0.000 / 0.003** | < 0.05 |
| C9 mid-luma ghosts | 84 / 488 | **1 / 488** | 0 |
| C9 leftover box x 462–500 / y 713–723 | 82 / 119 | **1 / 119** | 0 |
| C5 4×3 sleeve | 0 | **0** | 0 |
| C8 tape bright | 0 / 68 | **0 / 68** | 0 |
| C7 wordmark navyFrac | 0.888 | **0.900** | navy band |

## Stage 1m causal checks [V]

**A — Mid-luma interior ownership: cleared.** Unfiltered Lane E C9: **1 / 488** mid-luma source pixels in the two lettering windows still above median + 20 (ceiling 51.6). Combined ratio **0.002 < 0.05**. Left window **0.000** (0 / 166). Right window **0.003** (1 / 322) — 1l 0.261 (84 / 322). The 1l leftover cluster at x 462–500 / y 713–723 is **82 → 1**. Survivor: **(463, 714)** source luma 174.0 / output luma 186.5 — above the 1m snap's ≤180 AA fringe cap (C7 glyph-core lock). `bandAuthorityMaskUsed: false`.

**B — Occlusion ownership: preserved.** Crease column means x 277–283 = 32.6 … 33.8 (floor 25.6). C3 PASS. Hand/forearm bright skin **109 / 109 byte-identical** (C10). 4×3 sleeve patch x 389–392 / y 746–748 **byte-identical to source** (C5).

**C — Sleeve/cream boundary: held.** C5 PASS. 1j 8-px zip-corner cream admission stays rejected.

**D — Top ridge / cream raise: held at 1l zeros.** C2 remnants **0**. C4 cream-body → navy **0**, first-navy row at x 290 = source **676** (raise 0). Row 676 x 208–213 and x 256–262 remain navy 34.

**E — Right/top perimeter: held at 1l zeros.** C6 cream→navy **0** at x 580–616 / y 713–730. Wordmark navyFrac **0.900** (C7 PASS; 1l 0.888). Left tape + diagonal navy (C8 0/68 bright).

## Verdict — **CHEST STILL GATE: CLEARED** (11 / 11)

| # | Criterion | 1m live | vs 1l leftovers | vs 1m fixture | Evidence |
|---|---|---|---|---|---|
| 1 | Full band incl. left third | **PASS** (0/2283 unpainted) | = | = | `stage1m_chest_compare.jpg` |
| 2 | Pinstripe + AA removed | **PASS** — remnants **0** | = (held) | = | `stage1m_pinstripe_topleft.jpg` |
| 3 | Crease removed | **PASS** | = | = | `stage1m_crease_lettering.jpg` |
| 4 | Cream preservation | **PASS** — cream→navy **0**, raise **0** | = (held) | = | `stage1m_pinstripe_topleft.jpg` |
| 5 | Sleeve/forearm | **PASS** | = | = | `stage1m_sleeve_zip_bottom.jpg` |
| 6 | Perimeter / right-end | **PASS** — cream→navy **0** | = (held) | = | `stage1m_right_top_edge.jpg` |
| 7 | Wordmark | **PASS** (navyFrac 0.900) | held (0.888→0.900) | = | `stage1m_right_top_edge.jpg` |
| 8 | Centre / single zip | **PASS** (0/68 bright) | = | = | `stage1m_centre_wedge.jpg` |
| 9 | No ghosting | **PASS** — unfiltered ratio **0.002** < 0.05 (left 0.000; right 0.003; 1/488) | **fixed** (0.172→0.002; right 0.261→0.003; 84→1) | = (live 1 leftover vs fixture 0; both under ceiling) | `stage1m_right_top_edge.jpg` |
| 10 | Foreground occlusion | **PASS** | = | = | `stage1m_sleeve_zip_bottom.jpg` |
| 11 | Outside-region | **PASS** — 0 px above y 600 / below y 800 | = | = | `stage1m_abs_diff.jpg` |

Lane E 1l rescore of `9eaf0c55` is **10 / 11**, FAIL {9} — identical to PR #70. 1k rescore of `c9c4efee` is **7 / 11**, FAIL {2,4,6,9} — identical to PR #66. The 1m table is on the same ruler.

## Live vs fixture 1m [V]

Fixture `warpQuadAlpha` + snap predicted **11 / 11**. Live is **11 / 11**. The one residual vs a perfect-zero C9 is a single C7-protected pixel at (463, 714) with output luma 186.5 (>180), so the snap correctly left it. Combined / right ratios stay an order of magnitude under the 0.05 ceiling.

C2 / C4 / C6 remain the 1l live zeros.

## Hard locks [V]

Score-only. No production paint/occlusion change, no proxy auth widen, no Control Center, no V3, no paid Grok, no PR #37, no repair re-run, no redeploy. Evidence + Lane E historical table only. 1i occlusion, 1j ROI, 1k enclosure, and 1l C2/C4/C6 paints hold.

## Recommended next step [R]

Chest still gate is **CLEARED 11/11** on the canonical `2aa1a44c` + measured quad. Do not reopen C9-right paint for the 1 leftover glyph-core pixel. Next work is a product decision (human review of the still, then temporal / original-master lanes) — not another chest-paint stage.

## Evidence files

- `stage1m_chest_compare.jpg` — clean \| 1l \| live 1m
- `stage1m_pinstripe_topleft.jpg`
- `stage1m_crease_lettering.jpg`
- `stage1m_right_top_edge.jpg`
- `stage1m_sleeve_zip_bottom.jpg`
- `stage1m_centre_wedge.jpg`
- `stage1m_abs_diff.jpg` — full-frame |Δluma|
- `stage1m_lane_e_report.json` — Lane E 1m JSON
- `stage1m_live_score.json` — 1m + 1l/1k/1j rescore + forensic probes
- `stage1m-live/` — harness package (gate, summary, crops)
- `stage1m-harness/live_asset.json` — identity + storage path
- `scripts/scoreStage1mLive.mts` — ImageScript 1.3.0 + `evaluateChestStill` (no authority-mask filter)
