// Bake-off contract — the shape a future provider comparison records its results in,
// and the one thing the capability registry can honestly say about provider choice today.
//
// THE LINE THIS MODULE DOES NOT CROSS
// -----------------------------------
// The registry knows what a provider/model/operation CAN do. It does not know which one
// is BETTER, and AVT has no evidence that would support saying so — there is no
// identity-preservation number, no temporal-stability number, no cost-per-useful-second
// for any candidate. So this module ranks nothing and scores nothing.
//
// What it does provide:
//   1. `eligibleCandidates()` — filters candidates to those whose declared capabilities
//      can satisfy a shot's hard requirements. Eligibility is a capability fact, not a
//      preference. Ties are returned in the caller's own order and are NOT a ranking.
//   2. `BakeoffResult` — the record shape a harness writes, so that when evidence does
//      exist it lands somewhere comparable instead of in prose.
//
// Per docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md, scores here must come from a run, never
// from a judgement call. `metrics` is therefore free-form and every entry carries the
// run that produced it.

import {
  type CapabilityAddress,
  type CapabilityEvaluation,
  type CapabilityRequest,
  type ResolveOptions,
  evaluateRequest,
  getCapability,
} from "./capabilityRegistry.ts";

/** A provider/model/operation a bake-off may consider. */
export type Candidate = CapabilityAddress & { label?: string };

export type CandidateFeasibility = {
  candidate: Candidate;
  /** True when nothing about the shot's hard requirements is known to be impossible. */
  eligible: boolean;
  /** True when eligibility rests on unverified capability facts. */
  provisional: boolean;
  evaluation: CapabilityEvaluation;
  /** Human-readable reasons a candidate was excluded, or why it is only provisional. */
  notes: string[];
};

/**
 * Which candidates could execute this shot at all.
 *
 * A candidate is INELIGIBLE only when a capability fact positively rules it out (a known
 * limit exceeded, a required feature declared unsupported). A candidate whose facts are
 * merely unknown or stale is ELIGIBLE but `provisional` — absence of evidence is not
 * evidence of incapability, and quietly dropping an unproven provider is how a registry
 * turns into a ranking by omission.
 *
 * The returned order is the caller's input order. It carries no preference.
 */
export function eligibleCandidates(
  candidates: Candidate[],
  requirements: CapabilityRequest,
  options: ResolveOptions = {},
): CandidateFeasibility[] {
  return candidates.map((candidate) => {
    const resolved = getCapability(candidate, options);
    const evaluation = evaluateRequest(resolved, requirements);
    const blocking = evaluation.violations.filter((v) => v.severity === "block");
    const unverified = evaluation.violations.filter((v) => v.severity === "unverified");
    return {
      candidate,
      eligible: blocking.length === 0,
      provisional: blocking.length === 0 && (unverified.length > 0 || !resolved.known),
      evaluation,
      notes: [
        ...blocking.map((v) => `excluded: ${v.message}`),
        ...unverified.map((v) => `unproven: ${v.message}`),
        ...(resolved.known
          ? []
          : [`unproven: ${candidate.provider} is not in the registry — eligibility is untested`]),
      ],
    };
  });
}

/**
 * One candidate's result on one canonical test shot.
 *
 * `metrics` is intentionally open: identity preservation, canonical-Look adherence,
 * temporal stability, treatment conformance, and cost per useful second are the
 * dimensions the project cares about, but none of them has an agreed measurement yet.
 * Fixing a closed enum now would freeze a taxonomy before the evidence exists to shape it.
 */
export type BakeoffMetric = {
  name: string;
  value: number;
  unit: string;
  /** How it was computed — a script path plus version, never a person's impression. */
  method: string;
  /** Higher-is-better, lower-is-better, or neither. Recorded so nobody has to guess later. */
  direction: "higher_better" | "lower_better" | "neutral";
};

export type BakeoffResult = {
  /** The frozen test shot every candidate is run against. */
  testShotId: string;
  /** Hash of the ShotSpec used, so a later run can prove it used the same one. */
  shotSpecHash: string;
  candidate: Candidate;
  /** Feasibility at the time of the run — a candidate may have been provisional. */
  feasibility: Pick<CandidateFeasibility, "eligible" | "provisional" | "notes">;
  metrics: BakeoffMetric[];
  /** Output artifact reference, so a human can look at the actual pixels. */
  outputRef?: string | null;
  /** Observed cost of this run, in USD. */
  costUsd?: number | null;
  runAt: string;
  /** Everything needed to reproduce: model version, seed, prompt hash, mask version. */
  reproduction: Record<string, unknown>;
};

export type BakeoffRound = {
  roundId: string;
  testShotId: string;
  results: BakeoffResult[];
  /**
   * Deliberately absent: a `winner` field. Picking one is a decision made from the
   * results by a reviewer, recorded with its rationale — not a property of the round.
   */
  notes?: string;
};
