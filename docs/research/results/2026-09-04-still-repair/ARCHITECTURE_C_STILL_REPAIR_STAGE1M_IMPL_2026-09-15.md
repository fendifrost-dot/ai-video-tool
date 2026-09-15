# Architecture C — Stage 1m implementation (C9-right wordmark-edge AA)

**Date:** 2026-09-15 · **Author:** Cursor Lane A · **Spend:** $0 · **Issue:** #71 (lineage #67, parent #50)
**Status:** automated regression on `main` (PR #72). **Live 1m asset scored** `9ed83c01` (`architecture_c_still_repair_1m`). **CHEST STILL GATE: CLEARED 11/11** (Lane E, unfiltered mid-luma).

Evidence labels: **[V]** verified on the canonical crop fixture + Lane E · **[D]** decision · **[R]** recommendation

## Ownership surface

| File | Role |
|------|------|
| `src/lib/garment/logoComposite.ts` | Vitest source of truth: `snapWordmarkEdgeAaGhosts` after cover |
| `supabase/functions/_shared/logoComposite.ts` | Edge mirror (same snap) |
| `supabase/functions/_shared/placementEngine.ts` | call snap after `warpQuadAlpha`; `repair_method_version: architecture_c_still_repair_1m` only |
| `src/lib/garment/architectureCStillRepairGolden.test.ts` | Truthful 1m goldens (fail on 1l C9-right leftovers; pass when snapped) |
| `src/lib/eval/stage1lEvidence.ts` | Historical 1l live scorecard (PR #70, 10/11) |

Not touched: sleeve-panel R&D, temporal propagation, original-master reconstruction, evaluator productization, Astra/Premiere, pipeline OS, `grok-video-research-proxy`, Control Center, V3, PR #37. Occlusion semantics (1i), ROI compute (1j), 1k enclosure, and 1l C2/C4/C6 paints unchanged.

## 1l live remaining FAIL (authoritative, PR #70) [V]

Asset `9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75`, `architecture_c_still_repair_1l`, **10/11**.

| # | Live 1l | 1m fixture [V] |
|---|---------|----------------|
| C2 pinstripe/AA | **0** (cleared) | **0** |
| C4 cream preservation | **0** (cleared) | **0** |
| C6 right-end | **0** (cleared) | **0** |
| C9 ghosts | 0.172 (left 0.000 / right **0.261**, 84/488 at x 462–500 / y 713–723) | **< 0.05** after snap |

Locked 1l PASSes held on the fixture: C1, C2, C3, C4, C5, C6, C7, C8, C10, C11 (and C9-left).

## What changed [D]

**C9-right — post-warp wordmark-edge AA snap.** Live 1l in-quad mid-luma fill cleared the left lettering window (0.042→0) and recovered only 4 right-window pixels. The crop fixture is cover-only and predicted 11/11; live SAM-3 + `warpQuadAlpha` re-lit source-mid-luma pixels at the wordmark half. Stage 1m does **not** reopen enclosure/absorb. After the perspective wordmark warp, snap output pixels that are:

- inside the C9-right window (x 442–560 / y 704–734) and the measured quad
- source mid-luma (60–180), not cream-body
- output above band-median + 20 and **≤ 180** (AA fringe, not C7 glyph cores)
- x < 576 (C6 tongue lock)

Those pixels are rewritten to the painted band navy sampled at (450, 700).

## Goldens [V]

`architectureCStillRepairGolden.test.ts` Stage 1m:

- 1l-style planted leftovers at x 462–500 / y 713–723 **FAIL** C9-right (same class as live 0.261)
- snap of those leftovers **PASS** C9 (`ghostRatio` / `rightWindowRatio` < 0.05) and keep a planted C7 core (L>180)
- crop+cover+snap stays 11/11; C2/C4/C6 zeros hold
- planted 1-px cream raise at x 290 stays source (1l C4 lock)
- `warpQuadAlpha` + snap: 1l-style warp AA fails C9-right; snap clears it and keeps glyph cores
- 1i crease/wedge/hand + 1j sleeve 4×3 + C8 tapes survive

## Deploy [R]

Redeploy **only** `architecture-c-still-repair-proxy`. Expect `architecture_c_still_repair_1m`. One canonical $0 run on `2aa1a44c` + measured quad. Score with Lane E unfiltered mid-luma (same ruler as PR #70). Target: C9 combined < 0.05, right window < 0.05; C2/C4/C6 remain 0.

No frontend Publish. No V3. No paid Grok.
