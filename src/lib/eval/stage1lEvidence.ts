/**
 * GitHub-verified Stage 1l chest scorecard (Cursor live verification, PR #70).
 * Evidence: docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1L_RESULT_2026-09-15.md
 *
 * Live ≠ fixture: the real-crop 1l pipeline predicted 11/11.
 * Canonical live (asset 9eaf0c55, ImageScript-decoded, unfiltered mid-luma)
 * is 10/11 — C2/C4/C6 cleared; C9-right wordmark-edge AA remains (84/488).
 * Stage 1m goldens target that remaining FAIL.
 */

import type { ChestCriterionId } from "./types";

export const STAGE1L_LIVE_VERIFIED = {
  repairMethodVersion: "architecture_c_still_repair_1l",
  assetId: "9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75",
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  cleanStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  keyframeId: "v2-still-0.785",
  gate: "NOT_CLEARED" as const,
  pass: [1, 2, 3, 4, 5, 6, 7, 8, 10, 11] as const satisfies readonly ChestCriterionId[],
  fail: [9] as const satisfies readonly ChestCriterionId[],
  /** Unfiltered window ghost ratios (no authority-mask skip). Combined 0.172. */
  ghostRatiosUnfiltered: { left: 0.0, right: 0.261, combined: 0.172 },
  midLumaGhosts: 84,
  midLumaChecked: 488,
  rightWindowGhosts: 84,
  rightWindowChecked: 322,
  leftoverBox: { x0: 462, x1: 500, y0: 713, y1: 723 },
  rightEndCreamToNavy: 0,
  creamBodyToNavy: 0,
  firstNavyRaisePx: 0,
  sleeveCornerDarkened: 0,
  pinstripeRemnants: 0,
} as const;
