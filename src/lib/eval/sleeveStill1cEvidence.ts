/**
 * GitHub-verified Lane B sleeve still identity + live scorecard (Stage 1c).
 * Scorecard: docs/sleeve-panel/LANE_B_SLEEVE_STILL_1C_LIVE_RESULT_2026-09-16.md
 *
 * Live $0 Hero Frame run on clean still 2aa1a44c (preferred chest-cleared
 * 9ed83c01 was not the stillAssetId). Paint not re-run. Historical lock —
 * later paint stages must not change these numbers.
 */

import type { SleeveCriterionId } from "../sleevePanel/liveScore";

export const SLEEVE_STILL_1C_LIVE_VERIFIED = {
  repairMethodVersion: "architecture_c_sleeve_still_1c",
  claim: "visible_geometry_only",
  contractVersion: "1.0.0",
  geometryNote: "visible_upper_arm_only",
  hiddenShoulderToCuffValidated: false,
  navyFillMode: "navy_over_cream",
  sourceNavyFraction: 1,
  assetId: "fdb86b18-d4aa-465e-b73f-1d252709739c",
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  wardrobeFeatureId: "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
  cleanStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  preferredChestOutputAssetId: "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
  preferredChestOutputUsed: false,
  chestOutputAssetId: null,
  consumedChestOutput: true,
  keyframeId: "v2-still-0.785",
  stage: "sleeve_panel",
  createdAtUtc: "2026-09-15T23:54:54.956805Z",
  storedPath:
    "3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/architecture-c-repair/sleeve_panel_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789516494410.png",
  temporalTrackingEnabled: false,
  geometryRejectedHttp400: false,
  leftPainted: 22777,
  rightPainted: 11128,
  vsCleanChangedPx: 33905,
  vs1aChangedPx: 33905,
  vs1bChangedPx: 25949,
  leftMeanSrcLuma: 202.24,
  leftMeanOutLuma: 39.93,
  leftNavyLike: 22730,
  rightMeanSrcLuma: 133.56,
  rightMeanOutLuma: 39.96,
  rightNavyLike: 11104,
  rightChecked: 11139,
  c5BrightChanged: 0,
  c5PatchDarkened: 0,
  c11ChangedAboveY600: 0,
  c11ChangedBelowY800: 0,
  chestReservedChanged: 0,
  hiddenFaceChanged: 0,
  gate: "CLEARED" as const,
  pass: [1, 2, 3, 4, 5, 6] as const satisfies readonly SleeveCriterionId[],
  fail: [] as const satisfies readonly SleeveCriterionId[],
} as const;
