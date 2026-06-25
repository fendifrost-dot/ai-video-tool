/**
 * Locked prompt for Grok Image-Edit full-outfit garment-truth lane (Hero Frame Studio).
 * See CURSOR_HANDOFF_grok_image_garment_lane_FINAL.md §5.
 */
export const GROK_GARMENT_TRUTH_PROMPT = `Photorealistic edit of the source frame: keep the exact pose, camera angle, lighting, and background, but dress Fendi Frost in the COMPLETE OUTFIT worn by the model in the reference — jacket, shirt, tie, pants, and every worn piece, as one full look. EXCLUDE the model's glasses/eyewear.

Priorities, in order:
1. Full-outfit construction fidelity — exact collar shape/stand, exact stripe width/position/angle, exact zipper/hardware/buttons/pockets/seams, exact shirt + tie, exact trouser cut, exact fabric wash and drape across the whole outfit. Do not invent or simplify any element.
2. Preserve Fendi's OWN identity — his face, beard, skin tone, head shape, body proportions, and his own glasses. Do NOT copy the model's face or eyewear onto him.
3. Preserve the original pose, background, and lighting.

<IMAGE_0> is Fendi's real video frame (pose, lighting, background). <IMAGE_1> is the on-model full-look product reference for garment construction. Use the supplied references for construction detail.`;
