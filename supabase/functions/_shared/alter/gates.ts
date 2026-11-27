import type { CheckMode } from "./types.ts";

/**
 * Gates.
 *
 * Structure, change, motion, jumps, tail drift and frozen frames are the
 * scenario-alter skill's published numbers (qa.md, calibrated 13 and 21 Oct 2026
 * on that skill's own takes). They are not a measurement of Fendi's footage.
 *
 * The mouth gates were measured on Fendi's footage on 26 Nov 2026
 * (docs/alter/CALIBRATION_2026-11-26.md): two rapping takes, eight Genjutsu
 * redraws of them, each take against a 480p copy of itself, and each take
 * against itself moved 1 to 36 frames. They are evidence from two takes, not a
 * certified benchmark.
 *
 * Identity distance 0.25 is the sung-line default already in
 * scripts/edit/camera_coverage.py (`identity_max`). It was NOT measured here:
 * the ArcFace file is not on the machine.
 */
export const STRUCTURE_FLOOR: Record<CheckMode, number> = {
  swap: 0.45,
  recast: 0.45,
  motion: 0.08,
  restyle: 0.12,
  action: 0.45,
};

export const CHANGED_RANGE: Record<CheckMode, readonly [number, number]> = {
  swap: [0.004, 0.55],
  recast: [0.01, 0.55],
  motion: [0.05, 1],
  restyle: [0.15, 1],
  action: [0.004, 0.55],
};

/**
 * Motion correlation and the jump test compare how much each frame moves in the take and in the draft. An action
 * shot adds movement the take does not have, so both trip on the change that was asked for: the draft Fendi passed
 * on 26 and 27 Nov 2026 read -0.16 with 33 "jumps" (docs/alter/TEST_2026-11-26.md). They are reported, not gated,
 * for an action. Frozen frames, tail drift, structure and the mouth are still gated.
 */
export const MOTION_GATED: Record<CheckMode, boolean> = {
  swap: true,
  recast: true,
  motion: true,
  restyle: true,
  action: false,
};

export const RESTYLE_STRUCTURE_MAX = 0.65;
export const MOTION_MIN = 0.6;
/** Correlation of his mouth opening, the take against the redraw, on the take's clock. */
export const MOUTH_TIMING_MIN = 0.65;
/** Frames searched either side for a mouth that is right but late or early. */
export const MOUTH_MAX_LAG = 6;
/** A best fit this many frames off the clock still passes (one frame is 33 to 42 ms). Two or more is re-timed. */
export const MOUTH_LAG_OK = 1;
/** How much better the off-clock fit must be before the redraw is called re-timed. */
export const MOUTH_LAG_GAIN = 0.02;
/** Mean lip-point distance in face widths above which the redraw draws other mouth shapes. */
export const MOUTH_SHAPE_MAX = 0.06;
/** Share of frames where his face must be read in BOTH clips before lip sync is claimed. */
export const MOUTH_COVERAGE_MIN = 0.8;
export const IDENTITY_DISTANCE_MAX = 0.25;
/** Lip-point distance, in face widths, that warns without failing. */
export const LANDMARK_DISTANCE_WATCH = 0.04;

export const GATE_PROVENANCE = {
  structureFloor: "scenario-alter qa.md, 21 Oct 2026 calibration. Not measured on Fendi's footage.",
  changedRange: "scenario-alter qa.md. Swap floor 0.4% is the cup-to-can case (1.9% changed).",
  restyleStructureMax:
    "scenario-alter qa.md. Above 0.65 the source surface survived (anime-over-a-photo, re-grade).",
  action:
    "A decision resting on one sample: the swap structure floor and change range, without the motion and jump gates. The draft Fendi passed (Meditate, 26 and 27 Nov 2026) kept structure 0.69 and changed 8.2% of the frame.",
  motionMin:
    "scenario-alter qa.md. Below 0.60 the output was re-timed or frozen on their coarse grid.",
  mouthTimingMin:
    "Fendi's footage, 26 Nov 2026: halfway between the highest wrong-moment score at 0.4 s or more (0.567) and the lowest real redraw of the same performance (0.744). The same take at 480p scored 0.775 and 0.953.",
  mouthLag:
    "Same run: all eight real redraws and both 480p copies fit best on the clock (0 frames). A take moved 2 or more frames against itself fit best off the clock every time. One frame passes.",
  mouthShapeMax:
    "Same run: identical footage at 480p reads 0.030 to 0.032 face widths apart (the tracker's own noise); real redraws 0.026 to 0.029. The fail line is twice the noise, the watch line 0.04.",
  mouthCoverageMin:
    "A decision, not a measurement: 0.8. The two front takes read on 96% to 100% of frames; a side-on take read on 3% to 9%.",
  identityDistanceMax:
    "scripts/edit/camera_coverage.py identity_max default 0.25. Lower is closer. Not measured on 26 Nov 2026: the ArcFace file is not on the machine.",
  landmarkDistanceWatch:
    "Fendi's footage, 26 Nov 2026: 0.04 face widths, just above the tracker's own noise (0.032). Warns only.",
} as const;
