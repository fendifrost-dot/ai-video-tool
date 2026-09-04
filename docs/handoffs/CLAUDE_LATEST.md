# CLAUDE → repo · latest handoff

> **Convention.** This file is always Claude's most recent handoff. Claude overwrites it each time; dated copies live in `docs/` and `docs/research/results/`. Cursor and ChatGPT: "check the repo" means read this file. Cursor's side is `docs/handoffs/CURSOR_LATEST.md`.

**Updated:** 2026-09-04 (rev 3 — Publish landed, UI path verified) · **Author:** Claude (Cowork) · **Spend:** $12.80 of $20 ceiling, 32 generations · **No paid call pending** · stage-1 re-run cost $0

## State in one paragraph

Stage 1 (`logo_chest`) has now been run with a **correct, measured band quad** on the clean still `2aa1a44c` → output asset `477b722c`. The wordmark renders legibly as SAINT LAURENT in the house typeface (defect **D fixed**, **F fixed** inside the quad). It is still **NOT a pass** under zero-deviation: the wordmark is centred on the band and ~2× oversized (reference: wearer's-left segment, ~½ band height), the patch paints over the crossed hand (no occlusion mask), the tilted band leaks below the rectangular patch, the zip line is erased, and the band is flat/unlit. **The failure has changed category** — from "can the engine do this" to specifiable compositing rules. V2 stays frozen; V3 is installed but inactive (`4af7afa`). **Fendi review added two generation defects: I navy pocket welts, J navy cuffs (both mastic on the reference) — and defect H is withdrawn (it was the pocket welt). Collar A and sleeve ring C are untouched by design.** The repair produced one still, not a clip; the Review clip is unchanged. **Lovable Publish has landed:** the `4af7afa` runner is live and stage 1 was re-run through the product UI with the same quad — output pixel-identical to `477b722c`, no auto-chaining, placement check working. UI path and proxy path now agree.

## Read this

**`docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1_RESULT_2026-09-04.md`** (`33e2ab9` + two addenda) — full result, disclosure of how the quad was supplied, defect table, and six proposed fixes. Annotated evidence in the same folder (`stage1b_ref_vs_result.jpg`, `stage1b_before_after.jpg`, `stage1b_chest_zoom.jpg`, `v2_pockets_cuffs_annot.jpg`).

Prior context: `docs/ARCHITECTURE_C_V2_DEFECTS_AND_PROPOSED_FIXES_2026-09-03.md` (register A–F) and `docs/ARCHITECTURE_C_CHATGPT_V3_STILL_FIRST_RULING_2026-09-03.md` (sequence).

## Disclosure (closed)

The first stage-1b run supplied the quad directly to `architecture-c-still-repair-proxy` because the live app pre-dated `4af7afa`. After Publish, the same quad was entered in-product and the UI-path output is byte-identical to the proxy-path output (addendum 2 in the result doc). No open disclosure.

## Open items by owner

| Owner | Item |
|---|---|
| **Cursor** | Deterministic layer, in this order: (1) logo sub-zone + scale from product truth (`logo_offset_norm`, `logo_height_ratio`) instead of quad centre/full height; (2) occlusion mask before compositing — SAM-3 `outfit − dilate(hands) − dilate(face)` on the still; (3) mask-derived band quad for the tilted band; (4) shading transfer (low-frequency luminance from the source band, `periocularComposite` helper shape); (5) exclude/redraw the zip strip. Details in the result doc. |
| **Fendi** | Nothing blocking. (Publish done — verified live.) Next Publish is needed only after Cursor lands items 1–5. |
| **ChatGPT** | Rule on a **V3 clause for pockets/cuffs** (I, J) — proposed text in the result-doc addendum, not applied. Installed V3 does not cover them; the single gated V3 run should wait until it does. |
| **Claude** | Sleeve `sleeve_panel` stage on the visible upper arm (directive step 3) is ready to run on the same still at $0 — recommend waiting for Cursor items 1–3 first, since the sleeve composite will hit the same occlusion/shading problems. Will run on request either way. |

## Guardrails unchanged

V2 frozen · V3 inactive until still stages pass · no paid Grok call · `temporalTrackingEnabled=false` until a still passes review · zero-deviation is the garment standard.
