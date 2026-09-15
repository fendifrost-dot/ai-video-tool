import { describe, expect, it } from "vitest";
import { PipelineError, classifyUnknownError } from "./errors";
import { computeBackoffMs, shouldRetry } from "./retry";
import { DEFAULT_RETRY_POLICY } from "./retry";

describe("pipeline error classification + retry", () => {
  it("preserves PipelineError fields", () => {
    const err = new PipelineError("missing_inputs", "no still", {
      retryable: false,
      classification: "input",
      details: { missing: ["source_still"] },
    });
    const failure = classifyUnknownError(err, 1, "2026-09-15T00:00:00.000Z");
    expect(failure).toMatchObject({
      code: "missing_inputs",
      retryable: false,
      classification: "input",
      causeName: "PipelineError",
    });
  });

  it("maps VideoNeedsProcessingError to a non-retryable gate", () => {
    const err = new Error("transcode first");
    err.name = "VideoNeedsProcessingError";
    const failure = classifyUnknownError(err, 1, "2026-09-15T00:00:00.000Z");
    expect(failure.code).toBe("needs_transcode");
    expect(failure.retryable).toBe(false);
    expect(failure.classification).toBe("gate");
  });

  it("maps FalRunError as retryable adapter failure", () => {
    const err = new Error("fal 500");
    err.name = "FalRunError";
    const failure = classifyUnknownError(err, 1, "2026-09-15T00:00:00.000Z");
    expect(failure.retryable).toBe(true);
    expect(shouldRetry(failure, 1, DEFAULT_RETRY_POLICY)).toBe(true);
    expect(shouldRetry(failure, 3, DEFAULT_RETRY_POLICY)).toBe(false);
  });

  it("honors ProviderCallError.retryable", () => {
    const retryable = Object.assign(new Error("429"), { name: "ProviderCallError", retryable: true });
    const notRetryable = Object.assign(new Error("400"), { name: "ProviderCallError", retryable: false });
    expect(classifyUnknownError(retryable, 1, "t").retryable).toBe(true);
    expect(classifyUnknownError(notRetryable, 1, "t").retryable).toBe(false);
  });

  it("uses exponential backoff", () => {
    expect(computeBackoffMs(1, DEFAULT_RETRY_POLICY)).toBe(1000);
    expect(computeBackoffMs(2, DEFAULT_RETRY_POLICY)).toBe(2000);
    expect(computeBackoffMs(3, DEFAULT_RETRY_POLICY)).toBe(4000);
  });
});
