import { describe, expect, it } from "vitest";
import { filedSeedanceSeconds, seedanceFileSeconds } from "./seedanceDuration";

describe("a Seedance file is one frame longer than the seconds that were asked", () => {
  it("stores 4 s as 97 frames", () => {
    expect(seedanceFileSeconds(4)).toBeCloseTo(97 / 24, 6);
    expect(seedanceFileSeconds(10)).toBeCloseTo(241 / 24, 6);
  });

  it("leaves a duration that was already measured", () => {
    expect(filedSeedanceSeconds({ asked: 4, method: "montage", stored: 4.041667 })).toBeCloseTo(
      4.041667,
      5,
    );
    expect(filedSeedanceSeconds({ asked: 4, method: "montage", stored: 4 })).toBeCloseTo(
      97 / 24,
      6,
    );
    expect(filedSeedanceSeconds({ asked: 4, method: "dressed", stored: 4 })).toBe(4);
  });
});
