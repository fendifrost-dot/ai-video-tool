import { describe, expect, it } from "vitest";
import {
  colorMatchPatch,
  compositePeriocular,
  extractQuad,
  normQuadToPx,
  patchStats,
  regionStats,
} from "./periocularComposite";
import type { RgbaImage } from "./logoComposite";
import type { QuadNorm } from "./placementEngine";

function solid(w: number, h: number, r: number, g: number, b: number): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

function px(img: RgbaImage, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

const FULL: QuadNorm = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
// Centred destination quad, well inside a 20x20 image.
const CENTER: QuadNorm = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.75, 0.75],
  [0.25, 0.75],
];

describe("normQuadToPx", () => {
  it("maps normalized corners to pixel space (clamped to width-1/height-1)", () => {
    const q = normQuadToPx(FULL, 100, 50);
    expect(q[0]).toEqual({ x: 0, y: 0 });
    expect(q[2]).toEqual({ x: 99, y: 49 });
  });
});

describe("extractQuad", () => {
  it("rectifies a region to the requested size with opaque alpha", () => {
    const hero = solid(20, 20, 10, 20, 200);
    const out = extractQuad(hero, normQuadToPx(FULL, 20, 20), 8, 8);
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    expect(px(out, 4, 4)).toEqual([10, 20, 200, 255]);
  });
});

describe("colorMatchPatch", () => {
  it("shifts a flat patch's mean to the destination mean (std fallback)", () => {
    const patch = solid(4, 4, 0, 0, 255); // blue, std ~0
    const matched = colorMatchPatch(
      patch,
      patchStats(patch),
      { mean: [255, 0, 0], std: [0, 0, 0] }, // dst red
    );
    expect(px(matched, 1, 1)).toEqual([255, 0, 0, 255]);
  });
});

describe("regionStats", () => {
  it("computes mean over pixels inside the destination quad", () => {
    const img = solid(20, 20, 40, 80, 120);
    const stats = regionStats(img, normQuadToPx(CENTER, 20, 20));
    expect(stats.mean[0]).toBeCloseTo(40, 5);
    expect(stats.mean[1]).toBeCloseTo(80, 5);
    expect(stats.mean[2]).toBeCloseTo(120, 5);
  });
});

describe("compositePeriocular", () => {
  it("composites the source region into the destination quad, leaving the rest untouched", () => {
    const final = solid(20, 20, 255, 0, 0); // red
    const hero = solid(20, 20, 0, 0, 255); // blue
    const out = compositePeriocular(final, hero, FULL, CENTER, {
      featherPx: 0,
      colorMatch: false,
    });
    // dims preserved
    expect(out.width).toBe(20);
    expect(out.height).toBe(20);
    // centre of the quad shows the source (blue), fully opaque
    expect(px(out, 10, 10)).toEqual([0, 0, 255, 255]);
    // a corner outside the quad is unchanged (still red)
    expect(px(out, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it("colour-matches the patch toward the destination region when enabled", () => {
    const final = solid(20, 20, 255, 0, 0); // red destination
    const hero = solid(20, 20, 0, 0, 255); // blue source
    const matched = compositePeriocular(final, hero, FULL, CENTER, {
      featherPx: 0,
      colorMatch: true,
    });
    const plain = compositePeriocular(final, hero, FULL, CENTER, {
      featherPx: 0,
      colorMatch: false,
    });
    // With colour-match the centre is pulled toward the red destination.
    expect(px(matched, 10, 10)[0]).toBeGreaterThan(px(plain, 10, 10)[0]);
  });
});
