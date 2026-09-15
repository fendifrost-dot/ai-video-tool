import type { FailureClassification, RetryPolicy, StageFailure } from "./types";

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1_000,
  backoffMultiplier: 2,
  retryableClassifications: ["adapter", "timeout"],
};

export function isRetryableFailure(failure: StageFailure, policy: RetryPolicy): boolean {
  if (!failure.retryable) return false;
  return policy.retryableClassifications.includes(failure.classification);
}

export function shouldRetry(failure: StageFailure, attempt: number, policy: RetryPolicy): boolean {
  if (attempt >= policy.maxAttempts) return false;
  return isRetryableFailure(failure, policy);
}

/** Backoff after the attempt that just failed (attempt is 1-based). */
export function computeBackoffMs(attempt: number, policy: RetryPolicy): number {
  const exp = Math.max(0, attempt - 1);
  return Math.round(policy.backoffMs * policy.backoffMultiplier ** exp);
}

export function nextRetryAt(attempt: number, policy: RetryPolicy, nowIso: string): string {
  const started = Date.parse(nowIso);
  const base = Number.isFinite(started) ? started : Date.now();
  return new Date(base + computeBackoffMs(attempt, policy)).toISOString();
}

export function isRetryableClassification(
  classification: FailureClassification,
  policy: RetryPolicy,
): boolean {
  return policy.retryableClassifications.includes(classification);
}
