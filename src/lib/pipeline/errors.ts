import type { FailureClassification, StageFailure } from "./types";

export class PipelineError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly classification: FailureClassification;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    opts: {
      retryable: boolean;
      classification: FailureClassification;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "PipelineError";
    this.code = code;
    this.retryable = opts.retryable;
    this.classification = opts.classification;
    this.details = opts.details;
  }
}

function errorName(error: unknown): string | undefined {
  if (error instanceof Error && error.name) return error.name;
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Classify lane/runtime errors by `error.name` so this module stays decoupled
 * from query/provider files (no imports of FalRunError, ProviderCallError, …).
 */
export function classifyUnknownError(error: unknown, attempt: number, occurredAt: string): StageFailure {
  if (error instanceof PipelineError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      classification: error.classification,
      causeName: error.name,
      details: error.details,
      occurredAt,
      attempt,
    };
  }

  const name = errorName(error);
  const message = errorMessage(error);

  if (name === "VideoNeedsProcessingError") {
    return {
      code: "needs_transcode",
      message,
      retryable: false,
      classification: "gate",
      causeName: name,
      occurredAt,
      attempt,
    };
  }

  if (name === "FalRunError") {
    return {
      code: "fal_run_failed",
      message,
      retryable: true,
      classification: "adapter",
      causeName: name,
      occurredAt,
      attempt,
    };
  }

  if (name === "ProviderCallError") {
    const retryable =
      typeof error === "object" &&
      error !== null &&
      "retryable" in error &&
      (error as { retryable?: boolean }).retryable === true;
    return {
      code: "provider_call_failed",
      message,
      retryable,
      classification: "adapter",
      causeName: name,
      occurredAt,
      attempt,
    };
  }

  return {
    code: "adapter_uncaught",
    message,
    retryable: false,
    classification: "adapter",
    causeName: name,
    occurredAt,
    attempt,
  };
}
