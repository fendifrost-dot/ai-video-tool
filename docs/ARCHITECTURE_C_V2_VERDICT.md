# Architecture C — V2 verdict (2026-09-03)

**Status:** DECISION. Freeze Frozen Prompt V2. Do not write a V3 construction prompt. Remaining garment defects go through **deterministic repair**, not more Grok prose.

**Class:** A (docs / scoring). Does not change runtime. Does not authorize a paid xAI call.

Post-test ChatGPT handoff (stills, sleeve geometry limit, withdrawn V3 compiler): [`claude_code_handoff_avt_architecture_c_v2_after_test_2026-09-03.md`](../claude_code_handoff_avt_architecture_c_v2_after_test_2026-09-03.md).

---

## Split the score (do not mix)

Claude scored **product plumbing** and **garment zero-deviation** as one PASS. They are not the same.

| Surface | Verdict | Label |
|---------|---------|--------|
| In-product dry-run (15/15), paid `/v1/videos/edits`, `edited_clip` persist, Review-board handoff | **PASS** | **VERIFIED** — row `f31bd0f2-884f-42e1-8b08-aa645597b7a6`, request `9d47bd2f-c220-98a4-a281-f1499b8ae7f4`, `$0.32`, `prompt_version: v2`, parent clip `76fe7438-…` |
| Identity + scene preserved | **PASS** | **OBSERVED** (Claude; Fendi did not dispute) |
| Garment zero-deviation vs Saint Laurent flat ref | **NOT a pass** | **OBSERVED** (Fendi): wordmark illegible; sleeve stripe location/formation wrong |

Zero-deviation is the **target**, not a claim that Grok is pixel-perfect. Plumbing PASS does not make the garment a pass.

---

## Collar causal story — rejected

Claude: the stand collar was 0/10 because “an open jacket physically cannot carry a stand collar,” so V1’s unzipped clause caused it.

**Rejected.**

- An open jacket can have a propped / standing collar. That is not a physical impossibility.
- V1 already asked for **both** in one sentence: `worn UNZIPPED and hanging open` **and** `a navy stand collar`. Collar omission is not the V1 failure mode.
- V2 changed zip state, collar wording (“standing upright”), band width, and shirt visibility **in one prompt**. One paid run cannot isolate zip-state as the cause.
- **OBSERVED:** V2 shows a standing collar. **HYPOTHESIS:** any single clause caused it. Do not treat that hypothesis as VERIFIED.

V2’s zip correction remains valid as a **factual** fix (both R4 refs are fully zipped). It is not a general law that construction defects are prompt-shaped.

---

## What stays on the defect list

Fendi confirmed these. Keep them. Do not prompt-iterate them.

1. **SAINT LAURENT wordmark still gibberish** — 5th consecutive observation. **Deterministic repair** (`logo_zone` / `placeDetail` / real-pixel composite). Already agreed; still agreed.
2. **Navy sleeve / side panels** — reference is vertical shoulder→cuff; V2 wraps the chest band around the sleeve. **Mechanistic `sleeve_panel`**, not a V3 sentence. `sleeve_panel` is registered in `placementEngine` and currently `detectStub` → `requires_manual_keyframe`.
3. **New V2 artifact:** cream pinstripe through the navy chest band (reference band is solid navy). Cover with real `chest_band` pixels; do not describe the pinstripe away in prose.
4. Silhouette longer than the cropped blouson — **generation/escalation**, not a logo-style repair. Not a V3 either.

Claude’s note that V2’s chest-band + sleeve-panel clause sits in one sentence may be a **HYPOTHESIS** about why the band wrapped. Even if true, the response is **not** another wording pass. Prompt-shaped topology is exactly why this lane composites real product pixels.

---

## What happens next

**Freeze V2.** `GROK_VIDEO_EDIT_PROMPT = GROK_VIDEO_EDIT_PROMPT_V2`. Identity + Polo-exclusion sentences stay byte-for-byte. No billed V3.

**Next engineering (Architecture C follow-on, already specified):**

```
raw Grok edited_clip (V2: f31bd0f2-…)
  → SAM-3 garment/region masks
  → composite onto original master (76fe7438-…)
  → deterministic brand layer: logo_zone, chest_band, sleeve_panel
  → face-restore safety net
```

Grok owns a plausible outfit + identity/scene. It does **not** own wordmark glyphs, stripe geometry, or sleeve-panel topology. Those are tracked real pixels from the flat product ref (`2a14a72b-e7de-4ecb-9c24-4142b672d175.jpg`), same split as `CURSOR_HANDOFF_brand_fidelity_v2.md` and `docs/VIDEO_SWAP_ARCHITECTURE.md` §3.5.

First build slice: **still-frame** logo + chest-band composite on a V2 hero frame **inside AVT** (existing `placeDetail` / `compositeLogoOntoVton`). Do not ad-hoc process frames in the agent sandbox. Do not un-stub `sleeve_panel` by guessing — manual keyframe first, same as logo.

**Paid-call verdict:** `skip`.
