# Look Generation Contract

**Status:** mechanism (generic, project-agnostic). **Lane wired:** `grok-image-look-composite`.
**Provenance:** Grok-initiated · YSL Real Video #1 (2026-09-19).

A repeatable, testable mechanism that any AVT look-generation lane can reuse so it
**cannot** silently ship the failure modes that wasted paid gens: close-up
"car-selfie" garbage, cropped-at-the-waist wardrobe shots, bare legs, warped
logos, wrong aspect. Framing is now a **typed input**, framing constraints and
protective negatives are **derived mechanically**, and every output passes a
**deterministic QA gate that fails closed** before it can be marked a success.

There is **no YSL-specific string anywhere in this mechanism.** Project-specific
prompts stay in the caller / treatment; the contract only supplies generic
framing scaffolding.

---

## 1. Shared input schema

`supabase/functions/_shared/lookGenerationContract.ts` — `LookGenerationInput`:

```ts
type LookGenerationInput = {
  identityPaths: string[];   // WHO — identity anchor storage path(s). >= 1.
  garmentPath?: string | null; // WHAT — optional garment/look reference still.
  prompt: string;            // the look, wardrobe, scene. required.
  negativePrompt?: string | null; // caller negatives, merged with defaults.
  aspect?: string;           // "W:H". default "9:16".
  framing?: "full_body" | "hero" | "broll"; // default "full_body".
};
```

**Default framing for wardrobe looks = `full_body`** (head-to-toe, feet visible).
B-roll opts into crop with `framing: "broll"`.

## 2. Prompt composer (framing injection)

`composeLookGeneration(input)` returns `{ aspect, framing, positivePrompt,
negativePrompt, promptSent }`. It **mechanically**:

- injects a framing sentence into the positive prompt:
  - `full_body` → head-to-toe, feet near the bottom edge, floor visible, full
    headroom, at the requested aspect;
  - `hero` → waist-up hero portrait at the requested aspect;
  - `broll` → **no** injection (opt-in crop).
- merges the caller's negatives with **framing-default negatives** (deduped,
  caller order first):
  - `full_body` defaults include: close-up, headshot, cropped face, cropped at
    the waist/knees, cut-off legs, feet out of frame, bare legs, exposed thighs,
    warped logo, distorted text, extra limbs;
  - `hero` defaults are lighter (allow crop) but still forbid extreme close-up /
    cropped face / warped logo / distorted text;
  - `broll` adds none.
- folds the merged negatives into a single `Avoid: …` clause (`promptSent`) for
  one-prompt engines like xAI `/v1/images/edits`, which has no separate
  negative-prompt field.

The composer is **pure and dependency-free** — it is unit-tested with vitest and
imported directly by the Deno edge function.

## 3. Output QA gate (fails closed)

`supabase/functions/_shared/lookQaGate.ts` — `evaluateLookQa(metrics)` runs
deterministic checks and returns `{ ok: true }` or `{ ok: false, reasons: [...] }`
with **machine-readable reasons**. Policy (thresholds) is separated from
measurement — every lane feeds the same gate whatever tool produced the metrics.

| check | trigger | reason | threshold |
|-------|---------|--------|-----------|
| aspect | always | `aspect` | \|actual − expected\| / expected ≤ `ASPECT_TOLERANCE` (0.12), expected default 9:16 |
| close-up | when a `faceBox` is supplied | `close_up` | faceBox.height / height ≤ `FACE_COVERAGE_MAX` (0.45) |
| feet coverage | `full_body` + `feetNearBottomScore` supplied | `cropped_legs` | score ≥ `FEET_MIN_SCORE` (0.5) |
| dimensions | always | `invalid_dimensions` | width, height > 0 |

The gate never guesses: the close-up / feet checks only run when a detector
supplies `faceBox` / `feetNearBottomScore`. This keeps the gate deterministic and
avoids adding a heavy ML dependency to the edge runtime.

## 4. How it is wired into `grok-image-look-composite`

1. Accepts `framing`, `aspect`, `garmentPath` in the request body (all optional).
2. Composes the prompt via `composeLookGeneration` → `promptSent`; records
   `framing`, `aspect`, merged `negative_prompt`, `garment_path` on the look's
   `composition_recipe_json`.
3. After xAI returns bytes, reads real pixel dimensions with
   `readImageDimensions` (`_shared/imageDimensions.ts`) and runs
   `evaluateLookQa` (aspect check live; face/feet checks skipped — no in-edge
   detector).
4. **Fails closed:** on QA failure the look is marked `status: "failed"` with
   `error_message: "qa_failed: <reasons>"` and `generated_image_url` /
   `generated_storage_path` left **null**, so no UI presents it as a downloadable
   success. The artifact is still uploaded and its path stored at
   `generation_metadata.qa_artifact_path` for human inspection.

## 5. Adopting the contract in other lanes

- **Garment-truth** (`grok-image-garment-proxy`): pass `framing: "broll"` (the
  source photo already fixes the crop) to still get the protective negatives
  merged, then reuse `evaluateLookQa` on the output. The locked pixel-preserving
  prompt is unaffected.
- **Compose / Virtual Sample**: build a `LookGenerationInput` with
  `framing: "full_body"` for wardrobe looks and run the same gate before
  enabling download.
- **Face / feet enforcement**: when a lane has a face detector, pass its box as
  `faceBox` (pixels) and a `feetNearBottomScore` (0..1) — the `close_up` and
  `cropped_legs` checks activate automatically with no code change.

## 6. Tests

- `supabase/functions/_shared/lookGenerationContract.test.ts` — framing
  injection, negative merge/dedupe, aspect parsing, per-framing behaviour.
- `supabase/functions/_shared/lookQaGate.test.ts` — aspect pass/fail (with
  synthetic PNG fixtures decoded through the real dimension reader), close-up
  fail / full-body pass, feet coverage, accumulated reasons.

Run: `npx vitest run supabase/functions/_shared/lookGenerationContract.test.ts supabase/functions/_shared/lookQaGate.test.ts`.
Deno typecheck: `deno check supabase/functions/grok-image-look-composite/index.ts`.
