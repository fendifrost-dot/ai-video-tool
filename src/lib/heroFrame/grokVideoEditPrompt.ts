/**
 * Frozen Grok /v1/videos/edits prompt for Architecture C (product lane).
 *
 * Provenance: HANDOFF_R4_R5_reference_config.md §3 — "Prompt (verbatim, identical
 * in all three)" for runs R1 / R4 / R5. Combined-best: A3′ construction prose +
 * A3″ full-outfit scope + brand-isolation clause. Approved verbatim by Fendi +
 * ChatGPT (consolidated directive 2026-08-28). Do not paraphrase.
 *
 * Paired with pickGrokVideoEditReferencePaths (flat-only, max 1).
 */
export const GROK_VIDEO_EDIT_PROMPT_READY = true as const;

export const GROK_VIDEO_EDIT_PROMPT =
  "Replace his entire visible outfit with the complete Saint Laurent look from the reference images. The jacket: mastic cream woven cotton, worn UNZIPPED and hanging open exactly as the reference model wears it, with a narrow navy horizontal band across the chest carrying small embroidered SAINT LAURENT lettering, a navy stand collar, and navy panels running down the sleeves and sides. Underneath it: a white and blue striped button-up dress shirt with a navy striped tie. Below: black pleated trousers wherever they are visible. Match the construction, proportions, fabric and tailoring of the referenced garments — crisp woven cotton, not knit, and not a generic track jacket. Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting. Keep his existing cap exactly as it appears in the original footage, but do NOT copy, repeat or infer the cap's Polo pony logo or any other branding onto the replacement clothing — the only brand marking anywhere on the new outfit is the SAINT LAURENT lettering on the navy chest band.";
