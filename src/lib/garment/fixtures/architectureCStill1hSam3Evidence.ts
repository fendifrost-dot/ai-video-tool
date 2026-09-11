/**
 * Evidence-derived Stage 1h SAM-3 α / mask reconstruction for Architecture C
 * Stage 1i regression.
 *
 * Commit `df64344` shipped JPG evidence + measured coverage profiles, not a
 * binary α dump. This fixture encodes those VERIFIED measurements from
 * `ARCHITECTURE_C_STILL_REPAIR_STAGE1H_RESULT_2026-09-10.md`:
 *
 * - Crease rows 695–705, x 276–288 implied coverage:
 *   `0.84 0.70 0.56 0.43 0.39 0.43 0.56 0.71 0.87 1.0`
 * - Wedge x 402–423 coverage `0.00` (outfit hole over shirt/tie)
 * - Hands/forearm protection: skin window rows ~738–755, x ~330–380 (criterion 10 PASS)
 *
 * Used only to exercise the post-paint occlusion composite (outfit-based vs
 * chest-local), not as a byte-golden of the live SAM-3 PNG.
 */

import { ARCHITECTURE_C_BAND_CROP } from "./architectureCStillBandCrop";

/** Live Stage 1h crease coverage profile (x 276…285 inclusive). */
export const STAGE1H_CREASE_COVERAGE_X276_285 = [
  0.84, 0.7, 0.56, 0.43, 0.39, 0.43, 0.56, 0.71, 0.87, 1.0,
] as const;

export const STAGE1H_SAM3_EVIDENCE = {
  sourceCommit: "df64344c566cdb359468a9c2afd8afb4f7320d97",
  repairMethodVersion: "architecture_c_still_repair_1h",
  assetIdPrefix: "39c4a842",
  frameW: ARCHITECTURE_C_BAND_CROP.frameW,
  frameH: ARCHITECTURE_C_BAND_CROP.frameH,
  creaseRowY0: 695,
  creaseRowY1: 705,
  creaseX0: 276,
  wedgeX0: 402,
  wedgeX1: 423,
  wedgeY0: 710,
  wedgeY1: 740,
  /** Forearm/hand skin window that must stay protected. */
  handX0: 330,
  handX1: 380,
  handY0: 738,
  handY1: 755,
} as const;

export type Stage1hSam3EvidenceAlphas = {
  /** Outfit − dilate(hands) − dilate(face) style α with live crease/wedge holes. */
  outfitBasedAlpha: Float32Array;
  handsAlpha: Float32Array;
  faceAlpha: Float32Array;
};

/**
 * Build full-frame float alphas matching the Stage 1h causal occlusion profile.
 * Outfit is open over the torso band region, dipped at the crease, zero at the
 * wedge, and cleared under the hand window (after a light dilate stand-in).
 */
export function buildStage1hSam3EvidenceAlphas(
  frameW: number = STAGE1H_SAM3_EVIDENCE.frameW,
  frameH: number = STAGE1H_SAM3_EVIDENCE.frameH,
): Stage1hSam3EvidenceAlphas {
  const n = frameW * frameH;
  const outfit = new Float32Array(n);
  const hands = new Float32Array(n);
  const face = new Float32Array(n);

  // Broad torso outfit membership (garment gate), excluding far cream margins.
  for (let y = 600; y < 800; y++) {
    for (let x = 200; x < 640; x++) {
      outfit[y * frameW + x] = 1;
    }
  }

  // Crease hole — multiply outfit by the measured coverage profile.
  const {
    creaseRowY0,
    creaseRowY1,
    creaseX0,
    wedgeX0,
    wedgeX1,
    wedgeY0,
    wedgeY1,
    handX0,
    handX1,
    handY0,
    handY1,
  } = STAGE1H_SAM3_EVIDENCE;
  for (let y = creaseRowY0; y <= creaseRowY1; y++) {
    for (let i = 0; i < STAGE1H_CREASE_COVERAGE_X276_285.length; i++) {
      const x = creaseX0 + i;
      outfit[y * frameW + x] = STAGE1H_CREASE_COVERAGE_X276_285[i]!;
    }
  }

  // Full outfit hole over shirt/tie wedge (coverage 0.00 in 1d–1h).
  for (let y = wedgeY0; y <= wedgeY1; y++) {
    for (let x = wedgeX0; x <= wedgeX1; x++) {
      outfit[y * frameW + x] = 0;
    }
  }

  // Hands/forearm membership — real foreground anatomy to protect.
  for (let y = handY0; y <= handY1; y++) {
    for (let x = handX0; x <= handX1; x++) {
      hands[y * frameW + x] = 1;
      outfit[y * frameW + x] = 0; // already subtracted in live outfit-based α
    }
  }

  // Face empty on this chest crop (still required channel for completeness).
  // Leave zeros — chest-local path must still protect hands alone.

  return { outfitBasedAlpha: outfit, handsAlpha: hands, faceAlpha: face };
}
