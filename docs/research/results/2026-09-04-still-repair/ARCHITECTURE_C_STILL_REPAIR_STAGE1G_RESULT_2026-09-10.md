# Architecture C — Stage 1g canonical live verification (`logo_chest`, PR #47)

**Date:** 2026-09-10 · **Author:** Claude (Cowork) · **Spend:** $0 (deterministic; SAM-3 via CC SwitchX) · xAI total unchanged **$12.80 / $20**
**Code under test:** `main` @ `81580f7` (Cursor `aa595cf` + `b1f0022` Stage 1g; then Lovable-agent `f5723c4`, `0b264bf`, `81580f7`) · edge `architecture-c-still-repair-proxy` redeployed by Fendi · **1g confirmed live by behaviour**
**Run:** authenticated AVT product UI, clean still `2aa1a44c`, keyframe `v2-still-0.785`, stage `logo_chest`, quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`, request body carried **no** `allowSkinHeuristicFallback`
**Compared against:** 1f `88a73cae`, the clean still, and the product reference (solid navy band, single zip line)

Evidence labels: **[V]** verified · **[O]** observed · **[D]** decision · **[R]** recommendation

## Response metadata [V]

| Field | Value |
|---|---|
| HTTP | 200 |
| `assetId` | **`2d110d13-3fe6-4b62-91a3-7535c11928e3`** |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789001892100.png` (720×1280, one still) |
| `repair_method_version` | **`architecture_c_still_repair_1g`** |
| `occlusion_source` / `sam3_attempted` / `sam3_ok` / `sam3_reason` | `sam3` / `true` / `true` / `null` |
| `allow_skin_heuristic_fallback` | `false` (fail-closed armed; 422 path not exercised) |
| `requested_band_quad_norm` | echoed unchanged; `logo_zone_quad_provided: true`; `keyframe_id: v2-still-0.785` |
| `effective_band_bbox` | `{216,678,621,749, pixel_count 25347}` — α∩quad only; it does not reflect paint that now extends above y 678 |
| `band` / `target_quad` | `(216,678)→(626,749)` / `[[441.5,696.95],[576.8,698.27],[576.8,731.77],[441.5,730.45]]` — unchanged since 1d |
| `temporalTrackingEnabled` | `false` (hard stop still in force) |

Changed vs clean: x 206–619, **y 662–761**, 15 142 px (1.64 %; 1f 0.31 %). 0 px changed above y 600 or below y 800. Band core median luma 33.0.

## Verdict — **CHEST STILL GATE: NOT CLEARED** (5 / 11)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Full band coverage | **PASS** — left third (x 216–285) painted; no unpainted source navy left in the band | `stage1g_left_zoom.jpg` |
| 2 | Pinstripe removal | **PASS** — rows 672–691 max luma at x 210–330: `55 54 58 56 43 38 44 …` (clean 231–254) | `stage1g_left_zoom.jpg` |
| 3 | Source crease | **FAIL — faint dark column at x 277–283.** Band-row column means `26 23 19 17 17 19 25` vs band 33 (all < median − 6 = 27); visible tonal seam. Clean was 3–9: lifted, not removed | `stage1g_left_zoom.jpg` |
| 4 | Cream preservation | **FAIL — band top edge raised 5–7 px into cream body along its whole length.** First navy row clean→1g: x 290 676→671 · 320 679→672 · 350 678→672 · 380 682→676 · 470 688→682 · 500 694→688 · 530 699→693 · 590 697→691. 1 386 cream-body px (11-px-median source > 140) now navy, 1 319 of them in rows 670–699 | `stage1g_top_edge.jpg`, `stage1g_right.jpg` |
| 5 | Forearm/sleeve preservation | **FAIL — grey/navy smear onto the cream sleeve at the crossed forearm.** Rows 743–755, x 330–380 mean luma 190–199 vs clean 205–216; visible patch x≈300–370 / y≈720–750 with a hard step at x≈370; paint also extends 10 rows below the quad (rows 750–759, x 372–535, 434 px) | `stage1g_forearm.jpg` |
| 6 | Band perimeter | **FAIL — hard unfeathered staircase along the entire raised top edge** (x 300 / 350 profile `224 → 32` in one pixel), staircase at the sleeve boundary, ragged protrusion with grey fringe at the band's right end (x≈590–620, y≈700–745), 1-px speck at x≈268 / y≈669 | `stage1g_top_edge.jpg`, `stage1g_right.jpg` |
| 7 | Wordmark | **PASS** — `target_quad` identical; legible, wearer's-left, 34.8 px | `stage1g_right.jpg` |
| 8 | Center continuity | **FAIL — tie/zip wedge not absorbed.** Row y 715, x 399–430 byte-identical to source: vertical tape at x≈400, diagonal tape at x≈430 and the wedge between them all remain; reference has one zip line | `stage1g_centre.jpg` |
| 9 | Illumination / material | **FAIL — flat patch.** Uniform 32–33 luma; the source's armhole fold shading (x≈540–560) is gone; tonal step at x≈277–283; the raised top strip reads as a flat rectangle on cream | `stage1g_right.jpg` |
| 10 | Occlusion | **PASS** — hand/skin untouched (rows 738–742 identical; the 143 changed px in the hand window are band pixels at x 280–300 / y 730–749) | `stage1g_forearm.jpg` |
| 11 | Outside-region preservation | **PASS** — 0 changes above y 600 / below y 800 | pixel diff |

## Causal layer [V] — each traced in `supabase/functions/_shared/logoComposite.ts` on `main`

- **D1 top-edge raise (criterion 4) — segmentation/geometry.** `absorbTopPinstripeLocal` walks `topPinstripeAbsorbPx = 6` px up the band normal from *every* component pixel and claims any pixel with luma > 140. There is no thin-ridge test, so cream body above the band is absorbed everywhere, not only the 4–5 px pinstripe.
- **D1/D4/D6 hard edges (criterion 6) — compositing.** After `inwardFeatherAlpha`, α is re-asserted to 1 on `coreComponent ∪ stripeAbsorb`. The absorbed strip *is* the outer boundary, so the feather is cancelled exactly where it was needed; the same re-assert hardens the component perimeter at the sleeve and at the right end.
- **D2 crease (criterion 3) — illumination.** Crease pixels are inside the closed component and painted solid, but `applyLowFrequencyBandIllumination` derives gain from the *source*, where the crease is a 12-px-wide, 50-px-tall luma-3–9 trough; the 0.80 gain floor re-imposes it (33 × 0.80 ≈ 26 = measured 24–26).
- **D3 sleeve smear (criterion 5) — segmentation.** The expansion pass (`navyEdge ∪ (quad ∩ navyDilate4)`) admits pixels with bare `luma < 140`, which includes the shadowed cream at the sleeve's top edge; those are painted and then hard-edged by the same α re-assert.
- **D5 wedge (criterion 8) — source-generation debt + compositing.** The wedge is kept inside the component by design (comment at the paint pass), then `overlayZipFromSource` restores the source strip around `zipUNorm = 0.5`, which brings back both tapes and the wedge geometry instead of one canonical zip line.
- **Test gap.** The real-crop golden fixture (`src/lib/garment/fixtures/architectureCStillBandCrop.png`) passed because nothing asserts that cream body in rows 662–676 above the band stays unchanged, that the outer edge has a ≥ 2-px ramp, or that the crease column is ≥ median − 6 *after* illumination.

## Recommended next step [R] — bounded corrections to 1g, not a new mechanism

1g's component definition works: criteria 1 and 2 are the first clean passes on the band body. Corrections supported by the evidence above:

- **(a)** Gate the top-normal absorb to thin bright ridges: claim a bright run only if the ray returns to non-cream (luma < 140) within ~3 px past it; otherwise stop.
- **(b)** Re-assert α = 1 only on `erode(core ∪ absorb, featherPx)` — never on the outer boundary — so the inward feather survives.
- **(c)** Drop the bare `luma < 140` admission in the expansion pass; use `isChestBandCandidate` only.
- **(d)** Compute the illumination gain from a crease-masked / median-filled band so the 0.80 floor cannot reintroduce the trough.
- **Ruling for ChatGPT:** should the zip overlay draw one canonical line at the left tape (x≈400) and let the band cover the diagonal tape? This is a product-truth decision, not a repair tweak.
- **Golden additions:** cream rows 662–676 above the band unchanged; outer-edge ramp ≥ 2 px; crease column ≥ median − 6 after illumination; sleeve rows 743–755 at x 330–380 unchanged.

## Repo observation (no action taken)

After Cursor's 1g commits, `gpt-engineer-app[bot]` landed `f5723c4`, `0b264bf`, `81580f7`: they restore edge-only exports (`decodeToRgba`, `encodePng`, `resolveLogoAssets`, `parseLogoPlacement`) that the 1g src→edge mirror overwrite dropped, add a `Float32Array` annotation, and add `roadmap.md` at the repo root. Paint logic untouched — same compile-fix class as 09-05. Cursor should confirm the mirror step keeps edge-only exports.

## Hard gates [V]

The live verification itself took no code, commit, deploy, prompt, V3, sleeve, temporal, Astra, or paid action. This document and its six evidence images were committed afterwards at Fendi's explicit request so ChatGPT can read the handoff.
