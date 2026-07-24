import { describe, expect, it } from "vitest";
import {
  lockGrokOutfitOntoHero,
  sam3MaskedRgbToAlpha,
  type RgbaImage,
} from "./grokOutfitLock";

function solid(w: number, h: number, r: number, g: number, b: number): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe("sam3MaskedRgbToAlpha", () => {
  it("maps black to 0 and white to 1", () => {
    const img = solid(2, 1, 0, 0, 0);
    img.data[4] = 255;
    img.data[5] = 255;
    img.data[6] = 255;
    const a = sam3MaskedRgbToAlpha(img);
    expect(a[0]).toBe(0);
    expect(a[1]).toBeCloseTo(1, 5);
  });

  it("gives a DARK garment full alpha (membership, not brightness)", () => {
    // Regression: dark denim / camo carries its ORIGINAL low-luma pixels inside
    // the SAM-3 mask. Luma-based alpha collapsed these to ~0.09 and the outfit
    // lock was skipped under threshold. Membership must read these as fully in.
    const img = solid(2, 1, 20, 25, 30); // dark denim, luma ≈ 0.096
    // Make the first pixel the blacked-out background.
    img.data[0] = 0;
    img.data[1] = 0;
    img.data[2] = 0;
    const a = sam3MaskedRgbToAlpha(img);
    expect(a[0]).toBe(0); // background stays out
    expect(a[1]).toBe(1); // dark garment is fully in, not ~0.096
  });
});

describe("lockGrokOutfitOntoHero", () => {
  it("keeps hero bytes outside the clothing mask", () => {
    const hero = solid(4, 4, 10, 20, 30);
    const grok = solid(4, 4, 200, 100, 50);
    // Left half clothing (white), right half black
    const mask = solid(4, 4, 0, 0, 0);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 2; x++) {
        const o = (y * 4 + x) * 4;
        mask.data[o] = 255;
        mask.data[o + 1] = 255;
        mask.data[o + 2] = 255;
      }
    }
    const { image, coverage } = lockGrokOutfitOntoHero(hero, grok, mask, {
      featherPx: 0,
      minAlpha: 0.5,
    });
    expect(coverage).toBeGreaterThan(0.2);
    // Outside mask (x=3): hero
    const outHero = (0 * 4 + 3) * 4;
    expect(image.data[outHero]).toBe(10);
    expect(image.data[outHero + 1]).toBe(20);
    expect(image.data[outHero + 2]).toBe(30);
    // Inside mask (x=0): grok
    const outGrok = (0 * 4 + 0) * 4;
    expect(image.data[outGrok]).toBe(200);
    expect(image.data[outGrok + 1]).toBe(100);
    expect(image.data[outGrok + 2]).toBe(50);
  });

  it("locks Grok over a DARK garment mask instead of collapsing coverage", () => {
    const hero = solid(4, 4, 10, 20, 30);
    const grok = solid(4, 4, 200, 100, 50);
    // Left half clothing but painted with the ORIGINAL dark garment (not white),
    // right half blacked-out background — this is what SAM-3 apply_mask returns.
    const mask = solid(4, 4, 0, 0, 0);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 2; x++) {
        const o = (y * 4 + x) * 4;
        mask.data[o] = 18; // dark denim R
        mask.data[o + 1] = 22; // G
        mask.data[o + 2] = 28; // B
      }
    }
    const { image, coverage } = lockGrokOutfitOntoHero(hero, grok, mask, {
      featherPx: 0,
      minAlpha: 0.5,
    });
    // Half the frame is garment → coverage ~0.5, comfortably over the 0.02 gate
    // that the luma bug undershot (it produced ~0.0159 for dark garments).
    expect(coverage).toBeGreaterThan(0.4);
    // Inside the dark mask: Grok is applied.
    const inGrok = (0 * 4 + 0) * 4;
    expect(image.data[inGrok]).toBe(200);
    expect(image.data[inGrok + 1]).toBe(100);
    expect(image.data[inGrok + 2]).toBe(50);
    // Outside: hero preserved.
    const outHero = (0 * 4 + 3) * 4;
    expect(image.data[outHero]).toBe(10);
    expect(image.data[outHero + 1]).toBe(20);
    expect(image.data[outHero + 2]).toBe(30);
  });
});
