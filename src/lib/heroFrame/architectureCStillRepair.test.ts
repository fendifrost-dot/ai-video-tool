import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_C_V2_REPAIR,
  MEASURED_V2_CHEST_BAND_QUAD,
  assertStillRepairStage,
  assessChestBandQuadPlacement,
  buildStillRepairAssetMetadata,
  isStillRepairOutputMetadata,
  mergeLogoZoneManualQuad,
} from "./architectureCStillRepair";

describe("ARCHITECTURE_C_V2_REPAIR", () => {
  it("points at the V2 edited_clip and freezes tracking off", () => {
    expect(ARCHITECTURE_C_V2_REPAIR.editedClipAssetId).toBe(
      "f31bd0f2-884f-42e1-8b08-aa645597b7a6",
    );
    expect(ARCHITECTURE_C_V2_REPAIR.recommendedStillTimeSec).toBe(0.785);
    expect(ARCHITECTURE_C_V2_REPAIR.recommendedStillAssetId).toBe(
      "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
    );
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(false);
    expect(ARCHITECTURE_C_V2_REPAIR.wardrobeFeatureId).toBe(
      "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
    );
  });
});

describe("MEASURED_V2_CHEST_BAND_QUAD", () => {
  it("matches the measured band on still 2aa1a44c (not the generic placeholder)", () => {
    expect(MEASURED_V2_CHEST_BAND_QUAD[0][1]).toBeCloseTo(0.503, 3);
    expect(MEASURED_V2_CHEST_BAND_QUAD[2][1]).toBeCloseTo(0.578, 3);
    expect(MEASURED_V2_CHEST_BAND_QUAD[0][0]).toBeCloseTo(0.3, 3);
    expect(MEASURED_V2_CHEST_BAND_QUAD[1][0]).toBeCloseTo(0.88, 3);
    // Generic VTON placeholder used y≈0.38–0.48 (the stage-1 face-hit class).
    expect(MEASURED_V2_CHEST_BAND_QUAD[0][1]).toBeGreaterThan(0.48);
  });
});

describe("assessChestBandQuadPlacement", () => {
  it("accepts the measured band seed", () => {
    const a = assessChestBandQuadPlacement(MEASURED_V2_CHEST_BAND_QUAD);
    expect(a.ok).toBe(true);
    expect(a.warnings).toEqual([]);
  });

  it("flags the stage-1 face-hit placeholder (too high, too tall)", () => {
    const faceHit: [[number, number], [number, number], [number, number], [number, number]] = [
      [0.219, 0.38],
      [0.781, 0.38],
      [0.781, 0.509],
      [0.219, 0.509],
    ];
    const a = assessChestBandQuadPlacement(faceHit);
    expect(a.ok).toBe(false);
    expect(a.warnings.length).toBeGreaterThan(0);
    expect(a.warnings.join(" ")).toMatch(/outside|height|far/i);
  });
});

describe("isStillRepairOutputMetadata", () => {
  it("detects logo_chest / sleeve_panel repair outputs", () => {
    expect(isStillRepairOutputMetadata({ repair_stage: "logo_chest" })).toBe(true);
    expect(isStillRepairOutputMetadata({ repair_stage: "sleeve_panel" })).toBe(true);
    expect(isStillRepairOutputMetadata({ mime_type: "image/png" })).toBe(false);
    expect(isStillRepairOutputMetadata(null)).toBe(false);
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
