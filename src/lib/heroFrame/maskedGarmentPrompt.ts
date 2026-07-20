/**
 * Prompts for the MASKED GARMENT INPAINT lane (Hero Frame Studio primary lane).
 *
 * This is NOT the Grok prompt. GROK_GARMENT_TRUTH_PROMPT (grokGarmentPrompt.ts)
 * talks a full-frame re-render engine out of touching the face, pose and
 * background — it has to, because xAI's /v1/images/edits takes no mask and
 * repaints every pixel. That negotiation is the whole reason that lane still
 * ships a reconstructed face.
 *
 * This lane doesn't negotiate. Flux only ever SEES the masked region, and the
 * deterministic recomposite blends its output back under a feathered jacket
 * mask, so every pixel outside the mask is byte-identical to the capture by
 * construction. There is nothing to defend: no face lock, no pose lock, no
 * scene lock, no "keep the background" — the architecture already guarantees
 * all three. Spending prompt tokens on them only dilutes the one instruction
 * that matters, which is what the jacket looks like.
 *
 * So this prompt is a GARMENT DESCRIPTION, not a set of rules. The short
 * region reminder at the top exists only to stop flux from painting a second
 * head or a hand into the masked area at the mask boundary; everything after
 * it is construction detail for the Saint Laurent Track Jacket.
 *
 * Kept in sync with supabase/functions/_shared/maskedGarmentPrompt.ts (the edge
 * copy, which is the fallback when a caller sends no prompt). The client always
 * sends this one, so this file wins for anything routed through the UI.
 */

/** Positive prompt — what flux paints INSIDE the mask. */
export const MASKED_GARMENT_PROMPT =
  "Clothing only, inside the masked region only. " +
  "A Saint Laurent Track Jacket worn on the torso: cream off-white body, " +
  "navy contrast stripe running down each shoulder and sleeve, " +
  "'SAINT LAURENT' script embroidered across the chest, ribbed stand collar, " +
  "full-length zip worn closed, ribbed cuffs and hem, matte technical jersey " +
  "with natural fabric drape and soft folds. " +
  "Lighting, exposure and colour temperature match the surrounding photograph. " +
  "Fill the entire masked region with garment — no skin, no face, no hands, " +
  "no background, no second person.";

/**
 * Negative prompt. Only reaches models whose schema accepts it (flux-general);
 * flux-lora/inpainting silently has no negative-prompt field, which is one of
 * the reasons flux-general is the preferred engine for this lane.
 */
export const MASKED_GARMENT_NEGATIVE_PROMPT =
  "face, head, hair, eyes, glasses, sunglasses, cap, hat, hands, fingers, " +
  "orange pants, rust trousers, background, second person, duplicate torso, " +
  "open jacket, warped text, distorted logo, garbled lettering, " +
  "extra sleeves, extra collar, blurry, deformed";

/**
 * evf-sam text prompt for the GARMENT mask — the region flux is allowed to
 * repaint. Deliberately names only upper-body clothing: evf-sam is a
 * text-grounded segmenter, so naming the pants here is what would put them in
 * the mask. Head and hands are excluded a second time by the face-guard
 * subtraction below, belt-and-braces.
 */
export const MASKED_GARMENT_MASK_PROMPT =
  "the jacket and upper-body clothing worn on the torso and arms, sleeves, collar";

/**
 * evf-sam text prompt for the FACE GUARD — the protective second mask. Whatever
 * this matches is DILATED and SUBTRACTED from the garment mask before flux ever
 * sees it, so a garment mask that bled onto his jaw, cap brim, glasses or hands
 * is clipped back off. This is the safety layer, not the primary defence; the
 * primary defence is that the recomposite never writes outside the mask at all.
 */
export const MASKED_GARMENT_FACE_GUARD_PROMPT =
  "the person's head, face, beard, hair, cap, glasses, ears, neck and hands";
