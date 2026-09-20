# Hero Frame — generative look-composite lane

**Grok-initiated · YSL Real Video #1.** Adds a *generative* look-composite path
to Hero Frame Studio, alongside the existing *garment-truth* swap.

## Two lanes, one Studio

| | Garment swap (truth) | Look composite (generative) |
|---|---|---|
| Input | captured hero frame **+ a real garment photograph** | captured hero frame (identity anchor) **+ text prompt** |
| Engine | `grok-image-garment-proxy` → xAI `/v1/images/edits` | `grok-image-look-composite` → xAI `/v1/images/edits` |
| What's preserved | repaints **only clothing pixels** (pixel-preserving) | identity of the person; wardrobe + scene are **generated** |
| `dependencyRole` in looks.json | `reference_image` | `look_composite` |
| Use | Look A / Look C (real YSL garments) | **Look B — White Ice** (no garment photo exists) |

The XAI key stays a **Lovable edge secret** (`XAI_API_KEY`) — never in the
frontend. Both lanes require a user JWT (`verify_jwt = true`).

## Pieces added

- `supabase/functions/grok-image-look-composite/index.ts` — edge function.
  Body: `{ artistId, identityPath | identityPaths[], identityBucket?, prompt,
  negativePrompt?, name?, projectId?, heroFrameSessionId?, candidateIndex?,
  model?, resolution? }`. Signs identity anchor(s), folds the negative into the
  single xAI prompt, calls xAI, stores the result to the `look-composites`
  bucket, and tracks an `artist_looks` row (`pipeline_used:
  grok_image_look_composite`, `composition_recipe_json.generative_look_composite
  = true`).
- `supabase/functions/_shared/lookCompositePrompt.ts` (+ test) — pure
  `composeLookCompositePrompt()` / `validateLookCompositeInput()`.
- `src/lib/queries/grokImageLookComposite.ts` — `applyGrokLookCompositeAndWait()`.
- Hero Frame Studio (`src/pages/HeroFrameStudioPage.tsx`) — a **Mode** toggle
  (section 2) switches between the two lanes; the generative lane (section 3)
  has a prompt + negative-prompt box, a Generate button, and Download / Approve.
- `supabase/config.toml` — `[functions.grok-image-look-composite] verify_jwt = true`.

## How to generate Look B — White Ice (B-hook1/2/3)

Look B is a `look_composite` — there is **no** YSL garment photograph, so it
must go through the generative lane. Prompts and identity anchors are already
authored:

- Prompts: `docs/treatments/ysl-ice-on.looks.json` → look id
  `ysl-look-b-white-ice` (`grokPrompt` + `negativePrompt`, `params.aspect =
  9:16`).
- Identity anchors (real $0 frames from the master):
  `~/Desktop/AVT_YSL_REAL_VIDEO_1/units/WARD/anchors/`
  - `anchor_B-hook1_t58s.jpg`
  - `anchor_B-hook2_t116s.jpg`
  - `anchor_B-hook3_t160s.jpg`

### In-app (signed in — project `764a63d2-93cd-44f3-905f-292f14ab2f51`)

For each B-hook anchor (hook1 → hook2 → hook3):

1. **Hero Frame Studio → section 1.** Either scrub the master to the anchor
   timecode (t58s / t116s / t160s) and **Capture hero frame**, or upload the
   matching `anchor_B-hook*.jpg` as the source frame. This becomes the identity
   anchor (`project-references` bucket).
2. **Section 2 → Mode → "Look composite (generative)".**
3. **Section 3.** Paste the Look B `grokPrompt` into **Prompt** and the
   `negativePrompt` into **Negative prompt**. Both already specify *9:16
   vertical, photoreal*.
4. **Generate look composite.** Grok returns a new 9:16 White-Ice hero of Fendi.
   The result lands in `look-composites` and an `artist_looks` row.
5. **Download** (B-hook{n}) and/or **Approve this hero** to gate it for Phase 2.

Repeat for hook2 and hook3 → **B-hook1 / B-hook2 / B-hook3**.

### Spend

Code work is **$0**. Each Grok gen is a paid image call (~$0.12/look, tracked as
`cost_cents` on the look row) and happens later in the signed-in app under the
project **$50** ceiling — log any smoke-test spend in `spend/LEDGER.csv`.

## What this does NOT do

No Treatment UX (#136–#143), no PR #37 resurrection, no weakening of proxy auth,
no XAI keys on disk / in the frontend, and no YSL hard-coding in AVT defaults —
the prompts live in the project's `looks.json`, not in app code.
