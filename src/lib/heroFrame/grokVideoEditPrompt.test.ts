import { describe, expect, it } from "vitest";
import { GROK_VIDEO_EDIT_PROMPT, GROK_VIDEO_EDIT_PROMPT_READY } from "./grokVideoEditPrompt";

const FROZEN_HANDOFF_PROMPT =
  "Replace his entire visible outfit with the complete Saint Laurent look from the reference images. The jacket: mastic cream woven cotton, worn UNZIPPED and hanging open exactly as the reference model wears it, with a narrow navy horizontal band across the chest carrying small embroidered SAINT LAURENT lettering, a navy stand collar, and navy panels running down the sleeves and sides. Underneath it: a white and blue striped button-up dress shirt with a navy striped tie. Below: black pleated trousers wherever they are visible. Match the construction, proportions, fabric and tailoring of the referenced garments — crisp woven cotton, not knit, and not a generic track jacket. Keep the man himself completely unchanged: his real face, beard, glasses, head, body, hands, performance, pose and movement, and the exact same camera, background and lighting. Keep his existing cap exactly as it appears in the original footage, but do NOT copy, repeat or infer the cap's Polo pony logo or any other branding onto the replacement clothing — the only brand marking anywhere on the new outfit is the SAINT LAURENT lettering on the navy chest band.";

describe("GROK_VIDEO_EDIT_PROMPT", () => {
  it("is ready and matches the frozen R4/R5 handoff byte-for-byte", () => {
    expect(GROK_VIDEO_EDIT_PROMPT_READY).toBe(true);
    expect(GROK_VIDEO_EDIT_PROMPT).toBe(FROZEN_HANDOFF_PROMPT);
    expect(GROK_VIDEO_EDIT_PROMPT.length).toBe(FROZEN_HANDOFF_PROMPT.length);
  });
});
