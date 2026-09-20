// Shared, pure "Output QA gate" for AVT look generation.
//
// Deterministic checks that run AFTER a look is generated and BEFORE it is
// marked `complete` / offered as a successful download. It fails CLOSED: any
// failed check returns a machine-readable reason and the caller must persist
// status `failed` (never present the artifact as a success).
//
// Dependency-free so it is vitest-unit-testable and importable from Deno edge
// functions. It takes MEASURED metrics (pixel dimensions, optional face bounding
// box, optional feet-coverage score) rather than doing image decoding itself —
// keeping the policy (thresholds) separate from the measurement, so every lane
// applies the exact same gate regardless of how it obtained the metrics.

import { parseAspectRatio, type LookFraming } from "./lookGenerationContract.ts";

/** A detected face bounding box in PIXELS of the generated image. */
export type FaceBox = { x?: number; y?: number; width: number; height: number };

export type LookQaMetrics = {
  /** Generated image pixel width. */
  width: number;
  /** Generated image pixel height. */
  height: number;
  /** Framing the look was requested at (drives which checks apply). */
  framing?: LookFraming;
  /** Expected aspect "W:H". Defaults to 9:16. */
  expectedAspect?: string;
  /** Optional detected face box; when present the close-up check runs. */
  faceBox?: FaceBox | null;
  /** Optional 0..1 score: how close the subject's feet are to the bottom edge
   *  (1 = feet at the very bottom, 0 = no feet visible). When present on a
   *  full_body look the feet check runs. */
  feetNearBottomScore?: number | null;
};

/** Machine-readable failure reasons — stable identifiers for callers/tests. */
export type LookQaReason = "aspect" | "close_up" | "cropped_legs" | "invalid_dimensions";

export type LookQaResult =
  | { ok: true; checks: LookQaReason[] }
  | { ok: false; reasons: LookQaReason[]; checks: LookQaReason[] };

/** Relative tolerance on the aspect ratio (|actual-expected|/expected). xAI
 *  vertical output is not pixel-exact; 12% keeps true 9:16 passing while still
 *  rejecting square / landscape / portrait-headshot outputs. */
export const ASPECT_TOLERANCE = 0.12;

/** Max fraction of frame HEIGHT a face may occupy before it reads as a close-up.
 *  >45% ⇒ the subject's head fills the frame = the car-selfie failure mode. */
export const FACE_COVERAGE_MAX = 0.45;

/** Minimum feet-near-bottom score a full_body look must reach. Below this the
 *  legs/feet are cropped and the look is not head-to-toe. */
export const FEET_MIN_SCORE = 0.5;

/**
 * Run every applicable deterministic check. Returns ok:false with one or more
 * machine-readable reasons on any failure (fail closed). `checks` always lists
 * which checks actually ran, for observability.
 */
export function evaluateLookQa(metrics: LookQaMetrics): LookQaResult {
  const checks: LookQaReason[] = [];
  const reasons: LookQaReason[] = [];

  const { width, height } = metrics;
  const framing = metrics.framing ?? "full_body";

  // 0. Dimensions must be real, positive integers or nothing else is meaningful.
  if (!(width > 0) || !(height > 0)) {
    return { ok: false, reasons: ["invalid_dimensions"], checks: ["invalid_dimensions"] };
  }

  // 1. Aspect ~ expected (default 9:16).
  checks.push("aspect");
  const expected = parseAspectRatio(metrics.expectedAspect) ?? parseAspectRatio("9:16")!;
  const actual = width / height;
  if (Math.abs(actual - expected) / expected > ASPECT_TOLERANCE) {
    reasons.push("aspect");
  }

  // 2. Close-up: face box too tall relative to the frame. Only when a detector
  //    supplied a box — the gate stays deterministic and never guesses.
  if (metrics.faceBox && metrics.faceBox.height > 0) {
    checks.push("close_up");
    if (metrics.faceBox.height / height > FACE_COVERAGE_MAX) {
      reasons.push("close_up");
    }
  }

  // 3. Full-body must actually reach the feet. Only when a feet score is given.
  if (framing === "full_body" && typeof metrics.feetNearBottomScore === "number") {
    checks.push("cropped_legs");
    if (metrics.feetNearBottomScore < FEET_MIN_SCORE) {
      reasons.push("cropped_legs");
    }
  }

  if (reasons.length) return { ok: false, reasons, checks };
  return { ok: true, checks };
}
