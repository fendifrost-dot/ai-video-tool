# Architecture C — still-first repair, stage 1d (`logo_chest`) on PR #40 / `bb2d75f` + SAM-3

**Date:** 2026-09-05 · **Author:** Claude (Cowork) · **Spend:** $0 (deterministic path; SAM-3 via CC SwitchX) · xAI total unchanged **$12.80 / $20**
**Code under test:** `main` @ `6d77a2b` = PR #40 merge `514153f` (tip `bb2d75f`, ChatGPT-approved) + three Lovable-agent compile fixes (`fe246b4`, `1ffb814`, `6d77a2b`)
**Input still:** `2aa1a44c` (clean) · **Quad:** `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` · request from the product UI, **no** `allowSkinHeuristicFallback`
**Output asset:** `e0fb43b1-e69c-4147-b88e-1682f55c0d26` · `logo_chest_2aa1a44c…_1788575173823.png`

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## Deploy state [V]

The Lovable-agent commits on `main` (author `gpt-engineer-app[bot]`, 02:17–02:18 UTC) are compile-only: `let a: Float32Array` annotation in both `stillRepairOcclusion.ts` copies, `decodeToRgba` / `encodePng` / `sampleBilinear` added to edge `_shared/logoComposite.ts` (they were imported by `placementEngine.ts` but missing after the merge), and a `deno.lock` refresh. No logic change, no files outside the still-repair lane. Consistent with a Lovable redeploy that failed Deno type-check and was auto-fixed. Noted as a rule deviation (Lovable agent wrote code), not a defect.

Verified by behaviour, not transcript: the proxy response now carries `repair_method_version: "architecture_c_still_repair_1d"`, `requested_band_quad_norm`, `effective_band_bbox {216,678,621,749, pixel_count 25297}`, `sam3_attempted: true`, `sam3_ok: true`, `sam3_reason: null`, **`occlusion_source: "sam3"`**, `allow_skin_heuristic_fallback` present. Fail-closed policy was therefore *not* exercised (SAM-3 succeeded); the 422 path remains untested live.

## Result — NOT A PASS; first frame with no regressions [V]

| Item | 1c (`8ebfe83`) | 1d | Evidence |
|---|---|---|---|
| Column-follow navy drips | 52 px below band | **Closed** — changed rows extend 2 px below the quad bottom | pixel diff vs clean still |
| Per-pixel luma ghosting | old lettering/pinstripe imprinted | **Closed** — band is uniform navy | `stage1d_chest_compare.jpg` |
| Zip slit | raw unpainted column | **Closed** — zip line reads through the band | zoom |
| Wordmark placement / scale | correct | **Correct** — wearer's-left, 34.8 px | `target_quad` unchanged |
| Hand / forearm occlusion | heuristic, cream sleeve unprotected | **Works** — SAM-3 α leaves the crossed forearm over the band's lower edge uncovered | zoom, bottom-left notch |
| **Band coverage at the true edges** | — | **Defect** — the cover paints only inside the manual quad, then the mask gates it. A ~10 px sliver at the far left (x < 216) and the top-left corner show the **original** navy with the old cream pinstripe | `stage1d_left_zoom` |
| **Edge quality** | — | **Defect** — hard pixel staircase along the whole perimeter; no feathering | zoom |
| **Black speckle column** | — | **Defect** — a vertical cluster of near-black pixels at x ≈ 280 inside the band | `stage1d_left_zoom` |
| Illumination | ghosted | Present but subtle; band still reads flatter than the source cloth | zoom |

Numbers: 1.31 % of the frame changed (1c: 1.69 %); inside the quad bbox 30 % of pixels are unpainted, of which 5 075 px are source-navy (old band left visible — the edge slivers) and 3 716 px are non-navy (cream/skin/zip — mostly legitimate occlusion and the tilt margins).

[D] Under zero-deviation this is not a pass. But it is the first deterministic frame that is strictly better than every previous one: 1b's five defects and 1c's three regressions are all closed, and the remaining items are perimeter-level.

## Proposed corrections (Cursor) [R]

1. **Paint region = navy-band mask ∪ manual quad**, then gate by occlusion α. Today the quad is the ceiling; the band's real extent past the quad edges is never covered, which is exactly where the old pinstripe survives. The navy-band mask already exists for `assessChestBandQuadPlacement` / `coverTargetQuad` snapping — use it to *extend*, not only to validate.
2. **Feather the composite alpha 2–3 px** at the paint-region boundary and at the occlusion boundary (Gaussian on the binary mask) so the perimeter is not a staircase.
3. **Trace the black speckles.** Reproduce on the golden fixture: candidates are alpha values in (0,1) multiplying an RGB that is already near-black in the source, or the median-fill sampling a dark non-navy pixel. Assert in the golden test that no pixel inside the painted region is darker than the navy reference by more than a threshold.
4. **Illumination gain**: keep the clamp but consider widening to [0.80, 1.20] and a slightly smaller blur radius so garment folds read; verify against the HF-leak test.
5. **Exercise the 422 path once** (temporarily block SwitchX or pass a bad prompt) to prove fail-closed works live; record `occlusion_unavailable` + `asset_persisted:false`.

## Next

Sleeve `sleeve_panel` stage remains on hold until the band passes on one frame; with corrections 1–3 the chest band is plausibly one land away. Evidence: `stage1d_chest_compare.jpg`, `stage1d_zoom_annot.jpg`, `stage1d_left_zoom.jpg`, `clean_left_zoom.jpg`.
