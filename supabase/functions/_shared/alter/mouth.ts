import { IDENTITY_DISTANCE_MAX, LANDMARK_DISTANCE_WATCH, MOUTH_TIMING_MIN } from "./gates.ts";
import type { GrayFrame, MouthFrame, MouthPoint } from "./types.ts";

export type MouthScore = {
  measured: boolean;
  timing: number | null;
  landmarkDistance: number | null;
  timingFails: boolean;
  landmarkWatch: boolean;
  issues: string[];
};

function corr(left: number[], right: number[]): number {
  const n = Math.min(left.length, right.length);
  if (n < 3) return 1;
  let meanL = 0;
  let meanR = 0;
  for (let i = 0; i < n; i++) {
    meanL += left[i];
    meanR += right[i];
  }
  meanL /= n;
  meanR /= n;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    const a = left[i] - meanL;
    const b = right[i] - meanR;
    dot += a * b;
    aa += a * a;
    bb += b * b;
  }
  const den = Math.sqrt(aa * bb);
  return den > 0 ? dot / den : 0;
}

function pointDistance(left: MouthPoint[], right: MouthPoint[]): number | null {
  if (!left.length || left.length !== right.length) return null;
  let sum = 0;
  for (let i = 0; i < left.length; i++) {
    const dx = left[i].x - right[i].x;
    const dy = left[i].y - right[i].y;
    sum += Math.hypot(dx, dy);
  }
  return sum / left.length;
}

/**
 * Compare mouth openness (lip gap / face width) and, when both sides supply the
 * same landmarks, the mean point distance in frame units.
 */
export function scoreMouth(source: MouthFrame[], output: MouthFrame[]): MouthScore {
  if (source.length < 3 || output.length < 3) {
    return {
      measured: false,
      timing: null,
      landmarkDistance: null,
      timingFails: false,
      landmarkWatch: false,
      issues: ["mouth: fewer than 3 frames, so lip sync was not scored"],
    };
  }
  const timing = corr(
    source.map((frame) => frame.openness),
    output.map((frame) => frame.openness),
  );
  const distances: number[] = [];
  const n = Math.min(source.length, output.length);
  for (let i = 0; i < n; i++) {
    if (source[i].points && output[i].points) {
      const distance = pointDistance(source[i].points!, output[i].points!);
      if (distance != null) distances.push(distance);
    }
  }
  const landmarkDistance = distances.length
    ? distances.reduce((sum, value) => sum + value, 0) / distances.length
    : null;
  const issues: string[] = [];
  const timingFails = timing < MOUTH_TIMING_MIN;
  if (timingFails) {
    issues.push(
      `mouth timing ${timing.toFixed(2)} is below ${MOUTH_TIMING_MIN} (the sung-line lip gate). The redraw does not keep his mouth.`,
    );
  }
  const landmarkWatch = landmarkDistance != null && landmarkDistance > LANDMARK_DISTANCE_WATCH;
  if (landmarkWatch) {
    issues.push(
      `mouth landmarks sit ${landmarkDistance!.toFixed(3)} of the frame apart, above the provisional watch of ${LANDMARK_DISTANCE_WATCH}. This warns. It is not a certified fail.`,
    );
  }
  return { measured: true, timing, landmarkDistance, timingFails, landmarkWatch, issues };
}

/** Mean darkness of a rectangle. A stand-in only. It cannot clear a rapping shot. */
export function opennessFromBox(
  frame: GrayFrame,
  box: { x: number; y: number; width: number; height: number },
): number {
  let sum = 0;
  let count = 0;
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(frame.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(frame.height, Math.ceil(box.y + box.height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sum += 255 - (frame.data[y * frame.width + x] ?? 0);
      count++;
    }
  }
  return count ? sum / count / 255 : 0;
}

export function identityFails(distance: number | null | undefined): {
  measured: boolean;
  fails: boolean;
  issue?: string;
} {
  if (distance == null || Number.isNaN(distance)) {
    return {
      measured: false,
      fails: false,
      issue: "identity was not measured. A rapping redraw is not cleared without it.",
    };
  }
  if (distance > IDENTITY_DISTANCE_MAX) {
    return {
      measured: true,
      fails: true,
      issue: `identity distance ${distance.toFixed(3)} is above ${IDENTITY_DISTANCE_MAX} (camera_coverage identity_max). The face is not his.`,
    };
  }
  return { measured: true, fails: false };
}
