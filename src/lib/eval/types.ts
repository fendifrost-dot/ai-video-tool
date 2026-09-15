/**
 * Lane E — Automated Visual Evaluation types.
 * Isolated from Architecture C paint / occlusion algorithms.
 */

export const CHEST_EVAL_SPEC_VERSION = "lane-e-chest-eval-v1" as const;

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type Point = { x: number; y: number };
export type QuadPts = [Point, Point, Point, Point];
export type NormQuad = [[number, number], [number, number], [number, number], [number, number]];

export type PixelBox = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

export type EvalVerdict = "PASS" | "FAIL";

export type ChestCriterionId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type ChestCriterionResult = {
  id: ChestCriterionId;
  key: string;
  name: string;
  verdict: EvalVerdict;
  metrics: Record<string, number>;
  windows: PixelBox[];
  note: string;
  /** Ordinary deterministic FAIL is explained here; empty when PASS. */
  failureReason: string | null;
};

export type EvalCrop = {
  id: string;
  box: PixelBox;
  image: RgbaImage;
};

export type ChestVisualArtifacts = {
  absDiff: RgbaImage;
  crops: EvalCrop[];
};

export type ChestVisualReport = {
  schemaVersion: typeof CHEST_EVAL_SPEC_VERSION;
  verdict: EvalVerdict;
  passCount: number;
  failCount: number;
  criteria: ChestCriterionResult[];
  artifacts: ChestVisualArtifacts;
  /**
   * Failures the probes cannot classify (empty source signal, size mismatch).
   * Ordinary deterministic FAILs are NOT listed here — they stay on the criterion.
   */
  unexplained: string[];
  scoring: {
    ghostTerritory: "quad_mid_luma";
    bandAuthorityMaskUsed: false;
    ghostRatioPassCeiling: number;
    referenceFrame: { width: number; height: number };
  };
};

export type EvaluateChestStillInput = {
  source: RgbaImage;
  output: RgbaImage;
  bandQuadNorm?: NormQuad;
  /**
   * Accepted so callers can prove it is ignored. Criterion 9 (ghosting) must
   * score every mid-luma source pixel inside the quad, not this mask.
   */
  bandAuthorityMask?: Float32Array | null;
};
