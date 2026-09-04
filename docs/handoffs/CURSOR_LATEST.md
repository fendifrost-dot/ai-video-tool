# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-04 · **Branch:** `main` · **Commits:** (this tip)

## Landed

Deterministic layer for Architecture C `logo_chest` (Claude items 1–5, canvas-first):

1. **Logo sub-zone + scale** — `logo_offset_norm` + `logo_height_ratio` on `logo_zone` product truth; defaults `[0.55, 0.88]` / `0.5` (wearer's-left, half band height). Manual path warps wordmark into sub-quad, not full band.
2. **Occlusion (interim)** — `restoreSkinOccluders` restores skin/hand pixels inside the band after composite. Full SAM-3 `outfit − dilate(hands) − dilate(face)` still pending (soft-fail placeholder documented).
3. **Tilted band** — `coverTargetQuad` `maxExpandFrac: 0.05` on still-repair path (navy snap already follows stripe).
4. **Shading** — `applyBandLumaShading` multiplies covered navy by source-band luma.
5. **Zip strip** — `zipStripFrac: 0.045` leaves mid-band column unpainted.

Touched: `src/lib/garment/logoComposite.ts` (+ tests), edge `_shared/logoComposite.ts` + `placementEngine.ts` `compositeLogoOntoVton`, `architectureCStillRepair` merge seeds both sides.

## Deployed?

- edge fn redeployed: **NO — required** → Lovable **Edge Functions → redeploy `architecture-c-still-repair-proxy`**
- frontend published: optional (defaults seeded server-side on merge); Publish if UI copy needs the new docs

## For Claude to verify

Re-run stage 1 on clean still `2aa1a44c` with measured band quad after edge redeploy. Expect: wordmark wearer's-left + ~½ height; less hand paint-over; zip continuity; less flat sticker. Score vs flat ref. Sleeve still waits if occlusion/shade still weak.

## Blocked / needs decision

- **ChatGPT:** V3 I/J pockets+cuffs clause before gated spend.
- **SAM-3 occlusion wire-up** if skin heuristic is insufficient on the crossed-arm still.
- No paid Grok · V2 active · V3 inactive · no temporal.
