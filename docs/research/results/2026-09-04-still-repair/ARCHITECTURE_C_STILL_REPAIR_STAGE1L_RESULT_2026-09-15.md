# Architecture C — Stage 1l canonical live verification (`logo_chest`, `9eaf0c55`)

**Date:** 2026-09-15 · **Author:** Cursor (Lane E, score-only) · **Spend:** $0 · **Issue:** #67 (lineage #52, parent #50)
**Code under test:** live edge serving `architecture_c_still_repair_1l` (PR #68 on `main` @ `2aaaaf1`). **Repair not re-run. Paint not changed.**
**Run:** authenticated AVT product UI (Fendi / Hero Frame Studio), clean still `2aa1a44c`, keyframe `v2-still-0.785`, stage `logo_chest`, quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`
**Scorer:** Lane E `evaluateChestStill` (`src/lib/eval/*`, spec `lane-e-chest-eval-v1`) + Stage 1d–1k forensic windows. **Unfiltered mid-luma** (`bandAuthorityMaskUsed: false`). Authority mask is accepted only so tests can prove it is ignored.
**Compared against:** clean still `2aa1a44c` (ImageScript 1.3.0, same decoder as the edge), Stage 1k live `c9c4efee` (PR #66, **NOT CLEARED 7/11**), Stage 1j live `fb8117ee` (5/11), 1l fixture prediction (11/11)

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## Runtime preflight [V]

| Field | Value |
|---|---|
| HTTP / attempts | 200, single attempt (repair already succeeded in Hero Frame Studio; this session did not invoke the proxy) |
| Latency | **~13 646 ms** [O] (1k ~56.6 s; 1j ~10.8 s). Not a chest-gate criterion. |
| Spend | **$0** — no V3 / paid Grok |
| `assetId` | **`9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75`** |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789446767711.png` (720×1280 PNG, 1 174 486 bytes) |
| `repair_method_version` | **`architecture_c_still_repair_1l`** |
| `occlusion_source` / `sam3_attempted` / `sam3_ok` / `sam3_reason` | `sam3` / `true` / `true` / `null` |
| `allow_skin_heuristic_fallback` | `false` |
| `requested_band_quad_norm` | echoed unchanged; `logo_zone_quad_provided: true`; `keyframe_id: v2-still-0.785` |
| `effective_band_bbox` | `{216,678,621,749, pixel_count 27 390}` (1k 27 307; 1j 27 582) |
| `temporalTrackingEnabled` | `false` |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Source still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Decoder | JPEG source decoded with **ImageScript 1.3.0** (edge `decodeToRgba`). 1k/1j/1l PNGs decoded with the same library. 1k rescore of `c9c4efee` is **7/11** — identical to PR #66. |

Changed vs clean: x 201–618, y 666–761, **21 264 px**. 0 px changed above y 600 or below y 800. Band-core sample luma (450,700) **31.6**.

## 1l vs 1k leftovers [V]

**702 px differ** vs 1k `c9c4efee` (460 by > 8). Delta bbox x 201–614 / y 669–741 — inside the chest belt.

| Metric | 1k live `c9c4efee` (PR #66) | 1l live `9eaf0c55` | 1l fixture |
|---|---|---|---|
| Lane E score | **7 / 11** | **10 / 11** | 11 / 11 |
| C2 remnants | 6 | **0** | 0 |
| C4 cream→navy / raise at x 290 | 19 / 1-px | **0 / 0** | 0 |
| C6 right-end cream→navy | 41 | **0** | 0 |
| C9 ghost ratio (combined / left / right) | 0.195 / 0.042 / 0.273 | **0.172 / 0.000 / 0.261** | 0 / 0 / 0 |
| C9 mid-luma ghosts | 95 / 488 | **84 / 488** | 0 |
| C5 4×3 sleeve | 0 | **0** | 0 |
| C8 tape bright | 0 / 68 | **0 / 68** | 0 |

1j rescore of `fb8117ee` on the same ruler is **5 / 11** (FAIL {2,4,5,6,8,9}) — matches the human 1j table.

## Stage 1l causal checks [V]

**A — Mid-luma interior ownership: still not cleared.** Unfiltered Lane E C9: **84 / 488** mid-luma source pixels in the two lettering windows still above median + 20 (ceiling 51.6). Left window **0.000** (0 / 166) — 1k 0.042, now under the 0.05 ceiling. Right window **0.261** (84 / 322) — 1k 0.273; fixture predicted 0. Survivors still cluster **x 462–500 / y 713–723** in the wordmark half (same class as 1k's x 462–555 / y 713–723). Combined ratio **0.172 ≥ 0.05**. `bandAuthorityMaskUsed: false`.

**B — Occlusion ownership: preserved.** Crease column means x 277–283 = 32.6 … 33.8 (floor 25.6). C3 PASS. Hand/forearm bright skin **109 / 109 byte-identical** (C10). 4×3 sleeve patch x 389–392 / y 746–748 **byte-identical to source** (C5).

**C — Sleeve/cream boundary: held.** C5 PASS. 1j 8-px zip-corner cream admission stays rejected.

**D — Top ridge / cream raise: cleared.** C2 remnants **0** (1k 6). C4 cream-body → navy **0**, first-navy row at x 290 = source **676** (raise 0; 1k raise 1 / 19 px). Row 676 x 208–213 and x 256–262 remain navy 34.

**E — Right/top perimeter: cleared.** C6 cream→navy **0** at x 580–616 / y 713–730 (1k 41). Wordmark navyFrac **0.888** (C7 PASS). Left tape + diagonal navy (C8 0/68 bright).

## Verdict — **CHEST STILL GATE: NOT CLEARED** (10 / 11)

| # | Criterion | 1l live | vs 1k leftovers | vs 1l fixture | Evidence |
|---|---|---|---|---|---|
| 1 | Full band incl. left third | **PASS** (0/2283 unpainted) | = | = | `stage1l_chest_compare.jpg` |
| 2 | Pinstripe + AA removed | **PASS** — remnants **0** | **fixed** (6→0) | = | `stage1l_pinstripe_topleft.jpg` |
| 3 | Crease removed | **PASS** | = | = | `stage1l_crease_lettering.jpg` |
| 4 | Cream preservation | **PASS** — cream→navy **0**, raise **0** | **fixed** (19 / 1-px → 0) | = | `stage1l_pinstripe_topleft.jpg` |
| 5 | Sleeve/forearm | **PASS** | = | = | `stage1l_sleeve_zip_bottom.jpg` |
| 6 | Perimeter / right-end | **PASS** — cream→navy **0** | **fixed** (41→0) | = | `stage1l_right_top_edge.jpg` |
| 7 | Wordmark | **PASS** (navyFrac 0.888) | = | = | `stage1l_right_top_edge.jpg` |
| 8 | Centre / single zip | **PASS** (0/68 bright) | = | = | `stage1l_centre_wedge.jpg` |
| 9 | No ghosting | **FAIL** — unfiltered ratio **0.172** ≥ 0.05 (left 0.000; right 0.261; 84/488) | improved (0.195→0.172; left cleared; right 0.273→0.261) | **live extra FAIL** (fixture 0) | `stage1l_crease_lettering.jpg`, `stage1l_right_top_edge.jpg` |
| 10 | Foreground occlusion | **PASS** | = | = | `stage1l_sleeve_zip_bottom.jpg` |
| 11 | Outside-region | **PASS** — 0 px above y 600 / below y 800 | = | = | `stage1l_abs_diff.jpg` |

Lane E 1k rescore of `c9c4efee` is **7 / 11**, FAIL {2,4,6,9} — identical to PR #66. The 1l table is on the same ruler.

## Live vs fixture 1l [V]

Fixture `coverTargetQuad` + 1h SAM-3 evidence α predicted **11 / 11**. Live is **10 / 11**. The one gap:

1. **C9 right window** — fixture 0 vs live **0.261** (84 px). Same wordmark-half mid-luma class as the 1k live miss (then 0.273 / 88 px). The 1l in-quad mid-luma fill cleared the **left** lettering window (0.042→0) and recovered **4** right-window pixels. The crop fixture does not reproduce the live SAM-3 + perspective wordmark-edge AA at x 462–500 / y 713–723.

C2 / C4 / C6 now match the fixture zeros on live pixels.

## Hard locks [V]

Score-only. No production paint/occlusion change, no proxy auth widen, no Control Center, no V3, no paid Grok, no PR #37, no repair re-run, no redeploy. Evidence + Lane E historical table only. 1i occlusion and 1j ROI hold.

## Recommended next step [R]

Not a threshold. C2 / C4 / C6 are live-cleared. The remaining gate is **C9-right**: 84 unfiltered mid-luma ghosts in the wordmark half (ratio 0.261 vs ceiling 0.05). Do not claim CLEARED. Hold 1i occlusion and 1j ROI. Next cheapest experiment is a truthful C9-right probe on the live PNG (where those 84 px sit relative to the warped wordmark vs the closed component), not another 1l paint tweak from memory.

## Evidence files

- `stage1l_chest_compare.jpg` — clean \| 1k \| live 1l
- `stage1l_pinstripe_topleft.jpg`
- `stage1l_crease_lettering.jpg`
- `stage1l_right_top_edge.jpg`
- `stage1l_sleeve_zip_bottom.jpg`
- `stage1l_centre_wedge.jpg`
- `stage1l_abs_diff.jpg` — full-frame |Δluma|
- `stage1l_lane_e_report.json` — Lane E 1l JSON
- `stage1l_live_score.json` — 1l + 1k/1j rescore + forensic probes
- `stage1l-live/` — harness package (gate, summary, crops)
- `scripts/scoreStage1lLive.mts` — ImageScript 1.3.0 + `evaluateChestStill` (no authority-mask filter)
