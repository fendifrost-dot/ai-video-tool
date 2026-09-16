/**
 * $0 temporal live-smoke body — existing synthetic luma fixture + frozen lineage.
 * No Grok / Fal / CC. No live footage. Reconstruct stays separate.
 */

import {
  CANONICAL_KEYFRAME_ID,
  CANONICAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_GATE,
  CLEARED_CHEST_GATE_SCORE,
  CLEARED_CHEST_QUAD_TUPLE,
  CLEARED_CHEST_REPAIR_METHOD_VERSION,
  CLEARED_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_GATE,
  CLEARED_SLEEVE_GATE_SCORE,
  CLEARED_SLEEVE_LEFT_QUAD_TUPLE,
  CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
  CLEARED_SLEEVE_RIGHT_QUAD_TUPLE,
  CLEARED_SLEEVE_CLAIM,
} from "./canonicalLineage";
import { clearedChestAndSleeveQuadSet } from "./approvedQuad";
import { clearedChestTranslatingFixture } from "./clearedChestFixture";
import { sourceClipToWire, type TemporalPropagateWireBody } from "./edgeDispatch";
import { DEFAULT_SLEEVE_STILL_GATE } from "./livePrep";

export const TEMPORAL_LIVE_SMOKE_VERSION = "1.0.0";
export const TEMPORAL_LIVE_SMOKE_CLIP_ID = "live-prep-cleared-chest-quad";
export const TEMPORAL_PROPAGATE_PROXY_PATH = "/functions/v1/temporal-propagate-proxy";

/** Frozen IDs the live smoke must stamp (or the edge must default to). */
export const TEMPORAL_LIVE_SMOKE_LINEAGE = {
  projectId: CANONICAL_PROJECT_ID,
  stillAssetId: CANONICAL_STILL_ASSET_ID,
  keyframeId: CANONICAL_KEYFRAME_ID,
  chestAssetId: CLEARED_CHEST_ASSET_ID,
  chestRepairMethodVersion: CLEARED_CHEST_REPAIR_METHOD_VERSION,
  chestGate: CLEARED_CHEST_GATE,
  chestGateScore: CLEARED_CHEST_GATE_SCORE,
  chestQuadTuple: CLEARED_CHEST_QUAD_TUPLE,
  sleeveAssetId: CLEARED_SLEEVE_ASSET_ID,
  sleeveRepairMethodVersion: CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
  sleeveGate: CLEARED_SLEEVE_GATE,
  sleeveGateScore: CLEARED_SLEEVE_GATE_SCORE,
  sleeveClaim: CLEARED_SLEEVE_CLAIM,
  sleeveLeftQuadTuple: CLEARED_SLEEVE_LEFT_QUAD_TUPLE,
  sleeveRightQuadTuple: CLEARED_SLEEVE_RIGHT_QUAD_TUPLE,
} as const;

/**
 * Explicit $0 smoke body. Product `callTemporalPropagate` only stamps
 * `explicitArm: true` onto a clip; omitted approved/sleeveGate default to this
 * same CLEARED chest 1m + sleeve 1c set on the edge.
 */
export function buildTemporalLiveSmokeBody(): TemporalPropagateWireBody {
  const fixture = clearedChestTranslatingFixture();
  return {
    explicitArm: true,
    clip: sourceClipToWire(fixture.clip),
    approved: clearedChestAndSleeveQuadSet(),
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
  };
}

export type TemporalLiveSmokeBodySummary = {
  smokeVersion: typeof TEMPORAL_LIVE_SMOKE_VERSION;
  explicitArm: true;
  clip: {
    id: string;
    fps: number;
    frameCount: number;
    width: number;
    height: number;
    lumaLengthPerFrame: number;
  };
  lineage: typeof TEMPORAL_LIVE_SMOKE_LINEAGE;
  jobsExpected: readonly ["chest", "sleeve_left", "sleeve_right"];
  paidCalls: false;
  grokPerFrame: false;
  reconstruct: "separate_in_lib_not_this_post";
};

/** Compact request envelope for docs / logs (no 10k-value luma dump). */
export function summarizeTemporalLiveSmokeBody(
  body: TemporalPropagateWireBody = buildTemporalLiveSmokeBody(),
): TemporalLiveSmokeBodySummary {
  const first = body.clip?.frames?.[0];
  return {
    smokeVersion: TEMPORAL_LIVE_SMOKE_VERSION,
    explicitArm: true,
    clip: {
      id: body.clip?.id ?? TEMPORAL_LIVE_SMOKE_CLIP_ID,
      fps: body.clip?.fps ?? 24,
      frameCount: body.clip?.frames?.length ?? 0,
      width: first?.width ?? 0,
      height: first?.height ?? 0,
      lumaLengthPerFrame: first?.luma.length ?? 0,
    },
    lineage: TEMPORAL_LIVE_SMOKE_LINEAGE,
    jobsExpected: ["chest", "sleeve_left", "sleeve_right"],
    paidCalls: false,
    grokPerFrame: false,
    reconstruct: "separate_in_lib_not_this_post",
  };
}
