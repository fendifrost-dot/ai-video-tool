/**
 * Crossed-arms visible-geometry lock.
 *
 * The canonical V2 still has arms crossed for the entire clip. A
 * shoulder→cuff quad is not placeable. This module rejects quads that
 * claim hidden geometry and never upgrades that rejection into a pass.
 */

import type { BinaryMask, QuadNorm, QuadPts, SleeveSide } from "./types";
import { CROSSED_ARMS_VISIBILITY } from "./types";
import { countMask, intersectMasks, quadNormToPts, rasterizeQuadMask } from "./raster";

export const VISIBLE_COVERAGE_MIN = 0.85;
export const HIDDEN_COVERAGE_MAX = 0.05;

export type VisibleQuadAssessment = {
  ok: boolean;
  side: SleeveSide;
  reason: string;
  visibleFrac: number;
  hiddenFrac: number;
  chestReservedFrac: number;
  centroidInVisible: boolean;
  quadPixelCount: number;
  visiblePixelCount: number;
  hiddenPixelCount: number;
};

export function poseLockStatement(): string {
  return CROSSED_ARMS_VISIBILITY.notes;
}

export function assessVisibleSleeveQuad(input: {
  side: SleeveSide;
  targetQuadNorm: QuadNorm;
  width: number;
  height: number;
  visibleMask: BinaryMask;
  hiddenMask: BinaryMask;
  chestReservedMask?: BinaryMask | null;
}): VisibleQuadAssessment {
  const quadPts: QuadPts = quadNormToPts(input.targetQuadNorm, input.width, input.height);
  const quadMask = rasterizeQuadMask(input.width, input.height, quadPts);
  const quadN = countMask(quadMask);
  const visibleN = countMask(intersectMasks(quadMask, input.visibleMask));
  const hiddenN = countMask(intersectMasks(quadMask, input.hiddenMask));
  const reserved = input.chestReservedMask;
  const reservedN = reserved ? countMask(intersectMasks(quadMask, reserved)) : 0;

  const visibleFrac = quadN > 0 ? visibleN / quadN : 0;
  const hiddenFrac = quadN > 0 ? hiddenN / quadN : 1;
  const chestReservedFrac = quadN > 0 ? reservedN / quadN : 0;

  const xs = input.targetQuadNorm.map(([x]) => x);
  const ys = input.targetQuadNorm.map(([, y]) => y);
  const cx = ((xs[0] + xs[1] + xs[2] + xs[3]) / 4) * input.width;
  const cy = ((ys[0] + ys[1] + ys[2] + ys[3]) / 4) * input.height;
  const cxi = Math.max(0, Math.min(input.width - 1, Math.round(cx)));
  const cyi = Math.max(0, Math.min(input.height - 1, Math.round(cy)));
  const centroidInVisible = input.visibleMask.data[cyi * input.width + cxi] === 1;

  let reason = "ok";
  let ok = true;
  if (quadN === 0) {
    ok = false;
    reason = "empty_quad";
  } else if (hiddenFrac > HIDDEN_COVERAGE_MAX) {
    ok = false;
    reason = "hidden_geometry_unvalidated";
  } else if (visibleFrac < VISIBLE_COVERAGE_MIN) {
    ok = false;
    reason = "insufficient_visible_coverage";
  } else if (!centroidInVisible) {
    ok = false;
    reason = "centroid_outside_visible_upper_arm";
  }

  return {
    ok,
    side: input.side,
    reason,
    visibleFrac,
    hiddenFrac,
    chestReservedFrac,
    centroidInVisible,
    quadPixelCount: quadN,
    visiblePixelCount: visibleN,
    hiddenPixelCount: hiddenN,
  };
}
