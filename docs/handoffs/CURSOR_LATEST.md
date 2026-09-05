# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-05 · **Branch:** `cursor/architecture-c-still-1e-perimeter-88eb` · **Head:** (this land)

## ChatGPT Stage 1D reading — confirmed

Matches repo: PR #40 merge `514153f` (+ SAM-3 tip `bb2d75f`) + Lovable compile-only `fe246b4`/`1ffb814`/`6d77a2b`. Stage 1d asset `e0fb43b1`, `occlusion_source:"sam3"`, `repair_method_version: architecture_c_still_repair_1d`. Approve **1e chest refinement**; sleeve **blocked**; no paid xAI.

## Landed — Stage 1e perimeter polish (code only; not live-run)

Implements 1d doc corrections 1–4 (correction 5 = live 422 exercise → Claude after redeploy):

1. **Paint = `quad_navy_union`** — expanded manual quad ∪ navy inside a bounded band-normal search shell (`navyUnionMarginPx: 12`). No `columnFollow`. Covers the ~10 px left/top-left true-band sliver without sleeve drips.
2. **Feather 2–3 px** — paint-mask `featherPx: 3` + SAM-3 occlusion `featherAlpha(..., 2)`.
3. **Black-speckle suppress** — near-black navy outliers rejected in LF illumination; solid paint clamps luma below navy×0.55 back to average navy. Golden asserts zero near-black painted cells.
4. **Illumination** — gain clamp **[0.80, 1.20]**; slightly tighter blur (`0.28×` band height).

Also: `allowSkinHeuristicFallback` default **fail-closed** (`=== true` to opt in). `repair_method_version` → **`architecture_c_still_repair_1e`**.

### Key files
- `src/lib/garment/logoComposite.ts` (+ tests / golden)
- `src/lib/garment/stillRepairOcclusion.ts` (`featherAlpha`)
- `supabase/functions/_shared/{logoComposite,stillRepairOcclusion,placementEngine}.ts` (mirrors)

### Verify
**698 tests passed**, `npm run build` ok. No paid call. No Stage 1e live run.

## Deployed?

| Surface | Status |
|---------|--------|
| `architecture-c-still-repair-proxy` edge redeploy | **YES — required** after ChatGPT review + merge |
| Frontend Publish | **NO — not required** (proxy-only) |

**STOP — no Stage 1e live run / no sleeve / no paid calls until ChatGPT authorizes post-merge.**

## Confirm

V2 active · V3 inactive · xAI spend unchanged · temporal **off** · sleeve **blocked** · 422 path still needs one live exercise after redeploy
