# Brief for Cursor — AVT Compose Pipeline Audit

## What this app is

**AI Music Video Production OS** — a virtual production system for music videos. The first shipped capability is the **Looks Composer**: pick a face, wardrobe items, accessories, locations, props from a library; generate an identity-locked photo of the artist wearing the outfit. Downstream goal is to use these locked looks as character refs for video generation (Runway, Veo, Pika, Higgsfield).

Two repos:
- **AVT** — `fendifrost-dot/ai-video-tool` — frontend + edge function proxy (`compose-look-proxy`).
- **CC** — `fendifrost-dot/fendi-control-center` — pure Fal orchestrator edge function (`compose-look`).

## The pipeline

User picks: face + wardrobe items + accessories + (optional location/props) + a pipeline mode in the composer UI. AVT proxy resolves features, signs URLs, builds `base_prompt` + `compose_prompt`, calls CC asynchronously. CC orchestrates Fal calls and writes the result back via a callback URL.

Pipelines available:
1. `auto`
2. `lora_seedream` — FLUX-LoRA generates base photo → Seedream v4 Edit overlays wardrobe
3. `seedream_only` — Seedream-only edit pipeline
4. `kontext_multi` — FLUX Kontext multi-reference
5. `lora_idm_vton` — FLUX-LoRA base → **Leffa** (`fal-ai/leffa/virtual-tryon`) chained per garment with `upper_body` / `lower_body` category routing → Seedream "accessories polish" pass to apply glasses/jewelry that VTON skips

`lora_idm_vton` is the newest and the most promising for garment fit, but composites are still inconsistent.

## What we built around the prompts

`buildIdentityPreamble` in `supabase/functions/compose-look-proxy/helpers.ts` compiles a long preamble from the artist's `identity_profile_json`:
- `body` (softened to "lean athletic, broad shoulders, proportionate torso")
- `body_measurements` (Fendi's actual inches + `proportion_summary` for 7.5-head-tall human anatomy)
- `eyewear` ("Cazal MOD octagonal aviator frames... clear prescription lenses, not tinted, never sunglasses")
- `tattoos` — name list, but only emitted to **base_prompt**, stripped from **compose_prompt** to keep Seedream from painting them on the jacket
- `continuity_rules`
- `wardrobe_rules` — a generic ruleset compiled from a jsonb object: `never_cropped`, `default_jacket_length`, `default_sleeve_length`, `garment_closure`, `outfit_completion_strict`, `never_midriff`, `reference_photo_caveat`, etc.
- A framing block ("full-body or upper-body, head 1/7.5 of total height, avoid sunglasses styling, avoid editorial crops")
- A LOCKED ATTRIBUTES tail with explicit eyewear lock
- An anti-hallucination cue ("Do not add any tattoos, logos, text, or graphic prints to clothing.")
- A "CRITICAL: glasses must have CLEAR prescription lenses..." cue appended to compose_prompt

Per-wardrobe-item `dimensions_description` exists on `character_features` and is concatenated into compose_prompt as a "Garment fit details:" block. Example for YSL bomber: *"Full-length men's bomber/chore jacket. Hem hits 4-5 inches below the natural waist. Sleeves measure 27 inches end-to-end..."*

## What's working

- Identity (face, beard, build, head-to-body ratio): consistent and recognizable
- Glasses (Cazal frames with clear lenses): clean when the polish pass runs
- Single-garment composites with `lora_idm_vton` (jacket alone, shirt alone, pants alone): each renders correctly in its own test
- Async architecture (look_id returned <1s, polling, callback handoff): solid

## What's NOT working

The combination case. **Jacket + pants + shirt + glasses in one composition has never rendered correctly all together.** Recent regression: jacket-on-top-of-shirt rendered the jacket as a crop-top with short sleeves, even though the jacket-alone test in the same session had it at hip length with full sleeves.

Patterns we've observed across runs:
- Single-garment tests: usually correct
- Multi-garment tests: garments interfere — jacket loses length when layered on a shirt, pants render correctly but Seedream sometimes invents an extra outerwear layer
- Glasses: tinted/sunglasses regression keeps coming back despite the explicit clear-lens cue at multiple positions in the prompt
- Bare midriff under open jackets when no inner top is picked (outfit_completion_strict in DB but model ignores)

## Hypothesis I want you to verify

**The wardrobe_rules and dimensions_description text live in the AVT proxy's `compose_prompt`, but I'm not sure Leffa actually consumes that text the way Seedream does.**

Leffa's API (verify against `https://fal.ai/models/fal-ai/leffa/virtual-tryon/api`) takes a `human_image_url`, a `garment_image_url`, a `category`, and (possibly) a `description` text field. Each Leffa call is per garment. The "compose_prompt" we built holds all the rules but it's only used by Seedream — for the polish pass at the end of the chain.

If Leffa is overlaying each garment with only its own visual prior (no text guidance), then:
- The "no crop, never midriff, default to canonical length" rules never reach the actual garment-overlay step
- That explains the crop-top regression on layered jackets — Leffa's stock prior for "jacket" is fashion-cropped
- And explains the sunglasses regression when glasses come from the polish pass and the polish pass is fighting Seedream's editorial prior

## Where to look in the code

In AVT repo:
- `supabase/functions/compose-look-proxy/index.ts` — proxy handler, builds compose_prompt, fires CC, callback
- `supabase/functions/compose-look-proxy/helpers.ts` — `buildIdentityPreamble`, prompt assembly
- `supabase/functions/compose-look-callback/index.ts` — handles CC's completion ping

In CC repo (`fendi-control-center`):
- `supabase/functions/compose-look/index.ts` — main orchestrator with `callFalLeffaVton`, `callFalSeedreamEdit`, `callFalFluxLora` helpers, and the `lora_idm_vton` pipeline switch
- `supabase/functions/compose-look/helpers.ts` — prompt formatters

## Specific questions to answer

1. **Does `callFalLeffaVton` pass any prompt/description text to Leffa, or only the two image URLs + category?** If text is passed, is it the full compose_prompt or just the per-item dimensions_description?

2. **How does the chained Leffa call structure handle multi-garment composition?** When jacket is overlayed on top of a shirt result, does Leffa see the wardrobe_rules at all?

3. **Is there a better way to inject our text rules into Leffa's call**, or does Leffa fundamentally ignore text and only respond to the human_image + garment_image priors?

4. **Are there higher-quality VTON alternatives on Fal that DO honor text-side rules** (catVTON, OOTDiffusion, fashion-vae)? Test C with bottoms is the only test where Leffa's category routing was load-bearing — if a different model fits the use case better, we should consider it.

5. **Is the Seedream polish pass adding value or causing regressions?** It's how we restore the Cazals after VTON (which doesn't touch the face), but it might also be the regression vector for the crop-top jacket via its own prior.

6. **Architectural sanity check**: are we over-engineering this with a chained per-garment pipeline when a single-pass model (Wan2.1, video generation models, or a fashion-specific multi-garment VTON) could do it all in one shot?

7. **Code review** of the prompt builder, the Leffa wrapper, the async callback flow, and the multi-angle reference handling. Is there obvious dead weight, foot-guns, or simpler shapes I missed?

## Constraints

- Lovable Cloud manages both Supabase projects (AVT and CC). No direct Supabase dashboard access. All schema/secret changes go through Lovable chat. Code changes go via GitHub REST.
- Lovable cannot push code; any "code apply" request to Lovable forks branches or commits routeTree.gen.ts churn. So all code edits must come from our side.
- Fendi (the user) doesn't own most of the wardrobe items — they're brand product photos. The system must work with cropped product shots, not require on-body references per item.
- Cost discipline: each look generation is $0.09 (Seedream) to $0.20 (VTON chain + polish). Iteration loop is expensive.

## What I want from you

A frank read on the audit questions above plus any other red flags in the code. Prioritize: which 2-3 changes would most likely make the combined-outfit case work consistently?
