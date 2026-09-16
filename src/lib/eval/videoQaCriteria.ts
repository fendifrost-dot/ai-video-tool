/**
 * Lane E2 video-QA thresholds — PROVISIONAL operational gates.
 *
 * [DECISION] These are not frozen canonical video goldens. Chest 11/11 and
 * sleeve 6/6 stay locked. Thresholds are derived from documented formulas
 * plus synthetic fixture margins (see docs/eval/LANE_E2_VIDEO_QA.md).
 *
 * Evidence labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION
 */

import type { VideoQaCriterionId } from "./videoQaTypes";

/** Binary mask: α > 0.5 is inside the transform. */
export const MASK_INSIDE_THRESHOLD = 0.5;

/** Soft seam: 0 < α < 1 (exclusive). */
export const SEAM_ALPHA_MIN = 0;
export const SEAM_ALPHA_MAX = 1;

/**
 * [DECISION] Unauthorized (α === 0) pixels must be byte-identical to original.
 * Matches Lane D reconstruct contract (VERIFIED in reconstruct unit tests).
 */
export const MAX_UNAUTHORIZED_CHANGED_PIXELS = 0;
export const MAX_UNAUTHORIZED_CHANGED_FRAC = 0;

/**
 * [DECISION] Repair coverage may be 0 (no identity punch). Fail only when
 * coverage jumps wildly across frames — a discontinuity in punch-out, not
 * a still-gate reopen.
 */
export const MAX_REPAIR_COVERAGE_FRAME_DELTA = 0.25;
export const MAX_REPAIR_COVERAGE = 0.85;

/**
 * [DECISION] Outside-region reconstructed temporal change must not exceed
 * original-master temporal change (excess luma). Fixture margin: happy-path
 * excess = 0; leak fixtures exceed this immediately.
 */
export const MAX_OUTSIDE_EXCESS_MEAN_ABS_LUMA = 1;

/**
 * [DECISION] Inside-mask reconstructed frame-to-frame mean |Δluma|. Synthetic
 * flicker fixture uses 80–200; stable stamp fixtures sit near 0.
 */
export const MAX_INSIDE_MEAN_ABS_LUMA_DELTA = 40;

/**
 * [DECISION] Hamming / XOR fraction of binarized masks between adjacent frames.
 * Happy-path fixtures hold XOR = 0; jump fixtures flip a large rectangle.
 */
export const MAX_MASK_XOR_MEAN = 0.12;
export const MAX_MASK_XOR_MAX = 0.25;

/**
 * [DECISION] Seam temporal mean |Δluma|. Stable feathered seams stay low;
 * oscillating perimeter fixtures sit well above this.
 */
export const MAX_SEAM_TEMPORAL_MEAN_ABS_LUMA = 25;

/**
 * [DECISION] Centroid of changed-inside-mask vs centroid of mask, in pixels.
 * Small rasters (16×16) use a 4 px allowance.
 */
export const MAX_CENTROID_DRIFT_PX = 4;

/**
 * [DECISION] Preservation FAIL is an original-master compositing contract break.
 * Escalate to reconstruct / D2 — never reopen chest 11/11 or sleeve 6/6.
 * `stillGoldensReopened` stays false on both the report and the escalate object.
 */
export const PRESERVATION_FAIL_ESCALATE_MESSAGE =
  "Original-master pixels drifted outside authorized α. Assign to reconstruct/compositing — do not reopen chest 11/11 or sleeve 6/6 still goldens.";

export const PRESERVATION_FAIL_ESCALATE = {
  kind: "architectural_blocker" as const,
  message: PRESERVATION_FAIL_ESCALATE_MESSAGE,
  stillGoldensReopened: false as const,
};

export const VIDEO_QA_NOT_CLAIMED = [
  "chest Stage 1m 11/11 rescore",
  "sleeve Stage 1c 6/6 rescore",
  "Architecture C paint / occlusion correctness",
  "temporal optical-flow / authorize internals",
  "in-process MP4 decode (Lane H or injected decoder supplies rasters)",
  "paid provider calls",
] as const;

export const VIDEO_QA_CRITERION_NAMES: Record<VideoQaCriterionId, string> = {
  paid_calls_false: "No paid provider calls",
  still_goldens_not_reopened: "Still goldens not rescored",
  per_frame_repair_coverage: "Per-frame repair coverage",
  temporal_jitter_drift: "Temporal jitter / drift",
  mask_discontinuity: "Mask discontinuity",
  unintended_outside_region_change: "Unintended outside-region change",
  seam_edge_instability: "Seam / edge instability",
  original_master_preservation: "Original-master preservation",
  mp4_artifact_scored: "Reconstructed MP4 artifact scored",
};

export const VIDEO_QA_CRITERION_ORDER: VideoQaCriterionId[] = [
  "paid_calls_false",
  "still_goldens_not_reopened",
  "mp4_artifact_scored",
  "per_frame_repair_coverage",
  "original_master_preservation",
  "unintended_outside_region_change",
  "mask_discontinuity",
  "temporal_jitter_drift",
  "seam_edge_instability",
];
