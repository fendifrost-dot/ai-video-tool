import { describe, expect, it } from "vitest";
import { cleanLabel, headerDimensions, MAX_SOURCE_PIXELS, pixelBox } from "./lib.ts";

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

describe("headerDimensions (decode-bomb guard)", () => {
  it("reads PNG IHDR, JPEG SOF0 and WebP VP8X sizes without decoding, and rejects other bytes", () => {
    const png = new Uint8Array(32); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x75, 0x30, 0, 0, 0x75, 0x30]);
    expect(headerDimensions(png)).toEqual({ width: 30000, height: 30000, kind: "png" });
    expect(30000 * 30000).toBeGreaterThan(MAX_SOURCE_PIXELS);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x09, 0x00, 0x07, 0x40, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
    expect(headerDimensions(jpeg)).toEqual({ width: 1856, height: 2304, kind: "jpeg" });
    const webp = new Uint8Array(32); webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x07, 0, 0xff, 0x08, 0]);
    expect(headerDimensions(webp)).toEqual({ width: 0x0740, height: 0x08ff + 1, kind: "webp" });
    expect(headerDimensions(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]))).toBeNull();
    expect(headerDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });
});
