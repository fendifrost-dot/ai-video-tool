import { describe, expect, it } from "vitest";
import { alphaShouldAdvance, colrOf, normalizedTime, renderSize, resampleGray } from "./render";

describe("pairing the alpha with the take by time", () => {
  it("a frame's place on its clock runs 0 to 1 over the file", () => {
    expect(normalizedTime(0, 0, 4)).toBe(0);
    expect(normalizedTime(2, 0, 4)).toBe(0.5);
    expect(normalizedTime(1.5, 0.5, 4.5)).toBe(0.25);
    expect(normalizedTime(1, 1, 1)).toBe(0);
  });

  it("advances to the next alpha frame when it is at least as near the take frame", () => {
    expect(alphaShouldAdvance(0.5, 0.4, 0.6)).toBe(true); // a tie goes forward
    expect(alphaShouldAdvance(0.45, 0.4, 0.6)).toBe(false);
    expect(alphaShouldAdvance(0.59, 0.4, 0.6)).toBe(true);
    expect(alphaShouldAdvance(0.2, 0.4, 0.6)).toBe(false); // never goes back
  });

  it("walks a matte with a doubled frame without drifting the rest of the window", () => {
    // take: 4 frames at 0, 1/3, 2/3, 1; matte: 5 frames with the second doubled
    const take = [0, 1 / 3, 2 / 3, 1];
    const matte = [0, 0.25, 0.25, 0.5, 0.75, 1].map((x) => x); // normalised times (the doubled frame sits at the same time)
    let cur = 0;
    const picks: number[] = [];
    for (const t of take) {
      while (cur + 1 < matte.length && alphaShouldAdvance(t, matte[cur], matte[cur + 1])) cur++;
      picks.push(cur);
    }
    expect(picks).toEqual([0, 2, 4, 5]);
  });
});

describe("resampleGray", () => {
  it("returns the same array at the same size and interpolates between sizes", () => {
    const src = new Float32Array([0, 1, 0, 1]);
    expect(resampleGray(src, 2, 2, 2, 2)).toBe(src);
    const up = resampleGray(src, 2, 2, 4, 2);
    expect(up.length).toBe(8);
    expect(up[0]).toBeCloseTo(0, 3);
    expect(up[3]).toBeCloseTo(1, 3);
    expect(up[1]).toBeGreaterThan(0);
    expect(up[1]).toBeLessThan(1);
  });
});

describe("renderSize", () => {
  it("keeps an upright take's size and refuses a turned one", () => {
    expect(renderSize({ width: 720, height: 1280, rotation: 0 })).toEqual({
      width: 720,
      height: 1280,
    });
    expect(renderSize({ width: 2160, height: 3840, rotation: 0 })).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(() => renderSize({ width: 1920, height: 1080, rotation: 90 })).toThrow(/turned/);
    expect(() => renderSize({ width: null, height: 1080, rotation: 0 })).toThrow(/size/);
  });
});

describe("colrOf", () => {
  it("tags what the encoder said it wrote and nothing it did not", () => {
    expect(colrOf({ matrix: "bt709", primaries: "bt709", transfer: "bt709" })).toBe("bt709");
    expect(colrOf({ matrix: "smpte170m" })).toBe("bt601");
    expect(colrOf({ matrix: "bt470bg" })).toBe("bt601");
    expect(colrOf({ matrix: "rgb" })).toBeNull();
    expect(colrOf(null)).toBeNull();
    expect(colrOf(undefined)).toBeNull();
  });
});
