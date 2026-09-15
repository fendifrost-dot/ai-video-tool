/**
 * GitHub-verified Stage 1k chest scorecard (Cursor live verification).
 * Evidence: docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1K_RESULT_2026-09-15.md
 *
 * Live ≠ fixture: the real-crop 1k pipeline still predicts 9/11 (FAIL C2+C6).
 * Canonical live (asset c9c4efee, ImageScript-decoded source, unfiltered mid-luma)
 * is 7/11 (FAIL C2+C4+C6+C9).
 */

import type { ChestCriterionId } from "./types";

export const STAGE1K_LIVE_VERIFIED = {
  repairMethodVersion: "architecture_c_still_repair_1k",
  assetId: "c9c4efee-6bd2-450f-a9e4-b70fb9b722bb",
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  cleanStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  gate: "NOT_CLEARED" as const,
  pass: [1, 3, 5, 7, 8, 10, 11] as const satisfies readonly ChestCriterionId[],
  fail: [2, 4, 6, 9] as const satisfies readonly ChestCriterionId[],
  /** Unfiltered window ghost ratios (no authority-mask skip). Combined 0.195. */
  ghostRatiosUnfiltered: { left: 0.042, right: 0.273, combined: 0.195 },
  rightEndCreamToNavy: 41,
  creamBodyToNavy: 19,
  sleeveCornerDarkened: 0,
  pinstripeRemnants: 6,
} as const;
