/**
 * Architecture C still-first deterministic repair — constants + pure helpers.
 * Temporal tracking is intentionally OFF until a still passes human review.
 */

import type { QuadNorm } from "@/lib/garment/placementEngine";
import { EDIT_R4_PRODUCT } from "@/lib/heroFrame/editR4ProductIds";

export const ARCHITECTURE_C_V2_REPAIR = {
  ...EDIT_R4_PRODUCT,
  editedClipAssetId: "f31bd0f2-884f-42e1-8b08-aa645597b7a6",
  grokRequestId: "9d47bd2f-c220-98a4-a281-f1499b8ae7f4",
  recommendedStillTimeSec: 0.785,
  /** Hard stop — do not build tracking until still repair passes. */
  temporalTrackingEnabled: false,
} as const;

export type StillRepairStage = "logo_chest" | "sleeve_panel";

export type SleevePanelManual = {
  side: "left" | "right";
  /** Target quad on the V2 still (visible upper-arm only). */
  targetQuad: QuadNorm;
  /** Optional crop on the flat front for navy panel pixels (norm x,y,w,h). */
  sourceBboxNorm?: [number, number, number, number];
};

/** Merge a still-specific logo_zone manual keyframe into product_truth without a new schema. */
export function mergeLogoZoneManualQuad(
  productTruthRaw: unknown,
  quad: QuadNorm,
  keyframeId = "v2-still-0.785",
): Record<string, unknown> {
  const base =
    productTruthRaw && typeof productTruthRaw === "object"
      ? { ...(productTruthRaw as Record<string, unknown>) }
      : { version: 1 };
  const detailsRaw =
    base.details && typeof base.details === "object"
      ? { ...(base.details as Record<string, unknown>) }
      : {};
  const logoRaw =
    detailsRaw.logo_zone && typeof detailsRaw.logo_zone === "object"
      ? { ...(detailsRaw.logo_zone as Record<string, unknown>) }
      : { detail_type: "logo_zone" };
  const mkf =
    logoRaw.manual_keyframe && typeof logoRaw.manual_keyframe === "object"
      ? { ...(logoRaw.manual_keyframe as Record<string, unknown>) }
      : {};
  mkf[keyframeId] = { target_quad_norm: quad };
  mkf.default = { target_quad_norm: quad };
  logoRaw.manual_keyframe = mkf;
  logoRaw.detail_type = "logo_zone";
  detailsRaw.logo_zone = logoRaw;
  return { ...base, version: typeof base.version === "number" ? base.version : 1, details: detailsRaw };
}

export function buildStillRepairAssetMetadata(input: {
  stage: StillRepairStage;
  sourceStillAssetId: string;
  sourceVideoAssetId: string | null;
  frameTimeSec: number | null;
  wardrobeFeatureId: string;
  repairMeta: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    bucket: "project-references",
    mime_type: "image/png",
    architecture_lane: "architecture_c",
    repair_stage: input.stage,
    temporal_tracking_enabled: ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled,
    source_still_asset_id: input.sourceStillAssetId,
    source_video_asset_id: input.sourceVideoAssetId,
    frame_time_sec: input.frameTimeSec,
    wardrobe_feature_id: input.wardrobeFeatureId,
    repair: input.repairMeta,
  };
}

export function assertStillRepairStage(stage: string): StillRepairStage {
  if (stage === "logo_chest" || stage === "sleeve_panel") return stage;
  throw new Error(`invalid_still_repair_stage:${stage}`);
}
