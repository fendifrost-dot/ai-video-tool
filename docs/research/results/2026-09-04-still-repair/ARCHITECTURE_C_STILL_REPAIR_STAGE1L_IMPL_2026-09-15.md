# Architecture C — Stage 1l implementation (remaining C2/C4/C6/C9)

**Date:** 2026-09-15 · **Author:** Cursor Lane A · **Spend:** $0 · **Issue:** #67 (lineage #52, parent #50)
**Status:** automated regression on `main` (PR #68). **Live 1l asset minted** `9eaf0c55` (`architecture_c_still_repair_1l`). **CHEST STILL GATE not scored live** (Lane E follow-up).

Evidence labels: **[V]** verified on the canonical crop fixture + Lane E · **[D]** decision · **[R]** recommendation

## Ownership surface

| File | Role |
|------|------|
| `src/lib/garment/logoComposite.ts` | Vitest source of truth: ridge AA walk, cream-raise stop, wordmark-right tongue drop, in-quad mid-luma fill |
| `supabase/functions/_shared/logoComposite.ts` | Edge mirror (same cover/absorb/trim/fill) |
| `supabase/functions/_shared/placementEngine.ts` | `repair_method_version: architecture_c_still_repair_1l` only |
| `src/lib/garment/architectureCStillRepairGolden.test.ts` | Truthful 1l goldens (would fail on 1k live defects) |
| `src/lib/eval/stage1kEvidence.ts` | Historical 1k live scorecard (PR #66, 7/11) |

Not touched: sleeve-panel R&D, temporal propagation, original-master reconstruction, evaluator productization, Astra/Premiere, pipeline OS, `grok-video-research-proxy`, Control Center, V3, PR #37. Occlusion semantics (1i) and ROI compute (1j) unchanged.

## 1k live remaining FAILs (authoritative, PR #66) [V]

Asset `c9c4efee-6bd2-450f-a9e4-b70fb9b722bb`, `architecture_c_still_repair_1k`, **7/11**.

| # | Live 1k | Fixture 1k | 1l fixture [V] |
|---|---------|------------|----------------|
| C2 pinstripe/AA | 6 remnants | 10 remnants | **0** |
| C4 cream preservation | 19 px / 1-px raise at x 290 | 0 | **0** (plus planted JPEG-leak golden) |
| C6 right-end | 41 cream→navy | 42 | **0** |
| C9 ghosts | 0.195 (left 0.042 / right 0.273) | 0.023 | **0** (plus planted wordmark-edge AA) |

Locked 1k PASSes held on the fixture: C1, C3, C5, C7, C8, C10, C11.

## What changed [D]

1. **C2 — lateral ridge AA walk.** Live remnants were cool grey-blue mid-luma beside the column-normal absorb (`(208,677)…(271,681)`), not cream-body. After column absorb, walk cool L 90–180 pixels within chebyshev distance 2 of the component in the ridge strip (quad-top ± absorb). Warm cream-body is excluded.
2. **C4 — single-row cream raise stop.** Live 19 px / 1-px raise at x 290: a 1-row cream-body tick with a later jacket shadow looked like a dark-capped ridge. `lastBright ≤ 1` cream at k=1 is never absorbed. Multi-row pinstripe (lastBright ≥ 2) still absorbs. Planted golden: cream at (290,675) + mid at 674 + dark at 673 stays unpainted.
3. **C6 — cool-white tongue past the wordmark.** Residual 41–42 px were r≈g≈b+8 highlights that **fail** `isCreamBodyPixel` (too cool) and were kept as “navy-bounded letter holes.” Drop all high-luma non-navy at x ≥ 576, including rows with no solid navy run. Paint-time guard so feather / core re-assert cannot relight them. Wordmark letter holes stay left of x 576 (C7 window).
4. **C9 — in-quad mid-luma fill.** Live right-window 0.273 was glyph AA on the component outer edge (y 713–723) that 1k enclosure rejected because it touched outside. Keep close-added mid-luma inside the measured quad even on the boundary; then flood mid-luma (60–180) 8-adjacent to the component inside the quad, excluding cream-body, below-quad sleeve, and x ≥ 576.

## Fixture Lane E [V]

Canonical crop embed (`ARCHITECTURE_C_BAND_CROP`, still `2aa1a44c`, same quad as live), `coverTargetQuad` + 1h SAM-3 evidence α:

**11 / 11 PASS.** C2 remnants 0, C4 cream→navy 0, C6 cream→navy 0, C9 unfiltered ghost ratio 0.

## Goldens [V]

`architectureCStillRepairGolden.test.ts` Stage 1l + Lane E real-crop scorecard:

- remnants === 0 (1k live 6 / fixture 10)
- C4 creamToNavy === 0 and planted 1-px raise at x 290 stays source
- C6 creamToNavy === 0 (1k live 41)
- C9 ghostRatio < 0.05 including planted wordmark-edge mid-luma
- 1i crease/wedge/hand, 1j 4×3 sleeve, C8 tapes still hold

Those zeros would fail on 1k paint.

## Deploy [R]

Redeploy **only** `architecture-c-still-repair-proxy`. Expect `architecture_c_still_repair_1l`. One canonical $0 run on `2aa1a44c` + measured quad. Score with Lane E unfiltered mid-luma (same ruler as PR #66).

No frontend Publish. No V3. No paid Grok.
