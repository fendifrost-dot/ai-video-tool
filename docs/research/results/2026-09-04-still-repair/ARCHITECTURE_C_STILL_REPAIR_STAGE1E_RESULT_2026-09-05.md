# Architecture C — Stage 1e live verification (`logo_chest`, PR #43 / `759a5b7`)

**Date:** 2026-09-05 · **Author:** Claude (Cowork) · **Spend:** $0 (deterministic; SAM-3 via CC SwitchX) · xAI total unchanged **$12.80 / $20**
**Code under test:** `main` @ `6ac5c9c` (PR #43 merged `205141d`; PR #44 handoff `69711bb`) · edge `architecture-c-still-repair-proxy` redeployed by Fendi · **1e confirmed live by behaviour**
**Run:** authenticated AVT product UI, clean still `2aa1a44c`, keyframe `v2-still-0.785`, stage `logo_chest`, quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`, request body carried **no** `allowSkinHeuristicFallback`
**Compared against:** stage 1d asset `e0fb43b1-e69c-4147-b88e-1682f55c0d26` and the clean still

Evidence labels: **[V]** verified · **[O]** observed · **[D]** decision · **[R]** recommendation

## Response metadata [V]

| Field | Value |
|---|---|
| HTTP | 200 |
| `assetId` | **`57504fac-2920-4c5f-8d54-f68faece3caa`** |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1788598955649.png` |
| `repair_method_version` | **`architecture_c_still_repair_1e`** |
| `occlusion_source` | **`sam3`** |
| `sam3_attempted / sam3_ok / sam3_reason` | `true / true / null` |
| `allow_skin_heuristic_fallback` | `false` (fail-closed policy in force; 422 path not exercised — SAM-3 succeeded) |
| `requested_band_quad_norm` | `[[0.3,0.53],[0.87,0.533],[0.87,0.585],[0.3,0.582]]` |
| `effective_band_bbox` | `{left 216, top 678, right 621, bottom 749, pixel_count 25349}` (1d: 25297) |
| `band` / `target_quad` | `(216,678)→(626,749)` / logo sub-quad `[[441.5,696.95],[576.8,698.27],[576.8,731.77],[441.5,730.45]]` — unchanged from 1d |

## Verdict — **FAIL** under zero-deviation (better than 1d; not a pass)

Changed region vs clean: x 208–621, y 673–755, 1.47 % of frame. **0 changed pixels above y 600 or below y 800** — face, hands, trousers, background untouched (criterion 10 met).

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Left / top-left old-band / pinstripe sliver completely gone | **FAIL (residual)** — the band's upper-left area (x 206–335, y 668–686) is now painted (1d left it bare), but the cream pinstripe survives as a faint grey curve: row max luma 152 / 128 / 141 / **166** / 93 on rows 675–679 vs painted band 43 (source 232–254). ≈ 40 % of the original line remains | `stage1e_topleft_edge.jpg` |
| 2 | No drips / leakage into sleeve or body | **FAIL (margin over-paint, not drips)** — no column-follow; max changed row is 755 (quad bottom 749). But **658 px** that are cream in the source (luma > 140) are navy (< 70) in 1e outside the band rows 683–745, bbox x 217–609 / y 677–749: the rectangle over-covers cream where the band tilts. 1d had the same class of over-paint (220 px at the forearm sample vs 165 in 1e) — it was under-reported in the 1d doc | `stage1e_forearm_boundary.jpg` |
| 3 | No black-speckle column / near-black artifacts | **FAIL (residual)** — the 1d speckle column is reduced to a faint dark seam at x 279–283, y 690–740: column mean luma 31–33 vs band 42 (1d: 19–27). No other near-black artifacts | `stage1e_zoom_annot.jpg` |
| 4 | Forearm / hand boundary clean after SAM-3 feather | **FAIL (bleed)** — at x 330–380, rows 741–749 the source is cream sleeve (luma 155→205); 1e is 89→173: a feathered navy smear onto the sleeve edge, ~30×9 px, where the crossed sleeve meets the band. Not skin — the hand itself is untouched | `stage1e_forearm_boundary.jpg` |
| 5 | No hard pixel staircase | **PASS** — perimeter feathered end to end | `stage1e_zoom_annot.jpg` |
| 6 | Band continuous, solid navy, reference-faithful | **PASS within scope** — solid, uniform, no ghosting. The centre is interrupted by the **source tie / zip wedge** (V2 generation defect: tie exposed below the throat); the repair correctly leaves it, but the reference band runs unbroken behind a closed zip — this is generation-owned, not repair-owned | `stage1e_zip_column.jpg` |
| 7 | Wordmark scale / position | **PASS** — `target_quad` identical to 1d; legible, wearer's-left, 34.8 px | zoom |
| 8 | Zip continuous, no slit | **PASS** — zip line reads through the band; no raw column | `stage1e_zip_column.jpg` |
| 9 | Illumination natural, no ghosting | **PASS** — smooth low-frequency shading, no lettering / pinstripe imprint | zoom |
| 10 | Face, hands, out-of-region clothing, master pixels preserved | **PASS** — zero changes outside y 673–755 / x 208–621 | pixel diff |

## Remaining defects and the smallest deterministic correction for each [R]

**D1 — residual pinstripe at the band's upper-left edge** (x 206–335, y 675–680). Cause: the paint feather blends *source* with cover at the mask boundary, and the mask boundary runs along the pinstripe. Correction: apply the feather **inward** — erode the paint mask by the feather radius before blurring — and dilate the navy-band mask 2 px along the band normal so the pinstripe is inside the solid region, never in the blend zone.

**D2 — faint dark seam at x 279–283.** Cause: two paint passes (quad and union) meeting; the seam pixels are darker than either. Correction: paint once over the merged mask; and clamp every painted pixel's pre-illumination luma to the band median ± 4 (the golden test should assert no painted pixel is darker than median − 6).

**D3 — navy over cream at the tilted margins, including the forearm boundary** (658 px; worst x 330–380, y 741–749). Cause: `quad ∪ navy` — the manual rectangle contributes cream pixels that the navy mask never would. Correction: change the union to **`navy_band_component ∪ (quad ∩ dilate(navy_band, 4 px))`** — i.e. quad pixels are painted only when within 4 px of real navy; bare cream inside the rectangle is never painted. This alone removes D3 and most of criterion 2.

Out of scope for the repair: the tie/zip wedge through the band centre is a V2 generation defect (throat-only layering not achieved). Record it against generation, not the deterministic layer.

## 422 fail-closed path

Skipped: exercising it live requires disabling SwitchX secrets or altering the request, both of which are configuration changes or a disruption to the working environment. `allow_skin_heuristic_fallback: false` is confirmed in the response, so the policy is armed; the branch's unit tests cover the 422 return.

## Hard gates [V]

No code, commits (other than this doc), prompt, auth/RLS, Lovable Builder, redeploy, V3, sleeve, temporal, or paid xAI action taken. Evidence in this folder: `stage1e_chest_compare.jpg`, `stage1e_zoom_annot.jpg`, `stage1e_topleft_edge.jpg`, `stage1e_forearm_boundary.jpg`, `stage1e_zip_column.jpg`.
