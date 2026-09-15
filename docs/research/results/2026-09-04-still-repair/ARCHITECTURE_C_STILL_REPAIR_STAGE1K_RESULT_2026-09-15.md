# Architecture C — Stage 1k canonical live verification (`logo_chest`, `c9c4efee`)

**Date:** 2026-09-15 · **Author:** Cursor (Lane A, score-only) · **Spend:** $0 · **Issue:** #52 (parent #50)
**Code under test:** `main` @ `9366f09` (Stage 1k enclosure / truthful goldens / right-end / absorb; edge `architecture-c-still-repair-proxy` already redeployed; **repair not re-run**)
**Run:** authenticated AVT product UI (Fendi), clean still `2aa1a44c`, keyframe `v2-still-0.785`, stage `logo_chest`, quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`
**Scorer:** Lane E `evaluateChestStill` (`src/lib/eval/*`, spec `lane-e-chest-eval-v1`) + Stage 1d–1j forensic windows. **Unfiltered mid-luma** (`bandAuthorityMaskUsed: false`).
**Compared against:** clean still `2aa1a44c` (ImageScript-decoded, same decoder as the edge), Stage 1j live `fb8117ee` (5/11), fixture 1k prediction (9/11, FAIL C2+C6)

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## Runtime preflight [V]

| Field | Value |
|---|---|
| HTTP / attempts | 200, single attempt (repair already succeeded; this session did not invoke the proxy) |
| Latency | **~56.6 s** [O] (1j: ~10.8 s; 1i: ~41 s). Not a chest-gate criterion. |
| `assetId` | **`c9c4efee-6bd2-450f-a9e4-b70fb9b722bb`** |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789441063771.png` (720×1280 PNG, 1 174 779 bytes, etag `e9bb12a7d146fdde8c1a18de419385d3`) |
| `repair_method_version` | **`architecture_c_still_repair_1k`** |
| `occlusion_source` / `sam3_attempted` / `sam3_ok` / `sam3_reason` | `sam3` / `true` / `true` / `null` |
| `allow_skin_heuristic_fallback` | `false` |
| `requested_band_quad_norm` | echoed unchanged; `logo_zone_quad_provided: true`; `keyframe_id: v2-still-0.785` |
| `effective_band_bbox` | `{216,678,621,749, pixel_count 27 307}` (1j 27 582) |
| `temporalTrackingEnabled` | `false` |
| Decoder | JPEG source decoded with **ImageScript 1.3.0** (edge `decodeToRgba`). FFmpeg JPEG decode differs on 859 067 / 921 600 px and **false-FAILs C5/C10/C11** — do not use it as source. PNG ffmpeg ↔ ImageScript: 0 px RGB diff. |

Changed vs clean: x 205–618, y 666–761, **20 930 px**. 0 px changed above y 600 or below y 800. Band-core sample luma (450,700) **31.6**.

## 1k vs 1j delta [V]

**3 773 px differ** (2 286 by > 8). Delta bbox x 205–617 / y 666–761 — inside the chest belt.

| Metric | 1j live `fb8117ee` | 1k live `c9c4efee` |
|---|---|---|
| Lane E score | **5 / 11** (rescore of the same PNGs; matches the human 1j table) | **7 / 11** |
| Unfiltered ghost ratio (combined / left / right) | 0.590 / 0.596 / 0.587 | **0.195 / 0.042 / 0.273** |
| C2 pinstripe remnants | 22 | **6** |
| C4 cream→navy (x 280–330 / y 673–676) | 71 (human 1j: 97) | **19** |
| C4 first-navy row at x 290 | 673 (raise 3) | **675** (raise **1**) |
| C5 4×3 sleeve patch | 8 darkened | **0** (byte-identical) |
| C6 right-end cream→navy | 109 (human 1j: 114) | **41** |
| C8 zip-tape bright samples | 47 / 68 | **0 / 68** |
| Left tape x399–401 y715 luma | 110 / 86 / 55 | **41 / 41 / 41** |

## Stage 1k causal checks [V]

**A — Mid-luma interior ownership: partial.** Unfiltered Lane E C9: **95 / 488** mid-luma source pixels in the two lettering windows still above median + 20 (ceiling 51.6). Left window **0.042** (7 / 166) — matches the fixture 0.042 and is under the 0.05 ceiling. Right window **0.273** (88 / 322) — fixture predicted 0.012. Survivors cluster x 462–555 / y 713–723 in the wordmark half (plus a few unpainted AA at x 552–555 / y 704–705).

**B — Occlusion ownership: preserved.** Crease column means x 277–283 = 35.6 … 33.8 (floor 25.6). C3 PASS. Hand/forearm bright skin **109 / 109 byte-identical** (C10). 1j 4×3 sleeve patch x 389–392 / y 746–748 is **byte-identical to source** (C5).

**C — Sleeve/cream boundary: restored.** C5 PASS. Below-quad trim + enclosure rejected the 1j 8-px zip-corner cream admission.

**D — Top ridge / cream raise: improved, not cleared.** Row 676 x 208–213 and x 256–262 are now navy 34 (1j still held source AA 39–108). Six mid-luma remnants remain: (208,677), (213,679), (269,680), (261–262,681), (271,681). Cream-body → navy **19 px**, almost all on **y 675** x 281–295 (y 673–674: 2+2 at x 280–281; y 676: 0). 1-px raise at x 290.

**E — Right/top perimeter: residual tongue.** C6 **41** cream→navy at x 580–614 / y 713–727 (mostly y 713–715: 10+12+15). Fixture residual was **42**. Not a PASS.

## Verdict — **CHEST STILL GATE: NOT CLEARED** (7 / 11)

| # | Criterion | Result | vs 1j | vs fixture 1k | Evidence |
|---|---|---|---|---|---|
| 1 | Full band incl. left third | **PASS** | = | = | `stage1k_chest_compare.jpg` |
| 2 | Pinstripe + AA removed | **FAIL** — 6 remnant px (rows 677/679/680/681) | improved (22→6) | FAIL as predicted | `stage1k_pinstripe_topleft.jpg` |
| 3 | Crease removed | **PASS** | = | = | `stage1k_crease_lettering.jpg` |
| 4 | Cream preservation | **FAIL** — 19 cream-body px, 1-px raise at x 290 | improved (71→19; raise 3→1) | **live extra FAIL** (fixture 0) | `stage1k_pinstripe_topleft.jpg` |
| 5 | Sleeve/forearm | **PASS** — 0 bright bytes changed; 4×3 patchDarkened 0 | **fixed** (8→0) | = | `stage1k_sleeve_zip_bottom.jpg` |
| 6 | Perimeter | **FAIL** — right-end cream→navy **41** (x 580–616 / y 713–730) | improved (109→41) | FAIL as predicted (42) | `stage1k_right_top_edge.jpg` |
| 7 | Wordmark | **PASS** (navyFrac 0.887) | = | = | `stage1k_right_top_edge.jpg` |
| 8 | Centre / single zip | **PASS** — left tape + diagonal navy (0/68 bright) | **fixed** (47/68→0) | = | `stage1k_centre_wedge.jpg` |
| 9 | No ghosting | **FAIL** — unfiltered ratio **0.195** ≥ 0.05 (left 0.042 PASS locally; right 0.273) | improved (0.590→0.195) | **live extra FAIL** (fixture < 0.05) | `stage1k_crease_lettering.jpg`, `stage1k_right_top_edge.jpg` |
| 10 | Foreground occlusion | **PASS** | = | = | `stage1k_sleeve_zip_bottom.jpg` |
| 11 | Outside-region | **PASS** — 0 px above y 600 / below y 800 | = | = | pixel diff |

Lane E 1j rescore of `fb8117ee` is **5 / 11**, FAIL {2,4,5,6,8,9} — identical to the human Stage 1j table. The 1k table is therefore on the same ruler.

## Live vs fixture 1k [V]

Fixture `coverTargetQuad` + 1h SAM-3 evidence alphas predicted **9 / 11** (FAIL C2+C6). Live is **7 / 11**. Two gaps:

1. **C9 right window** — fixture 0.012 vs live **0.273**. Left window matches (0.042). The wearer's-left wordmark half is where live SAM-3 + perspective wordmark warp sit; the crop fixture does not reproduce those mid-luma residuals.
2. **C4 cream raise** — fixture 0 at y 673–675 vs live **19** (15 of them on y 675 x 281–295). Absorb's cream-body stop is leakier on the live JPEG than on the embed crop.

C6 matched (41 live vs 42 fixture). C5/C8 matched (PASS).

## Hard locks [V]

Score-only. No production paint/occlusion change, no proxy auth widen, no Control Center, no V3, no paid Grok, no PR #37, no repair re-run. Evidence + Lane E historical table only.

## Recommended next step [R]

Not a threshold. C6 is the fixture-honest residual (navy-bounded letter-hole class, ~41 px) — same class the 1k impl already disclosed. C2 is six isolated ridge AA pixels. The **gate-moving** live misses vs the 9/11 prediction are **C9-right** (wordmark-half mid-luma, 88 px) and **C4** (19 px / 1-row raise). Hold 1i occlusion and 1j ROI. Do not claim CLEARED.

## Evidence files

- `stage1k_chest_compare.jpg` — clean \| 1j \| live 1k
- `stage1k_pinstripe_topleft.jpg`
- `stage1k_crease_lettering.jpg`
- `stage1k_right_top_edge.jpg`
- `stage1k_sleeve_zip_bottom.jpg`
- `stage1k_centre_wedge.jpg`
- `stage1k_lane_e_report.json` — Lane E 1k JSON
- `stage1k_live_score.json` — 1k + 1j rescore + forensic probes
