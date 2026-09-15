import { describe, expect, it } from "vitest";
import {
  RECONSTRUCT_ALPHA_SIZE_MISMATCH,
  RECONSTRUCT_SIZE_MISMATCH,
  buildAuthorizedAlpha,
  countRgbMismatches,
  reconstructOriginalMaster,
  unauthorizedPixelsMatchOriginal,
} from "./originalMasterReconstruct";
import {
  FIXTURE_HEIGHT,
  FIXTURE_WIDTH,
  GARMENT_RECT,
  IDENTITY_RECT,
  featheredRectMask,
  inRect,
  invertedGenerated,
  laneDFixturePack,
  rectMask,
  uniqueOriginal,
} from "./fixtures/syntheticMaster";
import type { RgbaImage } from "./types";

function rgbAt(img: RgbaImage, x: number, y: number): [number, number, number] {
  const p = (y * img.width + x) * 4;
  return [img.data[p]!, img.data[p + 1]!, img.data[p + 2]!];
}

function expectRgb(img: RgbaImage, x: number, y: number, expected: RgbaImage) {
  expect(rgbAt(img, x, y)).toEqual(rgbAt(expected, x, y));
}

describe("buildAuthorizedAlpha", () => {
  it("is clamp(seg) minus clamp(repair), never negative", () => {
    const seg = new Float32Array([1, 0.4, 0, 1.5, -0.2]);
    const repair = new Float32Array([0.25, 0.4, 1, 0, 0]);
    const a = buildAuthorizedAlpha(5, 1, seg, repair);
    expect([...a]).toEqual([0.75, 0, 0, 1, 0]);
  });

  it("without repair equals clamped segmentation", () => {
    const seg = new Float32Array([1, 0, 0.5]);
    expect([...buildAuthorizedAlpha(3, 1, seg)]).toEqual([1, 0, 0.5]);
  });
});

describe("Lane D fixture pack — original-master reconstruction", () => {
  const pack = laneDFixturePack();

  it("generated differs from original at every pixel (rerender is never a no-op)", () => {
    expect(countRgbMismatches(pack.original, pack.generated)).toBe(pack.width * pack.height);
  });

  it("zero segmentation returns the original master byte-for-byte (Grok cannot be the master)", () => {
    const empty = new Float32Array(pack.width * pack.height);
    const result = reconstructOriginalMaster({
      original: pack.original,
      generated: pack.generated,
      segmentation: empty,
    });
    expect(result.changedPixels).toBe(0);
    expect(result.preservedPixels).toBe(pack.width * pack.height);
    expect(result.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(countRgbMismatches(result.image, pack.original)).toBe(0);
    expect(countRgbMismatches(result.image, pack.generated)).toBe(pack.width * pack.height);
  });

  it("preserves original pixels outside the garment and inside the identity repair punch-out", () => {
    const result = reconstructOriginalMaster({
      original: pack.original,
      generated: pack.generated,
      segmentation: pack.segmentation,
      repair: pack.repair,
    });

    expect(result.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(
      unauthorizedPixelsMatchOriginal(pack.original, result.image, result.authorizedAlpha),
    ).toBe(true);

    for (let y = 0; y < pack.height; y++) {
      for (let x = 0; x < pack.width; x++) {
        const garment = inRect(x, y, GARMENT_RECT);
        const identity = inRect(x, y, IDENTITY_RECT);
        if (!garment || identity) {
          expectRgb(result.image, x, y, pack.original);
        } else {
          expectRgb(result.image, x, y, pack.generated);
        }
      }
    }
  });

  it("background sample is original; authorized garment sample is generated", () => {
    const result = reconstructOriginalMaster({
      original: pack.original,
      generated: pack.generated,
      segmentation: pack.segmentation,
      repair: pack.repair,
    });
    expectRgb(result.image, 1, 1, pack.original);
    expectRgb(result.image, 14, 8, pack.original); // identity rect
    expectRgb(result.image, 20, 12, pack.generated); // garment minus identity
  });

  it("full-mask no-repair copies generated everywhere (transform authorized on all pixels)", () => {
    const full = new Float32Array(pack.width * pack.height);
    full.fill(1);
    const result = reconstructOriginalMaster({
      original: pack.original,
      generated: pack.generated,
      segmentation: full,
    });
    expect(countRgbMismatches(result.image, pack.generated)).toBe(0);
    expect(result.changedPixels).toBe(pack.width * pack.height);
    expect(result.unauthorizedPixels).toBe(0);
    expect(result.originalPixelsPreservedWhereUnauthorized).toBe(true);
  });

  it("full repair over full segmentation restores the original (repair wins)", () => {
    const full = new Float32Array(pack.width * pack.height);
    full.fill(1);
    const result = reconstructOriginalMaster({
      original: pack.original,
      generated: pack.generated,
      segmentation: full,
      repair: full,
    });
    expect(countRgbMismatches(result.image, pack.original)).toBe(0);
    expect(result.changedPixels).toBe(0);
  });
});

describe("soft / feathered authorization", () => {
  it("α === 0 pixels stay byte-identical; α === 1 takes generated; α === 0.5 blends", () => {
    const original = uniqueOriginal(8, 4);
    const generated = invertedGenerated(original);
    const seg = new Float32Array(8 * 4);
    // row 0: all 0 (keep original)
    // row 1: 0.5 seam
    // row 2: 1 transform
    // row 3: 0
    for (let x = 0; x < 8; x++) {
      seg[1 * 8 + x] = 0.5;
      seg[2 * 8 + x] = 1;
    }
    const result = reconstructOriginalMaster({ original, generated, segmentation: seg });
    expect(result.originalPixelsPreservedWhereUnauthorized).toBe(true);

    for (let x = 0; x < 8; x++) {
      expectRgb(result.image, x, 0, original);
      expectRgb(result.image, x, 3, original);
      expectRgb(result.image, x, 2, generated);
      const [r, g, b] = rgbAt(result.image, x, 1);
      const [or, og, ob] = rgbAt(original, x, 1);
      const [gr, gg, gb] = rgbAt(generated, x, 1);
      expect(r).toBe(Math.round(or * 0.5 + gr * 0.5));
      expect(g).toBe(Math.round(og * 0.5 + gg * 0.5));
      expect(b).toBe(Math.round(ob * 0.5 + gb * 0.5));
    }
  });

  it("feathered garment fixture does not leak generated into α === 0 background", () => {
    const original = uniqueOriginal();
    const generated = invertedGenerated(original);
    const seg = featheredRectMask(FIXTURE_WIDTH, FIXTURE_HEIGHT, GARMENT_RECT);
    const result = reconstructOriginalMaster({ original, generated, segmentation: seg });
    expect(result.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(unauthorizedPixelsMatchOriginal(original, result.image, result.authorizedAlpha)).toBe(
      true,
    );
    expectRgb(result.image, 0, 0, original);
    expectRgb(result.image, FIXTURE_WIDTH - 1, FIXTURE_HEIGHT - 1, original);
  });
});

describe("reconstructOriginalMaster — contract errors", () => {
  it("throws reconstruct_size_mismatch when generated dimensions differ", () => {
    const original = uniqueOriginal(4, 4);
    const generated = uniqueOriginal(3, 4);
    const seg = rectMask(4, 4, { x0: 0, x1: 1, y0: 0, y1: 1 });
    expect(() => reconstructOriginalMaster({ original, generated, segmentation: seg })).toThrow(
      RECONSTRUCT_SIZE_MISMATCH,
    );
  });

  it("throws reconstruct_alpha_size_mismatch when segmentation length is wrong", () => {
    const original = uniqueOriginal(4, 4);
    const generated = invertedGenerated(original);
    expect(() =>
      reconstructOriginalMaster({
        original,
        generated,
        segmentation: new Float32Array(3),
      }),
    ).toThrow(RECONSTRUCT_ALPHA_SIZE_MISMATCH);
  });

  it("throws reconstruct_alpha_size_mismatch when repair length is wrong", () => {
    const original = uniqueOriginal(4, 4);
    const generated = invertedGenerated(original);
    const seg = new Float32Array(16);
    expect(() =>
      reconstructOriginalMaster({
        original,
        generated,
        segmentation: seg,
        repair: new Float32Array(2),
      }),
    ).toThrow(RECONSTRUCT_ALPHA_SIZE_MISMATCH);
  });
});

describe("metrics", () => {
  it("maskCoverage counts authorized α > 0.5", () => {
    const original = uniqueOriginal(10, 10);
    const generated = invertedGenerated(original);
    const seg = rectMask(10, 10, { x0: 0, x1: 10, y0: 0, y1: 2 }); // 20 px
    const result = reconstructOriginalMaster({ original, generated, segmentation: seg });
    expect(result.maskCoverage).toBe(0.2);
    expect(result.changedPixels).toBe(20);
    expect(result.preservedPixels).toBe(80);
    expect(result.unauthorizedPixels).toBe(80);
  });
});
