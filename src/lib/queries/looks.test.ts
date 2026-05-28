import { describe, expect, it } from "vitest";
import { formatCost, getLookPublicImageUrl, pipelineEstimateCents } from "./looks";

// ---------------------------------------------------------------------------
// formatCost
// ---------------------------------------------------------------------------
describe("formatCost", () => {
  it("returns $0.00 for zero cents", () => {
    expect(formatCost(0)).toBe("$0.00");
  });
  it("formats cents to two decimal places", () => {
    expect(formatCost(7)).toBe("$0.07");
    expect(formatCost(42)).toBe("$0.42");
    expect(formatCost(123)).toBe("$1.23");
  });
});

// ---------------------------------------------------------------------------
// pipelineEstimateCents — used by the composer to surface a pre-flight cost
// ---------------------------------------------------------------------------
describe("pipelineEstimateCents", () => {
  it("uses LoRA pipeline when auto + LoRA available", () => {
    expect(pipelineEstimateCents("auto", true)).toBe(7);
  });
  it("falls back to seedream-only when auto + no LoRA", () => {
    expect(pipelineEstimateCents("auto", false)).toBe(4);
  });
  it("returns the explicit pipeline cost regardless of LoRA presence", () => {
    expect(pipelineEstimateCents("seedream_only", true)).toBe(4);
    expect(pipelineEstimateCents("lora_seedream", false)).toBe(7);
    expect(pipelineEstimateCents("kontext_multi", false)).toBe(5);
  });
  it("defaults to auto when given null / undefined", () => {
    expect(pipelineEstimateCents(null, true)).toBe(7);
    expect(pipelineEstimateCents(undefined, false)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// getLookPublicImageUrl — used by the "Save as Canonical Base" button
// ---------------------------------------------------------------------------
describe("getLookPublicImageUrl", () => {
  it("returns the generated_image_url when set", () => {
    expect(
      getLookPublicImageUrl({
        generated_image_url: "https://v3b.fal.media/files/foo.png",
      }),
    ).toBe("https://v3b.fal.media/files/foo.png");
  });
  it("returns null when generated_image_url is null", () => {
    expect(getLookPublicImageUrl({ generated_image_url: null })).toBeNull();
  });
  it("returns null when generated_image_url is empty string", () => {
    expect(getLookPublicImageUrl({ generated_image_url: "" })).toBeNull();
  });
  it("returns null for null/undefined look", () => {
    expect(getLookPublicImageUrl(null)).toBeNull();
    expect(getLookPublicImageUrl(undefined)).toBeNull();
  });
});
