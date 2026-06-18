import { describe, expect, it } from "vitest";
import { parseLogoPlacement, logoPlacementFromMetadata } from "./logoPlacement";

describe("parseLogoPlacement", () => {
  it("parses valid placement", () => {
    const p = parseLogoPlacement({
      logo_asset_id: "abc",
      source_bbox_norm: [0.1, 0.2, 0.3, 0.15],
      placement_hint: "upper_left_chest",
    });
    expect(p).not.toBeNull();
    expect(p!.source_bbox_norm).toEqual([0.1, 0.2, 0.3, 0.15]);
    expect(p!.logo_asset_id).toBe("abc");
  });

  it("parses min_target_height_px", () => {
    const p = parseLogoPlacement({
      source_bbox_norm: [0.1, 0.2, 0.3, 0.15],
      min_target_height_px: 48,
    });
    expect(p?.min_target_height_px).toBe(48);
  });

  it("rejects out-of-range min_target_height_px", () => {
    expect(
      parseLogoPlacement({
        source_bbox_norm: [0.1, 0.2, 0.3, 0.15],
        min_target_height_px: 8,
      })?.min_target_height_px,
    ).toBeNull();
  });

  it("rejects invalid bbox", () => {
    expect(parseLogoPlacement({ source_bbox_norm: [0, 0, 0, 0] })).toBeNull();
    expect(parseLogoPlacement(null)).toBeNull();
  });
});

describe("logoPlacementFromMetadata", () => {
  it("reads nested logo_placement", () => {
    const p = logoPlacementFromMetadata({
      logo_placement: {
        source_bbox_norm: [0.05, 0.1, 0.4, 0.08],
      },
    });
    expect(p?.source_bbox_norm[0]).toBe(0.05);
  });
});
