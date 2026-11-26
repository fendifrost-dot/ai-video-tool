import type { CheckMode } from "./types.ts";

/**
 * Gates.
 *
 * Structure, change, motion, jumps, tail drift and frozen frames are the
 * scenario-alter skill's published numbers (qa.md, calibrated 13 and 21 Oct 2026
 * on that skill's own takes). They are not a measurement of Fendi's footage.
 *
 * Mouth timing 0.6 and identity distance 0.25 are the sung-line defaults already
 * in scripts/edit/camera_coverage.py (`lip_best_fit_min`, `identity_max`).
 *
 * Landmark distance 0.08 of face width is provisional. It warns only.
 */
export const STRUCTURE_FLOOR: Record<CheckMode, number> = {
  swap: 0.45,
  recast: 0.45,
  motion: 0.08,
  restyle: 0.12,
};

export const CHANGED_RANGE: Record<CheckMode, readonly [number, number]> = {
  swap: [0.004, 0.55],
  recast: [0.01, 0.55],
  motion: [0.05, 1],
  restyle: [0.15, 1],
};

export const RESTYLE_STRUCTURE_MAX = 0.65;
export const MOTION_MIN = 0.6;
export const MOUTH_TIMING_MIN = 0.6;
export const IDENTITY_DISTANCE_MAX = 0.25;
export const LANDMARK_DISTANCE_WATCH = 0.08;

export const GATE_PROVENANCE = {
  structureFloor: "scenario-alter qa.md, 21 Oct 2026 calibration. Not measured on Fendi's footage.",
  changedRange: "scenario-alter qa.md. Swap floor 0.4% is the cup-to-can case (1.9% changed).",
  restyleStructureMax:
    "scenario-alter qa.md. Above 0.65 the source surface survived (anime-over-a-photo, re-grade).",
  motionMin:
    "scenario-alter qa.md. Below 0.60 the output was re-timed or frozen on their coarse grid.",
  mouthTimingMin:
    "scripts/edit/camera_coverage.py lip_best_fit_min default 0.6, the sung-line gate.",
  identityDistanceMax:
    "scripts/edit/camera_coverage.py identity_max default 0.25. Lower is closer.",
  landmarkDistanceWatch:
    "Provisional. About one lip-height of error. Warns only. Not a certified benchmark.",
} as const;
