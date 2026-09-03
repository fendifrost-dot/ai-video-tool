# Architecture C — V2 defect register and proposed fixes

**Date:** 2026-09-03 · **Author:** Claude (Cowork, AVT project) · **Reviewed by:** Fendi (visual scoring)
**Generation baseline (frozen):** Frozen Prompt V2 · request `9d47bd2f-c220-98a4-a281-f1499b8ae7f4` · `edited_clip` `f31bd0f2-884f-42e1-8b08-aa645597b7a6`
**Repair still:** `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` (t=0.785 s, 720×1280) — verified pixel-identical to an independent extract of the V2 clip
**Reference of record:** flat product image `2a14a72b-e7de-4ecb-9c24-4142b672d175.jpg` (the only reference sent under EDIT-R4)

Evidence labels: **[V]** verified against the reference image · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

Standard in force: **zero deviation** is the reference/target standard (ChatGPT, 2026-09-03). Every visible departure is recorded as a defect and assigned an owner — generation, deterministic repair, or escalation. No "acceptable variance" category.

---

## 1. What V2 gets right [V]

Jacket zipped closed · collar standing up · collar **inner** facing navy · mastic body · continuous chest band · shirt and tie visible only at the throat · black pleated trousers · identity, performance, camera, background and lighting all preserved. No edit-vs-regenerate failure.

## 2. Defect register [V]

| # | Defect in V2 output | Reference truth | Class | Owner |
|---|---|---|---|---|
| **A** | Collar is navy on the **outside and inside** | Collar **outer is mastic** (self-colour); only the inner facing is navy | **Prompt error** | ChatGPT decision — see §4 |
| **B** | Full-length **silver / metallic** zip | **Self-colour mastic** zip tape, near-invisible against the body; small **gold pull** only | Prompt omission | ChatGPT decision — see §4 |
| **C** | Navy **horizontal ring around the bicep**, a continuation of the chest band; **no vertical sleeve panel** | Chest band **terminates at the armhole**; a **separate vertical** navy panel runs armhole → cuff, with a cream gap between the two | Capability gap | Generation / escalation; deterministic `sleeve_panel` repair on the visible upper arm (directive step 3) |
| **D** | Wordmark is **illegible gibberish** | Legible **SAINT LAURENT**, house typeface, cream on navy | Capability gap (5 consecutive observations) | Deterministic repair — **brand pixels already proven legible** in stage 1 |
| **E** | Lettering marks on **both** chest sides and on the sleeve rings | Wordmark **once**, **wearer's-left chest only** | Capability gap | Deterministic repair — scope in §3 |
| **F** | Thin **cream pinstripe** through the middle of the navy band | Band is **solid navy** | Capability gap (new in V2) | Deterministic repair — scope in §3 |
| G | Silhouette longer than the cropped blouson | Cropped, boxy, banded hem | Minor | Generation |
| H | Dark strap artifact dangling at the front hem | None | Minor | Generation artifact |

Annotated overlay: `docs/research/results/2026-09-03-v2/V2_defect_register_vs_ref.jpg`. Collar/zip close-up: `docs/research/results/2026-09-03-v2/V2_collar_zip_vs_ref.jpg`.

**Verdict on the V2 generation: NOT A PASS.** The product lane (dry-run gate, paid run, `edited_clip` persistence, Review handoff) passes end to end; the garment does not.

---

## 3. Deterministic repair — state and proposed scope

### 3.1 Stage 1 (`logo_chest`) result [V]

- **Capture fix works.** WebCodecs path + upload fallback (`3ea8a1d`) resolved the silent no-op. Still `2aa1a44c` captured at t=0.785 s, correct clip, correct frame.
- **The brand-pixel engine works.** The composited wordmark renders cleanly legible as SAINT LAURENT in the correct typeface, cream on navy, sourced from the flat ref. This is the part five Grok runs could not do.
- **Placement failed.** The patch landed across the performer's face. Measured by pixel-diffing output against input:

| | Landed | Actual chest band |
|---|---|---|
| x (norm) | 0.219 – 0.781 | ≈ 0.30 – 0.88 |
| y (norm) | **0.380 – 0.509** | **≈ 0.503 – 0.578** |

  ≈ 0.12 too high, ≈ 2.5× too tall, and a flat axis-aligned rectangle with no perspective warp.

- **[H] Not an engine bug — a placeholder default.** The panel states the manual quad is the source of truth and auto-detection only validates. `defaultChestStripeQuad()` was never meant to run unadjusted. **The warp engine has not yet been exercised with a correct quad; do not draw conclusions about it until one is.**

### 3.2 Proposed repair scope (supersedes "place one wordmark")

Defects **D, E and F** are all on the same planar region and should be handled as **one operation**:

1. **Chest-band quad spans the full band, edge to edge** (≈ x 0.30–0.88, y 0.503–0.578 on still `2aa1a44c`), not just the logo zone.
2. **Repaint the whole quad solid navy** from the flat ref — this erases the wearer's-right gibberish (E), the pinstripe (F), and the illegible wearer's-left marks (D) in one pass.
3. **Place one wordmark, wearer's-left chest**, at roughly one third of the band's width, cream on navy, from the flat-ref crop already proven to render.
4. Sleeve-ring marks in frame are addressed by the `sleeve_panel` stage, not by the chest quad.

A quad that covers only the logo zone leaves E and F in place and fails zero-deviation.

### 3.3 Sleeve panels (`sleeve_panel`, directive step 3)

[V] The performer's arms are crossed for the **entire** V2 clip; no frame shows a free arm. So no still can carry a full armhole → cuff run. The stage is correctly typed "visible upper-arm only". Place left/right quads on the upper-arm segments and let tracking extend later. This clip validates the upper portion only.

### 3.4 Cursor items for the repair runner

- **Chaining hazard [V]:** after stage 1 the "Repair still asset" selector auto-switched to the stage-1 *output*. A re-run would repair the already-repaired image and compound the misplaced patch. **Do not auto-select the output as the next input**, or at minimum label it clearly and default back to the clean capture.
- **Seed the default chest quad from the measured band** on the recommended still rather than a generic placeholder, so the first run lands on the garment.
- **Numeric quad entry** alongside the drag handles. The handles are drag-only, which makes agent-assisted placement impossible and human placement imprecise.
- **Surface stage failures loudly.** This is the third silent or near-silent failure in this family (swallowed insert → silent capture no-op → wrong-place composite saved as "success"). A composite that lands outside the garment mask should at least warn.

---

## 4. Decision required — Frozen Prompt V2 contains a second factual error [D]

V2 says: *"…the **navy stand collar** standing upright…"*

**[V] The reference collar is mastic on the outside; only the inner facing is navy.** V2 rendered the whole collar navy — defect A. The model did exactly what it was told. This is the **same class of error as V1's "unzipped and hanging open"**: the prompt instructed the deviation. It is not a capability gap.

The freeze on V2 and the "no V3" directive stand, and this document does not change the active prompt. But two of ChatGPT's own rulings pull in the same direction and warrant a ruling here:

1. **The V1 → V2 precedent:** *factual errors about the reference are corrected in the prompt; capability gaps go to repair or escalation.* Collar colour is the former.
2. **The repair-ownership rule:** large articulated regions across head/neck movement must **not** be dumped into deterministic repair. Repainting a collar outer across the clip is exactly that.

Applied consistently, both point to a prompt correction, not a repair. Defect B (zip colour, simply unspecified in V2) is a candidate for the same pass.

**Proposed clause corrections — for approval, NOT applied:**

| Clause | V2 (current) | Proposed |
|---|---|---|
| Collar | "…and the navy stand collar standing upright…" | "…and the stand collar standing upright — **mastic cream on the outside, matching the jacket body, with only its inner facing navy** —…" |
| Zip | "…with the front zip fastened all the way up…" | "…with the front zip fastened all the way up, **the zip tape self-coloured in the same mastic cream as the body with only a small gold pull at the top**…" |

Everything else in V2 — closure, continuous wide band, throat-only layering, fabric, anti-track-jacket, identity preservation, and the entire Polo-exclusion clause — unchanged.

**If approved:** install as V3 alongside V1/V2 (preserve history), extend the regression test (assert "mastic cream on the outside" present and "navy stand collar" absent from the active prompt), and gate one paid run (~$0.32) behind the in-product dry run. **If declined:** A and B move to escalation-owned, and the repair layer's scope stays as §3.2.

Sleeve defect **C** is **not** proposed for the prompt pass. V2 already requests vertical panels and the model did not render them; that is a capability gap, and the deterministic `sleeve_panel` stage is the correct owner per the current directive. A prompt-wording hypothesis exists (the band and panels are described in one sentence and may be read as one element) but it is untested and does not justify reopening generation on its own.

---

## 5. Sequence

1. Fendi places the **full-band** chest quad per §3.2 on the **clean** still `2aa1a44c` → re-run stage 1 → score against the flat ref.
2. Place upper-arm sleeve quads → run stage 2 → score.
3. ChatGPT rules on §4.
4. Only after 1–2 pass on one frame: temporal tracking across the V2 clip (`temporalTrackingEnabled` stays `false` until then).

**Spend:** $12.80 of the $20 ceiling, 32 generations. No spend in this document's work.

