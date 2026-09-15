/**
 * GitHub-verified Stage 1j chest scorecard (Claude live verification).
 * Evidence commits: d3dbe647 (result doc) / c24abc905 (CLAUDE_LATEST rev 15).
 *
 * This is the human forensic table the evaluator replaces. The local real-crop
 * fixture + cover path is evaluated independently — it may differ where the
 * fixture does not reproduce a live pixel (see C4).
 */

import type { ChestCriterionId } from "./types";

export const STAGE1J_LIVE_VERIFIED = {
  evidenceCommit: "d3dbe647",
  handoffCommit: "c24abc905",
  repairMethodVersion: "architecture_c_still_repair_1j",
  assetId: "fb8117ee",
  gate: "NOT_CLEARED" as const,
  pass: [1, 3, 7, 10, 11] as const satisfies readonly ChestCriterionId[],
  fail: [2, 4, 5, 6, 8, 9] as const satisfies readonly ChestCriterionId[],
  /** Unfiltered window ghost ratios from the 1j result (no authority-mask skip). */
  ghostRatiosUnfiltered: { left: 0.6, right: 0.59 },
  rightEndCreamToNavy: 114,
  sleeveCornerDarkened: 8,
} as const;
