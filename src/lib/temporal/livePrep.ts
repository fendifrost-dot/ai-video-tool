/**
 * Temporal live-prep activation gate.
 *
 * Architecture lock: live activation is AFTER sleeve still CLEARED.
 * This module prepares the decision + deploy notes. It does not enable
 * tracking, call Grok, or touch chest/sleeve paint.
 */

import { CLEARED_CHEST_GATE } from "./canonicalLineage";
import type { RepairGateStatus } from "./approvedQuad";

export const TEMPORAL_LIVE_PREP_CONTRACT_VERSION = "1.0.0";

/** Compile-time hard stop. Flip only after sleeve CLEARED + Class C sign-off. */
export const TEMPORAL_LIVE_ACTIVATION_ARMED = false;

export interface SleeveStillGate {
  status: RepairGateStatus;
  assetId?: string;
  repairMethodVersion?: string;
}

export type ActivationWaitToken =
  | "live_activation_not_armed"
  | "sleeve_still_not_cleared"
  | "chest_still_not_cleared"
  | "explicit_arm_required";

export interface TemporalLiveActivationDecision {
  contractVersion: typeof TEMPORAL_LIVE_PREP_CONTRACT_VERSION;
  /** Always false while TEMPORAL_LIVE_ACTIVATION_ARMED is false. */
  allowed: boolean;
  armed: boolean;
  waitingFor: ActivationWaitToken[];
  reasons: string[];
  chestGate: RepairGateStatus;
  sleeveGate: RepairGateStatus;
}

export interface TemporalLiveActivationInput {
  chestGate?: RepairGateStatus;
  sleeveGate?: SleeveStillGate | RepairGateStatus;
  /** Human / product arm after sleeve CLEARED. Default false. */
  explicitArm?: boolean;
  /**
   * Override for unit tests that prove the future-true path.
   * Production callers must omit — the compile-time const wins.
   */
  armed?: boolean;
}

function normalizeSleeve(gate: TemporalLiveActivationInput["sleeveGate"]): RepairGateStatus {
  if (!gate) return "PENDING";
  if (typeof gate === "string") return gate;
  return gate.status;
}

/**
 * Decide whether temporal live dispatch is allowed.
 * Default (canonical chest CLEARED, sleeve PENDING, not armed) → blocked.
 */
export function evaluateTemporalLiveActivation(
  input: TemporalLiveActivationInput = {},
): TemporalLiveActivationDecision {
  const chestGate = input.chestGate ?? CLEARED_CHEST_GATE;
  const sleeveGate = normalizeSleeve(input.sleeveGate);
  const explicitArm = input.explicitArm === true;
  const armed = input.armed ?? TEMPORAL_LIVE_ACTIVATION_ARMED;

  const waitingFor: ActivationWaitToken[] = [];
  const reasons: string[] = [];

  if (!armed) {
    waitingFor.push("live_activation_not_armed");
    reasons.push(
      "TEMPORAL_LIVE_ACTIVATION_ARMED is false — live dispatch stays off until sleeve CLEARED and Class C sign-off.",
    );
  }
  if (chestGate !== "CLEARED") {
    waitingFor.push("chest_still_not_cleared");
    reasons.push(`Chest still gate is ${chestGate}; need CLEARED (Stage 1m 11/11).`);
  }
  if (sleeveGate !== "CLEARED") {
    waitingFor.push("sleeve_still_not_cleared");
    reasons.push(`Sleeve still gate is ${sleeveGate}; temporal live waits for sleeve CLEARED.`);
  }
  if (!explicitArm) {
    waitingFor.push("explicit_arm_required");
    reasons.push("explicitArm is required after sleeve CLEARED; default is off.");
  }

  return {
    contractVersion: TEMPORAL_LIVE_PREP_CONTRACT_VERSION,
    allowed: waitingFor.length === 0,
    armed,
    waitingFor,
    reasons,
    chestGate,
    sleeveGate,
  };
}

export const DEFAULT_SLEEVE_STILL_GATE: SleeveStillGate = { status: "PENDING" };

/**
 * What must wait vs what becomes a one-edge-redeploy flip after sleeve CLEARED.
 * Machine-readable companion to docs/temporal/LIVE_PREP.md.
 */
export const TEMPORAL_LIVE_DEPLOY_NOTES = {
  mustWaitForSleeveCleared: [
    "Flip TEMPORAL_LIVE_ACTIVATION_ARMED to true",
    "Allow evaluateTemporalLiveActivation(...).allowed === true",
    "Hero Frame owner flips architectureCStillRepair.temporalTrackingEnabled (not this module)",
    "Redeploy a thin temporal edge wrapper that calls propagateRepair on luma frames",
    "Feed live footage / extract manifests into the adapter",
    "Dispatch any edge temporal job from Hero Frame or pipeline OS",
  ],
  readyNowWithoutActivation: [
    "Approved-quad → PropagationInput adapter",
    "Hero Frame prepare hook (tracking stays false)",
    "Edge request/response contract + authorize gate",
    "Fixture proof that the CLEARED chest quad propagates without per-frame Grok",
    "Reserved PENDING slots for future sleeve quads",
  ],
  doNotRedeployFromThisLane: [
    "architecture-c-still-repair-proxy (Lane B sleeve verify; chest path locked)",
    "wardrobe-video-propagate-proxy (Fal selector — out of ownership)",
    "grok-image-garment-proxy / grok-video-research-proxy",
  ],
  whenSleeveClearedThen: {
    libFlip: "src/lib/temporal/livePrep.ts → TEMPORAL_LIVE_ACTIVATION_ARMED = true",
    edgeRedeploy:
      "New isolated temporal-propagate edge (or gated wrapper) that imports authorizeTemporalEdgeRequest + propagateRepair. One Lovable Edge Functions redeploy. Do not widen Fal selector, proxy auth, or still-repair chest/sleeve paint.",
    frontend:
      "Optional Publish so Hero Frame can call prepareHeroFrameTemporalHook then the new edge. temporalTrackingEnabled flip is a Hero Frame owner change, not Lane C paint.",
    paidCalls: false,
    noPerFrameGrok: true,
  },
} as const;

export function defaultActivationForCanonicalLineage(): TemporalLiveActivationDecision {
  return evaluateTemporalLiveActivation({
    chestGate: "CLEARED",
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
    explicitArm: false,
  });
}
