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
 * Installed factual corrections for collar outer + zip tape (ChatGPT 2026-09-03).
 * Not active. Do not bill against this until still-first repair proof + spend gate.
 */
export const GROK_VIDEO_EDIT_PROMPT_V3 =
  "Replace his entire visible outfit with the complete Saint Laurent look from the reference images. The jacket: mastic cream woven cotton, worn FULLY ZIPPED CLOSED with the front zip fastened all the way up, the zip tape self-coloured in the same mastic cream as the body with only a small gold pull at the top, and the stand collar standing upright — mastic cream on the outside, matching the jacket body, with only its inner facing navy —, exactly as the reference images show, with a wide navy horizontal band running continuously and unbroken across the full chest carrying small embroidered SAINT LAURENT lettering, and navy panels running down the sleeves and sides. Underneath it, visible only at the throat above the closed zip: a white and blue striped button-up dress shirt with a navy striped tie. Below: black pleated trousers wherever they are visible. Match the construction, proportions, fabric and tailoring of the referenced garments — crisp woven cotton, not knit, and not a generic track jacket. Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting. Keep his existing cap exactly as it appears in the original footage, but do NOT copy, repeat or infer the cap's Polo pony logo or any other branding onto the replacement clothing — the only brand marking anywhere on the new outfit is the SAINT LAURENT lettering on the navy chest band.";

/** Active product-lane prompt (V2). */
export const GROK_VIDEO_EDIT_PROMPT = GROK_VIDEO_EDIT_PROMPT_V2;

export const GROK_VIDEO_EDIT_IDENTITY_SENTENCE =
  "Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting.";

export const GROK_VIDEO_EDIT_BRAND_EXCLUSION_SENTENCE =
  "Keep his existing cap exactly as it appears in the original footage, but do NOT copy, repeat or infer the cap's Polo pony logo or any other branding onto the replacement clothing — the only brand marking anywhere on the new outfit is the SAINT LAURENT lettering on the navy chest band.";
