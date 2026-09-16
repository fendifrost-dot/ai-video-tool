/**
 * Lane D — original-master live-wiring gate (Architecture C gate 4).
 *
 * Prerequisites (copied, not imported from temporal authorize):
 *   chest CLEARED 11/11 + sleeve CLEARED 6/6 + temporal ARMED (PR #88).
 *
 * Compile-time wiring is armed. Dispatch still requires explicitArm.
 * This module does not fetch SAM-3, call Grok/Fal/CC, or edit paint owners.
 */

import {
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_GATE,
  CLEARED_CHEST_REPAIR_METHOD_VERSION,
  CLEARED_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_GATE,
  CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
  type RepairGateStatus,
} from "./canonicalLineage";

export const RECONSTRUCT_LIVE_WIRING_CONTRACT_VERSION = "1.0.0";

/**
 * Compile-time arm after chest CLEARED + sleeve CLEARED + temporal ARMED.
 * Flip only with Class C sign-off. Dispatch still needs explicitArm.
 */
export const RECONSTRUCT_LIVE_WIRING_ARMED = true;

/**
 * Known temporal-arm state after PR #88. Copied — do not import
 * TEMPORAL_LIVE_ACTIVATION_ARMED or authorizeTemporalEdgeRequest.
 */
export const TEMPORAL_ARMED_AFTER_PR_88 = true;

export interface StillGate {
  status: RepairGateStatus;
  assetId?: string;
  repairMethodVersion?: string;
}

export type ReconstructWaitToken =
  | "live_wiring_not_armed"
  | "chest_still_not_cleared"
  | "sleeve_still_not_cleared"
  | "temporal_not_armed"
  | "explicit_arm_required";

export interface ReconstructLiveWiringDecision {
  contractVersion: typeof RECONSTRUCT_LIVE_WIRING_CONTRACT_VERSION;
  allowed: boolean;
  armed: boolean;
  temporalArmed: boolean;
  waitingFor: ReconstructWaitToken[];
  reasons: string[];
  chestGate: RepairGateStatus;
  sleeveGate: RepairGateStatus;
}

export interface ReconstructLiveWiringInput {
  chestGate?: StillGate | RepairGateStatus;
  sleeveGate?: StillGate | RepairGateStatus;
  /** Default: TEMPORAL_ARMED_AFTER_PR_88 (copied). Tests may override. */
  temporalArmed?: boolean;
  /** Human / product arm. Default false. */
  explicitArm?: boolean;
  /** Override for unit tests that prove the false path. */
  armed?: boolean;
}

function normalizeGate(gate: StillGate | RepairGateStatus | undefined): RepairGateStatus {
  if (!gate) return "PENDING";
  if (typeof gate === "string") return gate;
  return gate.status;
}

export function evaluateReconstructLiveWiring(
  input: ReconstructLiveWiringInput = {},
): ReconstructLiveWiringDecision {
  const chestGate =
    input.chestGate === undefined ? CLEARED_CHEST_GATE : normalizeGate(input.chestGate);
  const sleeveGate =
    input.sleeveGate === undefined ? CLEARED_SLEEVE_GATE : normalizeGate(input.sleeveGate);
  const explicitArm = input.explicitArm === true;
  const armed = input.armed ?? RECONSTRUCT_LIVE_WIRING_ARMED;
  const temporalArmed = input.temporalArmed ?? TEMPORAL_ARMED_AFTER_PR_88;

  const waitingFor: ReconstructWaitToken[] = [];
  const reasons: string[] = [];

  if (!armed) {
    waitingFor.push("live_wiring_not_armed");
    reasons.push(
      "RECONSTRUCT_LIVE_WIRING_ARMED is false — gate 4 wiring stays off until Class C sign-off.",
    );
  }
  if (chestGate !== "CLEARED") {
    waitingFor.push("chest_still_not_cleared");
    reasons.push(`Chest still gate is ${chestGate}; need CLEARED (Stage 1m 11/11).`);
  }
  if (sleeveGate !== "CLEARED") {
    waitingFor.push("sleeve_still_not_cleared");
    reasons.push(`Sleeve still gate is ${sleeveGate}; need CLEARED (sleeve 1c 6/6).`);
  }
  if (!temporalArmed) {
    waitingFor.push("temporal_not_armed");
    reasons.push(
      "Temporal live activation is not armed; original-master composite waits for PR #88 state.",
    );
  }
  if (!explicitArm) {
    waitingFor.push("explicit_arm_required");
    reasons.push("explicitArm is required for reconstruct dispatch; default is off.");
  }

  return {
    contractVersion: RECONSTRUCT_LIVE_WIRING_CONTRACT_VERSION,
    allowed: waitingFor.length === 0,
    armed,
    temporalArmed,
    waitingFor,
    reasons,
    chestGate,
    sleeveGate,
  };
}

export const DEFAULT_CHEST_STILL_GATE: StillGate = {
  status: CLEARED_CHEST_GATE,
  assetId: CLEARED_CHEST_ASSET_ID,
  repairMethodVersion: CLEARED_CHEST_REPAIR_METHOD_VERSION,
};

export const DEFAULT_SLEEVE_STILL_GATE: StillGate = {
  status: CLEARED_SLEEVE_GATE,
  assetId: CLEARED_SLEEVE_ASSET_ID,
  repairMethodVersion: CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
};

/**
 * Shared surfaces identified and left alone (collision policy).
 * Do not edit these from Lane D.
 */
export const RECONSTRUCT_SHARED_SURFACES_LEFT_ALONE = [
  "src/lib/garment/logoComposite.ts",
  "src/lib/garment/stillRepairOcclusion.ts",
  "src/lib/sleevePanel/**",
  "src/lib/temporal/livePrep.ts (TEMPORAL_LIVE_ACTIVATION_ARMED)",
  "src/lib/temporal/edgeAdapter.ts (authorizeTemporalEdgeRequest)",
  "supabase/functions/architecture-c-still-repair-proxy/",
  "supabase/functions/_shared/logoComposite.ts",
  "supabase/functions/_shared/stillRepairOcclusion.ts",
  "supabase/functions/sam3-segment-proxy/",
  "supabase/functions/temporal-propagate-proxy/",
  "src/lib/pipeline/**",
  "src/lib/heroFrame/architectureCStillRepair.ts",
] as const;

export const RECONSTRUCT_LIVE_DEPLOY_NOTES = {
  armed: true,
  edgeFunction: null,
  reason:
    "SAM-3 live fetch is sam3-segment-proxy (Control Center) — out of ownership. Master composite is reconstructOriginalMaster in-lib. No new JWT edge this PR.",
  parentRedeployOnly: {
    function: null,
    via: "none — no Lovable Edge Functions redeploy from this lane",
    publishNote:
      "Publish ≠ edge redeploy. Frontend Publish is required so Hero Frame §7 Run reconstruct E2E $0 is live. No edge redeploy from this lane.",
    paidCalls: false,
    noPerFrameGrok: true,
    noControlCenter: true,
    noProxyAuthWiden: true,
    sam3LiveFetch: false,
  },
  doNotRedeployFromThisLane: [
    "architecture-c-still-repair-proxy (chest 1m + sleeve 1c paint locked)",
    "temporal-propagate-proxy (Lane C — parent redeploys after PR #88)",
    "sam3-segment-proxy (CC SwitchX — out of ownership)",
    "grok-image-garment-proxy / grok-video-research-proxy",
  ],
  sharedSurfacesLeftAlone: RECONSTRUCT_SHARED_SURFACES_LEFT_ALONE,
} as const;

export function defaultWiringForCanonicalLineage(): ReconstructLiveWiringDecision {
  return evaluateReconstructLiveWiring({
    chestGate: DEFAULT_CHEST_STILL_GATE,
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
    temporalArmed: TEMPORAL_ARMED_AFTER_PR_88,
    explicitArm: false,
  });
}

export function armedWiringForCanonicalLineage(): ReconstructLiveWiringDecision {
  return evaluateReconstructLiveWiring({
    chestGate: DEFAULT_CHEST_STILL_GATE,
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
    temporalArmed: TEMPORAL_ARMED_AFTER_PR_88,
    explicitArm: true,
  });
}
