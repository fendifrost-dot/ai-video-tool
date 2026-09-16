/**
 * SAM-3 mask continuity evidence for the temporal path.
 * Caller-supplied / synthetic masks only — never fetches sam3-segment-proxy.
 */

import type { BinaryMask } from "../contract";
import { maskArea, maskIoU } from "../mask";
import { DEFAULT_TEMPORAL_QA_THRESHOLDS, type TemporalQaThresholds } from "./thresholds";

export type Sam3FrameContinuity = {
  index: number;
  consecutiveIou: number | null;
  area: number;
  repairOverlap: number | null;
};

export type Sam3ContinuitySummary = {
  sam3LiveFetch: false;
  frameCount: number;
  meanConsecutiveIou: number;
  minConsecutiveIou: number;
  discontinuityFrames: number;
  meanRepairOverlap: number;
  emptyMaskFrames: number;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function unionMaskList(masks: BinaryMask[]): BinaryMask | null {
  const first = masks[0];
  if (!first) return null;
  const data = new Uint8Array(first.data.length);
  for (const mask of masks) {
    if (mask.width !== first.width || mask.height !== first.height) continue;
    for (let i = 0; i < data.length; i++) {
      if (mask.data[i] === 1) data[i] = 1;
    }
  }
  return { width: first.width, height: first.height, data };
}

export function scoreSam3Continuity(
  sam3Masks: BinaryMask[],
  repairMasksByFrame?: Map<number, BinaryMask>,
  thresholds: TemporalQaThresholds = DEFAULT_TEMPORAL_QA_THRESHOLDS,
): { frames: Sam3FrameContinuity[]; summary: Sam3ContinuitySummary } {
  const frames: Sam3FrameContinuity[] = sam3Masks.map((mask, i) => {
    const prev = i > 0 ? sam3Masks[i - 1] : undefined;
    const repair = repairMasksByFrame?.get(i);
    return {
      index: i,
      consecutiveIou: prev ? maskIoU(prev, mask) : null,
      area: maskArea(mask),
      repairOverlap: repair ? maskIoU(mask, repair) : null,
    };
  });

  const ious = frames
    .map((f) => f.consecutiveIou)
    .filter((v): v is number => v != null);
  const overlaps = frames
    .map((f) => f.repairOverlap)
    .filter((v): v is number => v != null);

  return {
    frames,
    summary: {
      sam3LiveFetch: false,
      frameCount: sam3Masks.length,
      meanConsecutiveIou: mean(ious.length ? ious : [1]),
      minConsecutiveIou: ious.length ? Math.min(...ious) : 1,
      discontinuityFrames: frames.filter(
        (f) => f.consecutiveIou != null && f.consecutiveIou < thresholds.minSam3ConsecutiveIou,
      ).length,
      meanRepairOverlap: mean(overlaps),
      emptyMaskFrames: frames.filter((f) => f.area === 0).length,
    },
  };
}
