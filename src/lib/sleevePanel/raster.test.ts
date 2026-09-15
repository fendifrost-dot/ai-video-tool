import { describe, expect, it } from "vitest";
import { invBilinear, rasterizeQuadMask } from "./raster";
import { countMask } from "./raster";

describe("isolated sleeve raster", () => {
  it("maps the center of an axis-aligned quad to uv ≈ 0.5, 0.5", () => {
    const tl = { x: 10, y: 10 };
    const tr = { x: 30, y: 10 };
    const br = { x: 30, y: 30 };
    const bl = { x: 10, y: 30 };
    const uv = invBilinear(20, 20, tl, tr, br, bl);
    expect(uv).not.toBeNull();
    expect(uv!.u).toBeCloseTo(0.5, 5);
    expect(uv!.v).toBeCloseTo(0.5, 5);
    expect(invBilinear(4, 4, tl, tr, br, bl)).toBeNull();
  });

  it("rasterizes a 10×10 pixel quad to 100 pixels", () => {
    const mask = rasterizeQuadMask(40, 40, [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ]);
    expect(countMask(mask)).toBe(100);
  });
});
