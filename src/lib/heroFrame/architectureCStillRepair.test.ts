import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_C_V2_REPAIR,
  assertStillRepairStage,
  buildStillRepairAssetMetadata,
  mergeLogoZoneManualQuad,
} from "./architectureCStillRepair";

describe("ARCHITECTURE_C_V2_REPAIR", () => {
  it("points at the V2 edited_clip and freezes tracking off", () => {
    expect(ARCHITECTURE_C_V2_REPAIR.editedClipAssetId).toBe(
      "f31bd0f2-884f-42e1-8b08-aa645597b7a6",
    );
    expect(ARCHITECTURE_C_V2_REPAIR.recommendedStillTimeSec).toBe(0.785);
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(false);
    expect(ARCHITECTURE_C_V2_REPAIR.wardrobeFeatureId).toBe(
      "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
    );
  });
});

describe("mergeLogoZoneManualQuad", () => {
  const quad: [[number, number], [number, number], [number, number], [number, number]] = [
    [0.2, 0.4],
    [0.7, 0.41],
    [0.7, 0.48],
    [0.2, 0.47],
  ];

  it("writes default + keyframe without inventing a garment schema", () => {
    const merged = mergeLogoZoneManualQuad({ version: 1, details: {} }, quad, "v2-still-0.785");
    const logo = (merged.details as Record<string, unknown>).logo_zone as Record<string, unknown>;
    const mkf = logo.manual_keyframe as Record<string, { target_quad_norm: unknown }>;
    expect(mkf.default.target_quad_norm).toEqual(quad);
    expect(mkf["v2-still-0.785"].target_quad_norm).toEqual(quad);
  });

  it("preserves unrelated product_truth fields", () => {
    const merged = mergeLogoZoneManualQuad(
      { version: 1, details: { zipper_line: { detail_type: "zipper_line" } } },
      quad,
    );
    expect((merged.details as Record<string, unknown>).zipper_line).toEqual({
      detail_type: "zipper_line",
    });
  });
});

describe("buildStillRepairAssetMetadata", () => {
  it("records stage and hard-stops tracking", () => {
    const meta = buildStillRepairAssetMetadata({
      stage: "logo_chest",
      sourceStillAssetId: "still-1",
      sourceVideoAssetId: ARCHITECTURE_C_V2_REPAIR.editedClipAssetId,
      frameTimeSec: 0.785,
      wardrobeFeatureId: ARCHITECTURE_C_V2_REPAIR.wardrobeFeatureId,
      repairMeta: { placement_source: "manual_keyframe" },
    });
    expect(meta.temporal_tracking_enabled).toBe(false);
    expect(meta.repair_stage).toBe("logo_chest");
    expect(meta.architecture_lane).toBe("architecture_c");
  });
});

describe("assertStillRepairStage", () => {
  it("accepts only logo_chest and sleeve_panel", () => {
    expect(assertStillRepairStage("logo_chest")).toBe("logo_chest");
    expect(assertStillRepairStage("sleeve_panel")).toBe("sleeve_panel");
    expect(() => assertStillRepairStage("temporal")).toThrow(/invalid_still_repair_stage/);
  });
});
