/**
 * Frozen Architecture C lineage for Lane C live-prep.
 * Values are copied from the Stage 1m CLEARED chest gate — not imported from
 * chest/sleeve paint owners (collision policy).
 */

import type { QuadNorm } from "./contract";

/** TL → TR → BR → BL, same tuple form as Hero Frame / Stage 1m live body. */
export type QuadTuple = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
];

export const CANONICAL_PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";
export const CANONICAL_STILL_ASSET_ID = "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc";
export const CANONICAL_KEYFRAME_ID = "v2-still-0.785";
export const CANONICAL_KEYFRAME_TIME_SEC = 0.785;
export const CLEARED_CHEST_ASSET_ID = "9ed83c01-8c7d-4d1b-918f-87b0fc743c50";
export const CLEARED_CHEST_REPAIR_METHOD_VERSION = "architecture_c_still_repair_1m";
export const CLEARED_CHEST_GATE = "CLEARED" as const;
export const CLEARED_CHEST_GATE_SCORE = "11/11";

/**
 * Live 1m chest-band quad on still `2aa1a44c` (t=0.785).
 * VERIFIED: Stage 1m CLEARED 11/11, asset `9ed83c01`.
 */
export const CLEARED_CHEST_QUAD_TUPLE: QuadTuple = [
  [0.3, 0.53],
  [0.87, 0.533],
  [0.87, 0.585],
  [0.3, 0.582],
];

export function tupleToQuadNorm(tuple: QuadTuple): QuadNorm {
  return [
    { x: tuple[0][0], y: tuple[0][1] },
    { x: tuple[1][0], y: tuple[1][1] },
    { x: tuple[2][0], y: tuple[2][1] },
    { x: tuple[3][0], y: tuple[3][1] },
  ];
}

export function quadNormToTuple(quad: QuadNorm): QuadTuple {
  return [
    [quad[0].x, quad[0].y],
    [quad[1].x, quad[1].y],
    [quad[2].x, quad[2].y],
    [quad[3].x, quad[3].y],
  ];
}

export const CLEARED_CHEST_QUAD_NORM: QuadNorm = tupleToQuadNorm(CLEARED_CHEST_QUAD_TUPLE);

export const CANONICAL_LINEAGE = {
  projectId: CANONICAL_PROJECT_ID,
  stillAssetId: CANONICAL_STILL_ASSET_ID,
  keyframeId: CANONICAL_KEYFRAME_ID,
  keyframeTimeSec: CANONICAL_KEYFRAME_TIME_SEC,
  clearedChestAssetId: CLEARED_CHEST_ASSET_ID,
  chestRepairMethodVersion: CLEARED_CHEST_REPAIR_METHOD_VERSION,
  chestGate: CLEARED_CHEST_GATE,
  chestGateScore: CLEARED_CHEST_GATE_SCORE,
  chestQuadTuple: CLEARED_CHEST_QUAD_TUPLE,
} as const;

export type CanonicalLineage = typeof CANONICAL_LINEAGE;
