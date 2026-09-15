import { describe, expect, it } from "vitest";
import {
  absDiffLuma,
  cropRgba,
  encodeBmp24,
  encodePpm,
  luma,
  pointInQuad,
  quadFromNorm,
  solidRgba,
} from "./pixelMath";
import { CANONICAL_BAND_QUAD_NORM } from "./chestCriteria";

describe("Lane E pixel math", () => {
  it("encodes PPM and BMP with the expected headers", () => {
    const img = solidRgba(3, 2, 10, 20, 30);
    const ppm = encodePpm(img);
    expect(new TextDecoder().decode(ppm.slice(0, 11))).toBe("P6\n3 2\n255\n");
    expect(ppm[11]).toBe(10);
    expect(ppm[12]).toBe(20);
    expect(ppm[13]).toBe(30);
    const bmp = encodeBmp24(img);
    expect(bmp[0]).toBe(0x42);
    expect(bmp[1]).toBe(0x4d);
    expect(bmp.length).toBeGreaterThan(54);
  });

  it("crops and diffs without touching Architecture C modules", () => {
    const a = solidRgba(8, 8, 0, 0, 0);
    const b = solidRgba(8, 8, 0, 0, 0);
    b.data[4] = 100;
    const diff = absDiffLuma(a, b);
    expect(diff.data[4]).toBeGreaterThan(0);
    const crop = cropRgba(b, { x0: 0, x1: 1, y0: 0, y1: 1 });
    expect(crop.width).toBe(2);
    expect(crop.height).toBe(2);
  });

  it("treats the canonical band quad as a closed polygon", () => {
    const quad = quadFromNorm(720, 1280, CANONICAL_BAND_QUAD_NORM);
    expect(pointInQuad(450, 710, quad)).toBe(true);
    expect(pointInQuad(10, 10, quad)).toBe(false);
    expect(luma(28, 32, 95)).toBeLessThan(80);
  });
});
