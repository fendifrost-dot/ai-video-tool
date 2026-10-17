import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { blendBox, weightMap } from "./render";
import { rectOfBox } from "./submit";
import { boxOf, cropRect, featherFor } from "./plan";


describe("the swapped picture goes back into its box only", () => {
  it("pixels outside the box are the original's; the centre of the box is the swap's; the edge is between", () => {
    const W = 40;
    const H = 40;
    const frame = new Uint8ClampedArray(W * H * 4).fill(10);
    const rect = { x: 10, y: 10, w: 20, h: 20 };
    const patch = new Uint8ClampedArray(rect.w * rect.h * 4).fill(250);
    blendBox(frame, W, patch, rect, weightMap(rect, featherFor(rect)), 1);
    const at = (x: number, y: number) => frame[(y * W + x) * 4];
    expect(at(0, 0)).toBe(10);
    expect(at(9, 20)).toBe(10);
    expect(at(30, 20)).toBe(10);
    expect(at(20, 20)).toBe(250);
    expect(at(10, 20)).toBe(10); // the box's own border is fully the original: no seam
    const edge = at(11, 20);
    expect(edge).toBeGreaterThan(10);
    expect(edge).toBeLessThan(250);
  });

  it("outside its window nothing changes", () => {
    const frame = new Uint8ClampedArray(20 * 20 * 4).fill(10);
    const rect = { x: 2, y: 2, w: 16, h: 16 };
    blendBox(frame, 20, new Uint8ClampedArray(16 * 16 * 4).fill(250), rect, weightMap(rect), 0);
    expect(frame.every((v) => v === 10)).toBe(true);
  });

  it("the box recorded with the swap comes back to the same pixels it was cut at", () => {
    for (const box of [
      { x: 0.38, y: 0.6, w: 0.24, h: 0.08 },
      { x: 0.05, y: 0.7, w: 0.3, h: 0.25 },
      { x: 0.6, y: 0.1, w: 0.4, h: 0.4 },
    ]) {
      const rect = cropRect(box, 720, 1280);
      expect(rectOfBox(boxOf(rect, 720, 1280), 720, 1280)).toEqual(rect);
    }
  });
});
