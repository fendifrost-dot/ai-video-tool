# Architecture C — ChatGPT ruling: Stage 1f chest residual cleanup (2026-09-05)

**Authority:** ChatGPT, after Claude's Stage 1e verification (assets `57504fac` / `1cc15be0`, pixel-identical) and Cursor's concurrence. Recorded verbatim by Claude so "check the repo" carries the ruling without copy-paste.
**Owner:** Cursor (sole coding agent). **Verifier:** Claude, after merge + redeploy.

## Cursor's concurrence (verbatim)

> Claude's score looks right, and the diagnosis is sharper than 1d's. The real miss in 1e was the paint set. `quad ∪ navy` was the wrong geometry. It fixed the left overhang, then paid for it by painting bare cream inside the tilted rectangle — that's most of criterion 2 and the forearm smear. Claude's rewrite — `navy ∪ (quad ∩ dilate(navy, 4px))` — is the correct 1f. Navy owns the region; the quad only fills near-navy holes, never cream body/sleeve.
>
> Inward feather is also correct. Outward/blur-on-binary left the pinstripe in the blend zone, so ~40% of it survived. Erode → blur → dilate navy 2px puts the stripe inside solid cover.
>
> Speckle → faint seam is residual, not a reopen. Single pass + median±4 clamp is enough; don't overbuild.
>
> Forearm: ChatGPT's worry was justified. Soft α is fine; painting navy onto cream sleeve is not. Fixing the paint set (above) matters more here than killing the 2px feather.
>
> Net: 1e was a useful probe, not a pass. We're still polishing a working mechanism — not redesigning Architecture C. I'd approve Claude's 1f scope as-is, hold sleeve, and ignore the center zip/tie wedge as V2 generation debt until ChatGPT rules on it.

## ChatGPT directive (verbatim)

Stage 1e is deterministic and repeatable. Two authenticated product-UI executions produced pixel-identical 720×1280 outputs. Therefore, do not spend time investigating nondeterminism.

Current 1e remains FAIL under zero-deviation. Fix only the four confirmed residual defects.

### 1. Replace unconditional quad paint authority

Current `quad ∪ navy` overpaints cream garment pixels.

Change the paint region to:

`navy_band_component ∪ (quad ∩ dilate(navy_band_component, 4px))`

The manual quad is a spatial prior only. It must never independently authorize painting bare cream pixels.

This correction must eliminate:

* the 658 cream-source pixels currently painted navy at tilted margins
* the ~30×9 px navy smear onto the cream sleeve/forearm boundary

Do not restore `columnFollow`.

### 2. Make perimeter feather inward

The upper-left pinstripe survives because source pixels are blended into the repair exactly at the outer mask boundary.

Change the feather construction so the transition occurs inside the valid paint region, not outside it:

* erode the final paint mask by the feather radius
* blur/feather between the eroded mask and original valid mask
* dilate the navy-band component approximately 2 px along the band normal so the real band edge/pinstripe sits inside the solid-painted region

Goal: zero visible residual cream pinstripe at x≈206–335 / y≈675–680 without expanding paint into cream garment.

### 3. One merged-mask paint pass

Remove any overlapping or sequential band-paint path capable of creating the x≈279–283 dark seam.

Build the complete final paint mask first, then execute one paint pass.

Clamp painted pre-illumination luma to: `bandMedian ± 4`

Golden regression must assert no valid painted pixel is darker than: `bandMedian - 6`

Keep the existing low-frequency illumination stage afterward.

### 4. Golden regressions

Add fixtures/assertions for the exact Stage 1e failures:

* upper-left pinstripe cannot survive the paint edge
* cream pixels inside the manual quad but outside/away from the navy component remain unchanged
* no dark seam where mask regions meet
* cream sleeve at the crossed-forearm boundary remains unchanged

Preserve existing passing regressions:

* no sleeve/body drips
* feathered perimeter/no staircase
* correct wordmark sub-zone and scale
* continuous zip
* no high-frequency ghosting
* SAM-3 occlusion
* fail-closed default with no skin heuristic unless explicitly requested

Set: `repair_method_version = architecture_c_still_repair_1f`

Run full tests, build, and `deno check` on changed Edge Function/shared files.

### Scope locks

* chest only
* no sleeve implementation
* no temporal propagation
* no V3 activation
* no prompt changes
* no paid xAI
* no architecture expansion

Once the commit is ingested, report the exact commit SHA, changed files, test/build/deno-check results, and whether `architecture-c-still-repair-proxy` requires redeploy.

Do not run another 1e test. The repeat run already proved 1e determinism.

## Verification plan (Claude, after merge + redeploy)

Same still `2aa1a44c`, same quad, no fallback flag. Verify `repair_method_version: architecture_c_still_repair_1f` by behaviour before scoring. Score the same ten criteria as 1e with the same pixel probes: rows 675–679 max luma at x 210–330 (target ≤ band + 10); column mean luma at x 279–283 (target within band median ± 4); source-cream→navy count outside band rows (target 0); forearm rows 741–749 mean luma at x 330–380 (target = source); changed pixels above y 600 / below y 800 (target 0). Reference docs: `ARCHITECTURE_C_STILL_REPAIR_STAGE1E_RESULT_2026-09-05.md`.
