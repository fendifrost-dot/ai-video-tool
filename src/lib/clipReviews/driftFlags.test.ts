import { describe, expect, it } from "vitest";
import { DRIFT_THRESHOLD, computeDriftFlags } from "./driftFlags";

describe("computeDriftFlags", () => {
  it("returns empty when all scores are at or above the threshold", () => {
    expect(
      computeDriftFlags({
        face_consistency_score: 9,
        wardrobe_score: 8,
        lighting_score: DRIFT_THRESHOLD,
      }),
    ).toEqual([]);
  });

  it("flags only the dimensions that fell below the threshold", () => {
    expect(
      computeDriftFlags({
        face_consistency_score: 5,
        wardrobe_score: 6,
        lighting_score: 9,
      }),
    ).toEqual(["face", "wardrobe"]);
  });

  it("ignores null / undefined scores (treats them as not-rated)", () => {
    expect(
      computeDriftFlags({
        face_consistency_score: null,
        wardrobe_score: 2,
        lighting_score: undefined,
      }),
    ).toEqual(["wardrobe"]);
  });

  it("flag order is stable: face, wardrobe, lighting", () => {
    expect(
      computeDriftFlags({
        lighting_score: 1,
        wardrobe_score: 1,
        face_consistency_score: 1,
      }),
    ).toEqual(["face", "wardrobe", "lighting"]);
  });

  it("DRIFT_THRESHOLD itself is not flagged (it's inclusive at threshold)", () => {
    expect(
      computeDriftFlags({ face_consistency_score: DRIFT_THRESHOLD }),
    ).toEqual([]);
    expect(
      computeDriftFlags({ face_consistency_score: DRIFT_THRESHOLD - 0.1 }),
    ).toEqual(["face"]);
  });
});
