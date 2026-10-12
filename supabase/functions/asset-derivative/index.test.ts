import { describe, expect, it } from "vitest";
import { cleanLabel, pixelBox } from "./lib.ts";

describe("unit: asset-derivative input rules", () => {
  it("maps fractional boxes to pixels and refuses degenerate or out-of-range ones", () => {
    expect(pixelBox({ x: 0, y: 0.5, w: 1, h: 0.5 }, 1000, 2000)).toEqual({ x: 0, y: 1000, w: 1000, h: 1000 });
    expect(pixelBox({ x: 0.9, y: 0, w: 0.2, h: 1 }, 1000, 1000)).toBeNull();
    expect(pixelBox({ x: 0, y: 0, w: 0.001, h: 1 }, 1000, 1000)).toBeNull();
    expect(pixelBox({ x: "0", y: 0, w: 1, h: 1 }, 10, 10)).toBeNull();
    expect(pixelBox(null, 10, 10)).toBeNull();
  });
  it("labels are filesystem-safe and short", () => {
    expect(cleanLabel(" outfit no face ")).toBe("outfit_no_face");
    expect(cleanLabel("../xy")).toBe("xy");
    expect(cleanLabel("!")).toBeNull();
    expect(cleanLabel(42)).toBeNull();
  });
});
