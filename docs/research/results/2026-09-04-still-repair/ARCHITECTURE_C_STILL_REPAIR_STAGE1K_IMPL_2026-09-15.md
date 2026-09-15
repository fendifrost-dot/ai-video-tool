# Architecture C — Stage 1k implementation (enclosure / truthful goldens / right-end / absorb)

**Date:** 2026-09-15 · **Author:** Cursor Lane A · **Spend:** $0 · **Issue:** #52 (parent #50)
**Status:** automated regression shipped; **canonical live scored 2026-09-15 — CHEST STILL GATE NOT CLEARED 7/11** (asset `c9c4efee`). See `ARCHITECTURE_C_STILL_REPAIR_STAGE1K_RESULT_2026-09-15.md`. Fixture prediction was 9/11 (FAIL C2+C6); live extra FAILs are C4 and C9-right.

Evidence labels: **[V]** verified on the canonical crop fixture · **[D]** decision · **[R]** recommendation

## Ownership surface

| File | Role |
|------|------|
| `src/lib/garment/logoComposite.ts` | Vitest source of truth: enclosure, absorb, right-end / below-quad trims |
| `supabase/functions/_shared/logoComposite.ts` | Edge mirror (same logic) |
| `supabase/functions/_shared/placementEngine.ts` | `repair_method_version: architecture_c_still_repair_1k` only |
| `src/lib/garment/architectureCStillRepairGolden.test.ts` | Truthful 1k goldens |

Not touched: sleeve-panel R&D, temporal propagation, original-master reconstruction, evaluator productization, Astra/Premiere, pipeline OS, `grok-video-research-proxy`, Control Center, V3, PR #37.

## Locked wins preserved [V]

- Stage 1i chest-local occlusion (crease/wedge/hand) still asserted in goldens
- Stage 1j `dilateAlphaRoi` / ROI compute unchanged

## What changed [D]

1. **Enclosure** replaces ≥4 original-seed-neighbour ownership. A close-added mid-luma pixel is kept only when it is not 8-adjacent to any pixel outside the closed snapshot. Cream-body mid-luma is rejected (disconnects sleeve close-bridges). Bright cores (L>180) stay unless they are cream-body *and* on the close boundary.
2. **Absorb** keeps the 1j dark-capped ridge scan, adds an AA-only case (L≥90 immediately above the component), and stops when a cream-body pixel is followed by another cream-body pixel unless a dark-capped ridge is in progress.
3. **Right-end trim** drops non-navy past the per-row solid navy run (gap 2 / min run 14) and drops cream that is not a navy-bounded letter hole near that end.
4. **Below-quad trim** drops non-navy / non-candidate pixels below `quadBottom − 8` (crossed forearm / 4×3 sleeve patch).

## Fixture measurements [V]

Canonical crop embed (`ARCHITECTURE_C_BAND_CROP`, still `2aa1a44c`, same quad as live):

| Metric | 1j | 1k |
|--------|----|----|
| Left window ghost ratio (unfiltered) | 0.596 | 0.042 |
| Right window ghost ratio (unfiltered) | 0.416 | 0.012 |
| Right-end cream→navy (x 580–616 / y 713–730) | 114 | 42 |
| Sleeve 4×3 (x 389–392 / y 746–748) | 8 | 0 |
| Left tape x399 y715 | source 110 | painted 34 |
| Cream raise x280–330 y673–675 | 0 | 0 |

Residual **[V]**: 42 cream→navy pixels in the right-end window still have navy within 6 px on both sides (letter-hole class). Not claimed as criterion-6 PASS until live scores it.

## Goldens [V]

`architectureCStillRepairGolden.test.ts` Stage 1k + the 1j mid-luma test now count every mid-luma source pixel in the windows (no `bandAuthorityMask` filter). Target `< 0.05`. Added assertions for right-end residual, left tape, 4×3 sleeve, cream-body stop, and 1i crease/wedge/hand.

## Deploy [R]

Redeploy **only** `architecture-c-still-repair-proxy`. Expect `architecture_c_still_repair_1k`. One canonical $0 run on `2aa1a44c`.
