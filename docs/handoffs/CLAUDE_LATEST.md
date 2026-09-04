# CLAUDE → repo · latest handoff

> **Convention.** This file is always Claude's most recent handoff. Claude overwrites it each time; dated copies live in `docs/` and `docs/research/results/`. Cursor and ChatGPT: "check the repo" means read this file. Cursor's side is `docs/handoffs/CURSOR_LATEST.md`.

**Updated:** 2026-09-04 (rev 4 — Cursor 8ebfe83 deployed + scored: regression) · **Author:** Claude (Cowork) · **Spend:** $12.80 of $20 ceiling, 32 generations · **No paid call pending** · stage-1 re-run cost $0

## State in one paragraph

**Latest (rev 4):** Cursor's `8ebfe83` (items 1–5) was redeployed to `architecture-c-still-repair-proxy` by Claude via Lovable deploy-only chat (`main` unchanged) and scored on the same still/quad → asset `f7c7b524`. **Wordmark placement is now correct (item 1 fixed) but the band regressed:** per-pixel luma shading ghosts the old lettering/pinstripe as blotches, the tilted-band expansion painted navy drips ~52 px below the band over sleeves and hands, the zip strip is a raw slit, and the skin heuristic cannot protect cream sleeve. **NOT a pass; worse than 1b on the band.** Corrections are specified in the 1c doc. Sleeve stage stays on hold.

Prior state (rev 3): Stage 1 (`logo_chest`) has now been run with a **correct, measured band quad** on the clean still `2aa1a44c` → output asset `477b722c`. The wordmark renders legibly as SAINT LAURENT in the house typeface (defect **D fixed**, **F fixed** inside the quad). It is still **NOT a pass** under zero-deviation: the wordmark is centred on the band and ~2× oversized (reference: wearer's-left segment, ~½ band height), the patch paints over the crossed hand (no occlusion mask), the tilted band leaks below the rectangular patch, the zip line is erased, and the band is flat/unlit. **The failure has changed category** — from "can the engine do this" to specifiable compositing rules. V2 stays frozen; V3 is installed but inactive (`4af7afa`). **Fendi review added two generation defects: I navy pocket welts, J navy cuffs (both mastic on the reference) — and defect H is withdrawn (it was the pocket welt). Collar A and sleeve ring C are untouched by design.** The repair produced one still, not a clip; the Review clip is unchanged. **Lovable Publish has landed:** the `4af7afa` runner is live and stage 1 was re-run through the product UI with the same quad — output pixel-identical to `477b722c`, no auto-chaining, placement check working. UI path and proxy path now agree.

## Read this

**`docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1C_RESULT_2026-09-04.md`** — the 1c scorecard on `8ebfe83` with six corrections (defect-masked low-frequency shading clamped ±15 %; expansion along the band normal only; zip as feathered overlay; SAM-3 garment mask with `occlusion_source` surfaced; mask-derived quad; golden regression test). Evidence `stage1c_chest_compare.jpg`.

**`docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1_RESULT_2026-09-04.md`** (`33e2ab9` + two addenda) — full result, disclosure of how the quad was supplied, defect table, and six proposed fixes. Annotated evidence in the same folder (`stage1b_ref_vs_result.jpg`, `stage1b_before_after.jpg`, `stage1b_chest_zoom.jpg`, `v2_pockets_cuffs_annot.jpg`).

Prior context: `docs/ARCHITECTURE_C_V2_DEFECTS_AND_PROPOSED_FIXES_2026-09-03.md` (register A–F) and `docs/ARCHITECTURE_C_CHATGPT_V3_STILL_FIRST_RULING_2026-09-03.md` (sequence).

## Disclosure (closed)

The first stage-1b run supplied the quad directly to `architecture-c-still-repair-proxy` because the live app pre-dated `4af7afa`. After Publish, the same quad was entered in-product and the UI-path output is byte-identical to the proxy-path output (addendum 2 in the result doc). No open disclosure.

## Open items by owner

| Owner | Item |
|---|---|
| **Cursor** | Fix the 1c regressions per the 1c doc §Proposed corrections: (1) shading = defect-masked, blurred luma, gain clamped [0.85,1.15]; (2) `coverTargetQuad` expansion along the band normal only — never column-following; (3) zip as a feathered overlay line, not an unpainted column; (4) SAM-3 garment mask as compositing alpha, skin heuristic only as surfaced fallback; (5) mask-derived quad; (6) golden test on still `2aa1a44c`. Item 1 (logo sub-zone) is done — keep it. Then say `redeploy needed` in CURSOR_LATEST. |
| **Fendi** | Nothing blocking. Edge redeploys are now handled by Claude via Lovable deploy-only chat (verified safe this round); a frontend Publish is only needed if the runner UI changes. |
| **ChatGPT** | Rule on a **V3 clause for pockets/cuffs** (I, J) — proposed text in the result-doc addendum, not applied. Installed V3 does not cover them; the single gated V3 run should wait until it does. |
| **Claude** | On Cursor's next land: redeploy `architecture-c-still-repair-proxy` (deploy-only), verify by behaviour (response `target_quad`/`occlusion_source`), re-run stage 1 on `2aa1a44c` with the same quad, score. Sleeve stage stays on hold until the band passes on one frame. |

## Guardrails unchanged

V2 frozen · V3 inactive until still stages pass · no paid Grok call · `temporalTrackingEnabled=false` until a still passes review · zero-deviation is the garment standard.
