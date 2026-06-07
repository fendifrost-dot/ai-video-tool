# Cursor Handoff — Structural Pivot to Segmentation + Regional Inpainting

## Why we're doing this

We just shipped your prompt-split + chain-reorder fixes. Both verified in the live recipe (stages = `flux_lora → leffa_lower_body → leffa_upper_body shirt → leffa_upper_body jacket → accessories_polish_seedream`), but the failing case still failed: jacket stage replaced the shirt with a hallucinated cropped streetwear top + a "StolenGirlfriend" chest stripe. Bottom-up chain order didn't help because each Leffa call still re-solves the full scene from its own latent prior. Layering literally doesn't survive the chain.

Text-side ceiling is reached. We need an architecture that preserves the body/identity/region constraints by NOT re-rendering the whole image each pass. ChatGPT's framing of the right architecture:

> "preserve identity while replacing segmented regions" instead of "generate me wearing clothes"

## Target architecture

New pipeline mode: **`lora_segmented_inpaint`** (or whatever you'd prefer to name it). Adds to CC's existing pipeline switch alongside `lora_idm_vton`, `lora_seedream`, etc. Don't remove the existing modes — this is a new option to A/B.

Flow:

1. **Canonical base.** FLUX-LoRA generates ONE identity-locked base photo. Same as Stage 1 today. This becomes the **immutable identity layer** — face, body, proportions, tattoos, glasses, all rendered once. It is never re-rendered later in the chain.
2. **Segmentation pass.** Run a human-parsing / segmentation model on the base photo to get masks for each clothing region: upper_body, lower_body, footwear, hair (preserve), face (preserve). This is the structural lock.
3. **Regional inpainting per garment.** For each picked wardrobe item, run an inpaint call that:
   - Takes the current canvas image as input
   - Takes the segment mask for that garment's region
   - Takes the garment reference photo (signed URL)
   - Takes a per-region prompt (the dimensions_description + relevant wardrobe_rules for that item)
   - Outputs a new image with ONLY that region redrawn, body / face / other regions identical
4. **Accessories micro-pass.** For glasses / jewelry, use a face-region mask (we already have this kind of narrow polish working — keep the new `jewelry_polish_seedream` you just shipped).
5. **Done.** No full-frame re-render at any point after step 1.

## API connections — what we have, what to choose

**Everything we need is on Fal, covered by the existing `FAL_API_KEY` secret. No new vendor signups, no new API keys.**

Models to evaluate (do a quick research pass first, pick the strongest for each role):

**For segmentation** (need a model that outputs per-clothing-region masks from a single person photo):
- `fal-ai/sapiens-segmentation` — Meta's Sapiens model, human-specific, returns body part + clothing masks. Likely the strongest single option.
- `fal-ai/sam-2` (Segment Anything 2) — general-purpose, would need text or point prompts to segment specific regions.
- `fal-ai/grounding-dino` + `fal-ai/sam-2` chain — text-prompted segmentation ("jacket", "pants"). More flexible but two API calls.
- `fal-ai/birefnet` — background removal / matting, not what we need.

Recommendation: try Sapiens-segmentation first. Fall back to Grounded-SAM if Sapiens doesn't give us per-clothing-type masks.

**For regional inpainting** (need to redraw a masked region given a reference garment + prompt):
- `fal-ai/flux-fill` — FLUX's official inpaint endpoint. Takes image + mask + prompt. Likely the best quality.
- `fal-ai/flux/dev/inpaint` — alternative FLUX inpaint endpoint.
- `fal-ai/sd-xl/inpainting` — SDXL inpaint, older but well-understood.
- `fal-ai/leffa/virtual-tryon` — what we're using now, NOT inpaint-aware (full-frame re-render).

Recommendation: FLUX-fill. If it doesn't accept a garment reference image as a conditioning input (it takes a text prompt natively), we may need to either:
- Use a Kontext-style call: `fal-ai/flux-pro/kontext/multi` with the mask + garment ref + base image, all as image inputs, with a text prompt naming what to do.
- Or pre-process: extract the garment from the product photo, paste it into the mask region as an init image, then refine with FLUX-fill.

Verify the actual request shape against Fal docs before committing.

**For accessories** (face-region polish for glasses):
- Keep what you just shipped (`jewelry_polish_seedream` via `fal-ai/bytedance/seedream/v4/edit`). Already working. Just feed it a face-region mask if Sapiens gives us one — otherwise the existing narrow-input approach.

## Code changes in CC

In `fendifrost-dot/fendi-control-center` / `supabase/functions/compose-look/index.ts`:

1. **Add helpers** (top of file, alongside existing `callFalSeedreamEdit`, `callFalLeffaVton`, etc.):
   - `callFalSapiensSegmentation(apiKey, imageUrl): Promise<{ masks: { upper_body, lower_body, footwear, hair, face, background } }>` — wraps the segmentation endpoint, returns named region masks as data URLs or signed URLs.
   - `callFalFluxFill(apiKey, baseImageUrl, maskUrl, garmentRefUrl | null, prompt, options): Promise<{ image_url }>` — wraps the inpaint endpoint. Garment ref may be passed as conditioning if the API supports it, otherwise as part of the prompt.

2. **Add pipeline mode**: `lora_segmented_inpaint`. New switch case in the existing pipeline branch. Reuses the existing FLUX-LoRA Stage 1 to produce the base image. Then runs segmentation. Then iterates wardrobe items in order (bottom → top → outerwear, same as Leffa chain), calling FLUX-fill per item with the appropriate mask and the item's reference URL + per-item dimensions_description/wardrobe_rules text. Final step: the accessories polish pass for glasses/jewelry (reuse the existing `jewelry_polish_seedream` you just shipped).

3. **Stages array**: log each step in `generation_metadata.stages` like the existing `lora_idm_vton` does. Should look like: `flux_lora → sapiens_segmentation → flux_fill_lower_body → flux_fill_upper_body_shirt → flux_fill_upper_body_jacket → jewelry_polish_seedream`.

4. **Cost tracking**: bump `cost_cents` per stage. Sapiens segmentation is ~$0.02. FLUX-fill is ~$0.05-0.10 per call. So per-look cost is roughly $0.10 (LoRA) + $0.02 (seg) + 3 × $0.07 (fill) + $0.06 (polish) ≈ $0.39. Higher than current $0.24 but the floor isn't expected to move much from here.

5. **Failure modes to handle**:
   - Sapiens returns empty/unusable masks → fall back to lora_idm_vton or surface error
   - FLUX-fill rejects garment-ref conditioning → either inline the garment via Kontext, or paste-then-refine
   - Mask dilation: probably need a small dilation kernel (~10-20px) on each mask before sending to fill, otherwise edges look sharp/cut-out. Fal might do this automatically — verify.

## AVT-side changes (likely none — but verify)

The new mode is server-side. AVT just needs to expose `lora_segmented_inpaint` in the pipeline dropdown in `LookComposer.tsx`. That's a one-line type/enum addition + a new option in the picker with a tooltip describing it ("Identity-locked base + segmentation + regional inpaint — most architecturally robust, slightly higher cost").

If the AVT proxy's request body to CC needs to pass any extra fields (e.g. per-garment overrides), add them — but in the simplest version, the existing payload (face/wardrobe/jewelry/recipe) should be enough.

## Smoke test target

After you push, hand back the SHAs. Claude will:
1. Trigger Lovable redeploys on both CC and AVT (terse one-liners only).
2. Run the failing-case composition: face + YSL jacket + YSL confetti viscose shirt + YSL slim low-rise jeans + multi-angle Cazals item, pipeline `lora_segmented_inpaint`.
3. Inspect `generation_metadata.stages` to confirm the segmentation + per-region inpaint chain ran.
4. Visual assessment: did the jacket render at canonical length over the shirt without crushing it? Did jeans survive? Did glasses stay clean?
5. Honest report.

## Constraints

- Lovable chat is for deploy/redeploy/update ONLY. Never code requests, never data updates — Lovable forks branches and scrambles state.
- All code edits via local commits + push to GitHub.
- Keep all existing pipeline modes working. `lora_segmented_inpaint` is additive.
- The .env deletion thing earlier was fine — same approach is fine here. Don't track new secrets in repo.

## Optional small spike (do this first if you want a cheap A/B)

Before sinking into the structural work, consider a 10-minute test:
- In CC, bump the URL cap on `lora_seedream` from 4 to 8.
- Run the same failing case with `lora_seedream` (single-pass Seedream Edit, not Leffa chain).
- If single-pass with 8 refs produces a meaningfully better composite than the Leffa chain, we might not need the segmentation refactor at all.
- Push as a separate small commit. Claude will smoke test both modes side-by-side.

If single-pass Seedream still fails the layering case, proceed with the full `lora_segmented_inpaint` build above.

## Status of the repo

Both AVT and CC are clean on main with no stray branches:
- AVT main: `0397dcf0f9` "Fix compose pipeline prompts and VTON garment order."
- CC main: `8082a92d60` "Consume split compose prompts and fix VTON chain order."

Async architecture is shipped. Identity preamble + wardrobe_rules + multi-angle gallery all work. Build on top of those.
