/**
 * Locked prompt for Grok Image-Edit full-outfit garment-truth lane (Hero Frame Studio).
 * See CURSOR_HANDOFF_grok_image_garment_lane_FINAL.md §5.
 *
 * The client always sends this prompt, so it overrides the copy in
 * supabase/functions/grok-image-garment-proxy/index.ts. Keep the two in sync —
 * the edge copy is the fallback for direct/server-side calls.
 *
 * v2 (pose + identity lock): the previous version led with construction
 * fidelity and described the target as "the outfit worn by the model", which
 * let Grok treat the on-model reference as a full re-render target — it
 * imported the model's face and stance (hands in pockets) onto the frame.
 * Role separation and the two hard locks now come first; garment fidelity is
 * scoped to the clothing only.
 */
export const GROK_GARMENT_TRUTH_PROMPT = `Clothing-replacement edit of <IMAGE_0>. This is NOT a re-render and NOT a new photograph — it is a local edit that repaints only the clothing pixels of an existing photo.

REFERENCE ROLES — do not mix them:
- <IMAGE_0> is the ONLY source of the person, his face, his body, his pose, the camera, the lighting, and the background.
- <IMAGE_1> (and <IMAGE_2> if present) is a GARMENT SWATCH ONLY. Take the clothing from it. Take NOTHING else from it — not the model, not the model's face, not the model's body, not the model's stance, not the model's background.

HARD LOCKS — these override every other instruction:
1. FACE / IDENTITY LOCK. The face in <IMAGE_0> must come through unchanged: same face, same beard, same skin tone, same head shape, same hairline, same expression, same head angle, and his own glasses. Do not regenerate, beautify, re-light, smooth, age, slim or re-draw the face. Do not copy the reference model's face or eyewear onto him. If any part of the face would change, leave that pixel as it is in <IMAGE_0>.
2. POSE LOCK. The body stays exactly as in <IMAGE_0>: same arm positions, same hand positions, same shoulder line, same torso twist, same stance, same head position, same crop and framing. Specifically: do NOT put his hands in his pockets, do NOT fold or raise his arms, do NOT move his hands off his thighs, do NOT shift his weight or change his footing. The reference model's stance is irrelevant — ignore it completely.
3. SCENE LOCK. Keep the exact background, camera angle, focal length, depth of field and lighting from <IMAGE_0>. Do not invent, extend, replace, blur or re-render any background. Do not add studio backdrops, props or shadows from the reference.

WHAT TO CHANGE — the clothing, and only the clothing:
Replace the clothes he is wearing with the complete outfit shown in the reference — jacket, shirt, tie, trousers and every worn piece, as one coherent look. Reproduce the garment construction exactly: collar shape and stand, stripe width/position/angle, zipper, buttons, hardware, pockets, seams, trim, fabric wash, texture and drape.

GARMENT STYLING — match the reference exactly:
The jacket must be worn CLOSED, fastened exactly as it is on the reference model — same zip/button height, same overlap, same closure hardware state. Do not leave it open, half-open or hanging loose. Collar, lapel and cuff configuration must match the reference garment. Style the closure and collar from the reference; take the body position from <IMAGE_0>.

EXCLUSIONS: exclude the reference model's glasses/eyewear — keep Fendi's own. Do not add accessories that are not in the reference outfit.

Everything outside the clothing region — face, hair, hands, skin, background — must remain the original <IMAGE_0> pixels.`;

/**
 * Swap prompt for the SAM-3 → Grok → restore PRIMARY lane (sam_grok_restore).
 *
 * Why this exists separately from GROK_GARMENT_TRUTH_PROMPT:
 * On xAI's /v1/images/edits, the truth prompt's preservation framing
 * ("this is NOT a re-render", "leave that pixel as it is", "must remain the
 * original <IMAGE_0> pixels") makes Grok NO-OP — it echoes the source outfit
 * back unchanged, so the subject's original clothing survives and the
 * downstream SAM-3 membership lock then faithfully composites that unchanged
 * garment. The result is no swap at all.
 *
 * This prompt LEADS with full-outfit replacement and DROPS the preservation /
 * pixel-lock / not-a-re-render language so Grok actually replaces the clothes.
 * Identity is NOT protected here — it does not need to be: in this lane the
 * deterministic face restore that runs after the swap re-imposes the subject's
 * real face, and grokOutfitLock composites strictly inside the SAM-3 clothing
 * mask. So the prompt is scoped to one job: dress the person in the reference
 * garment. Keep this in sync with the proxy fallback only if that lane changes.
 */
export const GROK_GARMENT_SWAP_LOCKED_PROMPT = `Full-outfit replacement on <IMAGE_0>. The person in <IMAGE_0> must NO LONGER be wearing any of his original clothes — discard his current outfit completely and dress him in the outfit shown in the reference instead.

REFERENCE ROLES — do not mix them:
- <IMAGE_0> is the person to re-dress. Keep his body, his stance, the camera, the framing and the background.
- <IMAGE_1> (and <IMAGE_2> if present) is a GARMENT SWATCH ONLY. Take the clothing from it and nothing else — not the reference model, not his face, not his body, not his stance, not his background.

WHAT TO DO — replace the entire outfit:
Remove every piece of clothing currently worn in <IMAGE_0> and put the complete outfit from the reference onto him — jacket, shirt, tie, trousers and every worn piece, as one coherent look. None of his original camo/clothing should remain visible.

GARMENT FIDELITY — reproduce the reference garment exactly:
Match collar shape and stand, stripe width/position/angle, zipper, buttons, hardware, pockets, seams, trim, fabric wash, texture and drape. The jacket must be worn CLOSED, fastened exactly as on the reference model — same zip/button height, same overlap, same closure hardware state. Do not leave it open, half-open or hanging loose. Collar, lapel and cuff configuration must match the reference garment.

EXCLUSIONS: exclude the reference model's glasses/eyewear. Do not add accessories that are not in the reference outfit.`;
