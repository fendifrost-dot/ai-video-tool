import { describe, expect, it } from "vitest";
import {
  compareFaceRegions,
  detectFaceRegionHeuristic,
  faceRegionToQuad,
  isSkinPixel,
} from "./faceRegion";
import type { RgbaImage } from "./logoComposite";

/** Solid-colour canvas to paint synthetic subjects onto. */
function blank(width: number, height: number, rgb: [number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = rgb[0];
    data[p * 4 + 1] = rgb[1];
    data[p * 4 + 2] = rgb[2];
    data[p * 4 + 3] = 255;
  }
  return { width, height, data };
}

function fillRect(
  img: RgbaImage,
  left: number,
  top: number,
  w: number,
  h: number,
  rgb: [number, number, number],
) {
  for (let y = top; y < top + h; y++) {
    for (let x = left; x < left + w; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
    }
  }
}

const SKIN: [number, number, number] = [205, 150, 120];
const BACKDROP: [number, number, number] = [40, 44, 52];

describe("isSkinPixel", () => {
  it("accepts typical skin tones", () => {
    expect(isSkinPixel(205, 150, 120)).toBe(true);
    expect(isSkinPixel(160, 110, 85)).toBe(true);
  });

  it("rejects greys, blues and greens", () => {
    expect(isSkinPixel(128, 128, 128)).toBe(false);
    expect(isSkinPixel(40, 44, 52)).toBe(false);
    expect(isSkinPixel(60, 180, 90)).toBe(false);
  });

  it("rejects a red that fails the chroma range", () => {
    // Saturated pure red passes the RGB rule but sits outside the Cr window.
    expect(isSkinPixel(255, 0, 0)).toBe(false);
  });
});

describe("detectFaceRegionHeuristic", () => {
  it("finds a skin patch in the upper frame", () => {
    const img = blank(400, 700, BACKDROP);
    fillRect(img, 150, 80, 100, 130, SKIN);

    const region = detectFaceRegionHeuristic(img);
    expect(region).not.toBeNull();
    expect(region!.method).toBe("skin-heuristic");
    // Detection runs downscaled, so allow a few full-res pixels of slop.
    expect(region!.left).toBeGreaterThan(130);
    expect(region!.right).toBeLessThan(270);
    expect(region!.top).toBeGreaterThan(60);
    expect(region!.bottom).toBeLessThan(230);
    expect(region!.confidence).toBeGreaterThan(0);
  });

  it("prefers the head over a smaller lower skin blob (a hand)", () => {
    const img = blank(400, 700, BACKDROP);
    fillRect(img, 150, 60, 110, 140, SKIN); // head
    fillRect(img, 60, 400, 40, 45, SKIN); // hand

    const region = detectFaceRegionHeuristic(img)!;
    expect(region.top).toBeLessThan(200);
    expect(region.left).toBeGreaterThan(120);
  });

  it("returns null when there is no skin at all", () => {
    expect(detectFaceRegionHeuristic(blank(300, 300, BACKDROP))).toBeNull();
  });

  it("rejects a skin blob with an implausible aspect ratio", () => {
    const img = blank(400, 700, BACKDROP);
    fillRect(img, 20, 100, 360, 20, SKIN); // a wide band, not a head
    expect(detectFaceRegionHeuristic(img)).toBeNull();
  });

  it("ignores skin below the search band", () => {
    const img = blank(400, 700, BACKDROP);
    fillRect(img, 150, 620, 100, 60, SKIN);
    expect(detectFaceRegionHeuristic(img)).toBeNull();
  });

  it("returns null for a degenerate image", () => {
    expect(detectFaceRegionHeuristic(blank(4, 4, SKIN))).toBeNull();
  });
});

describe("faceRegionToQuad", () => {
  const region = { left: 100, top: 100, right: 199, bottom: 199 };

  it("pads the region out to the head and normalises it", () => {
    const quad = faceRegionToQuad(region, 400, 400, { padX: 0.3, padTop: 0.35, padBottom: 0.55 });
    const [tl, tr, br, bl] = quad;
    expect(tl[0]).toBeCloseTo((100 - 30) / 400, 5);
    expect(tr[0]).toBeCloseTo((199 + 30) / 400, 5);
    expect(tl[1]).toBeCloseTo((100 - 35) / 400, 5);
    expect(br[1]).toBeCloseTo((199 + 55) / 400, 5);
    // TL,TR,BR,BL winding.
    expect(bl[0]).toBeCloseTo(tl[0], 5);
    expect(br[0]).toBeCloseTo(tr[0], 5);
  });

  it("clamps padding at the image edges", () => {
    const quad = faceRegionToQuad({ left: 0, top: 0, right: 50, bottom: 50 }, 100, 100);
    for (const [x, y] of quad) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});

describe("compareFaceRegions", () => {
  const img = { width: 400, height: 700 };
  const base = { left: 150, top: 80, right: 249, bottom: 209 };

  it("accepts the same head at a different resolution", () => {
    const scaled = { left: 300, top: 160, right: 499, bottom: 419 };
    const result = compareFaceRegions(base, img, scaled, { width: 800, height: 1400 });
    expect(result.ok).toBe(true);
    expect(result.scaleRatio).toBeCloseTo(1, 1);
    expect(result.centerOffset).toBeCloseTo(0, 2);
  });

  it("rejects a detection at a wildly different size", () => {
    const tiny = { left: 180, top: 100, right: 209, bottom: 139 };
    const result = compareFaceRegions(base, img, tiny, img);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/size disagrees/);
  });

  it("rejects a detection that moved across the frame", () => {
    const moved = { left: 20, top: 500, right: 119, bottom: 629 };
    const result = compareFaceRegions(base, img, moved, img);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/position disagrees/);
  });
});
