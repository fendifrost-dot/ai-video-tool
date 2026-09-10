# Architecture C — Stage 1i canonical live verification (`logo_chest`, PR #49 / `fb1d996` + `cc5b796`)

**Date:** 2026-09-10 · **Author:** Claude (Cowork) · **Spend:** $0 (deterministic; SAM-3 via CC SwitchX) · xAI total unchanged **$12.80 / $20**
**Code under test:** `main` @ `1ada136` (Cursor `fb1d996` Stage 1i, `cc5b796` Deno/type fix, handoffs `57d0cfc`, `1ada136`) · edge `architecture-c-still-repair-proxy` redeployed by Fendi; no frontend Publish · **1i confirmed live by behaviour**
**Run:** authenticated AVT product UI, clean still `2aa1a44c`, keyframe `v2-still-0.785`, stage `logo_chest`, quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`, request body carried **no** `allowSkinHeuristicFallback`
**Compared against:** the clean still, 1h `39c4a842` (`df64344`), 1g `2d110d13`, and the product reference (solid navy band, single narrow zip line, wordmark only)

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## Runtime preflight [V]

**First attempt: HTTP 546 `WORKER_RESOURCE_LIMIT` — "Function failed due to not having enough compute resources".** No asset, no metadata. Second attempt with the identical request (no config change) returned 200 after ~41 s. 1i adds two full-frame `dilateAlpha` passes at r = 12 (`applyChestLocalOcclusionSemantics`, `dilatePx: 12`) on 720×1280 — roughly 2 × 921 600 × 625 neighbourhood reads — on top of the existing pipeline. This is a compute-headroom regression at the edge worker: output is deterministic, availability is not. Recorded, not scored.

| Field | Value (second attempt) |
|---|---|
| HTTP | 200 |
| `assetId` | **`21972fcf-2566-4052-ae8f-5a21a00e4d99`** |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789049173741.png` (720×1280, one still) |
| `repair_method_version` | **`architecture_c_still_repair_1i`** |
| `occlusion_source` / `sam3_attempted` / `sam3_ok` / `sam3_reason` | `sam3` / `true` / `true` / `null` |
| `allow_skin_heuristic_fallback` | `false` — fallback not used |
| `requested_band_quad_norm` | echoed unchanged; `logo_zone_quad_provided: true`; `keyframe_id: v2-still-0.785` |
| `effective_band_bbox` | `{216,678,621,749, pixel_count **27 540**}` — **up from 25 347** in 1f–1h: 2 193 px inside the band that the outfit α used to hole out now carry α ≥ 0.5 |
| `band` / `target_quad` | unchanged since 1d |
| `temporalTrackingEnabled` | `false` |

Changed vs clean: x 207–618, y 673–759, 13 038 px (1.42 %). 0 px changed above y 600 or below y 800. Band core median luma 37.1.

## 1i vs 1h delta [V]

4 682 px differ by > 8. **Fixed:** crease (column means x 277–283 all 33 = band; 1h 27→18→25); wedge absorbed (region mean luma 17.8 → 42.9; implied coverage 0.75–1.0 across x 402–423, 1h 0.00); top-edge raise on the wearer's-left gone (first navy row = clean at x 380/470/500/530/590; 2-px feathered ramp); interior light seam gone (0 px); sleeve block gone (0 darkened px; rows 738–755 at x 330–380 identical to clean); cream-body → navy 765 → 97 px. **Unchanged:** right-end protrusion (113 cream → dark px at x 580–616 / y 713–730; 1h 118). **Regressed:** the old lettering and pinstripe are now re-exposed as bright **outlines** on both halves of the band and beside the zip — 882 unpainted non-candidate source pixels inside the band interior (1h 318, 1g 146).

## Causal checks A–E [V]

**A — Occlusion ownership: CHANGED, as intended.** Implied paint coverage `(out − src)/(paint − src)` at the crease is now `1.0` across x 276–288 at y 695 and 0.84–0.91 at y 705 (1e/1g/1h: `0.84 0.70 0.56 0.43 0.39 0.43 0.56 0.71 0.87 1.0`); at the wedge `0.75 1.0 1.0 0.93 0.84 0.91 0.98 0.96` (1d–1h: `0.00`). `effective_band_bbox.pixel_count` rose 25 347 → 27 540. Hand/forearm skin is untouched: rows 738–742 at x 330–380 `59 108 137 155 183` vs clean `58 106 134 155 183`; the 131 changed px in the hand window are band pixels at x 280–300 / y 730–749 (source luma 21). Code: `applyChestLocalOcclusionSemantics` (α = 1 − dilate(hands ∪ face) where `bandAuthorityMask` = 1), wired in `placementEngine.ts`; SAM-3 now returns raw `handsAlpha` / `faceAlpha`.

**B — Lower-half lettering (x 448–566, y 714–734): improved, not repaired.** Residues 204 → 113, now spanning y 704–734 / x 442–578. The hard lock is gone (verified: no `> 180` gate in the paint pass), but the residues changed form — glyph *cores* are painted, glyph *edges* are not (see criterion 9).

**C — Top ridge (y 676–679, x 214–255): improved, not removed.** Row 676: x 208–213 = 39–78, x 256–262 = 107→57; row 679: x 228–239 = 62–99, x 267–268 = 164/90; rows 678–686 max luma at x 210–280 = 146–179. The pinstripe now reads as a thin bright outline curve (x 260–280, y 676–690). Cream-body raise is 3 px at x 290 only (676 → 673; 97 cream px); elsewhere 0.

**D — Sleeve (x 373–399, y 738–759): PASS.** 0 darkened cream px; the navy block, the 10-row spill and the hairline are gone. Rows 750–759 now change only at x 480–544 where the source is band navy (178 px, source luma mean 40, 100 % < 70).

**E — Right/top perimeter: top fixed, right end unchanged.** Top edge: no raise, no staircase, no interior seam (x 500: `197 → 96 → 38`). Right end: 113 cream → dark px at x 580–616 / y 713–730 with a grey fringe — same as 1h.

## Verdict — **CHEST STILL GATE: NOT CLEARED** (6 / 11)

| # | Criterion | Result | vs 1h | Evidence |
|---|---|---|---|---|
| 1 | Full band incl. left third | **PASS** | = | `stage1i_chest_compare.jpg` |
| 2 | Pinstripe + AA removed | **FAIL** — fragments at row 676 (x 208–213, 256–262) and row 679 (x 228–239, 267–268); bright outline curve x 260–280 / y 676–690 | improved (1h: two solid lines) | `stage1i_pinstripe_topleft.jpg`, `stage1i_crease.jpg` |
| 3 | Crease removed | **PASS** — x 277–283 column means 33 = band; coverage 1.0 | fixed | `stage1i_crease.jpg` |
| 4 | Cream preservation | **FAIL** — 97 cream-body px → navy at x 280–330 / rows 673–676 (3-px raise at x 290) | improved (765 → 97) | `stage1i_pinstripe_topleft.jpg` |
| 5 | Sleeve/forearm | **PASS** — 0 darkened px; rows 738–755 identical to clean | fixed | `stage1i_sleeve_zip_bottom.jpg` |
| 6 | Perimeter | **FAIL** — right-end protrusion x 580–616 / y 713–730 (113 px) with grey fringe | unchanged | `stage1i_right_top_edge.jpg` |
| 7 | Wordmark | **PASS** | = | `stage1i_right_top_edge.jpg` |
| 8 | Centre / wedge / single zip | **FAIL** — wedge absorbed, but **both** tapes survive: left tape x 399–401 (109/182/98 at y 715, 91 % of column x = 400 byte-identical) and diagonal tape x 415–431 (161 at (715,428), 166 at (710,430), 128 at (735,428)); reference has one line | improved | `stage1i_centre_wedge.jpg` |
| 9 | No ghosting | **FAIL — REGRESSION in kind.** 882 unpainted non-candidate source px inside the band interior (1h 318, 1g 146); **809 of the 866 mid-luma (60–180) source pixels are unpainted** (1h 141) while bright (> 180) pixels are painted (73 unpainted, mostly the zip zone). Result: every old glyph, the pinstripe and the armhole stripe appear as bright outlines — left x 255–345 / y 696–712 (158 px), right x 442–578 / y 704–734, zip-adjacent x 370–395 | regressed | `stage1i_crease.jpg`, `stage1i_right_top_edge.jpg`, `stage1i_centre_wedge.jpg` |
| 10 | Foreground occlusion | **PASS** — skin identical; chest-local semantics active | = (ownership changed) | `stage1i_sleeve_zip_bottom.jpg` |
| 11 | Outside-region | **PASS** — 0 px above y 600 / below y 800 | = | pixel diff |

## Causal layer by defect

**9 (outline ghosts) — COMPONENT CONSTRUCTION [V].** `_shared/logoComposite.ts` lines 1829–1848: for every *close-added* pixel, `isNavyPixel → keep; luma > 180 → keep ("lettering hole fill, any half"); otherwise closedCandidates[i] = 0`. The comment scopes this to "shadowed sleeve cream", but the code has no spatial, chroma, or lower-half condition. The antialiased edges of every glyph, of the pinstripe and of the zip tapes are mid-luma (60–180) close-added pixels, so they are removed from the component everywhere in the band → never painted → outline ghosts. The measurement matches exactly: 93 % of mid-luma interior pixels unpainted, 86 % of bright pixels painted.

**2 (pinstripe fragments) — COMPONENT CONSTRUCTION + SEGMENTATION [V].** Same rule strips the ridge's antialias (the outline curve); the absorb still misses the ridge ends (row 676 x 208–213 and 256–262 are the curve's tails, which sit above the component's first navy row by more than the 5-px `topPinstripeAbsorbPx` reach at the tilt).

**8 (two tapes) — COMPONENT CONSTRUCTION [H, evidence-backed].** The zip overlay is not the restorer: `overlayZipFromSource` restores only within `half` = 3 px of `zipX` = 421 (x 418–424), yet both tapes at x 399–401 and 427–431 are byte-identical to source. Each tape is a 3-px bright line whose 1-px edges are mid-luma; the rule above removes the edges, the > 180 core is then a pixel-thin island disconnected from the band, and `largestOverlappingComponent` drops it. The diagonal tape core is itself ≤ 180 (161/166/128) and is removed directly.

**4 (3-px raise at x 290) — SEGMENTATION [V].** Fixed-origin absorb (`topPinstripeAbsorbPx: 5`) still climbs from the component top where the ridge is thickest (x 285–300); rows 673–675 there are cream body (217–220).

**6 (right-end protrusion) — COMPONENT CONSTRUCTION [V, unchanged since 1g].** At x 580–616 / y 713–730 the closed component follows the armhole shadow (dark low-chroma, a legitimate `isChestBandCandidate`) beyond the band's real end; the expansion then paints it. Not a rule change in 1i; nothing in 1h/1i targeted it.

## Regression / evidence audit [V]

`src/lib/garment/architectureCStillRepairGolden.test.ts` (Stage 1i describe, lines 763–960) now runs **paint → illumination → zip → `applyChestLocalOcclusionSemantics` → `applyOcclusionAlphaComposite`** on the real crop. Region coverage:

| Region | Exercised? | Note |
|---|---|---|
| Crease x 276–288 | yes (y 700 ≥ floor) | live agrees |
| Centre wedge | yes (y 720 < 80; zip at `midX` > 150) | live agrees for the wedge; **the tapes at x 399–401 / 427–431 are not asserted** — live disagrees (both survive) |
| Wearer's-left y 714–734 | **synthetic** — the test *plants* pure-bright (> 180) lettering pixels, then asserts ≥ 85 % repaired | **test-model mismatch**: real glyphs have mid-luma antialiased edges; the planted pixels are exactly the class the code keeps, so the live outline failure is invisible to CI |
| Foreground anatomy | yes (hand window unchanged) | live agrees |
| Top ridge | **synthetic** ridge + AA planted with dark fabric above | live disagrees on the real ridge tails (row 676 / 679 fragments) |
| Cream sleeve exclusion | yes (real crop, forearm sample unchanged) | live agrees |
| Right-end x 580–625 | **no assertion** | live fails |
| Mid-luma antialias pixels inside the band | **no assertion** | live fails (809 px) |

The α fixture (`architectureCStill1hSam3Evidence.ts`) is evidence-derived (my coverage profile + wedge hole + hand window), not the live SAM-3 PNG; it reproduces the 1h hole geometry well enough that the A result agrees live, but it cannot catch α shapes I did not measure. CI is now capable of reproducing the *occlusion* failure class; it is not capable of reproducing the *component-construction* failure class because its lettering/pinstripe inputs are planted rather than read from the crop.

## Recommended next architectural step [R]

Not a threshold change — a scope fix and two assertions, all traced above: (1) apply the close-rejection rule only where it was ruled — shadowed cream at the sleeve/forearm boundary (lower half of the band, `chroma < 32`, adjacent to cream body) — and keep mid-luma close-added pixels inside the band's top half and in the interior of the closed region (they are glyph and ridge antialias); (2) after the component is built, paint any thin bright island fully enclosed by the component (or dilate-then-largest-CC before the luma rejection) so tape cores cannot be orphaned; the diagonal tape then disappears and only the canonical zip line at `zipX` is restored by the overlay; (3) the right-end protrusion needs its own trace — clip the component at the band's right end where the quad's right edge meets cream (x ≥ 600) or by the armhole shadow's chroma; (4) golden: assert on the **real crop's** lettering rows (x 255–345 / y 696–712 and x 442–578 / y 704–734) that no interior pixel keeps luma > median + 20; assert x 427–431 is band navy after zip; assert x 580–616 / y 713–730 cream unchanged. Compute: the two r = 12 full-frame dilations should be restricted to the band bbox padded by 12 px so the edge worker stays inside its limit.

## Hard locks [V]

The verification took no code, deploy, prompt, V3, sleeve, temporal, Astra/Premiere, auth/RLS, Control Center, or paid action. This document and six evidence images are committed as authorized (evidence/documentation only).
