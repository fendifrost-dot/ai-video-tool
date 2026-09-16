/**
 * Regression lock for the authenticated temporal-propagate-proxy path.
 * Lane C2 must not raise maxFrames or reopen paid/Grok flags.
 */

import { CANONICAL_CLIP_FRAME_COUNT } from "../canonicalClip";
import { TEMPORAL_PROPAGATE_LIMITS } from "../edgeDispatch";

export const TEMPORAL_DISPATCH_LOCK_VERSION = "1.0.0";

export const YELLOW_EDGE_MAX_FRAMES =
  "edge_max_frames_24_vs_canonical_241" as const;
export const YELLOW_LIVE_NATIVE_PIXELS =
  "live_1080x1920_ingest_of_76fe7438_not_this_lane" as const;
export const YELLOW_E2_CONSUMER_SCHEMA =
  "lane_e2_should_consume_temporal-video-qa-v1" as const;
export const YELLOW_SAM3_LIVE_FETCH =
  "sam3_continuity_is_caller_supplied_not_live_fetch" as const;

export const TEMPORAL_QA_YELLOW_CONTRACTS = [
  YELLOW_EDGE_MAX_FRAMES,
  YELLOW_LIVE_NATIVE_PIXELS,
  YELLOW_E2_CONSUMER_SCHEMA,
  YELLOW_SAM3_LIVE_FETCH,
] as const;

export type TemporalQaYellowContract = (typeof TEMPORAL_QA_YELLOW_CONTRACTS)[number];

export type TemporalDispatchLockReport = {
  lockVersion: typeof TEMPORAL_DISPATCH_LOCK_VERSION;
  paidCalls: false;
  grokPerFrame: false;
  provider: "none";
  explicitArmRequired: true;
  jwtGatedProxy: true;
  edgeMaxFrames: number;
  canonicalFrameCount: number;
  fullClipFitsProxy: boolean;
  fullClipPath: "in_lib_propagateRepair";
  yellowContracts: readonly TemporalQaYellowContract[];
};

export function inspectTemporalDispatchLock(): TemporalDispatchLockReport {
  return {
    lockVersion: TEMPORAL_DISPATCH_LOCK_VERSION,
    paidCalls: false,
    grokPerFrame: false,
    provider: "none",
    explicitArmRequired: true,
    jwtGatedProxy: true,
    edgeMaxFrames: TEMPORAL_PROPAGATE_LIMITS.maxFrames,
    canonicalFrameCount: CANONICAL_CLIP_FRAME_COUNT,
    fullClipFitsProxy: CANONICAL_CLIP_FRAME_COUNT <= TEMPORAL_PROPAGATE_LIMITS.maxFrames,
    fullClipPath: "in_lib_propagateRepair",
    yellowContracts: TEMPORAL_QA_YELLOW_CONTRACTS,
  };
}
