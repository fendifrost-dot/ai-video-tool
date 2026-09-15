import type { AffineTransform, BinaryMask } from "./contract";
import { invertAffine } from "./geometry";

export interface MaskBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function emptyMask(width: number, height: number): BinaryMask {
  return { width, height, data: new Uint8Array(width * height) };
}

export function cloneMask(mask: BinaryMask): BinaryMask {
  return { width: mask.width, height: mask.height, data: new Uint8Array(mask.data) };
}

export function maskBBox(mask: BinaryMask): MaskBBox | null {
  const { width, height, data } = mask;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x] === 1) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1 };
}

export function maskArea(mask: BinaryMask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i] === 1) n++;
  return n;
}

/** Intersection-over-union of two same-size binary masks. */
export function maskIoU(a: BinaryMask, b: BinaryMask): number {
  if (a.width !== b.width || a.height !== b.height) return 0;
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.data.length; i++) {
    const av = a.data[i] === 1;
    const bv = b.data[i] === 1;
    if (av && bv) inter++;
    if (av || bv) union++;
  }
  return union === 0 ? 1 : inter / union;
}

/**
 * Warp `source` into dest space by `canonicalToDest`.
 * Inverse-maps each dest pixel (nearest neighbour). Pixels that fall outside
 * stay 0.
 */
export function warpMask(source: BinaryMask, canonicalToDest: AffineTransform): BinaryMask {
  const { width, height } = source;
  const dest = emptyMask(width, height);
  const inv = invertAffine(canonicalToDest);
  if (!inv) return dest;

  const [a, b, tx, c, d, ty] = inv.matrix;
  const src = source.data;
  const out = dest.data;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const sx = a * x + b * y + tx;
      const sy = c * x + d * y + ty;
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) continue;
      if (src[iy * width + ix] === 1) out[row + x] = 1;
    }
  }
  return dest;
}

export function paintRectMask(
  width: number,
  height: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
): BinaryMask {
  const mask = emptyMask(width, height);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + rw));
  const y1 = Math.min(height, Math.ceil(y + rh));
  for (let yy = y0; yy < y1; yy++) {
    const row = yy * width;
    for (let xx = x0; xx < x1; xx++) mask.data[row + xx] = 1;
  }
  return mask;
}
