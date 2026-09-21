/**
 * Frozen Grok /v1/videos/edits prompts for Architecture C (product lane).
 *
 * V1 (2026-08-28): R1/R4/R5 verbatim. Baseline live run 944b9875… used this text.
 * Do not overwrite — keep attributing pre-2026-09-03 runs to V1.
 *
 * V2 (2026-09-03): ChatGPT-approved correction. The jacket is fully zipped in
 * both R4 references; V1's "UNZIPPED and hanging open" clause was factually
 * false and drove the open-front / broken-band / over-exposed shirt defects.
 *
 * V3 (2026-09-03): ChatGPT-approved factual collar/zip corrections (installed,
 * not active). Collar outer is mastic; only the inner facing is navy. Zip tape
 * is self-colour mastic with a small gold pull. Capability gaps (wordmark,
 * sleeve panels, chest pinstripe) stay on deterministic repair — see
 * docs/ARCHITECTURE_C_V2_DEFECTS_AND_PROPOSED_FIXES_2026-09-03.md §4 and
 * docs/ARCHITECTURE_C_CHATGPT_V3_STILL_FIRST_RULING_2026-09-03.md.
 *
 * ACTIVE = V2 until still-first repair proof passes and Fendi authorizes one
 * gated paid V3 run. Do not flip GROK_VIDEO_EDIT_PROMPT to V3 without that gate.
 *
 * Paired with pickGrokVideoEditReferencePaths (flat-only, max 1).
 */

export const GROK_VIDEO_EDIT_PROMPT_READY = true as const;

/** Active product-lane version. Remains v2 until a gated V3 spend is authorized. */
export const GROK_VIDEO_EDIT_PROMPT_VERSION = "v2" as const;

/** Historical V1 — do not use for new billed runs. */
export const GROK_VIDEO_EDIT_PROMPT_V1 =
  "Replace his entire visible outfit with the complete Saint Laurent look from the reference images. The jacket: mastic cream woven cotton, worn UNZIPPED and hanging open exactly as the reference model wears it, with a narrow navy horizontal band across the chest carrying small embroidered SAINT LAURENT lettering, a navy stand collar, and navy panels running down the sleeves and sides. Underneath it: a white and blue striped button-up dress shirt with a navy striped tie. Below: black pleated trousers wherever they are visible. Match the construction, proportions, fabric and tailoring of the referenced garments — crisp woven cotton, not knit, and not a generic track jacket. Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting. Keep his existing cap exactly as it appears in the original footage, but do NOT copy, repeat or infer the cap's Polo pony logo or any other branding onto the replacement clothing — the only brand marking anywhere on the new outfit is the SAINT LAURENT lettering on the navy chest band.";

export const GROK_VIDEO_EDIT_PROMPT_V2 =
  "Replace his entire visible outfit with the complete Saint Laurent look from the reference images. The jacket: mastic cream woven cotton, worn FULLY ZIPPED CLOSED with the front zip fastened all the way up and the navy stand collar standing upright, exactly as the reference images show, with a wide navy horizontal band running continuously and unbroken across the full chest carrying small embroidered SAINT LAURENT lettering, and navy panels running down the sleeves and sides. Underneath it, visible only at the throat above the closed zip: a white and blue striped button-up dress shirt with a navy striped tie. Below: black pleated trousers wherever they are visible. Match the construction, proportions, fabric and tailoring of the referenced garments — crisp woven cotton, not knit, and not a generic track jacket. Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting. Keep his existing cap exactly as it appears in the original footage, but do NOT copy, repeat or infer the cap's Polo pony logo or any other branding onto the replacement clothing — the only brand marking anywhere on the new outfit is the SAINT LAURENT lettering on the navy chest band.";

/**
 * Installed factual corrections (ChatGPT 2026-09-03 / 2026-09-04).
 * Collar outer mastic + navy inner; self-colour zip + gold pull; self-colour
 * mastic welt pockets + mastic cuffs with navy sleeve panels stopping above
 * the cuff (defects I/J). Not active — do not bill until still-first proof + spend gate.
 */
export const GROK_VIDEO_EDIT_PROMPT_V3 =
  "Replace his entire visible outfit with the complete Saint Laurent look from the reference images. The jacket: mastic cream woven cotton, worn FULLY ZIPPED CLOSED with the front zip fastened all the way up, the zip tape self-coloured in the same mastic cream as the body with only a small gold pull at the top, and the stand collar standing upright — mastic cream on the outside, matching the jacket body, with only its inner facing navy —, exactly as the reference images show, with a wide navy horizontal band running continuously and unbroken across the full chest carrying small embroidered SAINT LAURENT lettering, and navy panels running down the sleeves and sides, with self-coloured mastic welt pockets and mastic cuffs, the navy sleeve panels stopping above the cuff. Underneath it, visible only at the throat above the closed zip: a white and blue striped button-up dress shirt with a navy striped tie. Below: black pleated trousers wherever they are visible. Match the construction, proportions, fabric and tailoring of the referenced garments — crisp woven cotton, not knit, and not a generic track jacket. Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting. Keep his existing cap exactly as it appears in the original footage, but do NOT copy, repeat or infer the cap's Polo pony logo or any other branding onto the replacement clothing — the only brand marking anywhere on the new outfit is the SAINT LAURENT lettering on the navy chest band.";

/**
 * V3 "jacket-only" (2026-09-20, Claude takeover · YSL Real Video #1). Same garment
 * facts as V3 for the Saint Laurent track jacket, but replaces ONLY the jacket/top
 * and explicitly keeps the wearer's trousers and shoes — the flat product photo is
 * the only reference the lane sends, so the on-model shirt/tie/trousers of V3 were
 * never in the reference and read as a defect on moving footage. First prompt to
 * pass Gate 0 on moving footage (S06, request 7957fbb6, asset d36c0309, $0.56).
 */
export const GROK_VIDEO_EDIT_PROMPT_V3_JACKET_ONLY =
  "Replace only his jacket/top with the Saint Laurent track jacket from the reference image, worn ON HIM over his real body. The jacket: mastic cream woven cotton, worn FULLY ZIPPED CLOSED with the front zip fastened all the way up so only his neck shows above the collar, the zip tape self-coloured in the same mastic cream as the body with only a small gold pull at the top, and the stand collar standing upright — mastic cream on the outside, matching the jacket body, with only its inner facing navy — exactly as the reference image shows, with a wide navy horizontal band running continuously and unbroken across the full chest carrying small embroidered SAINT LAURENT lettering, and navy panels running down the sleeves and sides, with self-coloured mastic welt pockets and mastic cuffs, the navy sleeve panels stopping above the cuff. Match the construction, proportions, fabric and tailoring of the referenced garment — crisp woven cotton, not knit, and not a generic track jacket. Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting; keep his trousers and shoes exactly as in the original footage. Keep his existing cap exactly as it appears in the original footage, but do NOT copy, repeat or infer the cap's Polo pony logo or any other branding onto the replacement clothing — the only brand marking anywhere on the new outfit is the SAINT LAURENT lettering on the navy chest band.";

/**
 * V3c "reference-true" (2026-09-21, Astra loop review #1 → repair). The V2/V3/V3-jacket-only
 * garment description was WRONG against the flat reference (it said a wide band with
 * centred white lettering); the reference has ONE narrow navy chest stripe interrupted by
 * the zip, a small gold SAINT LAURENT on the wearer's LEFT only, plain shoulders, navy on the
 * inside of the sleeves, a stand collar, sand-beige body. Jacket only; flat reference only.
 * Best result so far on S06 (request 296ee0ca, asset 443bdb13). S08/S12 came back with a
 * shirt collar + epaulettes, S09 with an outer-sleeve stripe — each xAI edit is an
 * independent sample; use referenceMode "full_look" / a hero frame to pin construction.
 */
export const GROK_VIDEO_EDIT_PROMPT_V3C_REFERENCE_TRUE =
  "Replace only his jacket/top with the Saint Laurent track jacket from the reference image, worn ON HIM over his real body, matching the reference garment EXACTLY. The jacket: sand-beige mastic woven cotton (a warm khaki-beige, NOT bright white, NOT cream-white), boxy and slightly cropped so the elastic hem sits at his waist, worn FULLY ZIPPED CLOSED with the front zip fastened all the way up so only his neck shows above the collar; the zip tape is self-coloured in the same sand-beige with only a small gold pull at the top; the collar is a short UPRIGHT STAND COLLAR (mock-neck / band collar that stands straight up around the neck like a track jacket), sand-beige on the outside with only its inner facing navy — NOT a fold-down shirt collar, NO collar points, NO lapels, NO epaulettes or shoulder tabs. The ONLY navy on the front torso is ONE narrow horizontal navy stripe at mid-chest, about the height of a hand, running across both fronts and interrupted only by the zip; the shoulders, the upper chest above the stripe, and everything below the stripe are plain sand-beige with NO navy yoke, NO navy shoulder panels, NO second stripe. The SAINT LAURENT wordmark appears EXACTLY ONCE, small and gold-toned (metallic gold on navy, not white), printed on the navy stripe on the WEARER'S LEFT chest only, which is the viewer's RIGHT side of the zip, occupying less than a third of that side of the stripe; the stripe on the wearer's right chest (viewer's left) is plain navy with NO lettering. The sleeves are plain sand-beige on top and on the outer arm with NO navy stripe running down the outside of the arm; the only navy on the sleeves is a narrow stripe on the INSIDE/underside of each sleeve, continuing from the chest stripe to the cuff, mostly hidden when the arms are down; the cuffs are plain sand-beige; two self-coloured sand-beige welt pockets. Crisp woven cotton, not knit, not a generic track jacket. Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting; keep his trousers and shoes exactly as in the original footage. Keep his existing cap exactly as it appears in the original footage, but do NOT copy the cap's Polo pony logo or any other branding onto the clothing; the only brand marking anywhere is the single small gold SAINT LAURENT on the wearer's left chest stripe.";

/**
 * V4 "full look" (2026-09-21, Fendi: "the outfit swap is only placing the jacket on me and
 * not the entire YSL outfit"). Replaces the WHOLE visible outfit as worn in the on-model
 * campaign photo: jacket worn OPEN over a white shirt with fine navy stripes and a
 * navy/white striped tie, black pleated wool trousers. Requires the proxy to send the
 * on-model reference (`referenceMode: "full_look"` + `lookId`, on-model + flat). First pass
 * 2026-09-21: 5/5 hook slots landed the full outfit (jacket open, shirt, tie, trousers), glasses
 * kept ("glasses not shades" — Fendi). Construction still varies shot to shot.
 */
export const GROK_VIDEO_EDIT_PROMPT_V4_FULL_LOOK =
  "Replace his entire visible outfit with the complete Saint Laurent look shown in the on-model reference photo, worn ON HIM over his real body, matching the garments EXACTLY. The jacket is the Saint Laurent track jacket from the flat reference: sand-beige mastic woven cotton, boxy and slightly cropped, ONE narrow horizontal navy stripe at mid-chest interrupted by the zip, a single small gold-toned SAINT LAURENT on the stripe on the wearer's LEFT chest only, plain sand-beige shoulders and outer sleeves, a short upright stand collar with a navy inner facing, self-coloured zip tape with a small gold pull. In this look the jacket is worn OPEN — zip fully undone, the two fronts hanging apart — over a white cotton dress shirt with fine navy pinstripes, its collar folded down over a navy-and-white diagonally striped silk tie knotted at the neck; the shirt is tucked into black pleated wool trousers with a straight wide leg that replace his current trousers. Keep his own shoes as in the original footage. Keep the man himself completely unchanged: his real face, beard, his own clear prescription glasses (NOT sunglasses), head, body, hands, performance, pose and movement, and the exact same camera, background and lighting. Keep his existing cap exactly as it appears in the original footage, but do NOT copy the cap's Polo pony logo or any other branding onto the clothing; the only brand marking anywhere is the single small gold SAINT LAURENT on the wearer's left chest stripe.";

/**
 * V4 "full look" for the pre-hook Look (YSL trucker + Mick Long Jeans). Same lane as
 * V4_FULL_LOOK (referenceMode "full_look" + lookId). First pass 2026-09-21: 3/3 slots landed
 * the outfit; one re-roll for a short-sleeved trucker (S04) — the sleeve clause below is the fix.
 */
export const GROK_VIDEO_EDIT_PROMPT_V4_FULL_LOOK_TRUCKER =
  "Replace his entire visible outfit with the complete Saint Laurent look from the reference images, worn ON HIM over his real body, matching the garments EXACTLY. Top: the YSL trucker jacket from the flat reference — French black washed denim, classic trucker cut with LONG SLEEVES down to buttoned cuffs at the wrist (never short sleeves, never sleeveless), a pointed collar, two buttoned chest-flap pockets, a front button placket with small silver-tone metal buttons, worn buttoned up over a plain black t-shirt. Bottom: the YSL Mick long jeans from the reference — Westwood black washed denim, straight long leg, worn full length so the hem stacks slightly over his shoes, replacing his current trousers. Keep his own shoes as in the original footage. Keep the man himself completely unchanged: his real face, beard, his own clear prescription glasses (NOT sunglasses), head, body, hands, performance, pose and movement, and the exact same camera, background and lighting. Keep his existing cap exactly as it appears in the original footage, but do NOT copy the cap's Polo pony logo or any other branding onto the clothing; the only brand markings are the small YSL/Cassandre details the garments carry in the reference photos.";

/**
 * V4b — Fendi's corrections after the first full-outfit pass (2026-09-21, with three ysl.com
 * detail crops now attached to the feature as "detail" references): the navy stripe runs down
 * the INSIDE of the sleeve, the collar is a STAND collar (navy inside, mastic outside — not a
 * fold-down collar), and the jacket is ZIPPED as in the reference (closed to the chest, only
 * the collar standing open over the shirt and tie).
 */
export const GROK_VIDEO_EDIT_PROMPT_V4B_FULL_LOOK =
  "Replace his entire visible outfit with the complete Saint Laurent look shown in the reference photos, worn ON HIM over his real body, matching the garments EXACTLY — the reference photos are the truth, follow them over any assumption. The jacket is the Saint Laurent track jacket: sand-beige (mastic) woven cotton, boxy and slightly cropped, ONE narrow horizontal navy stripe at mid-chest interrupted by the zip, a single small gold-toned SAINT LAURENT on the stripe on the wearer's LEFT chest only. COLLAR: a STAND COLLAR that stands straight up around the neck, mastic on the outside and navy on the inside facing — it does NOT fold down, it is NOT a shirt collar, NOT a butterfly collar, no collar points, no lapels. ZIP: the front zip is CLOSED — zipped up over the chest exactly as in the reference — with only the top of the collar standing open so the striped shirt collar and the knot of the tie show at the neck; the two jacket fronts are NOT hanging open. SLEEVES: the outer top of each sleeve and the shoulders are plain mastic with NO stripe; the only navy on the sleeves is a stripe running down the INSIDE / underside of each sleeve (the side against the body, from the armpit to the cuff), visible only when the arm lifts; the cuffs are mastic. Under the jacket: a white cotton shirt with fine navy pinstripes and a navy-and-white diagonally striped silk tie, both visible only at the neck because the zip is closed. Bottom: black pleated wool trousers with a straight wide leg, replacing his current trousers. Keep his own shoes as in the original footage. Keep the man himself completely unchanged: his real face, beard, his own clear prescription glasses (NOT sunglasses), head, body, hands, performance, pose and movement, and the exact same camera, background and lighting. Keep his existing cap exactly as it appears in the original footage, but do NOT copy the cap's Polo pony logo or any other branding onto the clothing; the only brand marking anywhere is the single small gold SAINT LAURENT on the wearer's left chest stripe.";

/**
 * Constraints-first composition (2026-09-21 finding, ruling §8). Stating the hard construction
 * facts as short imperative sentences BEFORE the descriptive prompt raised the hook hit rate
 * from 1/5 (V4B alone) to 4/4 (V4C). The mechanism is general: the constraints are whatever a
 * Look's garment truth says must not vary; the body is any registry prompt.
 */
export function composeConstraintsFirst(constraints: readonly string[], body: string): string {
  const head = constraints.map((c) => c.trim().replace(/[.\s]+$/, "") + ".").join(" ");
  return head ? `${head} Follow the reference photos exactly. ${body}` : body;
}

/** Hook-Look construction constraints that V4B alone did not hold (Fendi's garment truth). */
export const GROK_VIDEO_EDIT_V4C_CONSTRAINTS = [
  "THE JACKET IS ZIPPED CLOSED",
  "Its collar STANDS UP",
  "Its sleeves are PLAIN on the outside",
] as const;

/**
 * V4c — the winning runtime prompt for the hook Look on `YSL_IceOn_bars24-46_v5` (4/4 slots:
 * zipped, stand collar, plain outer sleeves). Identical text to what was sent at runtime on
 * 2026-09-21 (promptVersion "v4c-full-look"); registered so it can be reused and versioned.
 */
export const GROK_VIDEO_EDIT_PROMPT_V4C_FULL_LOOK = composeConstraintsFirst(
  GROK_VIDEO_EDIT_V4C_CONSTRAINTS,
  GROK_VIDEO_EDIT_PROMPT_V4B_FULL_LOOK,
);
export const GROK_VIDEO_EDIT_PROMPT_V4C_FULL_LOOK_VERSION = "v4c-full-look" as const;

/** Active product-lane prompt (V2). */
export const GROK_VIDEO_EDIT_PROMPT = GROK_VIDEO_EDIT_PROMPT_V2;

export const GROK_VIDEO_EDIT_IDENTITY_SENTENCE =
  "Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting.";

export const GROK_VIDEO_EDIT_BRAND_EXCLUSION_SENTENCE =
  "Keep his existing cap exactly as it appears in the original footage, but do NOT copy, repeat or infer the cap's Polo pony logo or any other branding onto the replacement clothing — the only brand marking anywhere on the new outfit is the SAINT LAURENT lettering on the navy chest band.";
