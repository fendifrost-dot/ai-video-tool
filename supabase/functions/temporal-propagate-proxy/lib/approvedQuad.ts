/**
 * Approved-repair quad slots for chest + sleeve integration.
 * Chest is CLEARED (1m). Sleeve left/right are CLEARED (live 1c).
 * Geometry is copied from temporal lineage — not imported from paint owners.
 */

import type { QuadNorm } from "./contract.ts";
import {
  CANONICAL_KEYFRAME_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_GATE,
  CLEARED_CHEST_QUAD_NORM,
  CLEARED_CHEST_REPAIR_METHOD_VERSION,
  CLEARED_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_GATE,
  CLEARED_SLEEVE_LEFT_QUAD_NORM,
  CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
  CLEARED_SLEEVE_RIGHT_QUAD_NORM,
} from "./canonicalLineage.ts";

export type RepairGateStatus = "CLEARED" | "PENDING" | "FAILED" | "NOT_RUN";

export type ApprovedQuadKind = "chest" | "sleeve_left" | "sleeve_right";

export interface ApprovedQuad {
  kind: ApprovedQuadKind;
  keyframeId: string;
  quadNorm: QuadNorm;
  sourceAssetId: string;
  repairMethodVersion: string;
  gate: RepairGateStatus;
}

export interface ReservedSleeveSlot {
  kind: "sleeve_left" | "sleeve_right";
  status: "PENDING";
  note: "Fill only after sleeve still CLEARED on the same lineage as chest 1m.";
}

export interface ApprovedQuadSet {
  chest: ApprovedQuad;
  sleeveLeft?: ApprovedQuad;
  sleeveRight?: ApprovedQuad;
  reservedSleeveSlots: readonly ReservedSleeveSlot[];
}

/** Historical reserved slots — unused once live 1c sleeve quads are wired. */
export const PENDING_SLEEVE_SLOTS: readonly ReservedSleeveSlot[] = [
  {
    kind: "sleeve_left",
    status: "PENDING",
    note: "Fill only after sleeve still CLEARED on the same lineage as chest 1m.",
  },
  {
    kind: "sleeve_right",
    status: "PENDING",
    note: "Fill only after sleeve still CLEARED on the same lineage as chest 1m.",
  },
];

export function clearedChestApprovedQuad(): ApprovedQuad {
  return {
    kind: "chest",
    keyframeId: CANONICAL_KEYFRAME_ID,
    quadNorm: CLEARED_CHEST_QUAD_NORM,
    sourceAssetId: CLEARED_CHEST_ASSET_ID,
    repairMethodVersion: CLEARED_CHEST_REPAIR_METHOD_VERSION,
    gate: CLEARED_CHEST_GATE,
  };
}

export function clearedSleeveLeftApprovedQuad(): ApprovedQuad {
  return {
    kind: "sleeve_left",
    keyframeId: CANONICAL_KEYFRAME_ID,
    quadNorm: CLEARED_SLEEVE_LEFT_QUAD_NORM,
    sourceAssetId: CLEARED_SLEEVE_ASSET_ID,
    repairMethodVersion: CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
    gate: CLEARED_SLEEVE_GATE,
  };
}

export function clearedSleeveRightApprovedQuad(): ApprovedQuad {
  return {
    kind: "sleeve_right",
    keyframeId: CANONICAL_KEYFRAME_ID,
    quadNorm: CLEARED_SLEEVE_RIGHT_QUAD_NORM,
    sourceAssetId: CLEARED_SLEEVE_ASSET_ID,
    repairMethodVersion: CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
    gate: CLEARED_SLEEVE_GATE,
  };
}

/** Chest CLEARED + empty sleeve slots. Chest-only fixture helper. */
export function clearedChestQuadSet(): ApprovedQuadSet {
  return {
    chest: clearedChestApprovedQuad(),
    reservedSleeveSlots: PENDING_SLEEVE_SLOTS,
  };
}

/** Canonical live set: CLEARED chest 1m + CLEARED sleeve 1c left/right. */
export function clearedChestAndSleeveQuadSet(): ApprovedQuadSet {
  return {
    chest: clearedChestApprovedQuad(),
    sleeveLeft: clearedSleeveLeftApprovedQuad(),
    sleeveRight: clearedSleeveRightApprovedQuad(),
    reservedSleeveSlots: [],
  };
}

export function gatedApprovedQuads(set: ApprovedQuadSet): ApprovedQuad[] {
  const out: ApprovedQuad[] = [];
  if (set.chest.gate === "CLEARED") out.push(set.chest);
  if (set.sleeveLeft?.gate === "CLEARED") out.push(set.sleeveLeft);
  if (set.sleeveRight?.gate === "CLEARED") out.push(set.sleeveRight);
  return out;
}
