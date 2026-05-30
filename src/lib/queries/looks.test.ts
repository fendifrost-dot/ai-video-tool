import { describe, expect, it } from "vitest";
import {
  BULK_DELETE_FRICTION_THRESHOLD,
  formatBulkDeleteToast,
  formatCost,
  getLookPublicImageUrl,
  pipelineEstimateCents,
  shouldFrictionWarn,
  summarizeBulkDeleteResults,
} from "./looks";

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


// ---------------------------------------------------------------------------
// shouldFrictionWarn — gates the "you're about to delete X" copy when the
// user has selected a chunky batch (≥10 by default).
// ---------------------------------------------------------------------------
describe("shouldFrictionWarn", () => {
  it("does not warn for small selections", () => {
    expect(shouldFrictionWarn(0)).toBe(false);
    expect(shouldFrictionWarn(1)).toBe(false);
    expect(shouldFrictionWarn(9)).toBe(false);
  });
  it("warns at the threshold and above", () => {
    expect(shouldFrictionWarn(BULK_DELETE_FRICTION_THRESHOLD)).toBe(true);
    expect(shouldFrictionWarn(12)).toBe(true);
    expect(shouldFrictionWarn(66)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// summarizeBulkDeleteResults — collapses a Promise.allSettled bulk into
// counts the toast uses. Per-item resilience: a single failure must not
// hide the rest of the successes from the report.
// ---------------------------------------------------------------------------
describe("summarizeBulkDeleteResults", () => {
  it("reports zeros for empty input", () => {
    expect(summarizeBulkDeleteResults([])).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
    });
  });
  it("counts only successes when nothing rejects", () => {
    const results: PromiseSettledResult<void>[] = [
      { status: "fulfilled", value: undefined },
      { status: "fulfilled", value: undefined },
      { status: "fulfilled", value: undefined },
    ];
    expect(summarizeBulkDeleteResults(results)).toEqual({
      total: 3,
      succeeded: 3,
      failed: 0,
    });
  });
  it("separates successes from failures so the toast can shame the failures", () => {
    const results: PromiseSettledResult<void>[] = [
      { status: "fulfilled", value: undefined },
      { status: "rejected", reason: new Error("boom") },
      { status: "fulfilled", value: undefined },
      { status: "rejected", reason: new Error("nope") },
    ];
    expect(summarizeBulkDeleteResults(results)).toEqual({
      total: 4,
      succeeded: 2,
      failed: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// formatBulkDeleteToast — copy is pinned by this test so a UX change to
// the toast string is a deliberate edit, not an accidental rephrasing.
// ---------------------------------------------------------------------------
describe("formatBulkDeleteToast", () => {
  it("uses singular when exactly one look succeeded", () => {
    expect(
      formatBulkDeleteToast({ total: 1, succeeded: 1, failed: 0 }),
    ).toBe("Deleted 1 look.");
  });
  it("uses plural for clean multi-success batches", () => {
    expect(
      formatBulkDeleteToast({ total: 12, succeeded: 12, failed: 0 }),
    ).toBe("Deleted 12 looks.");
  });
  it("calls out the failure count when anything rejected", () => {
    expect(
      formatBulkDeleteToast({ total: 5, succeeded: 3, failed: 2 }),
    ).toBe("Deleted 3 of 5 looks. 2 failed.");
  });
});
