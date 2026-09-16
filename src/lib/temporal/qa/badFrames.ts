/**
 * Automatic bad-frame identification from temporal QA metrics.
 * Stable reason tokens for machine-readable evidence.
 */

import type { InjectedDefectWindow } from "../fullClipFixture";
import type { TemporalFrameMetrics } from "./metrics";
import type { Sam3FrameContinuity } from "./sam3Continuity";
import { DEFAULT_TEMPORAL_QA_THRESHOLDS, type TemporalQaThresholds } from "./thresholds";

export type TemporalBadFrameReason =
  | "low_confidence"
  | "reanchor_recommended"
  | "hold"
  | "failed_match"
  | "scene_cut"
  | "drift_exceeded"
  | "flicker_iou"
  | "coverage_hole"
  | "coverage_overflow"
  | "occlusion_discontinuity"
  | "sam3_discontinuity";

export type TemporalBadFrame = {
  index: number;
  jobKind: string;
  reasons: TemporalBadFrameReason[];
};

const ENGINE_REASON_MAP: Record<string, TemporalBadFrameReason> = {
  failed_match: "failed_match",
  scene_cut: "scene_cut",
};

export function reasonsForFrame(
  frame: TemporalFrameMetrics,
  jobKind: string,
  opts: {
    thresholds?: TemporalQaThresholds;
    sam3?: Sam3FrameContinuity | null;
  } = {},
): TemporalBadFrame | null {
  const thresholds = opts.thresholds ?? DEFAULT_TEMPORAL_QA_THRESHOLDS;
  const reasons: TemporalBadFrameReason[] = [];

  if (frame.confidence < thresholds.minConfidence) reasons.push("low_confidence");
  if (frame.reanchorRecommended) reasons.push("reanchor_recommended");
  if (frame.source === "hold") reasons.push("hold");
  for (const r of frame.reanchorReasons) {
    const mapped = ENGINE_REASON_MAP[r];
    if (mapped && !reasons.includes(mapped)) reasons.push(mapped);
  }
  if (frame.driftPx > thresholds.maxDriftPx) reasons.push("drift_exceeded");
  if (frame.consecutiveIou != null && frame.consecutiveIou < thresholds.minConsecutiveIou) {
    reasons.push("flicker_iou");
  }
  if (frame.coverageRatio < thresholds.minCoverageRatio) reasons.push("coverage_hole");
  if (frame.coverageRatio > thresholds.maxCoverageRatio) reasons.push("coverage_overflow");
  if (
    frame.centroidJumpPx != null &&
    frame.centroidJumpPx > thresholds.maxCentroidJumpPx &&
    frame.source !== "hold" &&
    frame.source !== "anchor_snap"
  ) {
    reasons.push("occlusion_discontinuity");
  }
  if (
    opts.sam3 &&
    opts.sam3.consecutiveIou != null &&
    opts.sam3.consecutiveIou < thresholds.minSam3ConsecutiveIou
  ) {
    reasons.push("sam3_discontinuity");
  }

  if (reasons.length === 0) return null;
  return { index: frame.index, jobKind, reasons };
}

export function identifyBadFrames(
  jobKind: string,
  frames: TemporalFrameMetrics[],
  opts: {
    thresholds?: TemporalQaThresholds;
    sam3Frames?: Sam3FrameContinuity[];
  } = {},
): TemporalBadFrame[] {
  const sam3ByIndex = new Map((opts.sam3Frames ?? []).map((f) => [f.index, f]));
  const out: TemporalBadFrame[] = [];
  for (const frame of frames) {
    const flagged = reasonsForFrame(frame, jobKind, {
      thresholds: opts.thresholds,
      sam3: sam3ByIndex.get(frame.index) ?? null,
    });
    if (flagged) out.push(flagged);
  }
  return out;
}

/** True when every injected defect window has at least one flagged frame. */
export function detectorHitAllWindows(
  badFrames: TemporalBadFrame[],
  windows: readonly InjectedDefectWindow[],
  jobKind?: string,
): boolean {
  if (windows.length === 0) return true;
  const relevant = jobKind ? badFrames.filter((f) => f.jobKind === jobKind) : badFrames;
  return windows.every((w) => relevant.some((f) => f.index >= w.start && f.index <= w.end));
}
