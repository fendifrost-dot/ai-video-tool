import { describe, expect, it } from "vitest";
import {
  GROK_VIDEO_EDIT_BRAND_EXCLUSION_SENTENCE,
  GROK_VIDEO_EDIT_IDENTITY_SENTENCE,
  GROK_VIDEO_EDIT_PROMPT,
  GROK_VIDEO_EDIT_PROMPT_READY,
  GROK_VIDEO_EDIT_PROMPT_V1,
  GROK_VIDEO_EDIT_PROMPT_V2,
  GROK_VIDEO_EDIT_PROMPT_VERSION,
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
