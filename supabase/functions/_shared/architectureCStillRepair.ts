/**
 * Pure helpers mirrored for the Architecture C still-repair edge function.
 * Keep in sync with src/lib/heroFrame/architectureCStillRepair.ts.
 */

export type QuadNorm = [[number, number], [number, number], [number, number], [number, number]];

export type StillRepairStage = "logo_chest" | "sleeve_panel";

export type SleevePanelManual = {
  side: "left" | "right";
  targetQuad: QuadNorm;
  sourceBboxNorm?: [number, number, number, number];
};

export const ARCHITECTURE_C_V2_REPAIR = {
  ownerId: "3ca10935-8c3d-4479-9a0c-8bfe8050840c",
  editedClipAssetId: "f31bd0f2-884f-42e1-8b08-aa645597b7a6",
  wardrobeFeatureId: "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
  recommendedStillTimeSec: 0.785,
  temporalTrackingEnabled: false,
} as const;

export function mergeLogoZoneManualQuad(
  productTruthRaw: unknown,
  quad: QuadNorm,
  keyframeId = "v2-still-0.785",
): Record<string, unknown> {
  const base: Record<string, unknown> =
    productTruthRaw && typeof productTruthRaw === "object"
      ? { ...(productTruthRaw as Record<string, unknown>) }
      : { version: 1 };
  const detailsRaw: Record<string, unknown> =
    base.details && typeof base.details === "object"
      ? { ...(base.details as Record<string, unknown>) }
      : {};
  const logoRaw: Record<string, unknown> =
    detailsRaw.logo_zone && typeof detailsRaw.logo_zone === "object"
      ? { ...(detailsRaw.logo_zone as Record<string, unknown>) }
      : { detail_type: "logo_zone" };
  const mkf: Record<string, unknown> =
    logoRaw.manual_keyframe && typeof logoRaw.manual_keyframe === "object"
      ? { ...(logoRaw.manual_keyframe as Record<string, unknown>) }
      : {};
  mkf[keyframeId] = { target_quad_norm: quad };
  mkf.default = { target_quad_norm: quad };
  logoRaw.manual_keyframe = mkf;
  logoRaw.detail_type = "logo_zone";
  // Seed Architecture C wordmark sub-zone defaults when absent (wearer's-left, ~½ height).
  if (
    !Array.isArray(logoRaw.logo_offset_norm) ||
    (logoRaw.logo_offset_norm as unknown[]).length !== 2
  ) {
    logoRaw.logo_offset_norm = [0.55, 0.88];
  }
  if (typeof logoRaw.logo_height_ratio !== "number") {
    logoRaw.logo_height_ratio = 0.5;
  }
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

export function isQuadNorm(v: unknown): v is QuadNorm {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1),
    )
  );
}
