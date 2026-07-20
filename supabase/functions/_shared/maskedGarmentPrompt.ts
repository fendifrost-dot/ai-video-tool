/**
 * Prompt builder for the MASKED GARMENT INPAINT lane.
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH. It used to have a `src/` twin that
 * the Hero Frame Studio sent on every request; the twin is gone. Two copies of a
 * prompt is exactly how the lane ended up painting a Saint Laurent track jacket
 * onto a run whose selected garment was camouflage — nobody edits both.
 * jacket-inpaint-proxy derives the prompts from the wardrobe row it already
 * loads, and records them verbatim on the look's recipe, so provenance is kept
 * without the client having to carry a hardcoded string.
 *
 * ---------------------------------------------------------------------------
 * THE TWO PROMPTS DESCRIBE DIFFERENT GARMENTS. Do not derive one from the other.
 * ---------------------------------------------------------------------------
 *
 *   maskPrompt  → grounds evf-sam on what the subject is WEARING IN THE FRAME
 *                 RIGHT NOW (the full outfit by default). It is the region to
 *                 be replaced. It must stay source-descriptive and look-agnostic,
 *                 because the worn clothing is NOT the target look. Naming the
 *                 target here on a mismatched clip grounds on nothing.
 *
 *   prompt      → describes the TARGET garment flux paints inside the mask. This
 *                 is the one that must track the selected wardrobe item.
 *
 * The lane does not negotiate about face, pose or background the way the Grok
 * prompt has to. Flux only ever SEES the masked region and the deterministic
 * recomposite blends its output back under a feathered mask, so every pixel
 * outside the mask is byte-identical to the capture by construction. Spending
 * prompt tokens on locks that the architecture already guarantees only dilutes
 * the one instruction that matters, which is what the garment looks like.
 */

export type GarmentFeatureLike = {
  label?: string | null;
  feature_type?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

/**
 * evf-sam text prompt for the CLOTHING mask — the region flux may repaint.
 *
 * Canonical product scope is the ENTIRE OUTFIT (Grok is strongest on full
 * looks). Describe clothing by body coverage and name no colour, brand or
 * material — evf-sam is text-grounded and every adjective is a chance to ground
 * on nothing. Head and hands are excluded again by the face-guard subtraction.
 */
export const MASK_PROMPT_FULL_OUTFIT =
  "all clothing worn on the body — tops, jackets, shirts, trousers, pants, " +
  "shorts, skirts, socks and shoes — covering torso, arms, hips, legs and feet";

/** Upper-body-only override (legacy / metadata_json.mask_prompt experiments). */
export const MASK_PROMPT_UPPER_BODY =
  "the upper-body clothing worn on the torso and arms, sleeves, collar";

/** Lower-body equivalent, for wardrobe_bottom / wardrobe_footwear features. */
export const MASK_PROMPT_LOWER_BODY =
  "the trousers and lower-body clothing worn on the hips, legs and knees";

/** Default mask — full outfit. */
export const MASKED_GARMENT_MASK_PROMPT = MASK_PROMPT_FULL_OUTFIT;

/**
 * evf-sam text prompt for the FACE GUARD — the protective second mask. Whatever
 * this matches is DILATED and SUBTRACTED from the garment mask before flux ever
 * sees it, so a garment mask that bled onto his jaw, cap brim, glasses or hands
 * is clipped back off. This is the safety layer, not the primary defence; the
 * primary defence is that the recomposite never writes outside the mask at all.
 *
 * Garment-independent by nature — it describes the person, not the clothes.
 */
export const MASKED_GARMENT_FACE_GUARD_PROMPT =
  "the person's head, face, beard, hair, cap, glasses, ears, neck and hands";

/**
 * Negative prompt. Only reaches models whose schema accepts it (flux-general);
 * flux-lora/inpainting has no negative-prompt field, which is one of the reasons
 * flux-general is the preferred engine for this lane.
 *
 * Kept GARMENT-AGNOSTIC on purpose. The old copy listed "orange pants, rust
 * trousers" — artefacts of one specific source clip, which is meaningless
 * ballast on every other clip and actively wrong if a future look wants rust
 * trousers. Anything genuinely garment-specific belongs in the wardrobe row's
 * `metadata_json.negative_prompt`.
 */
export const MASKED_GARMENT_NEGATIVE_PROMPT =
  "face, head, hair, eyes, glasses, sunglasses, cap, hat, hands, fingers, " +
  "background, second person, duplicate torso, " +
  "warped text, distorted logo, garbled lettering, " +
  "extra sleeves, extra collar, blurry, deformed";

/** Region scaffolding — stops flux painting a second head or hand at the mask edge. */
const REGION_PREFIX = "Full outfit only, inside the masked clothing region only. ";

const REGION_SUFFIX =
  " Lighting, exposure and colour temperature match the surrounding photograph. " +
  "Fill the entire masked clothing region with the complete look — no skin, no face, " +
  "no hands, no background, no second person.";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function isLowerBody(featureType?: string | null): boolean {
  return featureType === "wardrobe_bottom" || featureType === "wardrobe_footwear";
}

/**
 * The evf-sam mask prompt for this run.
 *
 * Resolution order:
 *   1. `metadata_json.mask_prompt` — an explicit per-garment override, for the
 *      rare source frame where the generic region phrase grounds badly.
 *   2. body-region defaults only when metadata asks for a partial swap
 *      (`mask_scope: "upper" | "lower"`). Otherwise full outfit.
 *
 * NOTE the label is deliberately NOT consulted. The label names the TARGET
 * look; the mask must ground on the SOURCE clothing. See the header.
 */
export function buildMaskPrompt(feature: GarmentFeatureLike): string {
  const override = str(feature.metadata_json?.mask_prompt);
  if (override) return override;
  const scope = str(feature.metadata_json?.mask_scope);
  if (scope === "upper") return MASK_PROMPT_UPPER_BODY;
  if (scope === "lower" || isLowerBody(feature.feature_type)) return MASK_PROMPT_LOWER_BODY;
  return MASK_PROMPT_FULL_OUTFIT;
}

/**
 * The flux positive prompt — a description of the TARGET garment.
 *
 * Resolution order:
 *   1. `metadata_json.garment_prompt` — a fully authored prompt, used verbatim
 *      (no scaffolding added; the author owns the whole string).
 *   2. `metadata_json.garment_description` + label, wrapped in the region
 *      scaffolding. This is where a rich, art-directed description belongs.
 *   3. label alone, wrapped in the scaffolding. Always available —
 *      `character_features.label` is NOT NULL — so this function can always
 *      produce a prompt that names the garment the user actually picked.
 *
 * The IP-Adapter reference (a product still, or on the guarded-Grok lane a full
 * Grok render of him already wearing the garment) carries the fidelity that text
 * cannot. This prompt's job is to name the right thing, not to describe every seam.
 */
export function buildGarmentPrompt(feature: GarmentFeatureLike): string {
  const authored = str(feature.metadata_json?.garment_prompt);
  if (authored) return authored;

  const label = str(feature.label) ?? "the outfit";
  const description = str(feature.metadata_json?.garment_description);
  const scope = str(feature.metadata_json?.mask_scope);
  const region =
    scope === "lower" || isLowerBody(feature.feature_type)
      ? "worn as the lower-body garment"
      : scope === "upper"
        ? "worn as the upper-body garment"
        : "worn as a complete outfit (all clothing visible on the body)";

  const body = description
    ? `${label} ${region}: ${description}`
    : `${label} ${region}, reproduced exactly as in the reference image — same ` +
      "colours, patterns, materials, construction, closures and trim across the " +
      "full look, with natural fabric drape and soft folds.";

  return `${REGION_PREFIX}${body}${REGION_SUFFIX}`;
}

/** Per-garment negative prompt, falling back to the garment-agnostic default. */
export function buildNegativePrompt(feature: GarmentFeatureLike): string {
  return str(feature.metadata_json?.negative_prompt) ?? MASKED_GARMENT_NEGATIVE_PROMPT;
}

/** All three prompts for a wardrobe feature, in one call. */
export function buildMaskedGarmentPrompts(feature: GarmentFeatureLike): {
  prompt: string;
  maskPrompt: string;
  negativePrompt: string;
} {
  return {
    prompt: buildGarmentPrompt(feature),
    maskPrompt: buildMaskPrompt(feature),
    negativePrompt: buildNegativePrompt(feature),
  };
}
