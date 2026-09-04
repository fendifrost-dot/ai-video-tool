# Architecture C — still-first repair, stage 1c (`logo_chest`) on Cursor `8ebfe83`

**Date:** 2026-09-04 · **Author:** Claude (Cowork) · **Spend:** $0 (deterministic path) · running total unchanged at **$12.80 / $20**
**Edge code under test:** `8ebfe83` "logo sub-zone, zip strip, shading, skin occlusion" — redeployed to `architecture-c-still-repair-proxy` via Lovable chat (deploy-only; confirmed `8ebfe830b799…`; `main` unchanged after)
**Input still:** `2aa1a44c` (clean) · **Quad:** `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` (same as 1b) · **Output asset:** `f7c7b524-2f87-4c87-9624-85368de26f2d`
**Engine report:** logo sub-quad `[[441.5,696.95],[576.8,698.27],[576.8,731.77],[441.5,730.45]]`, target height **34.8 px** (was 71), scale 0.34, band `(216,678)→(626,749)`, confidence 1, no warnings.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## Pre-check [V]

Before redeploy, a UI re-run returned output **pixel-identical** to `477b722c` and the old full-band `target_quad` — proof the merged code was not yet live. After redeploy the `target_quad` became the logo sub-quad. Deploy verified by behaviour, not by the chat transcript alone.

## Result — NOT A PASS; wordmark placement fixed, band regressed [V]

| Item (from stage 1b) | Status on 1c | Evidence |
|---|---|---|
| 1 · Logo sub-zone + scale | **FIXED** | Wordmark wearer's-left, ≈ ½ band height, legible, correct typeface. Matches reference proportions |
| 2 · Occlusion (skin heuristic, interim) | **Insufficient** | Some hand pixels restored inside the band; but the heuristic cannot protect the **cream sleeve**, which now carries navy drips (see 3) |
| 3 · Tilted band / `maxExpandFrac 0.05` | **REGRESSION** | Cover expansion followed dark pixel columns downward: **navy vertical drips up to 52 px below the band bottom** (changed rows extend to y=801 vs band bottom 749), over the sleeves and across the crossed forearms |
| 4 · Shading transfer | **REGRESSION** | Per-pixel luma multiply imprints the source band's **old gibberish lettering and cream pinstripe as light/dark blotches**. Band reads mottled rather than cloth-lit. Worse than 1b's flat navy |
| 5 · Zip strip `0.045` | **Partial / wrong look** | A raw unpainted column shows the original grey zip and cream. Reads as a slit in the band, not a zip running through navy |
| Top edge | minor | Cream sliver along the top-left of the quad (quad top 0.530 vs band top ≈ 0.528) — mask-derived quad will fix |

[D] Net: the one placement item is right; three of the four pixel-processing items make the frame worse than 1b. Do not chain sleeve work onto this.

## Proposed corrections (Cursor) [R]

1. **Shading — low-frequency only, defect-masked.** Compute luma on the *source* band, but first mask out non-navy pixels (old lettering, pinstripe, zip) and fill them by median of the navy neighbourhood; then Gaussian-blur (σ ≈ 8–12 px at 720 wide); normalise to the band median; **clamp gain to [0.85, 1.15]**. Multiply the flat navy by that. Nothing high-frequency from the source should survive.
2. **Cover expansion — along the band normal only.** Expand the quad's top/bottom edges outward by ≤ 5 % of band height (uniform per edge, or per-x from a *row-wise* navy profile that is itself smoothed), never by following individual dark columns. Any expansion candidate that grows more than ~1.5× band height in the y direction is a leak — reject.
3. **Zip — overlay, not hole.** Paint the band fully navy, then draw the zip as a thin (≈ 1–1.5 % of frame width) feathered line sampled from the source zip's own colour, or restore only pixels that were zip tape in the source (a narrow mask ≤ 2 % width, feathered). No raw column.
4. **Occlusion — garment mask, as specified.** SAM-3 `outfit − dilate(hands) − dilate(face)` on the still, applied as the compositing alpha for both the cover and the wordmark. The skin heuristic cannot see cream sleeves or background and is the reason item 3's leak is visible. Keep the heuristic only as a fallback when SAM-3 is unavailable, and **surface that fallback in the response** (`occlusion_source: "skin_heuristic" | "sam3"`).
5. **Quad from mask.** Derive the band quad from the navy-band mask on the still (bounded by the manual quad ± margin) so the top/bottom edges sit on the real band edge.
6. **Regression fixture.** Add a golden test on still `2aa1a44c` with this quad: assert (a) no changed pixels more than 8 px outside the (expanded) band quad, (b) band-interior luma std below a threshold, (c) wordmark bbox inside the wearer's-left half.

## Runner note [V]

The published `4af7afa` runner behaved correctly throughout: seeded quad, numeric entry, placement message, no auto-chaining, clean still stayed selected.

Evidence: `stage1c_chest_compare.jpg` (clean | 1b | 1c, annotated), `stage1c_before_after.jpg`.
