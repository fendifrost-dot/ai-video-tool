import { describe, expect, it } from "vitest";
import { formatCost, pipelineEstimateCents } from "./looks";

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
