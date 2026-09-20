import { describe, expect, it } from "vitest";
import {
  composeLookGeneration,
  DEFAULT_ASPECT,
  DEFAULT_FRAMING,
  mergeNegatives,
  parseAspectRatio,
} from "./lookGenerationContract.ts";

describe("composeLookGeneration — framing defaults", () => {
  it("defaults to full_body + 9:16 when omitted", () => {
    const out = composeLookGeneration({ identityPaths: ["a.jpg"], prompt: "a winter look" });
    expect(out.framing).toBe(DEFAULT_FRAMING);
    expect(out.framing).toBe("full_body");
    expect(out.aspect).toBe(DEFAULT_ASPECT);
    expect(out.aspect).toBe("9:16");
  });

  it("mechanically injects the full-body framing sentence into the positive prompt", () => {
    const out = composeLookGeneration({ identityPaths: ["a.jpg"], prompt: "a winter look" });
    expect(out.positivePrompt.startsWith("a winter look")).toBe(true);
    expect(out.positivePrompt).toMatch(/head-to-toe/i);
    expect(out.positivePrompt).toMatch(/feet/i);
    expect(out.positivePrompt).toContain("9:16");
  });

  it("carries the requested aspect into the injected sentence", () => {
    const out = composeLookGeneration({
      identityPaths: ["a.jpg"],
      prompt: "a look",
      aspect: "4:5",
    });
    expect(out.aspect).toBe("4:5");
    expect(out.positivePrompt).toContain("4:5");
  });

  it("merges framing-default negatives even when the caller supplies none", () => {
    const out = composeLookGeneration({ identityPaths: ["a.jpg"], prompt: "a look" });
    expect(out.negativePrompt).toMatch(/close-up/i);
    expect(out.negativePrompt).toMatch(/bare legs/i);
    expect(out.negativePrompt).toMatch(/warped logo/i);
    // and they must reach the single folded string an engine receives
    expect(out.promptSent).toContain("Avoid:");
    expect(out.promptSent).toMatch(/close-up/i);
  });

  it("keeps caller negatives first and de-dupes against framing defaults", () => {
    const out = composeLookGeneration({
      identityPaths: ["a.jpg"],
      prompt: "a look",
      negativePrompt: "blurry, Close-Up",
    });
    const neg = out.negativePrompt ?? "";
    expect(neg.indexOf("blurry")).toBe(0);
    // "Close-Up" (caller) and "close-up" (default) collapse to one entry
    expect(neg.toLowerCase().match(/close-up/g)?.length).toBe(1);
  });
});

describe("composeLookGeneration — hero framing", () => {
  it("injects a waist-up hero sentence and a lighter negative set", () => {
    const out = composeLookGeneration({
      identityPaths: ["a.jpg"],
      prompt: "a look",
      framing: "hero",
    });
    expect(out.positivePrompt).toMatch(/waist-up|hero portrait/i);
    // hero allows crop, so it must NOT force "bare legs" / "cropped at the knees"
    expect(out.negativePrompt).not.toMatch(/bare legs/i);
    expect(out.negativePrompt).toMatch(/extreme close-up/i);
  });
});

describe("composeLookGeneration — broll framing (opt-in crop)", () => {
  it("does not inject a framing sentence and forces no negatives", () => {
    const out = composeLookGeneration({
      identityPaths: ["a.jpg"],
      prompt: "a detail shot",
      framing: "broll",
    });
    expect(out.positivePrompt).toBe("a detail shot");
    expect(out.negativePrompt).toBeNull();
    expect(out.promptSent).toBe("a detail shot");
  });

  it("still folds caller negatives when broll supplies them", () => {
    const out = composeLookGeneration({
      identityPaths: ["a.jpg"],
      prompt: "a detail shot",
      negativePrompt: "blurry",
      framing: "broll",
    });
    expect(out.negativePrompt).toBe("blurry");
    expect(out.promptSent).toBe("a detail shot\n\nAvoid: blurry");
  });
});

describe("mergeNegatives", () => {
  it("returns null when nothing to avoid (broll, no caller negatives)", () => {
    expect(mergeNegatives(null, "broll")).toBeNull();
    expect(mergeNegatives("", "broll")).toBeNull();
  });

  it("splits caller negatives on commas and newlines", () => {
    const out = mergeNegatives("blurry,\n  warped face", "broll");
    expect(out).toBe("blurry, warped face");
  });
});

describe("parseAspectRatio", () => {
  it("parses W:H", () => {
    expect(parseAspectRatio("9:16")).toBeCloseTo(0.5625, 4);
  });
  it("parses W/H and WxH", () => {
    expect(parseAspectRatio("16/9")).toBeCloseTo(1.7778, 3);
    expect(parseAspectRatio("4 x 5")).toBeCloseTo(0.8, 4);
  });
  it("returns null for garbage or zero", () => {
    expect(parseAspectRatio("banana")).toBeNull();
    expect(parseAspectRatio("0:16")).toBeNull();
    expect(parseAspectRatio(null)).toBeNull();
  });
});
