# Brief for ChatGPT — AI Music Video Production OS, Compose Pipeline Stuck on Multi-Garment Composites

## The product

I'm building an **AI Music Video Production OS** — a virtual production system designed to take a song from a phone recording to a fully produced music video using AI models. The first shipped capability is the **Looks Composer**: I pick a face, wardrobe items, accessories, location, props from a library, and the system generates an identity-locked photo of me wearing the outfit. Those locked looks are intended to become character references for video generation downstream (Runway, Veo, Pika, Higgsfield).

The whole point is that I want to **try on outfits I don't own** — pull a jacket from a brand's website, pair it with pants from another brand, see myself wearing the combination on-screen.

## The architecture today

Two backend pieces:
- **AVT (AI Video Tool)** — frontend + an edge function "proxy" that handles auth, feature resolution, prompt building, and async result polling
- **CC (Control Center)** — pure orchestrator edge function that calls Fal AI models

Both deployed via Lovable Cloud (managed Supabase). Frontend is React + TanStack Router. Edge functions are Deno.

Pipeline modes I can pick in the UI:
1. `lora_seedream` — FLUX-LoRA trained on my face generates a base photo, Seedream v4 Edit overlays wardrobe via image editing
2. `seedream_only` — Seedream-only, no LoRA step (cheapest)
3. `kontext_multi` — FLUX Kontext with multiple reference images
4. **`lora_idm_vton`** — newest, two stages: FLUX-LoRA generates the base photo, then Leffa virtual-tryon (`fal-ai/leffa/virtual-tryon`) is called *per garment* with explicit upper_body / lower_body category routing, chained so each garment overlay feeds into the next. Final step is a Seedream "accessories polish" pass to apply glasses since VTON doesn't touch the face.

`lora_idm_vton` is the most promising for garment fit but doesn't compose multiple garments cleanly.

## What we built to fight the model's defaults

I have a deep `identity_profile_json` on my artist row:
- Body description (lean athletic build, broad shoulders, proportionate torso)
- Body measurements in inches (torso 20.5", arms 27.25", legs 34", waist 34", neck 15", shoe US 11) plus a `proportion_summary` for 7.5-head-tall human anatomy
- Eyewear description (Cazal MOD octagonal aviator frames, gold detailing on black acetate, clear prescription lenses NOT tinted NOT sunglasses)
- Tattoos (FENDI script, Modest Bear, Blackhawks logo, Warrior Blood — preserved on skin, never on clothing)
- Continuity rules (beard always connected, glasses always on, etc.)
- **wardrobe_rules** — a generic ruleset jsonb compiled into the prompt: `never_cropped`, `default_jacket_length`, `default_sleeve_length`, `garment_closure` (all closurable garments rendered closed by default), `outfit_completion_strict` (missing top → default tee, missing bottom → default jeans, NEVER bare chest, NEVER midriff), `reference_photo_caveat` (product photos may be cropped — extend to canonical length regardless)

The proxy compiles all this into a `base_prompt` (Stage 1 input) and a `compose_prompt` (Stage 2 input, with tattoo names stripped to avoid Seedream painting them on clothing).

Per-item `dimensions_description` on each wardrobe item gets concatenated into compose_prompt as a "Garment fit details:" block.

## What actually works

- Identity locks well — the LoRA produces a recognizable face, beard, build, head/body proportions
- Single-garment composites: jacket alone, shirt alone, pants alone each render correctly
- Clear-lens Cazal glasses: clean when the Seedream polish pass runs
- Async UX: click Generate → look_id returned in <1s, UI polls until complete, completion surfaces with toast and image
- Tattoo containment: no longer painted onto jacket fabric as graphics

## What doesn't work

**The combined-outfit case has never rendered correctly all together.** Jacket + pants + glasses in a single composition consistently fails one or more of:
- Jacket regresses to a crop-top short-sleeve when layered over a shirt
- Pants render correctly in lower_body but the model invents an extra outerwear layer
- Glasses regress to tinted/sunglasses despite multiple explicit clear-lens cues
- Bare midriff under open jackets when no inner top is picked (outfit_completion_strict in the prompt but model ignores)
- Multi-garment chains cause unpredictable interactions where prior fixes regress

We've spent a long session iterating on text-side fixes (preamble structure, position, repetition, negative cues, anti-hallucination blocks, etc.). Each fix helps in isolation but they don't compose. We hit a real ceiling on Seedream's text adherence; switched to VTON (Leffa) for better garment fit; but Leffa might not consume our text rules at all (just image inputs), so the chain has gaps.

## Hypotheses I have

1. **Leffa is ignoring our text rules** — its API likely only takes image inputs + category, so the wardrobe_rules / dimensions_description we built are effectively only consumed by the Seedream polish pass at the end. The actual garment overlay happens without text guidance, so Leffa defaults to its own fashion-cropped silhouette priors.

2. **Chained per-garment calls don't preserve constraints** — each Leffa call sees only "person image + garment image + category." The "person image" coming into the second Leffa call (jacket) is the output of the first (shirt). At no point does Leffa know "this person should not have a cropped jacket on top of this shirt." Each call optimizes locally.

3. **The polish pass is fighting itself** — Seedream's pass to add glasses inherits a "fashion-editorial" prior that brings back cropping and tinted lenses. We're using one tool to fix another tool's omission.

4. **The conceptual mismatch** — VTON is built for "person + ONE garment → person in garment." We're trying to use it for "person + MULTIPLE garments + accessories + identity preservation + style rules." That's not the problem VTON is designed for.

## What I want from you

1. **Strategy critique** — am I architecturally over-engineering this? Is there a simpler shape (single-shot multi-garment VTON, fashion-specific diffusion fine-tune, dedicated stylist model) that handles "person + full outfit" natively?

2. **Better model alternatives** — what are the state-of-the-art models or services that big brands (Farfetch's Wanna, Zeekit/Walmart, Doppl/Google, others) use for try-on with multi-garment outfit assembly? Is there an open model that's measurably better than IDM-VTON / Leffa for this case?

3. **Fashion-text-conditioning approaches** — research-grade work like StableVITON, OOTDiffusion-text, CatVTON, IMAGDressing-v1 that explicitly support text prompts for garment behavior. Should we move off Leffa entirely?

4. **Pipeline restructure ideas** — would it be smarter to:
   - Do ALL wardrobe overlay in a single Seedream-style edit call with everything in one prompt (despite Seedream's text-adherence ceiling)?
   - Use a 3D body model + garment dressing layer (CLOTH3D-style)?
   - Train a custom fashion LoRA on top of FLUX?
   - Switch entirely to a fashion-vae / fashion-specific diffusion model where text rules are stronger?

5. **The video step** — eventually the locked look images get used to drive video generation (pose-driven character animation with Wan2.1, AnimateAnyone, or similar). Does the current approach poison the downstream by encoding too much identity into the wrong stage?

6. **Realistic feasibility check** — given everything above, is it actually possible today to consistently render "this exact face + this exact jacket + this exact pant + these exact glasses" with cropped product photos as wardrobe input? Or are we trying to solve a problem that requires either custom training, on-body references, or a model that doesn't exist yet at production quality?

## Constraints

- Solo developer, working with Claude as the build agent
- Cost-sensitive: $0.09–$0.20 per look generation, longer iteration loops compound costs
- Wardrobe is brand product photography only — I do NOT have access to on-body shots of every garment
- Fal AI is the primary inference platform; Replicate is acceptable; can spin up dedicated infra if it's the unlock
- Lovable Cloud manages Supabase deployments; I can push code via GitHub REST but not via Lovable's chat (it forks branches)

## What success looks like

A single composition (face + jacket + pants + accessories + glasses) renders correctly with:
- Jacket at canonical length (hem at hip, full sleeves to wrist, closed/buttoned)
- Pants on lower body, correct length
- Glasses with clear lenses (not tinted, exact frame style)
- Identity recognizable
- No bare midriff, no hallucinated patches/text, no model fashion-crop bias

Consistently. Not "got lucky once in five tries."

If that's not achievable with current models, I need to know that honestly so I can decide whether to fine-tune, restructure, or shift the product.
