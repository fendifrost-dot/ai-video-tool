# Architecture C — Stage 1j canonical live verification (`logo_chest`, `88af4fa`)

**Date:** 2026-09-14 · **Author:** Claude (Cowork) · **Spend:** $0 (deterministic; SAM-3 via CC SwitchX) · xAI total unchanged **$12.80 / $20**
**Code under test:** `main` @ `88af4fa` (Cursor Stage 1j: topology close-fill + ROI chest-local dilate) · edge `architecture-c-still-repair-proxy` redeployed by Fendi · **1j confirmed live by behaviour** (a first attempt on 2026-09-11 still served `_1i` and was refused as DEPLOYMENT MISMATCH; this run follows Fendi's second redeploy)
**Run:** authenticated AVT product UI, clean still `2aa1a44c`, keyframe `v2-still-0.785`, stage `logo_chest`, quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`, request body carried **no** `allowSkinHeuristicFallback`
**Compared against:** the clean still, 1i `21972fcf` (`c6e032b`), 1h `39c4a842`, and the product reference

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## Runtime preflight [V]

| Field | Value |
|---|---|
| HTTP | 200, single attempt, **~10.8 s** (1i: 546 on first attempt, ~41 s on second) — the ROI dilation removed the compute-limit failure |
| `assetId` | **`fb8117ee-a0bd-4949-a190-517d444cee4a`** |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789363013015.png` (720×1280, one still) |
| `repair_method_version` | **`architecture_c_still_repair_1j`** |
| `occlusion_source` / `sam3_attempted` / `sam3_ok` / `sam3_reason` | `sam3` / `true` / `true` / `null` |
| `allow_skin_heuristic_fallback` | `false` — fallback not used |
| `requested_band_quad_norm` | echoed unchanged; `logo_zone_quad_provided: true`; `keyframe_id: v2-still-0.785` |
| `effective_band_bbox` | `{216,678,621,749, pixel_count 27 582}` (1i 27 540) |
| `band` / `target_quad` | unchanged since 1d |
| `temporalTrackingEnabled` | `false` |

Changed vs clean: x 207–618, y 673–759, 13 380 px (1.45 %). 0 px changed above y 600 or below y 800. Band core median luma 37.1.

## 1j vs 1i delta [V]

**384 px differ by > 8.** The two outputs are otherwise the same image. Improved: mid-luma interior residuals 809 → 595 (see A); left glyph outline 158 → 110 px; wearer's-left residues 113 → 101; diagonal zip tape mostly absorbed (y 715 x 427–428: 161/161 → 40/40; y 735 x 419–420: 127/128 → 45/45); bright interior residues 73 → 31. Unchanged: pinstripe fragments (rows 676/679 byte-identical to 1i), cream-body → navy 97, right-end protrusion 113 → 114, top edge, left zip tape. Regressed: 8 px darkened cream at x 389–392 / y 746–748 (1i: 0).

## Stage 1j causal checks [V]

**A — Mid-luma interior ownership: partial.** Same metric as 1i (source luma 60–180, non-candidate, inside the band interior, byte-identical after repair): **595 / 866 unpainted** (1i 809, 1h 141). The residual count did not go to zero; 69 % of the class remains. Spatially the survivors are the same outlines, thinner: x 255–345 / y 696–712 (99 of 166 window pixels above median + 20), x 442–560 / y 704–734 (189 of 322), zip-adjacent x 380–420 (223), ridge x 260–280. Bright cores (> 180) are painted (31 unpainted, mostly the left tape). Cause traced below.

**B — Occlusion ownership: preserved.** Crease implied coverage `1.0` across x 276–288 at y 695 and 0.85–0.91 at y 705 (identical to 1i); column means x 277–283 all 33 = band. Wedge coverage `0.81 1.0 1.0 0.93 0.84 0.91 0.98 0.98`; region mean luma 42.5 (1i 42.9; source 17.8). Hand/forearm skin byte-identical (rows 738–742 at x 330–380 `59 108 137 155 182` vs clean `58 106 134 155 183`; hand-window changes are band pixels at x 280–300). No regression.

**C — Sleeve/cream boundary: preserved except one 4×3 patch.** Rows 738–755 at x 330–380 identical to clean; rows 745–759 at x 373–399 show no block or spill; but at x 389–392 / y 746–748 eight cream pixels dropped from 102–204 to 43–87 (1i left them untouched). It is the zip/sleeve corner — a mid-luma cream pixel cluster newly admitted by the topology rule (≥ 4 seed neighbours at the band's lower boundary).

**D — Top ridge: unchanged from 1i.** Row 676 x 208–213 (39–78) and x 256–262 (107→57); row 679 x 228–239 (62–99), x 267 (164); rows 678–686 max luma 146–179 at x 210–280. Cream-body → navy 97 px at x 280–330 / rows 673–676 (3-px raise at x 290). No new cream absorbed.

**E — Right/top perimeter: top unchanged (correct), right end unchanged (defect).** First navy row = clean at every sampled column except x 290 (676 → 673) and x 320 (679 → 678); no light seam; right-end protrusion 114 cream → dark px at x 580–616 / y 713–730.

## Verdict — **CHEST STILL GATE: NOT CLEARED** (5 / 11)

| # | Criterion | Result | vs 1i | Evidence |
|---|---|---|---|---|
| 1 | Full band incl. left third | **PASS** | = | `stage1j_chest_compare.jpg` |
| 2 | Pinstripe + AA removed | **FAIL** — fragments rows 676/679 and outline curve x 260–280 / y 676–690, byte-identical to 1i | unchanged | `stage1j_pinstripe_topleft.jpg` |
| 3 | Crease removed | **PASS** | = | `stage1j_crease_lettering.jpg` |
| 4 | Cream preservation | **FAIL** — 97 cream-body px at x 280–330 / rows 673–676 | unchanged | `stage1j_pinstripe_topleft.jpg` |
| 5 | Sleeve/forearm | **FAIL — minor regression** — 8 px at x 389–392 / y 746–748 darkened by 60–145 luma (1i: 0) | regressed | `stage1j_sleeve_zip_bottom.jpg` |
| 6 | Perimeter | **FAIL** — right-end protrusion x 580–616 / y 713–730 (114 px) | unchanged | `stage1j_right_top_edge.jpg` |
| 7 | Wordmark | **PASS** | = | `stage1j_right_top_edge.jpg` |
| 8 | Centre / single zip | **FAIL (improved)** — diagonal tape reduced to a dotted line (most core pixels now 40–45), left tape x 399–401 survives (109/85/55 at y 715; 100/154/49 at y 735) | improved | `stage1j_centre_wedge.jpg` |
| 9 | No ghosting | **FAIL (improved)** — outline ghosts of every glyph, the pinstripe and the tapes remain visible on both halves: 595 mid-luma interior px unpainted (1i 809), 60 % / 59 % of the mid-luma pixels in the two lettering windows still above median + 20 | improved | `stage1j_crease_lettering.jpg`, `stage1j_right_top_edge.jpg` |
| 10 | Foreground occlusion | **PASS** | = | `stage1j_sleeve_zip_bottom.jpg` |
| 11 | Outside-region | **PASS** — 0 px above y 600 / below y 800 | = | pixel diff |

## Causal layer by defect

**9 / 2 / 8 (outline ghosts, ridge AA, tape edges) — COMPONENT CONSTRUCTION [V].** `_shared/logoComposite.ts`, the close-added loop: a close-added non-navy pixel with luma ≤ 180 is kept only if it has **≥ 4 original-seed 8-neighbours** (`candidates[...] >= 0.5`, i.e. navy / dark low-chroma pixels). A glyph's antialias ring sits between navy seeds on its outer side and the glyph's bright core on its inner side; the core pixels are close-added, not seeds, so an AA pixel typically has 2–3 seed neighbours and is still rejected. The same geometry holds for the pinstripe AA (cream body on one side) and the tape edges (bright core on one side). The rule fixed exactly the AA pixels that happen to border seeds on ≥ 4 sides (the 26 % recovered) and nothing else. Seeds are the wrong topology reference: the enclosing set has to include close-added bright cores (or the test must be "enclosed by the closed component", not "surrounded by seeds").

**5 (4×3 sleeve patch) — COMPONENT CONSTRUCTION [V].** Same rule in the other direction: at the band's lower boundary near the zip, a few shadowed cream pixels (luma 102–204) have ≥ 4 dark-seed neighbours and are now admitted.

**4 (3-px raise at x 290) — SEGMENTATION [V, unchanged].** Fixed-origin absorb still climbs 3 rows into cream body where the ridge is thickest.

**6 (right-end protrusion) — COMPONENT CONSTRUCTION [V, untouched since 1g].** The closed component follows the armhole shadow past the band's end; no stage has targeted it.

## Regression / evidence audit [V] — test-model mismatch, demonstrated

I ran the golden file locally at `88af4fa` (`npx vitest run src/lib/garment/architectureCStillRepairGolden.test.ts`): **38 / 38 pass**, including *"real-crop mid-luma interior AA is painted (no outline ghosts)"* and *"close/expansion does not paint navy sleeve/forearm block or right-end protrusion"*. Both pass against live behaviour that fails them:

| Test | Why it passes while live fails |
|---|---|
| mid-luma interior AA | It counts a mid-luma pixel only if `covered.bandAuthorityMask[...] >= 0.5`. The rejected AA pixels are, by construction, *not* in the closed component and therefore not in the authority mask — the test skips exactly the pixels the rule rejects. Applying the test's own windows and ceiling (median + 20 at (450, 700)) to the live output **without** that filter gives ghost ratios **0.60** (x 255–345 / y 696–712) and **0.59** (x 442–560 / y 704–734) against the test's `< 0.25` threshold (1i: 0.83 / 0.73). |
| right-end protrusion | The assertion window is x 373–399 / y 745–759 (the sleeve block), not x 580–616 / y 713–730. The live protrusion is never examined. |
| diagonal tape | Asserts one row (y 715) < 80 — live agrees for that row; the left tape and the remaining dotted pixels are not asserted. |
| crease / wedge / hand / sleeve rows 741–749 | Genuine coverage; live agrees. |

The ROI dilation is correct: `dilateAlphaRoi` reproduces full-frame results inside the band bbox + 12 px, the run time dropped from ~41 s to ~10.8 s, and no 546 occurred.

## Recommended next step [R]

Not a threshold — a reference-set fix and two test corrections, each traced above: (1) make the interior test "enclosed by the closed component" — keep a close-added mid-luma pixel if it is not 8-adjacent to any pixel outside `closedCandidates` (or, equivalently, reject only close-added pixels that touch the component's outer boundary); that admits glyph/ridge/tape AA and still rejects boundary cream bridges, and it also excludes the new 4×3 sleeve patch; (2) remove the `bandAuthorityMask` filter from the mid-luma golden — count every mid-luma source pixel in the window that lies inside the *quad*, and assert the ratio against the live numbers (target < 0.05); (3) add a real assertion for x 580–616 / y 713–730 (cream unchanged) and for the left tape column x 399–401 after the zip overlay; (4) the pinstripe tails (rows 676/679) and the 3-px raise at x 290 need the absorb to accept AA (luma 100–140) adjacent to the ridge and to stop at the first cream-body row — unchanged recommendation from 1i.

## Hard locks [V]

The verification took no production code, deploy, config, prompt, V3, sleeve, temporal, Astra/Premiere, auth/RLS, Control Center, or paid action. Running the golden suite locally is read-only. This document and six evidence images are committed as authorized.
