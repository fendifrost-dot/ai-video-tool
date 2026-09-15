import { describe, expect, it } from "vitest";
import {
  applyAffine,
  composeAffine,
  identityTransform,
  invertAffine,
  translationOf,
  translationTransform,
  warpQuadNorm,
} from "./geometry";

describe("affine geometry", () => {
  it("applies a translation", () => {
    const p = applyAffine(translationTransform(3, -2), { x: 10, y: 4 });
    expect(p).toEqual({ x: 13, y: 2 });
  });

  it("composes translations additively", () => {
    const t = composeAffine(translationTransform(2, 1), translationTransform(5, 3));
    expect(translationOf(t)).toEqual({ dx: 7, dy: 4 });
  });

  it("inverts a translation", () => {
    const inv = invertAffine(translationTransform(4, -1));
    expect(inv).not.toBeNull();
    const p = applyAffine(inv!, applyAffine(translationTransform(4, -1), { x: 8, y: 8 }));
    expect(p.x).toBeCloseTo(8);
    expect(p.y).toBeCloseTo(8);
  });

  it("returns null for a singular matrix", () => {
    expect(invertAffine({ kind: "affine", matrix: [0, 0, 1, 0, 0, 2] })).toBeNull();
  });

  it("leaves points unchanged under identity", () => {
    expect(applyAffine(identityTransform(), { x: 3.5, y: 9 })).toEqual({ x: 3.5, y: 9 });
  });

  it("warps a normalized quad by a pixel translation", () => {
    const quad = [
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.25, y: 0.5 },
    ] as const;
    const warped = warpQuadNorm(translationTransform(4, 0), quad, 16, 16);
    expect(warped[0].x).toBeCloseTo(0.5);
    expect(warped[0].y).toBeCloseTo(0.25);
    expect(warped[1].x).toBeCloseTo(0.75);
  });
});
