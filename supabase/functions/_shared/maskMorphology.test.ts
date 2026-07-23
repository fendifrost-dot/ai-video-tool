import { describe, expect, it } from "vitest";
import { closeAlpha, dilateAlpha, erodeAlpha } from "./maskMorphology";

// Build a w×h alpha grid from a helper that returns 0/1 per (x,y).
function grid(w: number, h: number, fn: (x: number, y: number) => number): Float32Array {
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = fn(x, y);
  return a;
}

function coverage(a: Float32Array, thresh = 0.5): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > thresh) n++;
  return n;
}

describe("maskMorphology — dilate/erode duality", () => {
  it("erode is the inverse of dilate on a solid block interior (open silhouette unchanged)", () => {
    const W = 40;
    const H = 40;
    // Solid 20×20 block, well clear of the border.
    const a = grid(W, H, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? 1 : 0));
    const closed = closeAlpha(a, W, H, 3);
    // A close on an already-solid convex block gives back the same silhouette.
    expect(coverage(closed)).toBe(coverage(a));
  });

  it("dilate grows and erode shrinks a block by ~radius each", () => {
    const W = 40;
    const H = 40;
    const a = grid(W, H, (x, y) => (x >= 15 && x < 25 && y >= 15 && y < 25 ? 1 : 0));
    const grown = coverage(dilateAlpha(a, W, H, 2));
    const shrunk = coverage(erodeAlpha(a, W, H, 2));
    expect(grown).toBeGreaterThan(coverage(a));
    expect(shrunk).toBeLessThan(coverage(a));
  });
});

describe("maskMorphology — closeAlpha reconnects limbs (the floating-arm fix)", () => {
  it("bridges a thin gap between a torso block and a detached arm fragment", () => {
    const W = 60;
    const H = 40;
    // Torso: x in [10,30). Arm fragment: x in [33,45). Gap of 3px at x in [30,33).
    // Both share rows y in [15,25) — an arm coming off the torso, mis-segmented.
    const torsoOrArm = (x: number, y: number) =>
      y >= 15 && y < 25 && ((x >= 10 && x < 30) || (x >= 33 && x < 45)) ? 1 : 0;
    const a = grid(W, H, torsoOrArm);

    // Before: the 3px column gap at x=31 is empty on every shared row.
    for (let y = 15; y < 25; y++) expect(a[y * W + 31]).toBe(0);

    // Close radius 2 (bridges gaps up to ~2r = 4px) fills the 3px gap.
    const closed = closeAlpha(a, W, H, 2);
    for (let y = 17; y < 23; y++) {
      expect(closed[y * W + 31]).toBeGreaterThan(0.5);
    }
    // And it does not blow the mask up wildly — coverage grows only by the
    // bridged gap, not by a naked dilation of the whole silhouette.
    expect(coverage(closed)).toBeGreaterThan(coverage(a));
    expect(coverage(closed)).toBeLessThan(coverage(a) + 10 * 3 * 2);
  });

  it("fills a small pinhole left inside a sleeve", () => {
    const W = 40;
    const H = 40;
    // Solid block with a single-pixel hole punched at (20,20).
    const a = grid(W, H, (x, y) =>
      x >= 10 && x < 30 && y >= 10 && y < 30 && !(x === 20 && y === 20) ? 1 : 0);
    expect(a[20 * W + 20]).toBe(0);
    const closed = closeAlpha(a, W, H, 2);
    expect(closed[20 * W + 20]).toBeGreaterThan(0.5);
  });

  it("does NOT bridge a wide separation (two genuinely distinct regions stay split)", () => {
    const W = 80;
    const H = 20;
    // Two blocks separated by a 20px void — far wider than 2r; must stay apart.
    const a = grid(W, H, (x, y) =>
      y >= 5 && y < 15 && ((x >= 5 && x < 20) || (x >= 40 && x < 55)) ? 1 : 0);
    const closed = closeAlpha(a, W, H, 3);
    // Mid-void column stays empty.
    for (let y = 5; y < 15; y++) expect(closed[y * W + 30]).toBe(0);
  });
});

// Mirrors subtractAlpha (kept in jacketRecomposite.ts, which is Deno-only): the
// exact per-pixel op the pipeline uses for the guard subtraction. Inlined so the
// compositing-ORDER invariant can be proven in Vitest without importing the
// imagescript-bound module.
function subtract(base: Float32Array, guard: Float32Array): Float32Array {
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = Math.max(0, base[i] - guard[i]);
  return out;
}

describe("compositing order — close THEN guard-subtract (pad_upload sequence)", () => {
  it("reconnects the arm but still clips the head out of the garment mask", () => {
    const W = 60;
    const H = 40;
    // Garment: torso [10,30) + a detached arm fragment [33,45), rows [15,25).
    const garment = grid(W, H, (x, y) =>
      y >= 15 && y < 25 && ((x >= 10 && x < 30) || (x >= 33 && x < 45)) ? 1 : 0);
    // A face-guard blob sitting on the top of the torso (the head/neck), rows
    // [8,16), x [16,24) — deliberately overlapping the garment's top edge, the
    // way evf-sam's outfit and head masks abut at the collar.
    const guard = grid(W, H, (x, y) => (y >= 8 && y < 16 && x >= 16 && x < 24 ? 1 : 0));

    // The pipeline order: close the garment FIRST, then subtract the dilated guard.
    const closed = closeAlpha(garment, W, H, 2);
    const guarded = subtract(closed, dilateAlpha(guard, W, H, 3));

    // 1. The arm is reconnected to the torso by the close (gap column filled).
    for (let y = 17; y < 23; y++) expect(guarded[y * W + 31]).toBeGreaterThan(0.5);

    // 2. The head/neck region the guard covered is fully removed from the mask,
    //    even after the close — so flux never repaints it and the deterministic
    //    face-restore lands on clean, real pixels (no dark/murky head).
    for (let y = 8; y < 16; y++) {
      for (let x = 16; x < 24; x++) expect(guarded[y * W + x]).toBe(0);
    }
  });
});

describe("maskMorphology — radius 0 is a no-op", () => {
  it("returns the input unchanged for radius <= 0", () => {
    const W = 8;
    const H = 8;
    const a = grid(W, H, (x) => (x < 4 ? 1 : 0));
    expect(closeAlpha(a, W, H, 0)).toBe(a);
    expect(dilateAlpha(a, W, H, 0)).toBe(a);
    expect(erodeAlpha(a, W, H, 0)).toBe(a);
  });
});
