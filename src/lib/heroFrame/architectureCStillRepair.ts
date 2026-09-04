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
  /** Clean capture used for stage-1 scoring (t=0.785). */
  recommendedStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  /** Hard stop — do not build tracking until still repair passes. */
  temporalTrackingEnabled: false,
} as const;

/**
 * Measured full chest band on clean still `2aa1a44c` (t=0.785), TL→TR→BR→BL.
 * From docs/ARCHITECTURE_C_V2_DEFECTS_AND_PROPOSED_FIXES_2026-09-03.md §3.1–3.2.
 * Seed the runner from this — not the generic upper-chest placeholder.
 */
export const MEASURED_V2_CHEST_BAND_QUAD: QuadNorm = [
  [0.3, 0.503],
  [0.88, 0.503],
  [0.88, 0.578],
  [0.3, 0.578],
];

export type ChestBandQuadAssessment = {
  ok: boolean;
  warnings: string[];
  centerY: number;
  height: number;
};

function quadBounds(quad: QuadNorm): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = quad.map(([x]) => x);
  const ys = quad.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * Warn when a chest-band / logo quad is likely off-garment (e.g. stage-1 face hit).
 * Pure heuristic against the measured band on the recommended still — not a mask.
 */
export function assessChestBandQuadPlacement(
  quad: QuadNorm,
  expected: QuadNorm = MEASURED_V2_CHEST_BAND_QUAD,
): ChestBandQuadAssessment {
  const b = quadBounds(quad);
  const e = quadBounds(expected);
  const centerY = (b.minY + b.maxY) / 2;
  const height = b.maxY - b.minY;
  const expectedHeight = e.maxY - e.minY;
  const expectedCenterY = (e.minY + e.maxY) / 2;
  const warnings: string[] = [];

  if (centerY < e.minY - 0.04 || centerY > e.maxY + 0.04) {
    warnings.push(
      `Quad center y=${centerY.toFixed(3)} is outside the measured chest band (≈ ${e.minY.toFixed(3)}–${e.maxY.toFixed(3)}). Likely off-garment.`,
    );
  }
  if (height > expectedHeight * 1.75) {
    warnings.push(
      `Quad height ${height.toFixed(3)} is ~${(height / Math.max(expectedHeight, 1e-6)).toFixed(1)}× the measured band (${expectedHeight.toFixed(3)}).`,
    );
  }
  if (b.maxY < e.minY || b.minY > e.maxY) {
    warnings.push("Quad does not vertically overlap the measured chest band.");
  }
  if (Math.abs(centerY - expectedCenterY) > 0.08) {
    warnings.push(
      `Quad is ~${Math.abs(centerY - expectedCenterY).toFixed(3)} too far from band center y=${expectedCenterY.toFixed(3)}.`,
    );
  }

  return { ok: warnings.length === 0, warnings, centerY, height };
}

/** True when metadata marks this asset as a still-repair output (do not re-chain as input). */
export function isStillRepairOutputMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const stage = (metadata as { repair_stage?: unknown }).repair_stage;
  return stage === "logo_chest" || stage === "sleeve_panel";
}

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
