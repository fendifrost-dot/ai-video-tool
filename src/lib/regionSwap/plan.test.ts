import { describe, expect, it } from "vitest";
import {
  boxOf,
  cropRect,
  edgeWeight,
  featherFor,
  MIN_BOX_FRACTION,
  parseBox,
  parseWindow,
  windowWeight,
} from "./plan";

describe("the box that is cut and enlarged", () => {
  it("takes the frame's shape around the box's centre, so the crop enlarges without stretching", () => {
    // c044: his shoes at the pillar, a wide low box on a 720×1280 frame
    const r = cropRect({ x: 0.38, y: 0.6, w: 0.24, h: 0.08 }, 720, 1280);
    expect(r.w / r.h).toBeCloseTo(720 / 1280, 2);
    expect(r.w).toBeGreaterThanOrEqual(720 * MIN_BOX_FRACTION);
    // the box's centre stays inside the crop
    expect(r.x).toBeLessThanOrEqual(0.5 * 720);
    expect(r.x + r.w).toBeGreaterThanOrEqual(0.5 * 720);
    expect([r.x, r.y, r.w, r.h].every((n) => n % 2 === 0)).toBe(true);
  });

  it("is moved, not shrunk, to lie inside the frame", () => {
    const r = cropRect({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, 720, 1280);
    expect(r.x + r.w).toBeLessThanOrEqual(720);
    expect(r.y + r.h).toBeLessThanOrEqual(1280);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.w).toBeGreaterThanOrEqual(180);
  });

  it("a box bigger than the frame is the frame", () => {
    expect(cropRect({ x: 0, y: 0, w: 1, h: 1 }, 720, 1280)).toEqual({
      x: 0,
      y: 0,
      w: 720,
      h: 1280,
    });
  });

  it("refuses an empty box or an unknown frame", () => {
    expect(() => cropRect({ x: 0, y: 0, w: 0, h: 0.1 }, 720, 1280)).toThrow(/empty/);
    expect(() => cropRect({ x: 0, y: 0, w: 0.1, h: 0.1 }, 0, 1280)).toThrow(/size/);
  });

  it("boxOf is the rectangle back in 0–1", () => {
    expect(boxOf({ x: 180, y: 640, w: 360, h: 640 }, 720, 1280)).toEqual({
      x: 0.25,
      y: 0.5,
      w: 0.5,
      h: 0.5,
    });
  });
});

describe("putting the swapped picture back", () => {
  const rect = { x: 100, y: 200, w: 200, h: 356 };
  it("blends fully inside the box, falls to nothing at its edges, and never reaches outside it", () => {
    const f = featherFor(rect);
    expect(edgeWeight(200, 378, rect, f)).toBe(1);
    expect(edgeWeight(100, 378, rect, f)).toBe(0);
    expect(edgeWeight(99, 378, rect, f)).toBe(0);
    expect(edgeWeight(300, 378, rect, f)).toBe(0);
    const mid = edgeWeight(100 + f / 2, 378, rect, f);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });

  it("does not fade a side that lies on the frame's border (c045: his shoes run out of the bottom of the frame)", () => {
    const frame = { width: 720, height: 1280 };
    const low = { x: 288, y: 768, w: 288, h: 512 }; // the box ends at the frame's bottom
    const f = featherFor(low);
    expect(edgeWeight(432, 1279, low, f, frame)).toBe(1); // bottom row: the swap, not the original
    expect(edgeWeight(432, 1279, low, f)).toBe(0); // without the frame every side fades
    expect(edgeWeight(288, 1279, low, f, frame)).toBe(0); // the inner sides still fade to the original
    expect(edgeWeight(432, 768, low, f, frame)).toBe(0);
    expect(edgeWeight(432, 1280, low, f, frame)).toBe(0); // and nothing outside the box
    const whole = { x: 0, y: 0, w: 720, h: 1280 };
    expect(edgeWeight(0, 0, whole, featherFor(whole), frame)).toBe(1);
  });

  it("shows only inside its window, fading at the ends", () => {
    expect(windowWeight(1, null)).toBe(1);
    expect(windowWeight(3.5, [3.3, 4.0])).toBe(1);
    expect(windowWeight(1.0, [3.3, 4.0])).toBe(0);
    expect(windowWeight(3.26, [3.3, 4.0])).toBeCloseTo(0.5, 5);
  });

  it("reads a box and a window from a link", () => {
    expect(parseBox("0.38,0.6,0.24,0.08")).toEqual({ x: 0.38, y: 0.6, w: 0.24, h: 0.08 });
    expect(parseBox("0.9,0.9,0.2,0.2")).toBeNull();
    expect(parseBox("x")).toBeNull();
    expect(parseWindow("3.3,4.0")).toEqual([3.3, 4.0]);
    expect(parseWindow("4,3")).toBeNull();
    expect(parseWindow(null)).toBeNull();
  });
});
