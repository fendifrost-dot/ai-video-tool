import {
  CHANGED_RANGE,
  IDENTITY_DISTANCE_MAX,
  MOTION_GATED,
  MOTION_MIN,
  RESTYLE_STRUCTURE_MAX,
  STRUCTURE_FLOOR,
} from "./gates.ts";
import { gateTrackScore, type MouthScore } from "./mouth.ts";
import { CHECK_MODES, type CheckMode } from "./types.ts";

/**
 * The one place a draft is judged. `checkAlter` measures frames and calls this; `avt_alter_check` and
 * `planFinalize` are handed a report and call this again on its NUMBERS, so a flag or an issue list typed by a
 * caller decides nothing. Nothing here reads video or calls a provider.
 */
export type Measurements = {
  mode: CheckMode;
  performance: boolean;
  sourceFrames: number;
  outputFrames: number;
  structureMedian: number;
  changedArea: number;
  motionCorrelation: number;
  /** Median absolute deviation of the take's own frame-to-frame motion. Near zero on a still take. */
  motionSpread: number;
  jumps: number[];
  frozenFrom: number[];
  tailTrimFrames: number;
  /** Runs of frames that lose the source structure, [first, last], the tail run excluded. */
  driftRuns: [number, number][];
};

export type Clearance = {
  verdict: "PASS" | "CHECK";
  /** True when the redraw may be used as it is: no open issue, the mouth passed, the face has a passing number. */
  redrawCleared: boolean;
  /** True when everything measured passed and only the face is open: no identity number, so Fendi judges it. */
  faceNeedsHisEye: boolean;
  next: string;
};

export const IDENTITY_UNMEASURED =
  "identity was not measured. The face is cleared by the number or by Fendi's word on the face sheet, not by this check.";

export function isWarning(issue: string): boolean {
  return issue.includes("This warns.");
}

/** Issues that still stand once warnings and the identity-unmeasured line are set aside. */
export function openIssues(issues: string[]): string[] {
  return issues.filter((issue) => !isWarning(issue) && issue !== IDENTITY_UNMEASURED);
}

export function frameIssues(m: Measurements): string[] {
  const issues: string[] = [];
  if (Math.abs(m.sourceFrames - m.outputFrames) > 1)
    issues.push(`length: source ${m.sourceFrames} frames, output ${m.outputFrames} frames`);
  if (m.mode === "restyle" && m.structureMedian > RESTYLE_STRUCTURE_MAX)
    issues.push(
      `restyle: structure median ${m.structureMedian.toFixed(2)} > ${RESTYLE_STRUCTURE_MAX}. The source surface survived. Add a target frame.`,
    );
  if (m.structureMedian < STRUCTURE_FLOOR[m.mode])
    issues.push(
      `structure: median ${m.structureMedian.toFixed(2)} < ${STRUCTURE_FLOOR[m.mode]} for a ${m.mode}`,
    );
  if (m.tailTrimFrames > 0)
    issues.push(`tail drift: trim the last ${m.tailTrimFrames} frames on every version alike`);
  if (m.mode === "swap" || m.mode === "action") {
    const long = m.driftRuns.filter(([first, last]) => last - first + 1 >= 6);
    for (const [first, last] of long.slice(0, 10))
      issues.push(`drift: frames ${first}-${last} lose the source structure`);
    if (long.length > 10)
      issues.push(`drift: ${long.length - 10} more runs lose the source structure`);
  }
  const [low, high] = CHANGED_RANGE[m.mode];
  if (m.changedArea < low)
    issues.push(
      `change: only ${(m.changedArea * 100).toFixed(1)}% of the frame differs; the ${m.mode} did not take`,
    );
  else if (m.changedArea > high)
    issues.push(
      `change: ${Math.round(m.changedArea * 100)}% of the frame differs; a ${m.mode} should leave most of it alone`,
    );
  if (MOTION_GATED[m.mode]) {
    if (m.motionCorrelation < MOTION_MIN && m.motionSpread > 0.3)
      issues.push(`motion: correlation ${m.motionCorrelation.toFixed(2)} < ${MOTION_MIN}`);
    if (m.jumps.length) issues.push(`jump at frames ${m.jumps.slice(0, 10).join(", ")}`);
  }
  if (m.frozenFrom.length)
    issues.push(
      `frozen output while the source moves, from frames ${m.frozenFrom.slice(0, 10).join(", ")}`,
    );
  return issues;
}

export function identityIssue(distance: number | null): string | null {
  if (distance == null) return IDENTITY_UNMEASURED;
  if (distance > IDENTITY_DISTANCE_MAX)
    return `identity distance ${distance.toFixed(3)} is above ${IDENTITY_DISTANCE_MAX} (camera_coverage identity_max). The face is not his.`;
  return null;
}

/** Everything that decides: the frame issues, the mouth (a performance only) and the face. */
export function judge(
  m: Measurements,
  mouth: MouthScore | null,
  identityDistance: number | null,
): Clearance & { issues: string[] } {
  const issues = frameIssues(m);
  if (m.performance) {
    if (mouth) issues.push(...mouth.issues);
    else
      issues.push("mouth: no mouth score was supplied. A rapping shot is not cleared without one.");
  }
  // The edit redraws his face whether or not he is rapping, so the face is judged on every clip.
  const face = identityIssue(identityDistance);
  if (face) issues.push(face);
  const open = openIssues(issues);
  const mouthOk =
    !m.performance || (mouth?.measured === true && !mouth.timingFails && !mouth.shapeFails);
  const measured = identityDistance != null;
  const faceOk = measured && identityDistance <= IDENTITY_DISTANCE_MAX;
  const redrawCleared = open.length === 0 && mouthOk && faceOk;
  const faceNeedsHisEye = open.length === 0 && mouthOk && !measured;
  return {
    issues,
    verdict: issues.some((issue) => !isWarning(issue)) ? "CHECK" : "PASS",
    redrawCleared,
    faceNeedsHisEye,
    next: redrawCleared
      ? "Cleared by the numbers, identity included. Post the side-by-side and the face sheet."
      : faceNeedsHisEye
        ? "Everything measured passed. The face has no number: post the side-by-side and the face sheet, and Fendi judges the face."
        : "Not cleared: read the issues. Re-roll, change the staging, or use his real take. Do not lay his original face back onto the redraw (failed by Fendi, 27 Nov 2026).",
  };
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, low: number, high: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high
    ? value
    : null;
}

function frames(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > 10000) return null;
  return value.every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0)
    ? (value as number[])
    : null;
}

export type Rejudged = Clearance & {
  mode: CheckMode;
  performance: boolean;
  measurements: Measurements;
  mouth: MouthScore | null;
  identity: { measured: boolean; fails: boolean; distance: number | null };
  issues: string[];
};

/**
 * Judge a report someone hands in (run_draft.py's report.json). Only its numbers are read; its own verdict, flags
 * and issue list are ignored and rebuilt. A report that is not shaped like one, or carries an impossible number,
 * is an error, not a pass.
 */
export function rejudge(
  report: unknown,
): { ok: true; value: Rejudged } | { ok: false; error: string } {
  const bad = (what: string) => ({
    ok: false as const,
    error: `report: ${what}. Pass the report.json that scripts/alter/run_draft.py wrote, unchanged.`,
  });
  if (!isObj(report)) return bad("not an object");
  const mode = (CHECK_MODES as readonly unknown[]).includes(report.mode)
    ? (report.mode as CheckMode)
    : null;
  if (!mode) return bad(`mode must be one of ${CHECK_MODES.join(", ")}`);
  if (typeof report.performance !== "boolean") return bad("performance must be true or false");
  const sourceFrames = num(report.sourceFrames, 1, 1e6);
  const outputFrames = num(report.outputFrames, 1, 1e6);
  const structureMedian = num(report.structureMedian, -1, 1);
  const changedArea = num(report.changedArea, 0, 1);
  const motionCorrelation = num(report.motionCorrelation, -1, 1);
  const motionSpread = num(report.motionSpread, 0, 255);
  const tailTrimFrames = num(report.tailTrimFrames, 0, 1e6);
  const jumps = frames(report.jumps);
  const frozenFrom = frames(report.frozenFrom);
  const runs =
    Array.isArray(report.driftRuns) && report.driftRuns.length <= 1000 ? report.driftRuns : null;
  if (
    sourceFrames == null ||
    outputFrames == null ||
    structureMedian == null ||
    changedArea == null ||
    motionCorrelation == null ||
    motionSpread == null ||
    tailTrimFrames == null ||
    !jumps ||
    !frozenFrom ||
    !runs
  )
    return bad("a measurement is missing or out of range");
  const driftRuns: [number, number][] = [];
  for (const run of runs) {
    const pair = frames(run);
    if (!pair || pair.length !== 2 || pair[1] < pair[0])
      return bad("driftRuns must be [first, last] pairs");
    driftRuns.push([pair[0], pair[1]]);
  }
  let mouth: MouthScore | null = null;
  if (report.mouth != null) {
    if (!isObj(report.mouth)) return bad("mouth must be an object or null");
    const m = report.mouth;
    const coverage = num(m.coverage, 0, 1);
    if (coverage == null) return bad("mouth.coverage must be between 0 and 1");
    const timing = m.timing == null ? null : num(m.timing, -1, 1);
    const best = m.timingBest == null ? null : num(m.timingBest, -1, 1);
    const lag = m.lagFrames == null ? 0 : num(m.lagFrames, -1000, 1000);
    const shape = m.landmarkDistance == null ? null : num(m.landmarkDistance, 0, 10);
    if (
      (m.timing != null && timing == null) ||
      (m.timingBest != null && best == null) ||
      lag == null ||
      (m.landmarkDistance != null && shape == null)
    )
      return bad("a mouth number is out of range");
    mouth = gateTrackScore({
      measured: m.measured === true,
      coverage,
      timing,
      timing_best: best,
      lag_frames: lag,
      mouth_shape_distance: shape,
    });
  }
  let distance: number | null = null;
  if (report.identity != null) {
    if (!isObj(report.identity)) return bad("identity must be an object or null");
    if (report.identity.distance != null) {
      distance = num(report.identity.distance, 0, 2);
      if (distance == null) return bad("identity.distance must be between 0 and 2");
    }
  }
  const measurements: Measurements = {
    mode,
    performance: report.performance,
    sourceFrames,
    outputFrames,
    structureMedian,
    changedArea,
    motionCorrelation,
    motionSpread,
    jumps,
    frozenFrom,
    tailTrimFrames,
    driftRuns,
  };
  const verdict = judge(measurements, mouth, distance);
  return {
    ok: true,
    value: {
      ...verdict,
      mode,
      performance: report.performance,
      measurements,
      mouth,
      identity: {
        measured: distance != null,
        fails: distance != null && distance > IDENTITY_DISTANCE_MAX,
        distance,
      },
    },
  };
}
