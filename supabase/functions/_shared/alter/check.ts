import { judge, type Measurements } from "./judge.ts";
import { scoreMouth, type MouthScore } from "./mouth.ts";
import type { CheckMode, GrayFrame, MouthFrame } from "./types.ts";
import {
  CHANGED_RANGE,
  IDENTITY_DISTANCE_MAX,
  MOTION_MIN,
  RESTYLE_STRUCTURE_MAX,
  STRUCTURE_FLOOR,
} from "./gates.ts";

/** What the frame checker writes. `judge.ts` `rejudge` reads the numbers back; flags and issues are rebuilt there. */
export type AlterReport = {
  verdict: "PASS" | "CHECK";
  mode: CheckMode;
  performance: boolean;
  framesCompared: number;
  sourceFrames: number;
  outputFrames: number;
  changedArea: number;
  structureMedian: number;
  motionCorrelation: number;
  motionSpread: number;
  jumps: number[];
  tailTrimFrames: number;
  frozenFrom: number[];
  driftRuns: [number, number][];
  mouth: MouthScore | null;
  identity: { measured: boolean; fails: boolean; distance: number | null };
  /** True when the redraw may be used as it is: no open issue, the mouth passed, the face has a passing number. */
  redrawCleared: boolean;
  /** True when everything measured passed and only the face is open: no identity number, so Fendi judges it. */
  faceNeedsHisEye: boolean;
  next: string;
  issues: string[];
  gates: {
    structureFloor: number;
    changed: readonly [number, number];
    motionMin: number;
    restyleStructureMax: number;
  };
};

function at(frame: GrayFrame, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return 0;
  return frame.data[y * frame.width + x] ?? 0;
}

function edges(frame: GrayFrame): Float32Array {
  const out = new Float32Array(frame.width * frame.height);
  for (let y = 1; y < frame.height - 1; y++) {
    for (let x = 1; x < frame.width - 1; x++) {
      const gx = at(frame, x + 1, y) - at(frame, x - 1, y);
      const gy = at(frame, x, y + 1) - at(frame, x, y - 1);
      out[y * frame.width + x] = Math.hypot(gx, gy);
    }
  }
  return out;
}

function corr(left: ArrayLike<number>, right: ArrayLike<number>): number {
  const n = Math.min(left.length, right.length);
  if (!n) return 0;
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

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function meanAbsDiff(left: GrayFrame, right: GrayFrame): number {
  const n = Math.min(left.data.length, right.data.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(left.data[i] - right.data[i]);
  return n ? sum / n : 0;
}

function changedShare(left: GrayFrame, right: GrayFrame): number {
  const n = Math.min(left.data.length, right.data.length);
  let hit = 0;
  for (let i = 0; i < n; i++) if (Math.abs(left.data[i] - right.data[i]) > 40) hit++;
  return n ? hit / n : 0;
}

function motionEnergy(frames: GrayFrame[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < frames.length; i++) out.push(meanAbsDiff(frames[i - 1], frames[i]));
  return out;
}

export function checkAlter(input: {
  source: GrayFrame[];
  output: GrayFrame[];
  mode: CheckMode;
  performance?: boolean;
  mouthSource?: MouthFrame[];
  mouthOutput?: MouthFrame[];
  identityDistance?: number | null;
}): AlterReport {
  const n = Math.min(input.source.length, input.output.length);
  const structure: number[] = [];
  for (let i = 0; i < n; i++) structure.push(corr(edges(input.source[i]), edges(input.output[i])));
  const structureMedian = median(structure);
  const mad = median(structure.map((value) => Math.abs(value - structureMedian))) + 1e-3;
  const drops = structure
    .map((value, index) => ({ value, index }))
    .filter((row) => row.value < structureMedian - 4 * mad && row.value < 0.75 * structureMedian)
    .map((row) => row.index);
  const runs: number[][] = [];
  for (const index of drops) {
    const last = runs[runs.length - 1];
    if (last && index === last[last.length - 1] + 1) last.push(index);
    else runs.push([index]);
  }
  const tail = runs.find((run) => run[run.length - 1] >= n - 2 && run[0] >= n - 12);
  const tailTrimFrames = tail ? n - tail[0] : 0;
  const driftRuns = runs
    .filter((run) => run !== tail)
    .map((run): [number, number] => [run[0], run[run.length - 1]]);
  const areas: number[] = [];
  for (let i = 0; i < n; i++) areas.push(changedShare(input.source[i], input.output[i]));
  const changedArea = median(areas);

  const sourceMotion = motionEnergy(input.source.slice(0, n));
  const outputMotion = motionEnergy(input.output.slice(0, n));
  const motionCorrelation = n > 3 ? corr(sourceMotion, outputMotion) : 1;
  const motionSpread = median(sourceMotion.map((value) => Math.abs(value - median(sourceMotion))));
  const base = median(outputMotion) + 1e-3;
  const jumps = outputMotion
    .map((value, index) => ({ value, index }))
    .filter((row) => row.value > 3 * (sourceMotion[row.index] ?? 0) + 2 && row.value > 3 * base)
    .map((row) => row.index + 1);
  const frozenFrom: number[] = [];
  let run = 0;
  for (let i = 0; i < outputMotion.length; i++) {
    run = outputMotion[i] < 0.25 && sourceMotion[i] > 1.2 ? run + 1 : 0;
    if (run === 3) frozenFrom.push(i - 2);
  }

  const performance = input.performance !== false;
  const mouth =
    input.mouthSource && input.mouthOutput
      ? scoreMouth(input.mouthSource, input.mouthOutput)
      : null;
  const distance =
    typeof input.identityDistance === "number" && !Number.isNaN(input.identityDistance)
      ? input.identityDistance
      : null;
  const measurements: Measurements = {
    mode: input.mode,
    performance,
    sourceFrames: input.source.length,
    outputFrames: input.output.length,
    structureMedian,
    changedArea,
    motionCorrelation,
    motionSpread,
    jumps,
    frozenFrom,
    tailTrimFrames,
    driftRuns,
  };
  const judged = judge(measurements, mouth, distance);
  return {
    verdict: judged.verdict,
    mode: input.mode,
    performance,
    framesCompared: n,
    sourceFrames: input.source.length,
    outputFrames: input.output.length,
    changedArea,
    structureMedian,
    motionCorrelation,
    motionSpread,
    jumps,
    tailTrimFrames,
    frozenFrom,
    driftRuns,
    mouth,
    identity: {
      measured: distance != null,
      fails: distance != null && distance > IDENTITY_DISTANCE_MAX,
      distance,
    },
    redrawCleared: judged.redrawCleared,
    faceNeedsHisEye: judged.faceNeedsHisEye,
    next: judged.next,
    issues: judged.issues,
    gates: {
      structureFloor: STRUCTURE_FLOOR[input.mode],
      changed: CHANGED_RANGE[input.mode],
      motionMin: MOTION_MIN,
      restyleStructureMax: RESTYLE_STRUCTURE_MAX,
    },
  };
}
