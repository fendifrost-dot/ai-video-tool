// Bake-off contract — the shape a future provider comparison records its results in, and the
// one thing capability data can honestly say about provider choice today.
//
// CAPABILITY TRUTH LIVES IN providerCapabilities.ts
// -------------------------------------------------
// This module owns no capability facts. It reads them from `providerCapabilities.ts`, which is
// keyed provider:operation[:model] and is the single canonical source. An earlier draft of this
// lane shipped its own parallel registry; that was removed rather than reconciled, because two
// registries is the condition that produced the "main says 3, deployed says 5" incident in the
// first place.
//
// THE LINE THIS MODULE DOES NOT CROSS
// ----------------------------------
// Capability data knows what a provider/model/operation CAN do. It does not know which is
// BETTER, and AVT has no evidence that would support saying so — there is no
// identity-preservation number, no temporal-stability number, no cost-per-useful-second for any
// candidate. So this module ranks nothing and scores nothing.
//
// What it provides:
//   1. `eligibleCandidates()` — filters candidates to those whose declared capabilities can
//      satisfy a shot's hard requirements. Eligibility is a capability fact, not a preference.
//      Order is the caller's and is NOT a ranking.
//   2. `BakeoffResult` / `BakeoffRound` — the record shape a harness writes, so that when
//      evidence does exist it lands somewhere comparable instead of in prose.
//
// Per docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md, scores come from a run, never from a judgement
// call. `metrics` is therefore open, and every entry carries the method that produced it.

import {
  UNKNOWN_CAPABILITY_SOURCE,
  getProviderCapability,
  type ProviderCapability,
} from "./providerCapabilities.ts";

type EnvLike = { get(name: string): string | undefined };

/** A provider/operation/model a bake-off may consider. */
export type Candidate = {
  provider: string;
  /** Matches the capability key's operation segment, e.g. "videos/edits", "video_to_video". */
  operation: string;
  model?: string | null;
  label?: string;
};

/** The shot's hard requirements — the things a provider either can or cannot do. */
export type CandidateRequirements = {
  referenceImages?: number;
  promptChars?: number;
  /** The shot depends on pinning the subject's appearance from a supplied frame. */
  needsFirstFrameConditioning?: boolean;
};

export type CandidateFeasibility = {
  candidate: Candidate;
  capabilityKey: string;
  capability: ProviderCapability;
  /** True when nothing about the requirements is known to be impossible. */
  eligible: boolean;
  /** True when eligibility rests on unverified capability facts. */
  provisional: boolean;
  /** Why it was excluded, or why it is only provisional. */
  notes: string[];
};

export function capabilityKeyFor(c: Candidate): string {
  return `${c.provider}:${c.operation}`;
}

/**
 * Which candidates could execute this shot at all.
 *
 * A candidate is INELIGIBLE only when a capability fact positively rules it out — a known limit
 * exceeded, or a feature recorded as unsupported. A candidate whose facts are merely unknown is
 * ELIGIBLE but `provisional`: absence of evidence is not evidence of incapability, and quietly
 * dropping unproven providers is how capability data turns into a ranking by omission.
 *
 * The returned order is the caller's input order and carries no preference.
 */
export function eligibleCandidates(
  candidates: Candidate[],
  requirements: CandidateRequirements,
  env?: EnvLike,
): CandidateFeasibility[] {
  return candidates.map((candidate) => {
    const capabilityKey = capabilityKeyFor(candidate);
    const capability = getProviderCapability(capabilityKey, env, candidate.model ?? null);
    const known = capability.source !== UNKNOWN_CAPABILITY_SOURCE;
    const excluded: string[] = [];
    const unproven: string[] = [];

    if (requirements.referenceImages !== undefined) {
      if (requirements.referenceImages > capability.maxReferenceImages) {
        excluded.push(
          known
            ? `excluded: needs ${requirements.referenceImages} reference images; ${capabilityKey}${candidate.model ? `:${candidate.model}` : ""} accepts ${capability.maxReferenceImages}`
            : `excluded: ${capabilityKey} is not in the capability table — the conservative default is ${capability.maxReferenceImages} reference image(s)`,
        );
      }
    }

    if (requirements.promptChars !== undefined) {
      if (capability.maxPromptChars === null) {
        unproven.push(`unproven: no verified prompt limit for ${capabilityKey}`);
      } else if (requirements.promptChars > capability.maxPromptChars) {
        excluded.push(
          `excluded: prompt is ${requirements.promptChars} characters; ${capabilityKey} accepts ${capability.maxPromptChars}`,
        );
      }
    }

    if (requirements.needsFirstFrameConditioning) {
      if (capability.firstFrameConditioning === false) {
        excluded.push(`excluded: ${capabilityKey} does not support first-frame conditioning`);
      } else if (capability.firstFrameConditioning === null) {
        unproven.push(`unproven: first-frame conditioning is unverified for ${capabilityKey}`);
      }
    }

    if (!known)
      unproven.push(
        `unproven: ${capabilityKey} is not in the capability table — eligibility is untested`,
      );

    return {
      candidate,
      capabilityKey,
      capability,
      eligible: excluded.length === 0,
      provisional: excluded.length === 0 && unproven.length > 0,
      notes: [...excluded, ...unproven],
    };
  });
}

/**
 * One candidate's result on one canonical test shot.
 *
 * `metrics` is intentionally open: identity preservation, canonical-Look adherence, temporal
 * stability, treatment conformance and cost per useful second are the dimensions the project
 * cares about, but none has an agreed measurement yet. Fixing a closed enum now would freeze a
 * taxonomy before the evidence exists to shape it.
 */
export type BakeoffMetric = {
  name: string;
  value: number;
  unit: string;
  /** How it was computed — a script path plus version, never a person's impression. */
  method: string;
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
   * Deliberately absent: a `winner` field. Picking one is a decision a reviewer makes from the
   * results and records with its rationale — not a property of the round.
   */
  notes?: string;
};
