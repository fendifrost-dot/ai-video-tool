import { describe, expect, it } from "vitest";
import { composeLookCompositePrompt, validateLookCompositeInput } from "./lookCompositePrompt.ts";

describe("composeLookCompositePrompt", () => {
  it("returns the positive prompt unchanged when there is no negative", () => {
    expect(composeLookCompositePrompt("winter-white satin look, 9:16")).toBe(
      "winter-white satin look, 9:16",
    );
  });

  it("returns the trimmed positive prompt when the negative is blank", () => {
    expect(composeLookCompositePrompt("  a look  ", "   ")).toBe("a look");
  });

  it("folds the negative into an Avoid: clause", () => {
    const out = composeLookCompositePrompt("a look", "blurry, extra fingers");
    expect(out).toBe("a look\n\nAvoid: blurry, extra fingers");
  });

  it("collapses newlines/whitespace in the negative list to one line", () => {
    const out = composeLookCompositePrompt("a look", "blurry,\n  warped\tface");
    expect(out).toBe("a look\n\nAvoid: blurry, warped face");
  });
});

describe("validateLookCompositeInput", () => {
  it("rejects an empty prompt", () => {
    expect(validateLookCompositeInput({ prompt: "   " })).toEqual({
      ok: false,
      error: "prompt_required",
    });
  });

  it("rejects a missing prompt", () => {
    expect(validateLookCompositeInput({})).toEqual({
      ok: false,
      error: "prompt_required",
    });
  });

  it("accepts a valid prompt and normalises a blank negative to null", () => {
    expect(validateLookCompositeInput({ prompt: " a look ", negativePrompt: "  " })).toEqual({
      ok: true,
      prompt: "a look",
      negativePrompt: null,
    });
  });

  it("keeps a real negative prompt", () => {
    expect(validateLookCompositeInput({ prompt: "a look", negativePrompt: " blurry " })).toEqual({
      ok: true,
      prompt: "a look",
      negativePrompt: "blurry",
    });
  });

  it("enforces the prompt length cap", () => {
    const long = "x".repeat(20);
    expect(validateLookCompositeInput({ prompt: long }, { maxPromptChars: 10 })).toEqual({
      ok: false,
      error: "prompt_too_long",
    });
  });
});
