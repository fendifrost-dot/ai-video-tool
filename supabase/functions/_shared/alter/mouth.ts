import {
  IDENTITY_DISTANCE_MAX,
  LANDMARK_DISTANCE_WATCH,
  MOUTH_COVERAGE_MIN,
  MOUTH_LAG_GAIN,
  MOUTH_LAG_OK,
  MOUTH_MAX_LAG,
  MOUTH_SHAPE_MAX,
  MOUTH_TIMING_MIN,
} from "./gates.ts";
import type { GrayFrame, MouthFrame, MouthPoint } from "./types.ts";

export type MouthScore = {
  measured: boolean;
  /** Correlation of the mouth opening on the take's own clock. */
  timing: number | null;
  /** The best correlation within MOUTH_MAX_LAG frames either way, and the lag it was found at (> 0: the redraw is late). */
  timingBest: number | null;
  lagFrames: number;
  /** Mean distance between the take's lip points and the redraw's, in face widths. */
  landmarkDistance: number | null;
  /** Share of frames where his face was found in both clips. */
  coverage: number;
  timingFails: boolean;
  shapeFails: boolean;
  landmarkWatch: boolean;
  issues: string[];
};

function corr(left: number[], right: number[]): number | null {
  const n = Math.min(left.length, right.length);
  if (n < 3) return null;
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
  return den > 0 ? Math.max(-1, Math.min(1, dot / den)) : 0;
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

/** One sentence for a failed timing: re-timed (right mouth, wrong moment) or not his mouth at all. */
function timingIssue(timing: number, best: number, lag: number, retimed: boolean): string {
  if (retimed)
    return `mouth timing is ${timing.toFixed(2)} on the take's clock and ${best.toFixed(2)} when moved ${Math.abs(lag)} frames ${lag > 0 ? "earlier" : "later"}: the redraw re-timed his mouth. The song does not move, so it fails.`;
  return `mouth timing ${timing.toFixed(2)} is below ${MOUTH_TIMING_MIN}. The redraw does not keep his mouth.`;
}

const usable = (frame: MouthFrame | undefined): frame is MouthFrame =>
  !!frame && frame.found !== false && Number.isFinite(frame.openness);

/**
 * Compare the take's mouth with the redraw's, frame by frame.
 *
 * Timing is the correlation of mouth opening (lip gap / face width) on the take's clock. A redraw whose mouth is
 * right but late scores low on the clock and high a few frames away: that is reported as re-timed, and still fails,
 * because the song does not move. Shape is the mean lip-point distance in face widths, when both sides carry points.
 * A frame with no face on either side is left out and counted: below MOUTH_COVERAGE_MIN nothing is claimed.
 */
const TOO_FEW_FRAMES =
  "mouth: fewer than 3 frames with his face in both clips, so lip sync was not scored";

export function scoreMouth(source: MouthFrame[], output: MouthFrame[]): MouthScore {
  const total = Math.min(source.length, output.length);
  const pairs: Array<[MouthFrame, MouthFrame]> = [];
  for (let i = 0; i < total; i++) {
    if (usable(source[i]) && usable(output[i])) pairs.push([source[i], output[i]]);
  }
  const coverage = total ? pairs.length / total : 0;
  const empty = {
    timing: null,
    timingBest: null,
    lagFrames: 0,
    landmarkDistance: null,
    coverage,
    timingFails: false,
    shapeFails: false,
    landmarkWatch: false,
  };
  if (pairs.length < 3) {
    return {
      measured: false,
      ...empty,
      issues: [TOO_FEW_FRAMES],
    };
  }
  if (coverage < MOUTH_COVERAGE_MIN) {
    return {
      measured: false,
      ...empty,
      issues: [
        `mouth: his face was found in both clips on ${(coverage * 100).toFixed(0)}% of the frames, below ${MOUTH_COVERAGE_MIN * 100}%. Lip sync is not claimed on a face that was not read.`,
      ],
    };
  }
  const a = pairs.map(([frame]) => frame.openness);
  const b = pairs.map(([, frame]) => frame.openness);
  const timing = corr(a, b) ?? 0;
  let timingBest = timing;
  let lagFrames = 0;
  for (let lag = -MOUTH_MAX_LAG; lag <= MOUTH_MAX_LAG; lag++) {
    if (lag === 0 || Math.abs(lag) > a.length - 3) continue;
    const c = lag > 0 ? corr(a.slice(0, -lag), b.slice(lag)) : corr(a.slice(-lag), b.slice(0, lag));
    if (c != null && c > timingBest) {
      timingBest = c;
      lagFrames = lag;
    }
  }
  const distances: number[] = [];
  for (const [left, right] of pairs) {
    if (left.points && right.points) {
      const distance = pointDistance(left.points, right.points);
      if (distance != null) distances.push(distance);
    }
  }
  const landmarkDistance = distances.length
    ? distances.reduce((sum, value) => sum + value, 0) / distances.length
    : null;
  const issues: string[] = [];
  const retimed = Math.abs(lagFrames) > MOUTH_LAG_OK && timingBest - timing > MOUTH_LAG_GAIN;
  const timingFails = timing < MOUTH_TIMING_MIN || retimed;
  if (timingFails) issues.push(timingIssue(timing, timingBest, lagFrames, retimed));
  const shapeFails = landmarkDistance != null && landmarkDistance > MOUTH_SHAPE_MAX;
  if (shapeFails) {
    issues.push(
      `mouth shape is ${landmarkDistance!.toFixed(3)} face widths from the take's, above ${MOUTH_SHAPE_MAX}. The redraw draws other mouth shapes than he made.`,
    );
  }
  const landmarkWatch =
    !shapeFails && landmarkDistance != null && landmarkDistance > LANDMARK_DISTANCE_WATCH;
  if (landmarkWatch) {
    issues.push(
      `mouth shape is ${landmarkDistance!.toFixed(3)} face widths from the take's, above the provisional watch of ${LANDMARK_DISTANCE_WATCH}. This warns. It is not a certified fail.`,
    );
  }
  return {
    measured: true,
    timing,
    timingBest,
    lagFrames,
    landmarkDistance,
    coverage,
    timingFails,
    shapeFails,
    landmarkWatch,
    issues,
  };
}

/** What scripts/alter/track_mouth.py `score` writes for a take and its redraw. */
export type TrackScore = {
  measured?: boolean;
  coverage?: number;
  timing?: number | null;
  timing_best?: number | null;
  lag_frames?: number;
  mouth_shape_distance?: number | null;
  pose_turn_difference?: number | null;
  pose_ok_for_putback?: boolean;
  identity_distance?: number | null;
};

/**
 * Hold a tracker score against the same gates as scoreMouth. The tracker measures on the machine that has the
 * footage; the numbers are judged here so there is one set of thresholds.
 */
export function gateTrackScore(score: TrackScore): MouthScore {
  const coverage = typeof score.coverage === "number" ? score.coverage : 0;
  const timing = typeof score.timing === "number" ? score.timing : null;
  const shape = typeof score.mouth_shape_distance === "number" ? score.mouth_shape_distance : null;
  const base = {
    timing,
    timingBest: typeof score.timing_best === "number" ? score.timing_best : timing,
    lagFrames: typeof score.lag_frames === "number" ? score.lag_frames : 0,
    landmarkDistance: shape,
    coverage,
  };
  if (score.measured === false || timing == null || coverage < MOUTH_COVERAGE_MIN) {
    return {
      measured: false,
      ...base,
      timingFails: false,
      shapeFails: false,
      landmarkWatch: false,
      issues: [
        coverage < MOUTH_COVERAGE_MIN
          ? `mouth: his face was read on ${(coverage * 100).toFixed(0)}% of the frames of both clips (needs ${MOUTH_COVERAGE_MIN * 100}%). Lip sync is not claimed.`
          : TOO_FEW_FRAMES,
      ],
    };
  }
  const issues: string[] = [];
  const best = base.timingBest ?? timing;
  const retimed = Math.abs(base.lagFrames) > MOUTH_LAG_OK && best - timing > MOUTH_LAG_GAIN;
  const timingFails = timing < MOUTH_TIMING_MIN || retimed;
  if (timingFails) issues.push(timingIssue(timing, best, base.lagFrames, retimed));
  const shapeFails = shape != null && shape > MOUTH_SHAPE_MAX;
  if (shapeFails)
    issues.push(
      `mouth shape is ${shape!.toFixed(3)} face widths from the take's, above ${MOUTH_SHAPE_MAX}. The redraw draws other mouth shapes than he made.`,
    );
  const landmarkWatch = !shapeFails && shape != null && shape > LANDMARK_DISTANCE_WATCH;
  if (landmarkWatch)
    issues.push(
      `mouth shape is ${shape!.toFixed(3)} face widths from the take's, above the provisional watch of ${LANDMARK_DISTANCE_WATCH}. This warns. It is not a certified fail.`,
    );
  return { measured: true, ...base, timingFails, shapeFails, landmarkWatch, issues };
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
      issue:
        "identity was not measured. The face is cleared by the number or by Fendi's word on the face sheet, not by this check.",
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
