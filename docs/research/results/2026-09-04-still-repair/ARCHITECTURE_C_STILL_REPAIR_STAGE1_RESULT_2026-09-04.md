# Architecture C — still-first repair, stage 1 (`logo_chest`) with a correct quad

**Date:** 2026-09-04 · **Author:** Claude (Cowork) · **Spend:** $0 (deterministic path; no xAI call) · running total unchanged at **$12.80 / $20**
**Input still:** `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` (clean capture, V2 clip t=0.785 s) · **Output asset:** `477b722c-d1ba-4788-ac8c-fdfd493d6942`
**Quad used (norm, TL→TR→BR→BL):** `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` — derived from a pixel measurement of the navy band on the still (core band rows y 0.534–0.582).
**Engine report:** `perspective_quad_warp`, `placement_source: manual_keyframe`, confidence 1, target px (216,678)→(626,749), logo native 102 px → 71 px, no quality warnings.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## How the quad was placed — disclosure

[V] The live app was still serving the pre-`4af7afa` runner (drag-only handles; `main` had merged but Lovable had not published), and the Chrome tab reported a 0×0 viewport with Fendi away from the desk, so trusted drags were impossible. The quad was therefore supplied as `logoZoneQuad` directly to the deployed `architecture-c-still-repair-proxy` — the same function and code path the UI's "Save manual quad → Repair" calls, merged into `product_truth` under keyframe `v2-still-0.785` exactly as the UI does. **The UI placement step itself was not exercised.** Once the `4af7afa` numeric-entry runner is published, the same quad can be entered in-product to close that gap.

## Result — NOT A PASS, but the engine's hard part is proven [V]

| Defect | Status | Note |
|---|---|---|
| **D** wordmark illegible | **FIXED** | Clean, legible SAINT LAURENT, correct typeface, cream on navy, at band height |
| **F** cream pinstripe | **FIXED** (within quad) | Band is solid navy across the quad |
| **E** marks on both sides | **Half-fixed** | Spurious marks erased — but the single wordmark is **centred on the band, straddling the zip**; reference has it on the **wearer's-left segment only** |
| **NEW — wordmark oversized** | ✗ | Engine scaled the logo to ~the full band height (71 px). Reference wordmark is ≈ ½ band height and ≈ ¼ band width; ours is ≈ 2× that |
| **NEW — occlusion ignored** | ✗ | The patch paints straight over the crossed forearm/hand at the bottom-left of the band. No garment/skin mask is applied |
| **NEW — band leaks below patch** | ✗ | The band on this still tilts (lower on frame-left); the rectangular quad leaves slivers of the original navy visible beneath the patch on the left side |
| **NEW — zip continuity lost** | ✗ | Reference shows the zip line running through the band; the patch erases it |
| **NEW — flat, unlit** | ✗ | Uniform navy with hard edges; no shading or fabric response. Reads as a sticker rather than cloth |

[D] Under zero-deviation this is not a pass. But the failure has **changed category**: the brand-pixel and placement mechanism now works; every remaining item is a specifiable, mechanistic compositing rule.

## Proposed fixes (Cursor, deterministic layer) [R]

1. **Logo sub-zone from product truth, not quad centre.** Carry `logo_offset_norm` + `logo_height_ratio` on the garment: on the flat ref the wordmark sits at ≈ x 0.62–0.80 of jacket width, ≈ 0.5 of band height. Place and scale from that, within the band quad.
2. **Occlusion mask before compositing.** SAM-3 `outfit` − dilate(`hands`) − dilate(`face`) on the still (the established recipe from the seam work), so the patch only lands on garment pixels. This is the single largest visual fix and is needed at the still stage — the arms cross the band on this clip.
3. **Mask-derived band quad.** Derive the quad from the navy-band mask on the still rather than an axis-aligned rectangle, so a tilted band is covered edge-to-edge without over-painting cream.
4. **Shading transfer.** Multiply the flat navy by the source band's low-frequency luminance (the mean/std transfer helper in `periocularComposite.ts` is the right shape) so the band keeps the body's lighting.
5. **Zip strip.** Exclude a narrow centre strip from the repaint, or re-draw the zip line, so the zip runs through the band as in the reference.
6. **Runner:** the `4af7afa` items (numeric quad entry, seeded band, no auto-chaining, off-garment warning) are merged to `main` but **not yet published** to the live app.

## Next

Sleeve `sleeve_panel` stage on the visible upper arm (directive step 3) can run on the same still with the same proxy — but it is worth landing items 1–3 above first, since the sleeve composite will hit the same occlusion and shading problems.

Evidence: `docs/research/results/2026-09-04-still-repair/` — `stage1b_before_after.jpg`, `stage1b_chest_zoom.jpg`, `stage1b_ref_vs_result.jpg` (annotated).
