/**
 * Frozen Architecture C lineage for Lane D original-master live wiring.
 *
 * Values are copied from Stage 1m chest + live 1c sleeve + temporal PR #88
 * evidence — not imported from chest/sleeve paint owners or temporal
 * authorize constants (collision policy).
 */

export type QuadTuple = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
];

export const CANONICAL_PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";
export const CANONICAL_MASTER_CLIP_ID = "76fe7438-671d-4428-a7f6-17a45e98c16f";
export const CANONICAL_STILL_ASSET_ID = "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc";
export const CANONICAL_KEYFRAME_ID = "v2-still-0.785";
export const CANONICAL_KEYFRAME_TIME_SEC = 0.785;

export const CLEARED_CHEST_ASSET_ID = "9ed83c01-8c7d-4d1b-918f-87b0fc743c50";
export const CLEARED_CHEST_REPAIR_METHOD_VERSION = "architecture_c_still_repair_1m";
export const CLEARED_CHEST_GATE = "CLEARED" as const;
export const CLEARED_CHEST_GATE_SCORE = "11/11";

/** Live 1m chest-band quad on still `2aa1a44c` (t=0.785). */
export const CLEARED_CHEST_QUAD_TUPLE: QuadTuple = [
  [0.3, 0.53],
  [0.87, 0.533],
  [0.87, 0.585],
  [0.3, 0.582],
];

export const CLEARED_SLEEVE_ASSET_ID = "fdb86b18-d4aa-465e-b73f-1d252709739c";
export const CLEARED_SLEEVE_REPAIR_METHOD_VERSION = "architecture_c_sleeve_still_1c";
export const CLEARED_SLEEVE_GATE = "CLEARED" as const;
export const CLEARED_SLEEVE_GATE_SCORE = "6/6";
export const CLEARED_SLEEVE_EVIDENCE = "PR #86";

export const CLEARED_SLEEVE_LEFT_QUAD_TUPLE: QuadTuple = [
  [0.03, 0.5],
  [0.26, 0.505],
  [0.25, 0.615],
  [0.03, 0.61],
];

export const CLEARED_SLEEVE_RIGHT_QUAD_TUPLE: QuadTuple = [
  [0.88, 0.505],
  [0.99, 0.5],
  [0.99, 0.615],
  [0.88, 0.61],
];

export const CANONICAL_LINEAGE = {
  projectId: CANONICAL_PROJECT_ID,
  masterClipAssetId: CANONICAL_MASTER_CLIP_ID,
  stillAssetId: CANONICAL_STILL_ASSET_ID,
  keyframeId: CANONICAL_KEYFRAME_ID,
  keyframeTimeSec: CANONICAL_KEYFRAME_TIME_SEC,
  clearedChestAssetId: CLEARED_CHEST_ASSET_ID,
  chestRepairMethodVersion: CLEARED_CHEST_REPAIR_METHOD_VERSION,
  chestGate: CLEARED_CHEST_GATE,
  chestGateScore: CLEARED_CHEST_GATE_SCORE,
  chestQuadTuple: CLEARED_CHEST_QUAD_TUPLE,
  clearedSleeveAssetId: CLEARED_SLEEVE_ASSET_ID,
  sleeveRepairMethodVersion: CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
  sleeveGate: CLEARED_SLEEVE_GATE,
  sleeveGateScore: CLEARED_SLEEVE_GATE_SCORE,
  sleeveEvidence: CLEARED_SLEEVE_EVIDENCE,
  sleeveLeftQuadTuple: CLEARED_SLEEVE_LEFT_QUAD_TUPLE,
  sleeveRightQuadTuple: CLEARED_SLEEVE_RIGHT_QUAD_TUPLE,
} as const;

export type CanonicalLineage = typeof CANONICAL_LINEAGE;

export type RepairGateStatus = "CLEARED" | "PENDING" | "FAILED" | "NOT_RUN";
