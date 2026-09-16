/**
 * Per-frame temporal metrics on a PropagationOutput.
 * Drift / flicker / coverage / occlusion continuity. No providers.
 */

import type { BinaryMask, PropagatedFrame, PropagationOutput, SourceClipFrame } from "../contract";
import { translationOf } from "../geometry";
import { maskArea, maskBBox, maskIoU } from "../mask";
import { DEFAULT_TEMPORAL_QA_THRESHOLDS, type TemporalQaThresholds } from "./thresholds";

export interface MaskCentroid {
  x: number;
  y: number;
}

export function maskCentroid(mask: BinaryMask): MaskCentroid | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  const { width, height, data } = mask;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x] !== 1) continue;
      sx += x + 0.5;
      sy += y + 0.5;
      n++;
    }
  }
  if (n === 0) return null;
  return { x: sx / n, y: sy / n };
}

/** Fraction of mask pixels whose clip luma is “on” (≥ threshold). */
export function maskSupportCoverage(
  mask: BinaryMask,
  luma: Uint8Array,
  threshold = 128,
): number {
  let on = 0;
  let n = 0;
  const nPix = Math.min(mask.data.length, luma.length);
  for (let i = 0; i < nPix; i++) {
    if (mask.data[i] !== 1) continue;
    n++;
    if (luma[i]! >= threshold) on++;
  }
  return n === 0 ? 0 : on / n;
}

export type TemporalFrameMetrics = {
  index: number;
  confidence: number;
  source: PropagatedFrame["source"];
  reanchorRecommended: boolean;
  reanchorReasons: string[];
  driftPx: number;
  expectedDx: number;
  measuredDx: number;
  measuredDy: number;
  coverageRatio: number;
  supportCoverage: number;
  maskArea: number;
  consecutiveIou: number | null;
  centroidJumpPx: number | null;
};

export type DriftSummary = {
  maxPx: number;
  meanPx: number;
  framesOverThreshold: number;
};

export type FlickerSummary = {
  minConsecutiveIou: number;
  meanConsecutiveIou: number;
  framesBelowThreshold: number;
};

export type CoverageSummary = {
  minRatio: number;
  meanRatio: number;
  minSupport: number;
  meanSupport: number;
  holeFrames: number;
  overflowFrames: number;
};

export type OcclusionSummary = {
  declaredWindowCount: number;
  flaggedInWindows: number;
  recoveryLagFrames: number | null;
  discontinuityFrames: number;
  holdLatchedAfterBreak: boolean;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function scorePropagationFrames(
  output: PropagationOutput,
  expectedDx: number[],
  clipFrames: SourceClipFrame[] = [],
): TemporalFrameMetrics[] {
  const canonical = output.frames.find((f) => f.index === output.canonicalIndex);
  const canonicalArea = canonical ? maskArea(canonical.mask) : 0;
  const lumaByIndex = new Map(clipFrames.map((f) => [f.index, f.luma]));
  const sorted = [...output.frames].sort((a, b) => a.index - b.index);

  return sorted.map((frame, i) => {
    const t = translationOf(frame.transform);
    const expected = expectedDx[frame.index] ?? 0;
    const driftPx = Math.hypot(t.dx - expected, t.dy);
    const area = maskArea(frame.mask);
    const coverageRatio = canonicalArea === 0 ? 0 : area / canonicalArea;
    const luma = lumaByIndex.get(frame.index);
    const supportCoverage = luma ? maskSupportCoverage(frame.mask, luma) : 1;
    const prev = i > 0 ? sorted[i - 1] : undefined;
    const consecutiveIou = prev ? maskIoU(prev.mask, frame.mask) : null;
    const prevC = prev ? maskCentroid(prev.mask) : null;
    const curC = maskCentroid(frame.mask);
    const centroidJumpPx =
      prevC && curC ? Math.hypot(curC.x - prevC.x, curC.y - prevC.y) : null;
    return {
      index: frame.index,
      confidence: frame.confidence,
      source: frame.source,
      reanchorRecommended: frame.reanchorRecommended,
      reanchorReasons: [...frame.reanchorReasons],
      driftPx,
      expectedDx: expected,
      measuredDx: t.dx,
      measuredDy: t.dy,
      coverageRatio,
      supportCoverage,
      maskArea: area,
      consecutiveIou,
      centroidJumpPx,
    };
  });
}

export function summarizeDrift(
  frames: TemporalFrameMetrics[],
  thresholds: TemporalQaThresholds = DEFAULT_TEMPORAL_QA_THRESHOLDS,
): DriftSummary {
  const vals = frames.map((f) => f.driftPx);
  return {
    maxPx: vals.length ? Math.max(...vals) : 0,
    meanPx: mean(vals),
    framesOverThreshold: frames.filter((f) => f.driftPx > thresholds.maxDriftPx).length,
  };
}

export function summarizeFlicker(
  frames: TemporalFrameMetrics[],
  thresholds: TemporalQaThresholds = DEFAULT_TEMPORAL_QA_THRESHOLDS,
): FlickerSummary {
  const ious = frames
    .map((f) => f.consecutiveIou)
    .filter((v): v is number => v != null);
  return {
    minConsecutiveIou: ious.length ? Math.min(...ious) : 1,
    meanConsecutiveIou: mean(ious.length ? ious : [1]),
    framesBelowThreshold: frames.filter(
      (f) => f.consecutiveIou != null && f.consecutiveIou < thresholds.minConsecutiveIou,
    ).length,
  };
}

export function summarizeCoverage(
  frames: TemporalFrameMetrics[],
  thresholds: TemporalQaThresholds = DEFAULT_TEMPORAL_QA_THRESHOLDS,
): CoverageSummary {
  const ratios = frames.map((f) => f.coverageRatio);
  const support = frames.map((f) => f.supportCoverage);
  return {
    minRatio: ratios.length ? Math.min(...ratios) : 0,
    meanRatio: mean(ratios),
    minSupport: support.length ? Math.min(...support) : 0,
    meanSupport: mean(support),
    holeFrames: frames.filter(
      (f) =>
        f.coverageRatio < thresholds.minCoverageRatio ||
        f.supportCoverage < thresholds.minCoverageRatio,
    ).length,
    overflowFrames: frames.filter((f) => f.coverageRatio > thresholds.maxCoverageRatio).length,
  };
}

export function summarizeOcclusion(
  frames: TemporalFrameMetrics[],
  windows: readonly { start: number; end: number }[],
  thresholds: TemporalQaThresholds = DEFAULT_TEMPORAL_QA_THRESHOLDS,
): OcclusionSummary {
  const inWindow = (index: number) => windows.some((w) => index >= w.start && index <= w.end);
  const flaggedInWindows = frames.filter(
    (f) =>
      inWindow(f.index) &&
      (f.source === "hold" ||
        f.reanchorRecommended ||
        f.coverageRatio < thresholds.minCoverageRatio ||
        f.supportCoverage < thresholds.minCoverageRatio ||
        f.confidence < thresholds.minConfidence),
  ).length;

  let recoveryLagFrames: number | null = null;
  if (windows.length > 0) {
    const lastEnd = Math.max(...windows.map((w) => w.end));
    const recovered = frames.find(
      (f) =>
        f.index > lastEnd &&
        f.index <= lastEnd + thresholds.occlusionRecoveryFrames &&
        f.supportCoverage >= 0.85,
    );
    recoveryLagFrames = recovered ? recovered.index - lastEnd : null;
  }

  const firstHold = frames.find((f) => f.source === "hold");
  const holdLatchedAfterBreak =
    firstHold != null &&
    frames.filter((f) => f.index > firstHold.index && f.source === "hold").length >
      frames.filter((f) => f.index > firstHold.index && f.source !== "hold").length;

  const discontinuityFrames = frames.filter(
    (f) =>
      f.centroidJumpPx != null &&
      f.centroidJumpPx > thresholds.maxCentroidJumpPx &&
      f.source !== "hold" &&
      f.source !== "anchor_snap",
  ).length;

  return {
    declaredWindowCount: windows.length,
    flaggedInWindows,
    recoveryLagFrames,
    discontinuityFrames,
    holdLatchedAfterBreak,
  };
}

export function bboxArea(mask: BinaryMask): number {
  const box = maskBBox(mask);
  if (!box) return 0;
  return (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1);
}
