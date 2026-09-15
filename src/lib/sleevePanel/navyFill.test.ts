import { describe, expect, it } from "vitest";
import { CREAM, DEFAULT_PANELS, FLAT_PANEL_BBOX, NAVY, buildFlatSleeveRef } from "./fixtures";
import { DEFAULT_FLAT_SLEEVE_SOURCE_BBOX } from "./liveStill";
import {
  NAVY_CROP_MIN_FRACTION,
  NAVY_MAJORITY_FRACTION,
  PRODUCT_NAVY_FALLBACK,
  findVerticalNavyBbox,
  isSleeveCreamOrWhite,
  isSleeveProductNavy,
  navyFraction,
  preferProductNavyOverCream,
  resolveNavyPanelSource,
} from "./navyFill";
import { cropNormBbox } from "./raster";
import {
  STAGE1B_CREAM_MAJORITY_NAVY_FRACTION,
  buildCreamMajorityNavyStripeFlat,
  stage1bLeftoverRequestedNavyFraction,
} from "./stage1bRightLeftover";

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
      NAVY_MAJORITY_FRACTION,
    );
  });

  it("finds the vertical navy strip when the requested crop is cream", () => {
    const flat = buildFlatSleeveRef();
    const found = findVerticalNavyBbox(flat, "left", DEFAULT_FLAT_SLEEVE_SOURCE_BBOX);
    expect(found).not.toBeNull();
    const resolved = resolveNavyPanelSource(flat, DEFAULT_FLAT_SLEEVE_SOURCE_BBOX, "left");
    expect(["navy_over_cream", "warp"]).toContain(resolved.fillMode);
    expect(resolved.navyFraction).toBeGreaterThanOrEqual(NAVY_MAJORITY_FRACTION);
    expect(
      isSleeveProductNavy(resolved.medianNavy[0], resolved.medianNavy[1], resolved.medianNavy[2]),
    ).toBe(true);
    expect(
      isSleeveCreamOrWhite(
        resolved.source.data[0]!,
        resolved.source.data[1]!,
        resolved.source.data[2]!,
      ),
    ).toBe(false);
  });

  it("1c: navy-majority requested crop prefers navy over cream pinstripe", () => {
    const flat = buildFlatSleeveRef();
    const resolved = resolveNavyPanelSource(flat, DEFAULT_PANELS[0]!.sourceBboxNorm, "left");
    expect(resolved.fillMode).toBe("navy_over_cream");
    expect(resolved.bbox).toEqual(DEFAULT_PANELS[0]!.sourceBboxNorm);
    expect(resolved.navyFraction).toBeGreaterThanOrEqual(0.99);
    const stripeReplaced = preferProductNavyOverCream(
      cropNormBbox(flat, DEFAULT_PANELS[0]!.sourceBboxNorm),
      resolved.medianNavy,
    );
    expect(stripeReplaced.replaced).toBeGreaterThan(0);
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

  it("1b leftover: ~0.23 navy requested crop is cream-majority (would warp as-is in 1b)", () => {
    const flat = buildCreamMajorityNavyStripeFlat();
    const frac = stage1bLeftoverRequestedNavyFraction(flat);
    expect(frac).toBeGreaterThanOrEqual(NAVY_CROP_MIN_FRACTION);
    expect(frac).toBeLessThan(NAVY_MAJORITY_FRACTION);
    expect(frac).toBeCloseTo(STAGE1B_CREAM_MAJORITY_NAVY_FRACTION, 1);
    const resolved = resolveNavyPanelSource(flat, DEFAULT_FLAT_SLEEVE_SOURCE_BBOX, "right");
    expect(["navy_over_cream", "warp"]).toContain(resolved.fillMode);
    expect(resolved.navyFraction).toBeGreaterThanOrEqual(0.99);
    expect(
      isSleeveCreamOrWhite(
        resolved.source.data[0]!,
        resolved.source.data[1]!,
        resolved.source.data[2]!,
      ),
    ).toBe(false);
  });
});
