import { describe, expect, it } from "vitest";
import { CREAM, DEFAULT_PANELS, FLAT_PANEL_BBOX, NAVY, buildFlatSleeveRef } from "./fixtures";
import { DEFAULT_FLAT_SLEEVE_SOURCE_BBOX } from "./liveStill";
import {
  NAVY_CROP_MIN_FRACTION,
  PRODUCT_NAVY_FALLBACK,
  findVerticalNavyBbox,
  isSleeveCreamOrWhite,
  isSleeveProductNavy,
  navyFraction,
  resolveNavyPanelSource,
} from "./navyFill";
import { cropNormBbox } from "./raster";

describe("navy-ward sleeve source resolution", () => {
  it("classifies fixture navy vs cream", () => {
    expect(isSleeveProductNavy(NAVY[0], NAVY[1], NAVY[2])).toBe(true);
    expect(isSleeveProductNavy(CREAM[0], CREAM[1], CREAM[2])).toBe(false);
    expect(isSleeveCreamOrWhite(CREAM[0], CREAM[1], CREAM[2])).toBe(true);
    expect(isSleeveCreamOrWhite(227, 227, 227)).toBe(true);
    expect(PRODUCT_NAVY_FALLBACK[2]).toBeGreaterThan(PRODUCT_NAVY_FALLBACK[0]);
  });

  it("treats the 1a default bbox on the fixture flat as cream-majority", () => {
    const flat = buildFlatSleeveRef();
    const crop = cropNormBbox(flat, DEFAULT_FLAT_SLEEVE_SOURCE_BBOX);
    expect(navyFraction(crop)).toBeLessThan(NAVY_CROP_MIN_FRACTION);
    expect(navyFraction(cropNormBbox(flat, FLAT_PANEL_BBOX))).toBeGreaterThan(
      NAVY_CROP_MIN_FRACTION,
    );
  });

  it("finds the vertical navy strip when the requested crop is cream", () => {
    const flat = buildFlatSleeveRef();
    const found = findVerticalNavyBbox(flat, "left", DEFAULT_FLAT_SLEEVE_SOURCE_BBOX);
    expect(found).not.toBeNull();
    const resolved = resolveNavyPanelSource(flat, DEFAULT_FLAT_SLEEVE_SOURCE_BBOX, "left");
    expect(resolved.fillMode).toBe("warp");
    expect(resolved.navyFraction).toBeGreaterThanOrEqual(NAVY_CROP_MIN_FRACTION);
    expect(
      isSleeveProductNavy(resolved.medianNavy[0], resolved.medianNavy[1], resolved.medianNavy[2]),
    ).toBe(true);
  });

  it("warps a navy-majority requested crop as-is (pinstripe path)", () => {
    const flat = buildFlatSleeveRef();
    const resolved = resolveNavyPanelSource(flat, DEFAULT_PANELS[0]!.sourceBboxNorm, "left");
    expect(resolved.fillMode).toBe("warp");
    expect(resolved.bbox).toEqual(DEFAULT_PANELS[0]!.sourceBboxNorm);
  });

  it("falls back to median product navy when the flat has no navy panel", () => {
    const cream = {
      width: 32,
      height: 32,
      data: new Uint8Array(32 * 32 * 4),
    };
    for (let i = 0; i < 32 * 32; i++) {
      cream.data[i * 4] = CREAM[0];
      cream.data[i * 4 + 1] = CREAM[1];
      cream.data[i * 4 + 2] = CREAM[2];
      cream.data[i * 4 + 3] = 255;
    }
    const resolved = resolveNavyPanelSource(cream, DEFAULT_FLAT_SLEEVE_SOURCE_BBOX, "right");
    expect(resolved.fillMode).toBe("median_navy");
    expect(resolved.medianNavy).toEqual([...PRODUCT_NAVY_FALLBACK]);
    expect(
      isSleeveProductNavy(
        resolved.source.data[0]!,
        resolved.source.data[1]!,
        resolved.source.data[2]!,
      ),
    ).toBe(true);
  });
});
