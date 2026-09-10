# Architecture C — Stage 1h canonical live verification (`logo_chest`, PR #48 / `bd4262d`)

**Date:** 2026-09-10 · **Author:** Claude (Cowork) · **Spend:** $0 (deterministic; SAM-3 via CC SwitchX) · xAI total unchanged **$12.80 / $20**
**Code under test:** `main` @ `9b5f90c` (Cursor `bd4262d` Stage 1h; handoffs `86372e6`, `9b5f90c`) · edge `architecture-c-still-repair-proxy` redeployed by Fendi · **1h confirmed live by behaviour**
**Run:** authenticated AVT product UI, clean still `2aa1a44c`, keyframe `v2-still-0.785`, stage `logo_chest`, quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`, request body carried **no** `allowSkinHeuristicFallback`
**Compared against:** the clean still, 1g `2d110d13`, 1f `88a73cae`, and the product reference (solid navy band, single narrow zip line, no lettering other than the wordmark)

Evidence labels: **[V]** verified · **[O]** observed · **[D]** decision · **[R]** recommendation

## Runtime gate [V]

| Field | Value |
|---|---|
| HTTP | 200 |
| `assetId` | **`39c4a842-ea6e-4e5d-a233-d83bce06e078`** |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789013347585.png` (720×1280, one still) |
| `repair_method_version` | **`architecture_c_still_repair_1h`** |
| `occlusion_source` / `sam3_attempted` / `sam3_ok` / `sam3_reason` | `sam3` / `true` / `true` / `null` |
| `allow_skin_heuristic_fallback` | `false` — fallback not used |
| `requested_band_quad_norm` | echoed unchanged; `logo_zone_quad_provided: true`; `keyframe_id: v2-still-0.785` |
| `effective_band_bbox` | `{216,678,621,749, pixel_count 25347}` (α∩quad; unchanged since 1f) |
| `band` / `target_quad` | `(216,678)→(626,749)` / `[[441.5,696.95],[576.8,698.27],[576.8,731.77],[441.5,730.45]]` — unchanged since 1d |
| `temporalTrackingEnabled` | `false` |

Changed vs clean: x 207–618, y 668–759, 12 720 px (1.38 %; 1g 1.64 %). 0 px changed above y 600 or below y 800. Band core median luma 35.1.

## 1h vs 1g delta [V]

2 296 px differ by > 8 (929 inside the band bbox). **Improved:** left top edge raise 5–7 px → 0–2 px at x 290–350 (the `quadTop − 3` guard binds there); cream-body → navy 1 386 → 765 px; right-end protrusion 242 → 118 px; sleeve-darkened px 134 → 78. **Unchanged:** crease column (27 24 20 18 18 20 25 vs 1g 26 23 19 17 17 19 25); tie/zip wedge (byte-identical to source in both); top-edge raise of 5 px at x 380 and x 470–590; the navy block over the sleeve at x 373–399 / y 745–759. **Regressed:** the upper-left pinstripe is back as two hard lines (1g had it covered); the old cream lettering and the armhole pinstripe on the wearer's-left are re-exposed inside the band (28 → 204 residue px), running under the wordmark.

## Verdict — **CHEST STILL GATE: NOT CLEARED** (4 / 11)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Entire band reconstructed incl. left third | **PASS** — left third (x 216–285) painted; band extent intact | `stage1h_chest_compare.jpg` |
| 2 | Upper-left pinstripe removed | **FAIL — REGRESSION.** A 1-px bright line at y 676, x 214–255 (luma 110→254→130) and a grey line at y 679, x 214–239 (luma 104–129) survive as hard aliased lines; 1g had them covered | `stage1h_pinstripe_topleft.jpg` |
| 3 | Source crease removed | **FAIL — unchanged.** Band-row column means x 276–288: `33 31 27 24 20 18 18 20 25 34` vs band 35; at y 700 the pixels are luma 11–16 over source 3–5 (implied paint coverage 0.36–0.47) | `stage1h_crease.jpg` |
| 4 | No cream painted navy, esp. above the top edge | **FAIL — reduced, not fixed.** First navy row clean→1h: x 380 682→677, x 470 688→683, x 500 694→689, x 530 699→694, x 590 697→692 (5 px into cream body along the wearer's-left half); 765 cream-body px now navy (1g 1 386). Left half fixed (x 290 0, x 320 2, x 350 1) | `stage1h_right_top_edge.jpg` |
| 5 | No spill onto sleeve/forearm | **FAIL — unchanged block.** 78 px at x 373–399 / y 738–750 darkened by a mean of 91 luma (cream sleeve → navy/grey); rows 746–755 at x 330–380 10–15 darker than clean; paint still 10 rows below the quad (rows 750–759, x 373–535); a jagged cream hairline along y ≈ 746 where the new luma > 180 lock stops the paint mid-edge | `stage1h_sleeve_zip_bottom.jpg` |
| 6 | Smooth perimeter | **FAIL.** Hard staircase along the raised top edge on the wearer's-left (`225 → 37` in one pixel at x 500; same at 530 / 590); a **1-px light seam inside the band** 4–5 px below that edge (51 px, x 460–600, luma 93–132 between navy rows); jagged hairline at the sleeve lock; right-end protrusion at x 580–625 (118 cream → dark px) | `stage1h_right_top_edge.jpg`, `stage1h_sleeve_zip_bottom.jpg` |
| 7 | Wordmark | **PASS** — `target_quad` identical; legible, wearer's-left, 34.8 px (old lettering now runs beneath it — scored under 9) | `stage1h_right_top_edge.jpg` |
| 8 | Centre continuity, wedge absorbed, narrow zip | **FAIL — unchanged.** x 399–430 at y 715 and y 735 byte-identical to the source: both tapes and the dark wedge remain; implied paint coverage 0.00 across x 402–423 | `stage1h_centre_wedge.jpg` |
| 9 | No crease / lettering / pinstripe ghosting | **FAIL — REGRESSION.** 204 bright residue px inside the band interior on the wearer's-left (x 448–566, y 714–734; 1g: 28) — the old cream lettering row and the armhole pinstripe are fully visible again, through and below the wordmark. Every residue starts at y = 714 exactly | `stage1h_right_top_edge.jpg` |
| 10 | SAM-3 preserves arm/hand | **PASS** — skin untouched (rows 738–742 at x 330–380 identical; hand-window changes are band pixels at x 280–300). See causal layer: the same α is what keeps criteria 3 and 8 failing | `stage1h_sleeve_zip_bottom.jpg` |
| 11 | Outside-region preservation | **PASS** — 0 changes above y 600 / below y 800 | pixel diff |

## Causal layer [V]

**A. Crease (3) and wedge (8) — OCCLUSION, not illumination or zip overlay.** Implied per-pixel paint coverage `(out − src) / (paint − src)` at rows 695–705, x 276–288 is the same smooth profile in 1e, 1g and 1h: `0.84 0.70 0.56 0.43 0.39 0.43 0.56 0.71 0.87 1.0`. The wedge x 402–423 has coverage **0.00 in every stage, including 1d and 1e**, whose quad paint was unconditional over that region. The only operation applied identically after the paint in every stage is `applyOcclusionAlphaComposite(base, compositedFrame, samAlpha)` — the SAM-3 α (outfit − dilate(hands) − dilate(face), feathered 2 px). The outfit mask has a partial hole along the fold (α ≈ 0.4) and a full hole over the shirt/tie wedge (α = 0: shirt and tie are not "outfit"). No paint, clamp, gain-floor or zip-overlay change can alter pixels the α restores to source — 1g's gain floor and 1h's zip rewrite were aimed at the wrong layer. **Correction to my 1g report:** I attributed the crease to the 0.80 illumination floor; the α evidence shows that was at most secondary (floor 0.80 → 0.95 moved the column by ≤ 1 luma).

**B. Lettering / armhole-pinstripe regression (9, 6) — COMPOSITING.** 1h added a hard lock in the paint pass: `y > bandMidY && luma > 180 → never paint`. `bandMidY` = 713.6. The wearer's-left band sits 10–20 px lower than the quad (band top 688–699 there), so its lettering row and the armhole pinstripe are at y 714–734 and luma > 180 — every one of the 204 residues starts at y = 714. 170 bright pixels inside the band interior in rows 714–749 are byte-identical to source because of this lock. The same lock produces the cream hairline at the sleeve edge (y ≈ 746).

**C. Upper-left pinstripe (2) — SEGMENTATION.** `absorbTopPinstripeLocal` now caps a ridge at 3 claimed pixels; at x 214–255 the ridge is 4–5 px thick (rows 675–680), so its top row (676) falls outside the cap, and the antialiased row 679 (luma 104–129) is neither bright enough for absorb (> 140) nor dark enough for `isChestBandCandidate` (< 60) — it falls through both gates.

**D. Top-edge raise on the wearer's-left (4, 6) — SEGMENTATION.** The 3-px cap counts only *newly claimed* pixels per walk. Deeper component pixels walk up through rows already absorbed (`out ≥ 0.5` → not counted, `k++`) and then claim fresh bright rows above them; a pixel `d` rows below the edge reaches `6 − d` rows above it, so the strip grows to 5 px — exactly the measured raise. The `maxAbsY = quadTop − 3` guard binds only where the band top is near the quad top (left half); on the right the band top is 10–20 px below `quadTop`, so the guard never engages. The 1-px light seam inside the band is the edge's antialias row (luma 100–140): not absorbed, not a candidate → a hole between the absorbed strip and the core.

**E. Sleeve block (5) — SEGMENTATION.** `close(6)` bridges the band into the shadowed cream at the sleeve's top edge (luma 100–140); the post-close lower-half re-gate only rejects luma > 140, and the paint lock only protects luma > 180, so shadowed cream between 100 and 180 is painted solid as component core (x 373–399, y 745–759).

**Test gap.** The real-crop golden fixture runs without the live SAM-3 α, so A can never reproduce in CI; and nothing asserts that the wearer's-left lettering row (rows 714–734, x 448–566) is painted, which is how B shipped green (715 tests).

## Recommended next architectural step [R]

Two decisions for ChatGPT before any code:

1. **Occlusion semantics (fixes 3 and 8, and is the only thing that can).** The SAM-3 α is currently a per-pixel *garment* gate; inside the band component it must be a *hand/face* gate only. Concretely: `α_final = 1 − dilate(hands ∪ face)` wherever the band component is 1, and the current outfit-based α elsewhere. That makes the crease and the shirt/tie wedge paintable while keeping the crossed hand and forearm skin protected. It is a semantic change to what SAM-3 protects, so it needs a ruling, not a tweak.
2. **Withdraw the luma > 180 hard lock** (B) — it re-exposed the lettering; sleeve protection has to come from the segmentation (item E), not from a brightness cutoff in the paint pass.

Then, bounded corrections Cursor can carry with them: count already-absorbed rows toward the ridge cap (or compute the absorbed strip once from the component's top boundary instead of per-pixel walks) and admit the antialias row (luma 100–140) adjacent to the ridge into the absorb (C, D); reject shadowed cream (luma 100–180 with chroma < 32 and not navy) from the closed component in the lower half (E). Golden: add the dumped live SAM-3 α to the real-crop fixture; assert wearer's-left lettering rows 714–734 painted; assert crease column ≥ median − 6 and wedge x 402–423 painted with the α applied; assert no bright row between navy rows within 8 px of the top edge.

## Hard gates [V]

The live verification took no code, deploy, prompt, V3, sleeve, temporal, Astra, or paid action. This document and six evidence images were committed as authorized (evidence/documentation only).
