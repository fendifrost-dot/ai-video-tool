import { describe, expect, it } from "vitest";
import {
  applyOcclusionAlphaComposite,
  buildOutfitMinusOccludersAlpha,
  dilateAlpha,
  expandQuadAlongBandNormal,
  sam3MaskedRgbToAlpha,
  type RgbaImage,
} from "./stillRepairOcclusion";

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

describe("stillRepairOcclusion — SAM-3 α math", () => {
  it("sam3MaskedRgbToAlpha treats any non-black as membership", () => {
    const img = solid(4, 4, 0, 0, 0);
    img.data[0] = 12;
    img.data[1] = 5;
    img.data[2] = 3; // dark garment pixel
    const a = sam3MaskedRgbToAlpha(img);
    expect(a[0]).toBe(1);
    expect(a[1]).toBe(0);
  });

  it("buildOutfitMinusOccludersAlpha subtracts dilated hands/face from outfit", () => {
    const W = 40;
    const H = 40;
    const outfit = new Float32Array(W * H);
    const hands = new Float32Array(W * H);
    // Outfit covers a wide block; hands cover a small center patch.
    for (let y = 10; y < 30; y++) {
      for (let x = 5; x < 35; x++) outfit[y * W + x] = 1;
    }
    for (let y = 18; y < 22; y++) {
      for (let x = 18; x < 22; x++) hands[y * W + x] = 1;
    }
    const a = buildOutfitMinusOccludersAlpha({
      width: W,
      height: H,
      outfit,
      hands,
      face: null,
      dilatePx: 4,
    });
    // Center (hand) must be cleared after dilate+subtract
    expect(a[20 * W + 20]).toBe(0);
    // Far outfit pixel survives
    expect(a[12 * W + 8]).toBe(1);
  });

  it("applyOcclusionAlphaComposite restores source where α=0 (protected pixels)", () => {
    const source = solid(10, 10, 180, 120, 90); // skin
    const repaired = solid(10, 10, 20, 25, 80); // navy repair
    const alpha = new Float32Array(100);
    // Only right half is garment
    for (let y = 0; y < 10; y++) {
      for (let x = 5; x < 10; x++) alpha[y * 10 + x] = 1;
    }
    const out = applyOcclusionAlphaComposite(source, repaired, alpha);
    const left = (5 * 10 + 2) * 4;
    const right = (5 * 10 + 7) * 4;
    expect(out.data[left]).toBe(180); // skin preserved
    expect(out.data[right]).toBe(20); // navy applied
  });

  it("expandQuadAlongBandNormal keeps a tilted band narrow (no vertical drip)", () => {
    const quad = [
      { x: 10, y: 20 },
      { x: 50, y: 22 },
      { x: 48, y: 30 },
      { x: 8, y: 28 },
    ] as const;
    const expanded = expandQuadAlongBandNormal([...quad], 2);
    const h0 =
      (Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y) +
        Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y)) /
      2;
    const h1 =
      (Math.hypot(expanded[3].x - expanded[0].x, expanded[3].y - expanded[0].y) +
        Math.hypot(expanded[2].x - expanded[1].x, expanded[2].y - expanded[1].y)) /
      2;
    expect(h1).toBeGreaterThan(h0);
    expect(h1).toBeLessThan(h0 + 6); // ~2px each side
    // Must not shoot far below original bottom
    expect(Math.max(...expanded.map((p) => p.y))).toBeLessThan(35);
  });

  it("dilateAlpha grows a compact hand blob", () => {
    const W = 20;
    const H = 20;
    const a = new Float32Array(W * H);
    a[10 * W + 10] = 1;
    const d = dilateAlpha(a, W, H, 2);
    expect(d[10 * W + 10]).toBe(1);
    expect(d[10 * W + 12]).toBe(1);
    expect(d[0]).toBe(0);
  });
});
