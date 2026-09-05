# Grok Build anchor — xAI API reference-to-image research (2026-09-04)

**Date:** 2026-09-04 · **Author:** Cursor · **Spend:** $0 API · **Track:** RESEARCH ONLY  
**Inputs:** `docs/research/results/2026-09-04-grok-build/GROK_BUILD_CONSUMER_EXPERIMENT_2026-09-04.md`, `docs/handoffs/CLAUDE_LATEST.md` (rev 7 on `origin/main`), AVT image-edit wiring, docs.x.ai fetched this session.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[U]** unknown · **[R]** recommendation

## Research question

Is consumer Grok Build `imagine_reference_to_image` (source frame + garment refs → still) available as a **public xAI API** capability AVT can call?

## Answer (capability class)

| Classification | Statement |
|----------------|-----------|
| **VERIFIED** | Public API exposes multi-source still edit: `POST https://api.x.ai/v1/images/edits` with `images[]` (xor singular `image`). |
| **VERIFIED** | Current multi-image editing page: **up to five** source images; AR defaults to first input; `aspect_ratio` / `resolution` (`1k`\|`2k`) supported. |
| **OBSERVED** | Imagine overview / some third-party summaries still say “up to 3”; AVT code caps at **3** (`GROK_MAX_REFERENCE_IMAGES` / `slice(0,3)`). Ceiling conflict = treat **3 as safe**, 4–5 as **UNKNOWN** until a dry/reject probe. |
| **OBSERVED** | Consumer Build tool name `imagine_reference_to_image` does **not** appear as an API identifier. |
| **UNKNOWN** | Whether consumer Build uses the same model/backend/quality as `/v1/images/edits`. |
| **HYPOTHESIS** | Consumer tool ≈ API multi-image edits (same capability class; parity unproven). |

**Bottom line for ChatGPT:**  
**Capability class: VERIFIED YES.**  
**Same-as-consumer identity/quality: UNKNOWN** until one gated call.  
**Do not infer API availability solely from grok.com Build.**

---

## Endpoint / model [V]

| Item | Value |
|------|--------|
| Endpoint | `POST https://api.x.ai/v1/images/edits` |
| Multi-input | `images: [{ url \| file_id }, …]` |
| Prompt addressing | `<IMAGE_0>`, `<IMAGE_1>`, … |
| Models | `grok-imagine-image-quality` ($0.05 listed), `grok-imagine-image-2.0` ($0.04), `grok-imagine-image` ($0.02) |
| AVT default | `grok-imagine-image-quality` |
| Mask / seed / strength | **Not** in public edit schema (pose conditioning absent) |

---

## Existing AVT reuse [V]

| Surface | Role |
|---------|------|
| `supabase/functions/_shared/xaiImageEdits.ts` | `callXaiImageEdits` / `Detailed` |
| `grok-image-garment-proxy` | Production hero lane: IMAGE_0 scene, IMAGE_1+ garment refs |
| `grok-resolution-test` | Isolated billed harness (prefer for probe; `dryRun` first) |
| `src/lib/heroFrame/grokGarmentPrompt.ts` | Locked garment construction prompt |
| Wardrobe ref picker | On-model then flat |

**Do not** contaminate Architecture C still-repair, V2/V3 prompts, or video proxies for this probe.

---

## Smallest isolated probe (DO NOT EXECUTE) [R]

**Conceptual cell**

- Source: clean still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
- Refs: on-model + flat (EDIT-R4 product paths)
- Instruction: garment construction (wearer's-left wordmark, band, zip, collar, pockets/cuffs, …) + identity prose locks
- Lane: research-only (`grok-resolution-test` or curl + signed URLs) — **not** production Arch C

**Proposed envelope**

```json
{
  "model": "grok-imagine-image-quality",
  "prompt": "<IMAGE_0> identity/pose/scene; <IMAGE_1>/<IMAGE_2> garment refs only; replace outfit with exact Saint Laurent mastic track jacket construction…",
  "images": [
    { "url": "<signed_still_2aa1a44c>" },
    { "url": "<on_model_ref>" },
    { "url": "<flat_ref>" }
  ],
  "aspect_ratio": "9:16",
  "resolution": "2k",
  "response_format": "url"
}
```

Optional A/B: same body, `model: "grok-imagine-image-2.0"`.

| Item | Estimate | Label |
|------|----------|--------|
| Listed output (quality) | $0.05 | **V** |
| Edits bill input + output (docs) | ~$0.20 if 3 inputs + 1 output each count | **H** |
| Conservative 1–2 call budget | ≤ $0.25–$0.40 | **R** |

**Acceptance (if later authorized):** construction checklist vs flat ref; identity/pose honesty (consumer regenerated — score as such); persist model, image order, prompt hash, cost ticks. Architecture C may use a strong construction still as an **anchor candidate** only; final product still requires original-master reconstruction.

**Code required before probe?** **NO** for a dry-run URL assembly + one approved call via existing harness. Optional Class A: still-id override on resolution-test — not required.

---

## Risks vs consumer Grok Build [O]/[H]

| Risk | Label |
|------|--------|
| API still regenerates identity/pose (prose locks only) | **H** (strong prior) |
| Consumer multi-step fix loop ≠ one API call | **O** |
| Model mismatch (Build internal vs quality/2.0) | **U** |
| Max-ref doc drift (3 vs 5) | **O** |
| Multi-input billing surprise | **U** |
| Treating consumer still as production truth | forbidden by project rule |

**Architecture rule:** This does **not** replace Architecture C. Hypothesis only:

> reference-to-image may be a better **garment anchor** generator → then deterministic repair → video transform → temporal → SAM-3/original-master composite.

---

## Hard gates [V]

No paid call executed · no V3 activation · no Arch C production change · no sleeve/temporal · no CC edits.
