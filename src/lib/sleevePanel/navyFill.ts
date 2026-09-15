/**
 * Navy-ward source resolution for visible sleeve-panel repair.
 *
 * Stage 1a warped DEFAULT_FLAT_SLEEVE_SOURCE_BBOX as-is. On the live SL
 * flat that crop is cream/white (studio + mastic body), so quads filled
 * cream (FAIL #6: left luma 202→227, right 134→226).
 *
 * 1b: if the requested crop is not navy-majority, search the same flat
 * for a vertical navy strip on that side; if none, fill with the flat's
 * median product navy. Never paint cream/white as "panel truth".
 *
 * Does not import logoComposite / chest paint.
 */

import { cropNormBbox, createRgba, isNormBbox } from "./raster";
import type { NormBbox, RgbaImage, SleeveSide } from "./types";

export const NAVY_CROP_MIN_FRACTION = 0.18;
export const NAVY_SEARCH_MIN_COLUMN_FRACTION = 0.04;

/** Fixture / SL chest-band class navy when the flat has no navy samples. */
export const PRODUCT_NAVY_FALLBACK: readonly [number, number, number] = [28, 32, 88];

export type NavyFillMode = "warp" | "median_navy";

export type NavyPanelSource = {
  source: RgbaImage;
  bbox: NormBbox;
  navyFraction: number;
  fillMode: NavyFillMode;
  medianNavy: [number, number, number];
};

export function luma8(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Lit navy panel. Same shape as chest `isNavyPixel` but local — do not import
 * logoComposite (chest paint lock).
 */
export function isSleeveProductNavy(r: number, g: number, b: number): boolean {
  if (r > 95 || g > 95) return false;
  if (b < 45) return false;
  return b > r + 8 && b > g + 5;
}

export function isSleeveCreamOrWhite(r: number, g: number, b: number): boolean {
  if (isSleeveProductNavy(r, g, b)) return false;
  return luma8(r, g, b) >= 160;
}

export function navyFraction(img: RgbaImage): number {
  const total = img.width * img.height;
  if (total <= 0) return 0;
  let n = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (isSleeveProductNavy(img.data[o]!, img.data[o + 1]!, img.data[o + 2]!)) n++;
  }
  return n / total;
}

export function medianNavyRgb(img: RgbaImage): [number, number, number] | null {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const total = img.width * img.height;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r = img.data[o]!;
    const g = img.data[o + 1]!;
    const b = img.data[o + 2]!;
    if (!isSleeveProductNavy(r, g, b)) continue;
    rs.push(r);
    gs.push(g);
    bs.push(b);
  }
  if (rs.length < 8) return null;
  const mid = (arr: number[]): number => {
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)]!;
  };
  return [mid(rs), mid(gs), mid(bs)];
}

/**
 * Narrow + tall navy window on the matching side. Sleeve panels are vertical;
 * the chest band is a short horizontal run and scores lower per column.
 */
export function findVerticalNavyBbox(
  flat: RgbaImage,
  side: SleeveSide,
  requested: NormBbox,
): NormBbox | null {
  const w = flat.width;
  const h = flat.height;
  if (w < 4 || h < 4) return null;

  const colNavy = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isSleeveProductNavy(flat.data[i]!, flat.data[i + 1]!, flat.data[i + 2]!)) {
        colNavy[x]! += 1;
      }
    }
  }

  const x0 = side === "left" ? 0 : Math.floor(w * 0.5);
  const x1 = side === "left" ? Math.max(x0 + 1, Math.ceil(w * 0.5)) : w;
  const winW = Math.max(3, Math.min(x1 - x0, Math.round(requested[2] * w) || Math.round(w * 0.12)));
  if (winW <= 0 || x1 - x0 < winW) return null;

  let bestX = -1;
  let bestScore = 0;
  const step = Math.max(1, Math.floor(winW / 4));
  for (let x = x0; x + winW <= x1; x += step) {
    let s = 0;
    for (let k = 0; k < winW; k++) s += colNavy[x + k]!;
    const score = s / (winW * h);
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  if (bestX < 0 || bestScore < NAVY_SEARCH_MIN_COLUMN_FRACTION) return null;

  let left = bestX;
  let right = bestX + winW;
  const colThresh = h * 0.08;
  while (left < right - 1 && colNavy[left]! < colThresh) left++;
  while (right > left + 1 && colNavy[right - 1]! < colThresh) right--;
  const trimW = right - left;
  if (trimW < 2) return null;
  bestX = left;

  const rowNavy = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = bestX; x < bestX + trimW; x++) {
      const i = (y * w + x) * 4;
      if (isSleeveProductNavy(flat.data[i]!, flat.data[i + 1]!, flat.data[i + 2]!)) {
        rowNavy[y]! += 1;
      }
    }
  }
  const rowThresh = trimW * 0.25;
  let yStart = 0;
  let yEnd = h;
  for (let y = 0; y < h; y++) {
    if (rowNavy[y]! >= rowThresh) {
      yStart = y;
      break;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    if (rowNavy[y]! >= rowThresh) {
      yEnd = y + 1;
      break;
    }
  }
  const minH = Math.max(4, Math.round(requested[3] * h));
  if (yEnd - yStart < minH) {
    const mid = Math.floor((yStart + yEnd) / 2);
    yStart = Math.max(0, mid - Math.floor(minH / 2));
    yEnd = Math.min(h, yStart + minH);
    yStart = Math.max(0, yEnd - minH);
  }

  const bbox: NormBbox = [bestX / w, yStart / h, trimW / w, (yEnd - yStart) / h];
  if (!isNormBbox(bbox)) return null;
  return bbox;
}

export function resolveNavyPanelSource(
  flat: RgbaImage,
  requested: NormBbox,
  side: SleeveSide,
): NavyPanelSource {
  const requestedCrop = cropNormBbox(flat, requested);
  const requestedFrac = navyFraction(requestedCrop);
  const globalMedian =
    medianNavyRgb(flat) ?? ([...PRODUCT_NAVY_FALLBACK] as [number, number, number]);

  if (requestedFrac >= NAVY_CROP_MIN_FRACTION) {
    return {
      source: requestedCrop,
      bbox: requested,
      navyFraction: requestedFrac,
      fillMode: "warp",
      medianNavy: medianNavyRgb(requestedCrop) ?? globalMedian,
    };
  }

  const found =
    findVerticalNavyBbox(flat, side, requested) ??
    findVerticalNavyBbox(flat, side === "left" ? "right" : "left", requested);
  if (found) {
    const crop = cropNormBbox(flat, found);
    const frac = navyFraction(crop);
    if (frac >= NAVY_CROP_MIN_FRACTION) {
      return {
        source: crop,
        bbox: found,
        navyFraction: frac,
        fillMode: "warp",
        medianNavy: medianNavyRgb(crop) ?? globalMedian,
      };
    }
  }

  const fw = Math.max(8, requestedCrop.width);
  const fh = Math.max(8, requestedCrop.height);
  return {
    source: createRgba(fw, fh, globalMedian[0], globalMedian[1], globalMedian[2]),
    bbox: requested,
    navyFraction: requestedFrac,
    fillMode: "median_navy",
    medianNavy: globalMedian,
  };
}
