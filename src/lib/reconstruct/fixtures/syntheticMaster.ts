/**
 * Static synthetic fixtures for Lane D original-master reconstruction.
 *
 * Independent of live chest/sleeve production and of paid Grok generations.
 * Each original pixel is a unique (x,y) function so preservation is proven
 * by exact RGB equality, not by visual inspection.
 */

import type { RgbaImage } from "../types";

export const FIXTURE_WIDTH = 32;
export const FIXTURE_HEIGHT = 24;

/** Garment / transform region (segmentation = 1). */
export const GARMENT_RECT = { x0: 8, x1: 24, y0: 6, y1: 18 } as const;

/** Identity / face keep-original punch-out inside the garment (repair = 1). */
export const IDENTITY_RECT = { x0: 12, x1: 17, y0: 7, y1: 11 } as const;

export type Rect = { x0: number; x1: number; y0: number; y1: number };

export function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}

/** Unique per-pixel original master — never a flat field. */
export function uniqueOriginal(width = FIXTURE_WIDTH, height = FIXTURE_HEIGHT): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 13 + y * 7) & 255;
      data[i + 1] = (x * 3 + y * 17) & 255;
      data[i + 2] = (x * 29 + y * 5) & 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/**
 * Simulated full rerender: invert every RGB channel.
 * No uint8 equals its inverse, so generated differs at every pixel —
 * leaking it outside the authorized region is always detectable.
 */
export function invertedGenerated(original: RgbaImage): RgbaImage {
  const data = new Uint8Array(original.data.length);
  for (let p = 0; p < original.data.length; p += 4) {
    data[p] = 255 - original.data[p]!;
    data[p + 1] = 255 - original.data[p + 1]!;
    data[p + 2] = 255 - original.data[p + 2]!;
    data[p + 3] = 255;
  }
  return { width: original.width, height: original.height, data };
}

export function rectMask(width: number, height: number, rect: Rect, value = 1): Float32Array {
  const a = new Float32Array(width * height);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      a[y * width + x] = value;
    }
  }
  return a;
}

/** Soft 1-pixel seam: interior 1, perimeter 0.5, outside 0. */
export function featheredRectMask(width: number, height: number, rect: Rect): Float32Array {
  const a = new Float32Array(width * height);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const edge = x === rect.x0 || x === rect.x1 - 1 || y === rect.y0 || y === rect.y1 - 1;
      a[y * width + x] = edge ? 0.5 : 1;
    }
  }
  return a;
}

export function laneDFixturePack() {
  const original = uniqueOriginal();
  const generated = invertedGenerated(original);
  const segmentation = rectMask(FIXTURE_WIDTH, FIXTURE_HEIGHT, GARMENT_RECT);
  const repair = rectMask(FIXTURE_WIDTH, FIXTURE_HEIGHT, IDENTITY_RECT);
  return {
    original,
    generated,
    segmentation,
    repair,
    width: FIXTURE_WIDTH,
    height: FIXTURE_HEIGHT,
    garment: GARMENT_RECT,
    identity: IDENTITY_RECT,
  };
}
