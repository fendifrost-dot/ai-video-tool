import { describe, expect, it } from "vitest";
import {
  GROK_VIDEO_EDIT_BRAND_EXCLUSION_SENTENCE,
  GROK_VIDEO_EDIT_IDENTITY_SENTENCE,
  GROK_VIDEO_EDIT_PROMPT,
  GROK_VIDEO_EDIT_PROMPT_READY,
  GROK_VIDEO_EDIT_PROMPT_V1,
  GROK_VIDEO_EDIT_PROMPT_V2,
  GROK_VIDEO_EDIT_PROMPT_V3,
  GROK_VIDEO_EDIT_PROMPT_VERSION,
  GROK_VIDEO_EDIT_PROMPT_V4B_FULL_LOOK,
  GROK_VIDEO_EDIT_PROMPT_V4C_FULL_LOOK,
  GROK_VIDEO_EDIT_V4C_CONSTRAINTS,
  composeConstraintsFirst,
} from "./grokVideoEditPrompt";

describe("GROK_VIDEO_EDIT_PROMPT (active V2)", () => {
  it("is ready, versioned v2, and is the V2 constant", () => {
    expect(GROK_VIDEO_EDIT_PROMPT_READY).toBe(true);
    expect(GROK_VIDEO_EDIT_PROMPT_VERSION).toBe("v2");
    expect(GROK_VIDEO_EDIT_PROMPT).toBe(GROK_VIDEO_EDIT_PROMPT_V2);
  });

  it("contains the V2 construction clauses and not the false V1 open-jacket clauses", () => {
    expect(GROK_VIDEO_EDIT_PROMPT).toContain("FULLY ZIPPED CLOSED");
    expect(GROK_VIDEO_EDIT_PROMPT).toContain("continuously and unbroken");
    expect(GROK_VIDEO_EDIT_PROMPT).toContain("visible only at the throat above the closed zip");
    expect(GROK_VIDEO_EDIT_PROMPT).not.toContain("UNZIPPED");
    expect(GROK_VIDEO_EDIT_PROMPT).not.toContain("hanging open");
    expect(GROK_VIDEO_EDIT_PROMPT).not.toContain("narrow navy horizontal band");
  });

  it("keeps identity-preservation and brand-exclusion sentences byte-for-byte", () => {
    expect(GROK_VIDEO_EDIT_PROMPT).toContain(GROK_VIDEO_EDIT_IDENTITY_SENTENCE);
    expect(GROK_VIDEO_EDIT_PROMPT).toContain(GROK_VIDEO_EDIT_BRAND_EXCLUSION_SENTENCE);
    expect(GROK_VIDEO_EDIT_PROMPT_V1).toContain(GROK_VIDEO_EDIT_IDENTITY_SENTENCE);
    expect(GROK_VIDEO_EDIT_PROMPT_V1).toContain(GROK_VIDEO_EDIT_BRAND_EXCLUSION_SENTENCE);
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain(GROK_VIDEO_EDIT_IDENTITY_SENTENCE);
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain(GROK_VIDEO_EDIT_BRAND_EXCLUSION_SENTENCE);
  });
});

describe("GROK_VIDEO_EDIT_PROMPT_V3 (installed, not active)", () => {
  it("is preserved beside V1/V2 and is not the active product prompt", () => {
    expect(GROK_VIDEO_EDIT_PROMPT_V3).not.toBe(GROK_VIDEO_EDIT_PROMPT);
    expect(GROK_VIDEO_EDIT_PROMPT_V3).not.toBe(GROK_VIDEO_EDIT_PROMPT_V2);
    expect(GROK_VIDEO_EDIT_PROMPT).toBe(GROK_VIDEO_EDIT_PROMPT_V2);
    expect(GROK_VIDEO_EDIT_PROMPT_VERSION).toBe("v2");
  });

  it("corrects collar outer + zip tape factual errors from V2", () => {
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("mastic cream on the outside");
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("only its inner facing navy");
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain(
      "zip tape self-coloured in the same mastic cream as the body",
    );
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("small gold pull at the top");
    expect(GROK_VIDEO_EDIT_PROMPT_V3).not.toContain("navy stand collar");
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("FULLY ZIPPED CLOSED");
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("continuously and unbroken");
  });

  it("includes I/J pocket and cuff factual corrections (inactive)", () => {
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("self-coloured mastic welt pockets");
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("mastic cuffs");
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("navy sleeve panels stopping above the cuff");
  });

  it("does not authorize spend: active lane stays V2", () => {
    expect(GROK_VIDEO_EDIT_PROMPT).toBe(GROK_VIDEO_EDIT_PROMPT_V2);
    expect(GROK_VIDEO_EDIT_PROMPT).toContain("navy stand collar");
    expect(GROK_VIDEO_EDIT_PROMPT).not.toContain("self-coloured mastic welt pockets");
    expect(GROK_VIDEO_EDIT_PROMPT_VERSION).toBe("v2");
  });
});

describe("GROK_VIDEO_EDIT_PROMPT_V1 (history preserved)", () => {
  it("still exists and still contains UNZIPPED", () => {
    expect(GROK_VIDEO_EDIT_PROMPT_V1).toContain("UNZIPPED");
    expect(GROK_VIDEO_EDIT_PROMPT_V1).toContain("hanging open");
    expect(GROK_VIDEO_EDIT_PROMPT_V1).toContain("narrow navy horizontal band");
    expect(GROK_VIDEO_EDIT_PROMPT_V1).not.toBe(GROK_VIDEO_EDIT_PROMPT);
  });
});

describe("GROK_VIDEO_EDIT_PROMPT_V4C_FULL_LOOK (constraints first)", () => {
  it("is the exact runtime text that won 4/4 on the v5 hook slots", () => {
    expect(GROK_VIDEO_EDIT_PROMPT_V4C_FULL_LOOK).toBe(
      "THE JACKET IS ZIPPED CLOSED. Its collar STANDS UP. Its sleeves are PLAIN on the outside. Follow the reference photos exactly. " +
        GROK_VIDEO_EDIT_PROMPT_V4B_FULL_LOOK,
    );
  });
  it("puts every constraint before the body and keeps the body intact", () => {
    for (const c of GROK_VIDEO_EDIT_V4C_CONSTRAINTS) {
      expect(GROK_VIDEO_EDIT_PROMPT_V4C_FULL_LOOK.indexOf(c)).toBeLessThan(
        GROK_VIDEO_EDIT_PROMPT_V4C_FULL_LOOK.indexOf(GROK_VIDEO_EDIT_PROMPT_V4B_FULL_LOOK),
      );
    }
    expect(composeConstraintsFirst([], "body")).toBe("body");
    expect(composeConstraintsFirst(["A.", " b "], "body")).toBe("A. b. Follow the reference photos exactly. body");
  });
});
