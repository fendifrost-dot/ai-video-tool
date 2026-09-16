/**
 * G2 product lifecycle: queued / running / passed / failed / blocked / retryable.
 *
 * Internal StageStatus stays richer (skipped, needs_review, cancelled, …).
 * This module is the only place that maps between the two.
 */

import type { G2StageState, StageFailure, StageStatus } from "./types";

export const G2_REQUIRED_STATES = [
  "queued",
  "running",
  "passed",
  "failed",
  "blocked",
  "retryable",
] as const satisfies readonly G2StageState[];

export function lifecycleFromStatus(
  status: StageStatus,
  lastError?: StageFailure,
): G2StageState {
  switch (status) {
    case "pending":
    case "ready":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
    case "skipped":
      return "passed";
    case "retrying":
      return "retryable";
    case "blocked":
    case "needs_review":
      return "blocked";
    case "cancelled":
      return "failed";
    case "failed":
      return lastError?.retryable ? "retryable" : "failed";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function retryReasonFrom(input: {
  status: StageStatus;
  lifecycle: G2StageState;
  lastError?: StageFailure;
  gateReason?: string;
}): string | null {
  if (input.lifecycle === "retryable") {
    return (
      input.lastError?.message ??
      input.lastError?.code ??
      input.gateReason ??
      "retryable_failure"
    );
  }
  if (input.lifecycle === "blocked") {
    return input.gateReason ?? input.lastError?.message ?? input.lastError?.code ?? "blocked";
  }
  return null;
}

/** Passed (including skipped-as-passed) stages may hand artifacts downstream. */
export function isPassedLifecycle(state: G2StageState): boolean {
  return state === "passed";
}

export function isPauseLifecycle(state: G2StageState): boolean {
  return state === "failed" || state === "blocked" || state === "retryable";
}
