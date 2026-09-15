/**
 * GitHub-verified Stage 1m chest still identity + live scorecard.
 * Scorecard: docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1M_RESULT_2026-09-15.md
 *
 * Produced on the canonical still `2aa1a44c` with the measured live quad after
 * PR #72 merged and `architecture-c-still-repair-proxy` was redeployed for 1m.
 *
 * Live matches the 1m fixture prediction: 11/11. Canonical live (asset 9ed83c01,
 * ImageScript-decoded source, unfiltered mid-luma) is CLEARED. 1l leftover C9-right
 * (84/488 at x 462–500 / y 713–723) is down to 1/488 (ratio 0.002 / right 0.003).
 * C2/C4/C6 remain 0.
 */

import type { ChestCriterionId } from "./types";

export const STAGE1M_LIVE_VERIFIED = {
  repairMethodVersion: "architecture_c_still_repair_1m",
  assetId: "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  wardrobeFeatureId: "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
  cleanStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  keyframeId: "v2-still-0.785",
  stage: "logo_chest",
  createdAtUtc: "2026-09-15T05:08:18.043315Z",
  storedPath:
    "3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789448897690.png",
  occlusionSource: "sam3",
  sam3Ok: true,
  allowSkinHeuristicFallback: false,
  temporalTrackingEnabled: false,
  requestedBandQuadNorm: [
    [0.3, 0.53],
    [0.87, 0.533],
    [0.87, 0.585],
    [0.3, 0.582],
  ] as const,
  effectiveBandBboxPixelCount: 27394,
  gate: "CLEARED" as const,
  pass: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const satisfies readonly ChestCriterionId[],
  fail: [] as const satisfies readonly ChestCriterionId[],
  /** Unfiltered window ghost ratios (no authority-mask skip). Combined 0.002. */
  ghostRatiosUnfiltered: { left: 0, right: 0.003, combined: 0.002 },
  midLumaGhosts: 1,
  midLumaChecked: 488,
  rightWindowGhosts: 1,
  rightWindowChecked: 322,
  leftoverBox: { x0: 462, x1: 500, y0: 713, y1: 723 },
  leftoverGhosts: 1,
  leftoverChecked: 119,
  rightEndCreamToNavy: 0,
  creamBodyToNavy: 0,
  firstNavyRaisePx: 0,
  sleeveCornerDarkened: 0,
  pinstripeRemnants: 0,
} as const;
