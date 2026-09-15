/**
 * Approved-repair quad slots for later chest + sleeve integration.
 * Chest is CLEARED. Sleeve slots stay PENDING until a sleeve still CLEARED
 * lands on the same lineage — this module does not invent sleeve geometry.
 */

import type { QuadNorm } from "./contract";
import {
  CANONICAL_KEYFRAME_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_GATE,
  CLEARED_CHEST_QUAD_NORM,
  CLEARED_CHEST_REPAIR_METHOD_VERSION,
} from "./canonicalLineage";

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

/** Chest CLEARED + empty sleeve slots. Default live-prep set. */
export function clearedChestQuadSet(): ApprovedQuadSet {
  return {
    chest: clearedChestApprovedQuad(),
    reservedSleeveSlots: PENDING_SLEEVE_SLOTS,
  };
}

export function gatedApprovedQuads(set: ApprovedQuadSet): ApprovedQuad[] {
  const out: ApprovedQuad[] = [];
  if (set.chest.gate === "CLEARED") out.push(set.chest);
  if (set.sleeveLeft?.gate === "CLEARED") out.push(set.sleeveLeft);
  if (set.sleeveRight?.gate === "CLEARED") out.push(set.sleeveRight);
  return out;
}
