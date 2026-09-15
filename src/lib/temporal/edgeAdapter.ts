/**
 * Request/response contract for a future isolated temporal edge wrapper.
 *
 * Not wired to any proxy. authorizeTemporalEdgeRequest refuses live dispatch
 * until sleeve CLEARED + armed + explicitArm. No fetch. No auth changes.
 */

import type { SourceClip } from "./contract";
import type { ApprovedQuadSet } from "./approvedQuad";
import { clearedChestQuadSet } from "./approvedQuad";
import {
  TEMPORAL_LIVE_PREP_CONTRACT_VERSION,
  evaluateTemporalLiveActivation,
  type SleeveStillGate,
  type TemporalLiveActivationDecision,
} from "./livePrep";
import { TEMPORAL_PROPAGATION_CONTRACT_VERSION } from "./contract";

export const TEMPORAL_EDGE_ADAPTER_VERSION = "1.0.0";

export interface TemporalEdgeRequest {
  contractVersion: typeof TEMPORAL_LIVE_PREP_CONTRACT_VERSION;
  adapterVersion: typeof TEMPORAL_EDGE_ADAPTER_VERSION;
  propagationContractVersion: typeof TEMPORAL_PROPAGATION_CONTRACT_VERSION;
  clip: SourceClip;
  approved: ApprovedQuadSet;
  sleeveGate: SleeveStillGate;
  explicitArm: boolean;
}

export type TemporalEdgeRejectCode =
  | "live_activation_not_armed"
  | "sleeve_still_not_cleared"
  | "chest_still_not_cleared"
  | "explicit_arm_required"
  | "invalid_request";

export type TemporalEdgeAuthorization =
  | { ok: true; decision: TemporalLiveActivationDecision }
  | {
      ok: false;
      code: TemporalEdgeRejectCode;
      decision: TemporalLiveActivationDecision;
      message: string;
    };

export function buildTemporalEdgeRequest(input: {
  clip: SourceClip;
  approved?: ApprovedQuadSet;
  sleeveGate?: SleeveStillGate;
  explicitArm?: boolean;
}): TemporalEdgeRequest {
  return {
    contractVersion: TEMPORAL_LIVE_PREP_CONTRACT_VERSION,
    adapterVersion: TEMPORAL_EDGE_ADAPTER_VERSION,
    propagationContractVersion: TEMPORAL_PROPAGATION_CONTRACT_VERSION,
    clip: input.clip,
    approved: input.approved ?? clearedChestQuadSet(),
    sleeveGate: input.sleeveGate ?? { status: "PENDING" },
    explicitArm: input.explicitArm === true,
  };
}

export function authorizeTemporalEdgeRequest(
  request: TemporalEdgeRequest,
  armedOverride?: boolean,
): TemporalEdgeAuthorization {
  if (!request?.clip || !request.approved) {
    const decision = evaluateTemporalLiveActivation({
      sleeveGate: request?.sleeveGate,
      explicitArm: request?.explicitArm,
      armed: armedOverride,
    });
    return {
      ok: false,
      code: "invalid_request",
      decision,
      message: "clip and approved quad set are required",
    };
  }

  const decision = evaluateTemporalLiveActivation({
    chestGate: request.approved.chest.gate,
    sleeveGate: request.sleeveGate,
    explicitArm: request.explicitArm,
    armed: armedOverride,
  });

  if (decision.allowed) {
    return { ok: true, decision };
  }

  const code = (decision.waitingFor[0] ?? "live_activation_not_armed") as TemporalEdgeRejectCode;
  return {
    ok: false,
    code,
    decision,
    message: decision.reasons[0] ?? "temporal live dispatch is not authorized",
  };
}
