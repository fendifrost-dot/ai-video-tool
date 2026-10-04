/**
 * What a source take IS — read off the footage itself, before anything is generated against it.
 *
 * The problem this exists for (Fendi, October 2026): a restaging kept the location, the man and his clothes, and
 * still failed on framing, light, the moment a thing happens, the camera's move and the performance. Those five are
 * properties OF THE TAKE that a background has to agree with, and nobody was reading them. This reads them, so a
 * background can be asked for in terms the take can actually accept — and so a shot that cannot work is known to be
 * that before it is paid for.
 *
 * It is built on the three readings the app already makes of a file:
 *   media/probe.ts        the container: size, shape, rate, length, rotation, whether there is sound
 *   media/faceSeries.ts   his face on every frame — where it is, how large, how far below it the frame goes
 *   media/frameSeries.ts  the light of the whole picture, frame by frame, as a 12 × 12 grid of colour
 *   media/detailSeries.ts how sharp the picture is where, and how much of it moved since the frame before
 *
 * Pure: series in, findings out. Nothing here reads a file, touches the network, or knows a project.
 *
 * ── WHAT A FINDING IS ────────────────────────────────────────────────────────────────────────────────────────────
 * Every finding carries its own standing, and the three are not interchangeable:
 *   measured   read from the file or computed from frames by arithmetic that does not guess. A frame rate of 30 is
 *              measured. So is "his face was found in 94 % of frames".
 *   estimated  inferred, with a confidence and the evidence it came from. "The key appears to be above and to frame
 *              left" is estimated: it is read off a luma gradient, not off a light meter.
 *   unknown    the footage does not support an answer. Not a low confidence — an absence. Focal length, camera
 *              height in metres, the distance to the back wall and whether the lips match the words are unknown
 *              here, and this module says so rather than producing a number nobody can defend.
 *
 * Nothing in this file turns an estimate into a measurement by rounding it. Where camera motion and subject motion
 * cannot be told apart, the finding says `cannot_separate` and the production advice downstream treats it as a risk,
 * not as a still camera.
 */
import type { FaceFrame } from "./takeCheck";
import type { SeriesFrame } from "@/lib/media/frameSeries";
import type { DetailFrame } from "@/lib/media/detailSeries";
import { DETAIL_TILES } from "@/lib/media/detailSeries";

export const FOOTAGE_ANALYZER_VERSION = 1 as const;

export type Status = "measured" | "estimated" | "unknown";

/** One finding. `value` is null when `status` is "unknown"; `confidence` is set only when "estimated". */
export type Finding<T> = {
  status: Status;
  value: T | null;
  /** 0–1, and only on an estimate. It is the module's own stated confidence, not a calibrated probability. */
  confidence: number | null;
  /** What the value was read from, in one phrase — the thing to check when the value looks wrong. */
  evidence: string;
  /** What this finding cannot say. Present wherever the honest answer has an edge to it. */
  limit?: string;
};

const measured = <T>(value: T, evidence: string, limit?: string): Finding<T> => ({
  status: "measured",
  value,
  confidence: null,
  evidence,
  ...(limit ? { limit } : {}),
});
const estimated = <T>(
  value: T,
  confidence: number,
  evidence: string,
  limit?: string,
): Finding<T> => ({
  status: "estimated",
  value,
  confidence: Math.round(confidence * 100) / 100,
  evidence,
  ...(limit ? { limit } : {}),
});
const unknown = (evidence: string, limit?: string): Finding<never> => ({
  status: "unknown",
  value: null,
  confidence: null,
  evidence,
  ...(limit ? { limit } : {}),
});

// ── inputs ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the container says. Taken from media/probe.ts; nothing here re-derives it. */
export type FileFacts = {
  width: number | null;
  height: number | null;
  /** Frames per second, as the file's own timing gives it. */
  fps: number | null;
  durationSeconds: number | null;
  /** Degrees, from the track's display matrix. 0 when the file does not rotate its picture. */
  rotation: number | null;
  hasAudio: boolean;
  /** The track's codec string, and the colour transfer where the container names one (e.g. HLG). */
  codec: string | null;
  transfer: string | null;
};

export type AnalysisInput = {
  file: FileFacts;
  faces: readonly FaceFrame[];
  light: readonly SeriesFrame[];
  detail: readonly DetailFrame[];
  /** The stretch of the file analyzed, on the file's own clock. */
  range: readonly [number, number];
};

// ── findings ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type SubjectFindings = {
  /** Share of analyzed frames his face was found in, 0–1. */
  faceCoverage: Finding<number>;
  /** Median position of his face in the frame, 0–1 across and down. */
  position: Finding<{ x: number; y: number }>;
  /** How far he travels: the span of his face's position over the stretch, in frame widths and heights. */
  travel: Finding<{ x: number; y: number }>;
  /** Eye distance over frame height, median — how large he is in frame. Larger is closer. */
  scale: Finding<number>;
  /**
   * How far below his eyes the frame goes, in eye-distances (takeCheck.ts's `reach`). It is the one number that says
   * how much of him the take filmed, and it does not change when the camera comes closer.
   */
  reach: Finding<number>;
  /** What that reach amounts to in body terms. Estimated: it is a ratio read against ordinary human proportion. */
  coverage: Finding<Coverage>;
  /** Whether his face passes near a frame edge, and which. The BODY's edges are not measured — see `limit`. */
  faceNearEdge: Finding<string[]>;
};

export type CameraFindings = {
  /** Share of frame-to-frame steps where the picture's border moved at all, 0–1. */
  unsteadySteps: Finding<number>;
  /** The largest border movement seen in one step, as a share of frame width. */
  worstStep: Finding<number>;
  stability: Finding<"locked" | "handheld_slight" | "handheld_strong" | "moving">;
  /**
   * Whether the picture's movement can be attributed. `camera` = the border moved with the frame; `subject` = the
   * frame moved where the border did not; `mixed` = both; `still` = neither; `cannot_separate` = they disagree in a
   * way this reading cannot resolve.
   */
  motionSource: Finding<"still" | "camera" | "subject" | "mixed" | "cannot_separate">;
  /** A net drift over the stretch, as a share of frame width/height, when the border moved consistently one way. */
  drift: Finding<{ x: number; y: number }>;
};

export type LightFindings = {
  /** Mean luma over the stretch, 0–1, and how much it wanders. */
  exposure: Finding<{ mean: number; swing: number }>;
  clipping: Finding<{ black: number; white: number }>;
  /** Mean r:g:b over the stretch as a cast, and its strength. */
  colourCast: Finding<{ r: number; g: number; b: number; strength: number }>;
  /** Where the key appears to come from, read off the brightness gradient across the picture. */
  keyDirection: Finding<"frame_left" | "frame_right" | "above" | "below" | "even">;
  /** How abruptly the picture goes from light to dark. Uncalibrated — see `limit`. */
  softness: Finding<"soft" | "medium" | "hard">;
};

export type FocusFindings = {
  /** Sharpness of the sharpest part of the picture, median over the stretch. Relative to this clip only. */
  peakSharpness: Finding<number>;
  /** Share of frames whose sharpness falls well below this clip's own median — frames lost to movement. */
  blurredFrames: Finding<number>;
  /** Sharpness where he is against sharpness away from him: above 1, he is the sharper thing. */
  subjectVsBackground: Finding<number>;
  depthOfField: Finding<"shallow" | "deep" | "indeterminate">;
};

export type SeparationFindings = {
  /** How hard pulling him off this background looks, and why. */
  difficulty: Finding<"easy" | "moderate" | "hard">;
  reasons: string[];
  /** How much the background differs from him in brightness where they meet. Low means they blend. */
  edgeContrast: Finding<number>;
};

export type FloorFindings = {
  /** Whether his feet are in frame. Mostly unknown: this reading sees a face, not a body. */
  feetVisible: Finding<boolean>;
  /** Whether a contact shadow or reflection will be needed for a composite to sit. */
  contactNeeded: Finding<boolean>;
};

export type AudioFindings = {
  present: Finding<boolean>;
  /** Whether lip sync can be judged from this take alone. It cannot — stated so the next stage does not assume it. */
  lipSyncJudgeable: Finding<never>;
};

export type FootageAnalysis = {
  version: typeof FOOTAGE_ANALYZER_VERSION;
  analyzedAt: string;
  range: [number, number];
  /** How much was actually read, for a reader deciding how much to trust the rest. */
  sampled: {
    faceFrames: number;
    lightFrames: number;
    detailFrames: number;
    /** Why a frame's face was not used. A reading made on few frames is worth less, and this is how a reader sees that. */
    dropped: { noFace: number; tooDark: number; tooSmall: number };
  };
  file: {
    resolution: Finding<{ width: number; height: number }>;
    aspect: Finding<string>;
    fps: Finding<number>;
    duration: Finding<number>;
    rotation: Finding<number>;
    codec: Finding<string>;
    transfer: Finding<string>;
  };
  subject: SubjectFindings;
  camera: CameraFindings;
  light: LightFindings;
  focus: FocusFindings;
  separation: SeparationFindings;
  floor: FloorFindings;
  audio: AudioFindings;
  /** Everything this analysis does not and cannot establish, named rather than left to be assumed. */
  notEstablished: string[];
};

// ── small helpers ─────────────────────────────────────────────────────────────────────────────────────────────────

const r4 = (n: number) => Math.round(n * 10000) / 10000;

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function span(xs: readonly number[], lo = 0.05, hi = 0.95): number | null {
  if (xs.length < 3) return null;
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
  return at(hi) - at(lo);
}

/** The greatest common divisor, for naming an aspect ratio the way a camera would. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function aspectName(w: number, h: number): string {
  const g = gcd(w, h) || 1;
  const a = w / g;
  const b = h / g;
  if (a <= 64 && b <= 64) return `${a}:${b}`;
  const ratio = w / h;
  const known: [string, number][] = [
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["1:1", 1],
    ["2.39:1", 2.39],
    ["4:5", 0.8],
  ];
  let best = known[0];
  for (const k of known) if (Math.abs(k[1] - ratio) < Math.abs(best[1] - ratio)) best = k;
  return Math.abs(best[1] - ratio) < 0.02 ? best[0] : `${Math.round(ratio * 100) / 100}:1`;
}

/**
 * How much of a body a `reach` amounts to. The boundaries are ordinary human proportion measured in eye-distances
 * (an adult is roughly 28–32 eye-distances tall, head to foot, and the eyes sit about 1 from the crown). They are a
 * rule of thumb and the finding that uses them is an ESTIMATE, never a measurement. Pure — exported for its test.
 */
export type Coverage = "head_only" | "chest_up" | "waist_up" | "thigh_up" | "knee_up" | "full_body";

export const COVERAGE_BOUNDS: [number, Coverage, number][] = [
  [3.5, "head_only", 0.8],
  [7, "chest_up", 0.7],
  [11, "waist_up", 0.65],
  [16, "thigh_up", 0.6],
  [24, "knee_up", 0.55],
  [Infinity, "full_body", 0.5],
];

export function coverageOf(reach: number): { value: Coverage; confidence: number } {
  // reach = (frame bottom − eye line) ÷ eye distance
  let lower = 0;
  for (const [upper, value, base] of COVERAGE_BOUNDS) {
    if (reach < upper) {
      // Near a boundary the label is close to arbitrary: S06 at 11.47 and S09 at 10.97 are the same framing by eye
      // and fall either side of 11. Say so in the confidence rather than letting the label carry a difference the
      // footage does not support.
      const room = Math.min(reach - lower, upper === Infinity ? Infinity : upper - reach);
      const width = upper === Infinity ? 8 : upper - lower;
      const nearness = Math.min(1, room / (width * 0.25));
      return { value, confidence: Math.round(base * (0.6 + 0.4 * nearness) * 100) / 100 };
    }
    lower = upper;
  }
  return { value: "full_body", confidence: 0.5 };
}

// ── the analysis ──────────────────────────────────────────────────────────────────────────────────────────────────

/** How near a frame edge the face has to pass before it is called out, as a share of the frame. */
const EDGE_BAND = 0.08;
/** A border step larger than this share of frame width is movement, not noise. */
const STEADY = 0.004;
/** Above this share of steps moving, the camera is not locked off. */
const LOCKED_MAX = 0.08;
const HANDHELD_MAX = 0.45;
/** A frame this much below the clip's own median sharpness is a blurred frame. */
const BLUR_RATIO = 0.6;
/** A face is readable only where there is light on it. Below this spread it is a silhouette, not a face. */
const SEEN_MIN = 0.03;
/**
 * …and only where it is large enough for the landmarks to mean anything: eye distance over frame height. Below this
 * the reader still returns 478 points, and they are noise.
 *
 * Measured, not chosen: on take S09 four early frames came back with an eye distance of 11 to 46 px on a 1920-tall
 * frame. One of them put the frame's bottom 109 eye-distances below his eyes — three and a half bodies — which read
 * as a full-length figure with his feet in shot, and would have asked the background for a floor and a contact
 * shadow this take has no use for. One bad frame in a hundred was enough to change the production advice.
 */
const MIN_FACE_SIZE = 0.02;

export function analyzeFootage(input: AnalysisInput, analyzedAt: string): FootageAnalysis {
  const { file, faces, light, detail, range } = input;
  const withFace = faces.filter((f) => f.face);
  const litEnough = withFace.filter((f) => (f.face?.seen ?? 0) > SEEN_MIN);
  const seenFaces = litEnough.filter((f) => (f.face?.size ?? 0) >= MIN_FACE_SIZE);
  const dropped = {
    noFace: faces.length - withFace.length,
    tooDark: withFace.length - litEnough.length,
    tooSmall: litEnough.length - seenFaces.length,
  };
  const notEstablished: string[] = [];

  // ── file ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const res =
    file.width && file.height
      ? measured({ width: file.width, height: file.height }, "the file's video track")
      : unknown("the file does not say how large its picture is");
  const fileOut: FootageAnalysis["file"] = {
    resolution: res,
    aspect:
      file.width && file.height
        ? measured(
            aspectName(file.width, file.height),
            "the track's stored width and height",
            file.rotation
              ? "the stored shape; the file also asks for rotation, which a player applies"
              : undefined,
          )
        : unknown("no picture size to take a ratio from"),
    fps: file.fps
      ? measured(r4(file.fps), "the track's own timing")
      : unknown("the file's timing could not be read"),
    duration: file.durationSeconds
      ? measured(r4(file.durationSeconds), "the track's duration")
      : unknown("the file's length could not be read"),
    rotation:
      file.rotation === null || file.rotation === undefined
        ? unknown("the file carries no display matrix")
        : measured(file.rotation, "the track's display matrix"),
    codec: file.codec
      ? measured(file.codec, "the track's sample description")
      : unknown("no codec is named"),
    transfer: file.transfer
      ? measured(
          file.transfer,
          "the track's colour information",
          "a transfer curve is named, not verified against the pixels",
        )
      : unknown("the container names no colour transfer"),
  };

  // ── subject ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const coverageShare = faces.length ? seenFaces.length / faces.length : 0;
  const cxs = seenFaces.map((f) => f.face!.cx);
  const cys = seenFaces.map((f) => f.face!.cy);
  const sizes = seenFaces.map((f) => f.face!.size);
  const reaches = seenFaces.map((f) => f.face!.reach);
  const mx = median(cxs);
  const my = median(cys);
  const mReach = median(reaches);

  const edges: string[] = [];
  if (cxs.some((x) => x < EDGE_BAND)) edges.push("left");
  if (cxs.some((x) => x > 1 - EDGE_BAND)) edges.push("right");
  if (cys.some((y) => y < EDGE_BAND)) edges.push("top");
  if (cys.some((y) => y > 1 - EDGE_BAND)) edges.push("bottom");

  const cov = mReach !== null ? coverageOf(mReach) : null;
  const subject: SubjectFindings = {
    faceCoverage: faces.length
      ? measured(
          r4(coverageShare),
          `his face was readable in ${seenFaces.length} of ${faces.length} frames read (${dropped.noFace} none found, ${dropped.tooDark} too dark to read, ${dropped.tooSmall} too small for the landmarks to mean anything)`,
        )
      : unknown("no frames were read for faces"),
    position:
      mx !== null && my !== null
        ? measured(
            { x: r4(mx), y: r4(my) },
            "the median of his eye-line over the frames his face was read in",
          )
        : unknown("his face was not read in enough frames"),
    travel:
      cxs.length >= 3
        ? measured(
            { x: r4(span(cxs) ?? 0), y: r4(span(cys) ?? 0) },
            "the 5th-to-95th-percentile span of his eye-line, so one lost frame does not set it",
          )
        : unknown("too few frames with his face to say how far he moves"),
    scale: sizes.length
      ? measured(r4(median(sizes)!), "median eye distance over frame height")
      : unknown("his face was not read in enough frames"),
    reach:
      mReach !== null
        ? measured(
            r4(mReach),
            "median distance from his eye-line to the bottom of frame, in eye-distances",
          )
        : unknown("his face was not read in enough frames"),
    coverage: cov
      ? estimated(
          cov.value,
          cov.confidence,
          `a reach of ${r4(mReach!)} eye-distances read against ordinary human proportion`,
          "a rule of thumb about bodies, not a measurement of this one; a crouch or a low camera will move it",
        )
      : unknown("no reach to read a body against"),
    faceNearEdge: cxs.length
      ? measured(
          edges,
          `his eye-line against a band ${Math.round(EDGE_BAND * 100)} % in from each edge`,
          "his FACE only. Where his hands, elbows and shoulders are is not read here, so a body that leaves frame will not show up in this finding",
        )
      : unknown("his face was not read in enough frames"),
  };
  if (!cxs.length)
    notEstablished.push(
      "where he is in frame, and how much of him was filmed — his face was not readable",
    );

  // ── camera ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const steps = detail.filter((d) => d.shift !== null || d.borderShift !== null);
  const borderMag = detail.map((d) =>
    d.borderShift ? Math.hypot(d.borderShift[0], d.borderShift[1]) : 0,
  );
  const wholeMag = detail.map((d) => (d.shift ? Math.hypot(d.shift[0], d.shift[1]) : 0));
  const moving = borderMag.filter((m) => m > STEADY);
  const movingShare = detail.length > 1 ? moving.length / (detail.length - 1) : 0;
  const worst = borderMag.length ? Math.max(...borderMag) : 0;

  let stability: NonNullable<CameraFindings["stability"]["value"]> = "locked";
  if (movingShare > HANDHELD_MAX) stability = worst > 0.03 ? "moving" : "handheld_strong";
  else if (movingShare > LOCKED_MAX) stability = "handheld_slight";

  // the border is background; the whole frame includes him. Where they agree, the camera moved; where only the whole
  // frame moved, he did; where the border moves and the whole frame does not, the reading is not trustworthy.
  const bothStill =
    borderMag.filter((m) => m > STEADY).length === 0 &&
    wholeMag.filter((m) => m > STEADY).length === 0;
  const borderMoves = movingShare > LOCKED_MAX;
  const wholeMoves =
    detail.length > 1
      ? wholeMag.filter((m) => m > STEADY).length / (detail.length - 1) > LOCKED_MAX
      : false;
  let source: NonNullable<CameraFindings["motionSource"]["value"]>;
  let sourceConfidence = 0.6;
  let sourceNote =
    "the frame's border is taken to be background and the whole frame to include him; the two are compared";
  if (detail.length < 3) {
    source = "cannot_separate";
    sourceConfidence = 0.2;
    sourceNote = "too few frames to compare one with the next";
  } else if (bothStill) {
    source = "still";
    sourceConfidence = 0.8;
  } else if (borderMoves && wholeMoves) {
    source = "camera";
    sourceConfidence = 0.7;
  } else if (!borderMoves && wholeMoves) {
    source = "subject";
    sourceConfidence = 0.65;
  } else if (borderMoves && !wholeMoves) {
    source = "cannot_separate";
    sourceConfidence = 0.3;
    sourceNote =
      "the border moved where the whole picture did not, which this reading cannot explain";
  } else {
    source = "mixed";
    sourceConfidence = 0.4;
  }

  const driftX = detail.reduce((s, d) => s + (d.borderShift?.[0] ?? 0), 0);
  const driftY = detail.reduce((s, d) => s + (d.borderShift?.[1] ?? 0), 0);

  const camera: CameraFindings = {
    unsteadySteps:
      detail.length > 1
        ? measured(
            r4(movingShare),
            `border movement above ${STEADY} of frame width, over ${detail.length - 1} steps`,
          )
        : unknown("too few frames to compare"),
    worstStep:
      detail.length > 1
        ? measured(r4(worst), "the largest single-step border movement")
        : unknown("too few frames to compare"),
    stability:
      detail.length > 1
        ? estimated(
            stability,
            0.6,
            `${Math.round(movingShare * 100)} % of steps moved, worst ${r4(worst)} of frame width`,
            "a threshold on whole-pixel matching at 64 cells across: a slow push smaller than one cell reads as locked",
          )
        : unknown("too few frames to compare"),
    motionSource: detail.length
      ? estimated(
          source,
          sourceConfidence,
          sourceNote,
          "no optical flow and no depth: a camera that pans while he walks the other way is not resolved, and is reported as mixed or cannot_separate rather than guessed",
        )
      : unknown("no frames were read for movement"),
    drift:
      detail.length > 1
        ? estimated(
            { x: r4(driftX), y: r4(driftY) },
            0.4,
            "the sum of border movement over the stretch",
            "accumulated whole-cell steps; it drifts with its own rounding and is an indication of direction, not a displacement",
          )
        : unknown("too few frames to compare"),
  };
  if (source === "cannot_separate")
    notEstablished.push("whether the picture's movement came from the camera or from him");

  // ── light ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const lumas = detail.map((d) => d.luma);
  const meanLuma = median(lumas);
  const lumaSwing = span(lumas);
  const blacks = median(detail.map((d) => d.clipLow));
  const whites = median(detail.map((d) => d.clipHigh));

  // colour cast from the colour grid: the mean of each channel over every cell of every frame
  let rs = 0;
  let gs = 0;
  let bs = 0;
  let cells = 0;
  for (const f of light) {
    for (let i = 0; i + 2 < f.cells.length; i += 3) {
      rs += f.cells[i];
      gs += f.cells[i + 1];
      bs += f.cells[i + 2];
      cells++;
    }
  }
  const castMean = cells ? { r: rs / cells, g: gs / cells, b: bs / cells } : null;
  const castStrength = castMean
    ? (Math.max(castMean.r, castMean.g, castMean.b) -
        Math.min(castMean.r, castMean.g, castMean.b)) /
      Math.max(1e-6, (castMean.r + castMean.g + castMean.b) / 3)
    : null;

  // key direction from the sharp-tile raster's luma is not available here, so it is read off the colour grid: the
  // left-right and top-bottom difference in brightness, averaged over the stretch
  let leftSum = 0;
  let rightSum = 0;
  let topSum = 0;
  let bottomSum = 0;
  let gridFrames = 0;
  const G = light.length ? Math.round(Math.sqrt(light[0].cells.length / 3)) : 0;
  for (const f of light) {
    if (G <= 1) break;
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const i = (gy * G + gx) * 3;
        const l = 0.299 * f.cells[i] + 0.587 * f.cells[i + 1] + 0.114 * f.cells[i + 2];
        if (gx < G / 2) leftSum += l;
        else rightSum += l;
        if (gy < G / 2) topSum += l;
        else bottomSum += l;
      }
    }
    gridFrames++;
  }
  const half = (gridFrames * (G * G)) / 2 || 1;
  const lr = (leftSum - rightSum) / half;
  const tb = (topSum - bottomSum) / half;
  let key: NonNullable<LightFindings["keyDirection"]["value"]> = "even";
  const KEY_MIN = 0.03;
  if (Math.abs(lr) >= Math.abs(tb) && Math.abs(lr) > KEY_MIN)
    key = lr > 0 ? "frame_left" : "frame_right";
  else if (Math.abs(tb) > KEY_MIN) key = tb > 0 ? "above" : "below";

  // Softness is read ACROSS HIM, not across the frame. The whole frame's vertical falloff in a 9:16 room is ceiling
  // against floor and says nothing about the light on his face — measured on S06, where it called soft ceiling light
  // "hard". What a hard key does that a soft one does not is model the subject: one side of him brighter than the
  // other. So this takes the left-to-right difference in the band of cells he occupies, and nowhere else.
  const clipped = (blacks ?? 0) + (whites ?? 0);
  let modelling: number | null = null;
  if (mx !== null && my !== null && G > 1) {
    const gx = Math.min(G - 1, Math.max(0, Math.floor(mx * G)));
    const gy = Math.min(G - 1, Math.max(0, Math.floor(my * G)));
    const lumaAt = (f: SeriesFrame, x: number, y: number) => {
      const i = (y * G + x) * 3;
      return 0.299 * f.cells[i] + 0.587 * f.cells[i + 1] + 0.114 * f.cells[i + 2];
    };
    const diffs: number[] = [];
    for (const f of light) {
      // his own band: the column he stands in and one either side, from his eye-line down over his body
      for (let y = gy; y < Math.min(G, gy + 4); y++) {
        const leftCell = gx - 1 >= 0 ? lumaAt(f, gx - 1, y) : null;
        const rightCell = gx + 1 < G ? lumaAt(f, gx + 1, y) : null;
        if (leftCell !== null && rightCell !== null) {
          const mean = (leftCell + rightCell) / 2;
          if (mean > 0.02) diffs.push(Math.abs(leftCell - rightCell) / mean);
        }
      }
    }
    modelling = median(diffs);
  }
  const softness: NonNullable<LightFindings["softness"]["value"]> =
    modelling === null
      ? "medium"
      : modelling > 0.35 || clipped > 0.06
        ? "hard"
        : modelling > 0.15 || clipped > 0.02
          ? "medium"
          : "soft";
  const falloff = Math.max(Math.abs(lr), Math.abs(tb));

  const lightOut: LightFindings = {
    exposure:
      meanLuma !== null
        ? measured(
            { mean: r4(meanLuma), swing: r4(lumaSwing ?? 0) },
            "median frame brightness and its 5th-to-95th-percentile span",
          )
        : unknown("no frames were read for light"),
    clipping:
      blacks !== null
        ? measured(
            { black: r4(blacks), white: r4(whites ?? 0) },
            "share of pixels at or beyond the ends of the range, median over frames",
          )
        : unknown("no frames were read for light"),
    colourCast: castMean
      ? measured(
          {
            r: r4(castMean.r),
            g: r4(castMean.g),
            b: r4(castMean.b),
            strength: r4(castStrength ?? 0),
          },
          "mean of each channel over every cell of every frame",
        )
      : unknown("no colour grid was read"),
    keyDirection: gridFrames
      ? estimated(
          key,
          Math.min(0.6, 0.25 + falloff * 3),
          `a brightness difference of ${r4(lr)} across and ${r4(tb)} down the picture`,
          "where the picture is brighter, not where a lamp is. A bright wall on one side reads the same as a key from that side, and this cannot tell them apart",
        )
      : unknown("no colour grid was read"),
    softness:
      gridFrames && modelling !== null
        ? estimated(
            softness,
            0.35,
            `a left-to-right brightness difference of ${r4(modelling)} across the band he stands in, with ${r4(clipped)} of the picture clipped`,
            "UNCALIBRATED — no shadow edge is found and no light is measured. It reads how much the light models HIM, at the resolution of a 12-cell grid, which a wall behind him also contributes to. Treat it as a hint, never as a lighting spec",
          )
        : gridFrames
          ? estimated(
              "medium",
              0.15,
              "his position was not read, so the light on him could not be looked at; this is a default, not a reading",
              "no value was measured at all",
            )
          : unknown("no colour grid was read"),
  };
  notEstablished.push(
    "the lighting's geometry — how many sources, where they stand, how far, how large",
  );

  // ── focus ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const perFramePeak = detail.map((d) => (d.sharp.length ? Math.max(...d.sharp) : 0));
  const medianPeak = median(perFramePeak);
  const blurred = medianPeak
    ? perFramePeak.filter((p) => p < medianPeak * BLUR_RATIO).length /
      Math.max(1, perFramePeak.length)
    : 0;

  // where he is, in tiles, from his face position; sharpness there against sharpness away from there
  let subjectSharp: number | null = null;
  let backgroundSharp: number | null = null;
  if (mx !== null && my !== null && detail.length) {
    const tx = Math.min(DETAIL_TILES - 1, Math.max(0, Math.floor(mx * DETAIL_TILES)));
    const ty = Math.min(DETAIL_TILES - 1, Math.max(0, Math.floor(my * DETAIL_TILES)));
    const near: number[] = [];
    const far: number[] = [];
    for (const d of detail) {
      for (let y = 0; y < DETAIL_TILES; y++) {
        for (let x = 0; x < DETAIL_TILES; x++) {
          const v = d.sharp[y * DETAIL_TILES + x] ?? 0;
          // the column he stands in, and two tiles below his eye line: his body. Everything two tiles away: not him.
          if (Math.abs(x - tx) <= 1 && y >= ty - 1) near.push(v);
          else if (Math.abs(x - tx) >= 3) far.push(v);
        }
      }
    }
    subjectSharp = median(near);
    backgroundSharp = median(far);
  }
  const ratio =
    subjectSharp !== null && backgroundSharp !== null && backgroundSharp > 1e-5
      ? subjectSharp / backgroundSharp
      : null;
  const dof: NonNullable<FocusFindings["depthOfField"]["value"]> =
    ratio === null
      ? "indeterminate"
      : ratio > 1.8
        ? "shallow"
        : ratio > 0.75
          ? "deep"
          : "indeterminate";

  const focus: FocusFindings = {
    peakSharpness:
      medianPeak !== null
        ? measured(
            r4(medianPeak),
            "median over frames of the sharpest tile in each",
            "a number for this clip only. It is not comparable with another clip of a different size, bitrate or codec",
          )
        : unknown("no frames were read for sharpness"),
    blurredFrames: medianPeak
      ? measured(
          r4(blurred),
          `frames whose sharpest tile falls below ${BLUR_RATIO} of this clip's median`,
        )
      : unknown("no frames were read for sharpness"),
    subjectVsBackground:
      ratio !== null
        ? estimated(
            r4(ratio),
            0.45,
            `sharpness in the tiles around his face against tiles ${3} or more away`,
            "the tiles he stands in are guessed from his FACE, not from a cut-out of him. A hand waved into a background tile, or a chair beside him, lands in the wrong half",
          )
        : unknown("his face was not read, so there is nothing to measure sharpness against"),
    depthOfField:
      ratio !== null
        ? estimated(
            dof,
            0.35,
            `a subject-to-background sharpness ratio of ${r4(ratio)}`,
            "says which is sharper, not an aperture and not a distance. A flat wall behind him reads as soft because there is nothing in it to be sharp",
          )
        : unknown("no sharpness ratio could be taken"),
  };
  notEstablished.push(
    "focal length, aperture, sensor size, camera height and the distance to anything in frame",
  );

  // ── separation ──────────────────────────────────────────────────────────────────────────────────────────────────
  const reasons: string[] = [];
  let score = 0;
  if (ratio !== null && ratio < 1.2) {
    score += 1;
    reasons.push(
      "the background is about as sharp as he is, so there is no focus difference to cut along",
    );
  }
  if (blurred > 0.15) {
    score += 1;
    reasons.push(
      `${Math.round(blurred * 100)} % of frames are soft with movement, and a blurred edge is where a matte tears`,
    );
  }
  if (backgroundSharp !== null && backgroundSharp > 0.02) {
    score += 1;
    reasons.push(
      "the background carries a lot of detail, which a matte has to follow rather than flood",
    );
  }
  if ((castStrength ?? 0) < 0.08)
    reasons.push("no strong colour difference to key on — this is ordinary footage, not a screen");
  if (edges.length) {
    score += 1;
    reasons.push(
      `he passes within ${Math.round(EDGE_BAND * 100)} % of the ${edges.join(" and ")} edge, where a matte has no context to work with`,
    );
  }
  const difficulty: NonNullable<SeparationFindings["difficulty"]["value"]> =
    score >= 3 ? "hard" : score >= 1 ? "moderate" : "easy";

  // the brightness difference between the tiles he occupies and those beside him
  let edgeContrast: number | null = null;
  if (mx !== null && light.length && G > 1) {
    const gx = Math.min(G - 1, Math.max(0, Math.floor(mx * G)));
    const lumaAt = (f: SeriesFrame, x: number, y: number) => {
      const i = (y * G + x) * 3;
      return 0.299 * f.cells[i] + 0.587 * f.cells[i + 1] + 0.114 * f.cells[i + 2];
    };
    const diffs: number[] = [];
    for (const f of light) {
      for (let y = Math.floor(G / 3); y < G; y++) {
        const here = lumaAt(f, gx, y);
        const left = gx > 1 ? lumaAt(f, gx - 2, y) : null;
        const right = gx < G - 2 ? lumaAt(f, gx + 2, y) : null;
        for (const other of [left, right]) if (other !== null) diffs.push(Math.abs(here - other));
      }
    }
    edgeContrast = median(diffs);
  }

  const separation: SeparationFindings = {
    difficulty:
      ratio !== null || edges.length
        ? estimated(
            difficulty,
            0.4,
            `${score} of the four things that make a cut-out hard are present`,
            "a reading of the picture, not an attempt at a matte. Hair, a cap's brim, a chain and anything reflective are the usual failures and are NOT measured here — no matte was pulled",
          )
        : unknown("not enough was read to judge separation"),
    reasons,
    edgeContrast:
      edgeContrast !== null
        ? measured(
            r4(edgeContrast),
            "brightness difference between the column he stands in and the columns two cells either side",
          )
        : unknown("his position was not read"),
  };
  notEstablished.push(
    "how a matte actually behaves on his hair, the brim of his cap, and anything reflective he is wearing — nothing here pulls one",
  );

  // ── floor ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const feetLikely = mReach !== null ? mReach >= 24 : null;
  const floor: FloorFindings = {
    feetVisible:
      mReach === null
        ? unknown("his face was not read, so there is nothing to reason from")
        : estimated(
            feetLikely!,
            0.4,
            `a reach of ${r4(mReach)} eye-distances, against ${24} for a whole standing body`,
            "inferred from where his eyes are and where the frame ends. Nothing here sees a foot: a crouch, a low camera or a step towards the lens all break it",
          ),
    contactNeeded:
      mReach === null
        ? unknown("no reach to reason from")
        : estimated(
            !!feetLikely,
            feetLikely ? 0.5 : 0.6,
            feetLikely
              ? "his feet are likely in frame, so a composite has to put him ON something"
              : "the frame ends above his feet, so there is no contact point to match and no contact shadow to invent",
            "about whether a contact is NEEDED, not whether AVT can make one",
          ),
  };

  // ── audio ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const audio: AudioFindings = {
    present: measured(file.hasAudio, "the file's track list"),
    lipSyncJudgeable: unknown(
      "a take is the reference, so there is nothing to hold it against",
      "lip sync is a comparison between a clip and the take it was made from (storyboard/takeCheck.ts). It cannot be judged from one file alone, and this analysis does not try",
    ),
  };
  if (!file.hasAudio)
    notEstablished.push("anything about sound or sync — the file carries no audio track");

  return {
    version: FOOTAGE_ANALYZER_VERSION,
    analyzedAt,
    range: [range[0], range[1]],
    sampled: {
      faceFrames: faces.length,
      lightFrames: light.length,
      detailFrames: detail.length,
      dropped,
    },
    file: fileOut,
    subject,
    camera,
    light: lightOut,
    focus,
    separation,
    floor,
    audio,
    notEstablished,
  };
}
