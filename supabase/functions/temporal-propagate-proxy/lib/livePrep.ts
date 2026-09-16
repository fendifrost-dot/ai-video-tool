/**
 * Temporal live-activation gate.
 *
 * Architecture lock: live activation is AFTER sleeve still CLEARED.
 * Compile-time const is now armed (chest 1m 11/11 + sleeve 1c 6/6).
 * Dispatch still requires explicitArm. This module does not enable Hero Frame
 * tracking, call Grok, or touch chest/sleeve paint.
 */

import {
  CLEARED_CHEST_GATE,
  CLEARED_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_GATE,
  CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
} from "./canonicalLineage.ts";
import type { RepairGateStatus } from "./approvedQuad.ts";

export const TEMPORAL_LIVE_PREP_CONTRACT_VERSION = "1.1.0";

/** Compile-time arm. Flip only after sleeve CLEARED + Class C sign-off. */
export const TEMPORAL_LIVE_ACTIVATION_ARMED = true;

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
   * Override for unit tests that prove the false path.
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
 * Default (canonical chest + sleeve CLEARED, armed, no explicitArm) → blocked
 * on explicitArm only.
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
    reasons.push("explicitArm is required for live dispatch; default is off.");
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

export const DEFAULT_SLEEVE_STILL_GATE: SleeveStillGate = {
  status: CLEARED_SLEEVE_GATE,
  assetId: CLEARED_SLEEVE_ASSET_ID,
  repairMethodVersion: CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
};

/**
 * Deploy notes after sleeve 1c CLEARED + arm.
 * Machine-readable companion to docs/temporal/LIVE_PREP.md.
 */
export const TEMPORAL_LIVE_DEPLOY_NOTES = {
  armed: true,
  mustWaitForHeroFrameOwner: [
    "Hero Frame owner flips architectureCStillRepair.temporalTrackingEnabled (not this module)",
    "Optional frontend Publish so Hero Frame §7 can call prepareHeroFrameTemporalHook then temporal-propagate-proxy",
  ],
  readyNow: [
    "TEMPORAL_LIVE_ACTIVATION_ARMED = true",
    "CLEARED chest 1m + CLEARED sleeve 1c left/right visible quads",
    "authorizeTemporalEdgeRequest + propagateRepair (no Grok / Fal / CC)",
    "Isolated temporal-propagate-proxy (user JWT only; do not widen proxy auth)",
  ],
  doNotRedeployFromThisLane: [
    "architecture-c-still-repair-proxy (Lane B sleeve verify; chest path locked)",
    "wardrobe-video-propagate-proxy (Fal selector — out of ownership)",
    "grok-image-garment-proxy / grok-video-research-proxy",
  ],
  parentRedeployOnly: {
    function: "temporal-propagate-proxy",
    via: "Lovable → Edge Functions → redeploy",
    publishNote: "Publish ≠ edge redeploy. Frontend Publish is optional and is not this lane.",
    paidCalls: false,
    noPerFrameGrok: true,
    noControlCenter: true,
    noProxyAuthWiden: true,
  },
  heroFrameOwnerFlip: {
    owner: "Hero Frame / architectureCStillRepair — not Lane C temporal",
    file: "src/lib/heroFrame/architectureCStillRepair.ts",
    flag: "ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled",
    current: false,
    doNotEditInThisLane: true,
    afterEdgeRedeploy:
      "Hero Frame owner may flip temporalTrackingEnabled in a separate change. Do not edit chest/sleeve paint as part of that flip.",
  },
} as const;

export function defaultActivationForCanonicalLineage(): TemporalLiveActivationDecision {
  return evaluateTemporalLiveActivation({
    chestGate: "CLEARED",
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
    explicitArm: false,
  });
}

export function armedActivationForCanonicalLineage(): TemporalLiveActivationDecision {
  return evaluateTemporalLiveActivation({
    chestGate: "CLEARED",
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
    explicitArm: true,
  });
}
