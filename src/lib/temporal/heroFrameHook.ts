/**
 * Isolated Hero Frame hook for later §7 / still-repair integration.
 *
 * Does NOT import or edit src/lib/heroFrame/architectureCStillRepair.ts.
 * temporalTrackingEnabled is always false here. No edge invoke. No Grok.
 */

import {
  CANONICAL_LINEAGE,
  CANONICAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID,
  CANONICAL_KEYFRAME_ID,
  type CanonicalLineage,
} from "./canonicalLineage";
import { clearedChestQuadSet, type ApprovedQuadSet } from "./approvedQuad";
import {
  DEFAULT_SLEEVE_STILL_GATE,
  TEMPORAL_LIVE_DEPLOY_NOTES,
  TEMPORAL_LIVE_PREP_CONTRACT_VERSION,
  evaluateTemporalLiveActivation,
  type SleeveStillGate,
  type TemporalLiveActivationDecision,
} from "./livePrep";
import { buildPropagationJobsFromApprovedSet, type PropagationJobSpec } from "./quadAdapter";
import type { SourceClip } from "./contract";

export interface HeroFrameTemporalHookInput {
  projectId?: string;
  stillAssetId?: string;
  keyframeId?: string;
  clip?: SourceClip;
  approved?: ApprovedQuadSet;
  sleeveGate?: SleeveStillGate;
  explicitArm?: boolean;
}

export interface HeroFrameTemporalHookResult {
  contractVersion: typeof TEMPORAL_LIVE_PREP_CONTRACT_VERSION;
  /** Hard stop — this hook never enables product tracking. */
  temporalTrackingEnabled: false;
  lineage: {
    projectId: string;
    stillAssetId: string;
    keyframeId: string;
    clearedChestAssetId: string;
  };
  activation: TemporalLiveActivationDecision;
  preparedJobs: PropagationJobSpec[];
  reservedSleeveSlots: ApprovedQuadSet["reservedSleeveSlots"];
  providerCalls: [];
  grokPerFrame: false;
  deployWhenReady: typeof TEMPORAL_LIVE_DEPLOY_NOTES.whenSleeveClearedThen;
}

/**
 * Prepare (do not run) temporal jobs from approved quads for Hero Frame.
 * Without a clip, jobs stay empty; activation is still evaluated.
 */
export function prepareHeroFrameTemporalHook(
  input: HeroFrameTemporalHookInput = {},
): HeroFrameTemporalHookResult {
  const approved = input.approved ?? clearedChestQuadSet();
  const sleeveGate = input.sleeveGate ?? DEFAULT_SLEEVE_STILL_GATE;
  const activation = evaluateTemporalLiveActivation({
    chestGate: approved.chest.gate,
    sleeveGate,
    explicitArm: input.explicitArm,
  });

  const preparedJobs = input.clip
    ? buildPropagationJobsFromApprovedSet({
        clip: input.clip,
        approved,
      })
    : [];

  return {
    contractVersion: TEMPORAL_LIVE_PREP_CONTRACT_VERSION,
    temporalTrackingEnabled: false,
    lineage: {
      projectId: input.projectId ?? CANONICAL_PROJECT_ID,
      stillAssetId: input.stillAssetId ?? CANONICAL_STILL_ASSET_ID,
      keyframeId: input.keyframeId ?? CANONICAL_KEYFRAME_ID,
      clearedChestAssetId: CANONICAL_LINEAGE.clearedChestAssetId,
    },
    activation,
    preparedJobs,
    reservedSleeveSlots: approved.reservedSleeveSlots,
    providerCalls: [],
    grokPerFrame: false,
    deployWhenReady: TEMPORAL_LIVE_DEPLOY_NOTES.whenSleeveClearedThen,
  };
}
