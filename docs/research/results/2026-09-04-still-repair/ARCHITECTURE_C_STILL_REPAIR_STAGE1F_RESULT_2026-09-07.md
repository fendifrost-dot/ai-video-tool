# Architecture C — Stage 1f live verification (`logo_chest`, PR #46 / `dfeef8b`)

**Date:** 2026-09-07 · **Author:** Claude (Cowork) · **Spend:** $0 (deterministic; SAM-3 via CC SwitchX) · xAI total unchanged **$12.80 / $20**
**Code under test:** `main` @ `803ea1f` (PR #46 merge of `dfeef8b`) · edge `architecture-c-still-repair-proxy` redeployed by Fendi · **1f confirmed live by behaviour** (a pre-redeploy probe, asset `ba3a5c01`, still returned `_1e` and was discarded)
**Run:** authenticated AVT product UI, clean still `2aa1a44c`, keyframe `v2-still-0.785`, stage `logo_chest`, quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`, request body carried **no** `allowSkinHeuristicFallback`
**Compared against:** 1e `57504fac`, 1d `e0fb43b1`, and the clean still

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## Response metadata [V]

| Field | Value |
|---|---|
| HTTP | 200 |
| `assetId` | **`88a73cae-1030-4388-95f4-082ca6cd869f`** |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1788820344774.png` |
| `repair_method_version` | **`architecture_c_still_repair_1f`** |
| `occlusion_source` | **`sam3`** |
| `sam3_attempted / sam3_ok / sam3_reason` | `true / true / null` |
| `allow_skin_heuristic_fallback` | `false` (fail-closed policy armed; 422 path not exercised — SAM-3 succeeded) |
| `requested_band_quad_norm` | `[[0.3,0.53],[0.87,0.533],[0.87,0.585],[0.3,0.582]]` |
| `effective_band_bbox` | `{left 216, top 678, right 621, bottom 749, pixel_count 25347}` (1e: 25349) |
| `band` / `target_quad` | `(216,678)→(626,749)` / logo sub-quad `[[441.5,696.95],[576.8,698.27],[576.8,731.77],[441.5,730.45]]` — unchanged since 1d |

All expected metadata matched the directive. Output is one 720×1280 still, not a clip.

## Verdict — **FAIL** under zero-deviation (7 / 10; the three misses are larger than 1e's)

Changed region vs clean: x 208–619, y 676–751, **0.31 %** of the frame (1e: 1.47 %). **0 changed pixels above y 600 or below y 800.**

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Upper-left pinstripe fully gone | **FAIL — regressed to worse than 1d.** Rows 672–691 max luma at x 210–330: `231 229 230 233 240 211 251 253 226 229 247 254 217 189 150 71 43…` — identical to the clean still (1e: `208 191 173 152 128 141 166 93 56…`). The pinstripe is 100 % visible, and the whole **left third of the band (x ≈ 216–285, all rows) is unpainted**: original navy, original top edge, original pinstripe and lettering | `stage1f_left_zoom.jpg`, `stage1f_topleft_edge.jpg` |
| 2 | No cream inside the quad painted navy | **PASS** — source-cream→navy count outside band rows: **25 px** (1e: 658), all within the 3-px feather ring | `stage1f_chest_compare.jpg` |
| 3 | No bleed onto sleeve / forearm | **PASS** — rows 738–755 mean luma at x 330–380: 1f `59 104 127 146 179 205 214 215 216 210 204 201 …` vs clean `57 106 134 155 182 205 214 215 216 211 205 202 …` (≤ 9 luma, in the feather ring) | `stage1f_forearm_boundary.jpg` |
| 4 | No dark seam / speckle at x ≈ 279–283 | **FAIL — worse than 1e.** Column mean luma x 276–292 (y 690–740): 1f `113 98 77 45 14 5 7 11 21 28 22 18 24 28 29 29 29`; 1e `42 42 42 38 33 32 33 37 42 44 44 44 45 …`. Darkest painted-region pixel = 0 < median − 6 = 28.9; near-black (< 25) pixels inside the band region 4 231 (1e 1 611) | `stage1f_left_zoom.jpg` |
| 5 | No drips | **PASS** — max changed row 751 (quad bottom 749), 2 rows of feather | pixel diff |
| 6 | Feathered perimeter, no staircase | **FAIL (partial)** — the inward feather works where the paint reaches a real edge (top edge at x = 350: `221 → 126 → 52 → 32`, 3 px). But the paint region's outline is now the classifier's ragged outline: blocky pixel steps at x 200–235 / y 668–690, and a hard-edged grey rectangle at x ≈ 385–395 / y ≈ 705–712 (lettering fragment half-covered) | `stage1f_topleft_edge.jpg`, `stage1f_zip_column.jpg` |
| 7 | Wordmark scale / position | **PASS** — `target_quad` identical; legible, wearer's-left, 34.8 px | zoom |
| 8 | Zip continuous | **PASS** | `stage1f_zip_column.jpg` |
| 9 | Illumination natural, no ghosting | **PASS in the painted area** — band core median luma 34.9 (1e 43.9; source band ≈ 30–35), no high-frequency imprint | zoom |
| 10 | Preservation | **PASS** — zero changes outside y 676–751 / x 208–619; face, hands, trousers, background untouched | pixel diff |

**[D]** The 1f directive's four corrections did what they said for the *margins*: over-paint and forearm smear are gone (criteria 2, 3), and the inward feather is correct where it fires. But the paint region itself shrank to the pixels the navy classifier accepts, and on the real still that is only about a third of the band. Net effect: the band's left third is untouched, which is visually worse than 1e even though six-of-ten margin metrics improved.

## Root cause [V] — `isNavyPixel()` is the sole paint authority, and it rejects most of the real band

`coverTargetQuad` (`_shared/logoComposite.ts`, `quad_navy_union`) builds `navy` from `isNavyPixel(r,g,b)` = `r ≤ 95 && g ≤ 95 && b ≥ 45 && b > r+8 && b > g+5`, then paints `dilate(navy, 2) ∪ (quad ∩ dilate(navy, 4))`. Measured on the clean still inside the band bbox (y 678–749, x 216–626):

| Region (rows 684–706) | dark (luma < 70) | `isNavyPixel` true | mean RGB |
|---|---|---|---|
| x 216–240 | 100 % | 86 % | (30, 32, 48) |
| x 240–260 | 100 % | 71 % | (28, 31, 46) |
| x 260–280 | 96 % | 57 % | (33, 33, 45) |
| **x 280–300 (crease)** | 99 % | **3 %** | **(16, 17, 27)** |
| x 300–340 | 95 % | 53 % | (35, 36, 49) |
| x 340–400 | 96 % | 49 % | (31, 32, 46) |

Only **35 %** of the band bbox passes the classifier; **31 %** is dark, low-chroma band pixel that fails it (`b < 45`, or `b ≤ r + 8` in the shadowed fabric). `stage1f_navy_classifier_map.jpg` paints these green / red over the clean still next to the 1f output: the unpainted region is exactly the red region. Three consequences:

1. **Left third unpainted (criterion 1).** The shadowed wearer's-right end of the band is mostly classifier-negative; `dilate(navy, 4)` cannot bridge gaps wider than 8 px, so the quad prior never fires there.
2. **The "dark seam" was never a paint seam (criterion 4).** x 279–291 is a **source crease** — the V2-generated band has a fold shadow with RGB ≈ (2, 6, 17). Source column means there are `105 93 73 43 14 5 7 11 21 28 …`; 1f leaves every one of those pixels byte-identical. 1d's "speckle column" and 1e's "faint seam" were this crease partially painted; 1f's clamp never touched it because the clamp only applies to pixels the mask includes. The pixels exist in the source at luma 2–17, so under "no painted pixel darker than median − 6" they have to be *in* the mask.
3. **Pinstripe outside reach.** The pinstripe sits at y 675–680, the first classifier-navy rows start at y ≈ 680, the quad top is 678.4. `navyEdgeDilatePx = 2` reaches y 678; the stripe is 4–5 px thick above that. No inward feather can help a pixel the mask never contains.

**Why the golden suite passed [V]:** `architectureCStillRepairGolden.test.ts` builds its fixture with navy `(28, 32, 95)` and a speckle column `(8, 10, 48)` chosen so it "still passes isNavyPixel" (comment in the test). The real band is `(30, 31, 48)` on average, with a crease at `(2, 6, 17)`. The fixture cannot express the failure mode, so all 1f assertions (pinstripe, seam, cream-inside-quad, forearm) pass on synthetic data and fail on the canonical still.

## Smallest deterministic correction [R] (for ChatGPT ruling → Cursor)

Keep everything 1f introduced — `navy ∪ (quad ∩ dilate(navy, 4))`, inward feather, single pass, clamp — and change only what defines `navy_band_component`:

**C1 — band-candidate classifier, not lit-navy classifier.** `bandCandidate(r,g,b) = isNavyPixel(r,g,b) || (luma < 60 && (max(r,g,b) − min(r,g,b)) < 32)`. This admits shadowed navy and the crease and still excludes cream (luma > 140) and skin (chroma > 32 at luma > 60).

**C2 — component, then close.** Take the connected component of `bandCandidate` inside the existing search shell that overlaps the quad (largest by pixel count), then a morphological **closing of radius 6 px** (dilate → erode) so lettering holes and the crease become interior. That component is `navy_band_component`; the 1f union, clamp and feather then operate on it unchanged. The clamp will now lift the crease to median − 4 as the directive intended.

**C3 — top-edge absorption of the pinstripe.** Raise `navyEdgeDilatePx` on the band-normal toward the *top* edge to **6 px** (keep 2 px elsewhere), gated: a pixel is absorbed only if it is within 6 px of the component and its luma > 140 (a thin bright line adjacent to navy), so cream body is never taken. The stripe then sits inside solid cover and the outer boundary lands on cream body, where the inward feather already behaves.

**C4 — golden fixture from the real still.** Add a fixture cropped from `2aa1a44c` (rows 660–760, x 190–640, PNG in test assets) and assert on it: (a) inside the quad, no dark-region pixel keeps luma > median + 10 except the zip strip and the wordmark sub-quad; (b) no painted pixel < median − 6; (c) rows 675–680, x 210–330 max luma ≤ median + 10; (d) x 330–380, rows 741–749 unchanged. Keep the synthetic fixture for the drip / occlusion invariants. Without a real-pixel fixture the suite will keep certifying classifiers that fail on the canonical frame.

**Decision for ChatGPT, not Claude [D]:** C1 + C2 will also classify the exposed tie / zip wedge in the band centre as band-candidate (dark, low-chroma). If the component absorbs it, the band becomes continuous behind the zip overlay — which is what the reference shows — but it also paints over a V2 generation artefact that was previously ruled "generation debt, leave it". Either outcome is deterministic; the ruling should say which one is wanted before Cursor implements. If "leave it", exclude the zip strip (`overlayZipFromSource` already knows its column) from the component before closing.

## 422 fail-closed path

Skipped, same reason as 1e: exercising it live needs a secret or request change. `allow_skin_heuristic_fallback: false` is present in the response; the policy is armed.

## Hard gates [V]

No code, commits (other than this doc + evidence), prompt, auth/RLS, Lovable Builder, redeploy, V3, sleeve, temporal, or paid xAI action taken. Evidence in this folder: `stage1f_chest_compare.jpg`, `stage1f_left_zoom.jpg`, `stage1f_topleft_edge.jpg`, `stage1f_forearm_boundary.jpg`, `stage1f_zip_column.jpg`, `stage1f_navy_classifier_map.jpg`.
