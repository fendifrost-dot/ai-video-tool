/** Lane C2 temporal video-QA thresholds. Measurement-only — not paint gates. */

export const TEMPORAL_VIDEO_QA_SPEC_VERSION = "temporal-video-qa-v1" as const;

export const DEFAULT_TEMPORAL_QA_THRESHOLDS = {
  minConfidence: 0.6,
  maxDriftPx: 1.5,
  minConsecutiveIou: 0.75,
  minCoverageRatio: 0.55,
  maxCoverageRatio: 1.45,
  maxCentroidJumpPx: 6,
  occlusionRecoveryFrames: 8,
  minSam3ConsecutiveIou: 0.6,
  minSam3RepairOverlap: 0.15,
} as const;

export type TemporalQaThresholds = typeof DEFAULT_TEMPORAL_QA_THRESHOLDS;
