/**
 * Hero Frame §7 RECONSTRUCT-1 E2E run control — gating + copy.
 *
 * Consumes reconstruct live wiring + E2E compose. Reads Hero Frame
 * temporalTrackingEnabled (product flag) without editing still-repair
 * paint or temporal authorize constants.
 */

import { ARCHITECTURE_C_V2_REPAIR } from "@/lib/heroFrame/architectureCStillRepair";
import {
  RECONSTRUCT_E2E_VERSION,
  runReconstructE2e,
  type ReconstructE2eResult,
} from "@/lib/reconstruct/e2e";
import {
  CANONICAL_LINEAGE,
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID,
} from "@/lib/reconstruct/canonicalLineage";
import {
  RECONSTRUCT_LIVE_WIRING_ARMED,
  TEMPORAL_ARMED_AFTER_PR_88,
  evaluateReconstructLiveWiring,
  type ReconstructLiveWiringDecision,
} from "@/lib/reconstruct/liveWiring";
import {
  evaluateReconstructE2eResult,
  formatReconstructVideoSummary,
  reconstructVideoReportToJson,
  type ReconstructVideoReport,
} from "@/lib/eval/reconstructVideoEvaluator";

export const HERO_FRAME_RECONSTRUCT_RUN_VERSION = "1.0.0";

export type HeroFrameReconstructDispatchIntent = {
  contractVersion: typeof HERO_FRAME_RECONSTRUCT_RUN_VERSION;
  e2eVersion: typeof RECONSTRUCT_E2E_VERSION;
  temporalTrackingEnabled: boolean;
  reconstructArmed: boolean;
  temporalArmed: boolean;
  explicitArm: boolean;
  canDispatch: boolean;
  decision: ReconstructLiveWiringDecision;
  lineage: {
    projectId: string;
    stillAssetId: string;
    masterClipAssetId: string;
    clearedChestAssetId: string;
    clearedSleeveAssetId: string;
  };
};

export type HeroFrameReconstructRunGateInput = {
  canDispatch: boolean;
  reconstructArmed: boolean;
  temporalTrackingEnabled: boolean;
};

export function heroFrameReconstructRunEnabled(input: HeroFrameReconstructRunGateInput): boolean {
  return (
    input.canDispatch === true &&
    input.reconstructArmed === true &&
    input.temporalTrackingEnabled === true
  );
}

export function heroFrameReconstructExplicitArm(input?: {
  temporalTrackingEnabled?: boolean;
  reconstructArmed?: boolean;
  temporalArmed?: boolean;
}): boolean {
  const tracking =
    input?.temporalTrackingEnabled ?? ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled;
  const reconstructArmed = input?.reconstructArmed ?? RECONSTRUCT_LIVE_WIRING_ARMED;
  const temporalArmed = input?.temporalArmed ?? TEMPORAL_ARMED_AFTER_PR_88;
  return tracking === true && reconstructArmed === true && temporalArmed === true;
}

export function prepareHeroFrameReconstructDispatch(): HeroFrameReconstructDispatchIntent {
  const temporalTrackingEnabled = ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled;
  const reconstructArmed = RECONSTRUCT_LIVE_WIRING_ARMED;
  const temporalArmed = TEMPORAL_ARMED_AFTER_PR_88;
  const explicitArm = heroFrameReconstructExplicitArm({
    temporalTrackingEnabled,
    reconstructArmed,
    temporalArmed,
  });
  const decision = evaluateReconstructLiveWiring({ explicitArm });
  return {
    contractVersion: HERO_FRAME_RECONSTRUCT_RUN_VERSION,
    e2eVersion: RECONSTRUCT_E2E_VERSION,
    temporalTrackingEnabled,
    reconstructArmed,
    temporalArmed,
    explicitArm,
    canDispatch: explicitArm === true && decision.allowed,
    decision,
    lineage: {
      projectId: CANONICAL_PROJECT_ID,
      stillAssetId: CANONICAL_STILL_ASSET_ID,
      masterClipAssetId: CANONICAL_MASTER_CLIP_ID,
      clearedChestAssetId: CANONICAL_LINEAGE.clearedChestAssetId,
      clearedSleeveAssetId: CANONICAL_LINEAGE.clearedSleeveAssetId,
    },
  };
}

export function heroFrameReconstructRunEnabledFromDispatch(
  dispatch: Pick<
    HeroFrameReconstructDispatchIntent,
    "canDispatch" | "reconstructArmed" | "temporalTrackingEnabled"
  >,
): boolean {
  return heroFrameReconstructRunEnabled({
    canDispatch: dispatch.canDispatch,
    reconstructArmed: dispatch.reconstructArmed,
    temporalTrackingEnabled: dispatch.temporalTrackingEnabled,
  });
}

export function formatHeroFrameReconstructGateCopy(input: {
  temporalTrackingEnabled: boolean;
  reconstructArmed: boolean;
  explicitArm: boolean;
  canDispatch: boolean;
}): string {
  const flags = `temporalTrackingEnabled=${input.temporalTrackingEnabled}, reconstructArmed=${input.reconstructArmed}, explicitArm=${input.explicitArm}, canDispatch=${input.canDispatch}`;
  if (heroFrameReconstructRunEnabled(input)) {
    return `RECONSTRUCT-1 product gate is on (${flags}). Run reconstruct E2E $0 dispatches temporal-propagate-proxy then in-lib original-master composite. No Grok. Chest/sleeve paint stays locked.`;
  }
  if (input.temporalTrackingEnabled) {
    return `RECONSTRUCT-1 tracking is on (${flags}). Run stays disabled until reconstructArmed and canDispatch are both true.`;
  }
  return `HARD STOP — temporal tracking is off (${flags}). Do not run reconstruct E2E.`;
}

export function formatReconstructE2eError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/missing_bearer|unauthenticated|http_401|\b401\b/i.test(raw)) {
    return `401 — sign in required (${raw})`;
  }
  return raw;
}

export function scoreHeroFrameReconstructE2e(e2e: ReconstructE2eResult): ReconstructVideoReport {
  return evaluateReconstructE2eResult(e2e);
}

export function summarizeReconstructE2eResult(report: ReconstructVideoReport): string {
  return formatReconstructVideoSummary(report);
}

export function reconstructE2eResultJson(report: ReconstructVideoReport): Record<string, unknown> {
  return reconstructVideoReportToJson(report);
}

/**
 * In-lib reconstruct after a live temporal JSON body is in hand.
 * Callers POST temporal-propagate-proxy first (paidCalls=false).
 */
export function runHeroFrameReconstructFromTemporalJson(temporalPropagateResult: unknown): {
  e2e: ReconstructE2eResult;
  report: ReconstructVideoReport;
} {
  const e2e = runReconstructE2e({
    explicitArm: true,
    temporalPropagateResult,
  });
  return { e2e, report: evaluateReconstructE2eResult(e2e) };
}
