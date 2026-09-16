import type { AffineTransform, BinaryMask, SourceClipFrame } from "./contract.ts";
import { translationTransform } from "./geometry.ts";
import { maskBBox, type MaskBBox } from "./mask.ts";

export interface TranslationEstimate {
  transform: AffineTransform;
  dx: number;
  dy: number;
  sadPerPixel: number;
  /** Forward–backward consistency in 0..1. */
  confidence: number;
  matched: boolean;
}

const DEFAULT_SEARCH = 6;

function sadPatch(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
  box: MaskBBox,
  mask: Uint8Array,
  dx: number,
  dy: number,
): { sad: number; n: number } {
  let sad = 0;
  let n = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    const sy = y + dy;
    if (sy < 0 || sy >= height) continue;
    const rowA = y * width;
    const rowB = sy * width;
    for (let x = box.x0; x <= box.x1; x++) {
      if (mask[rowA + x] !== 1) continue;
      const sx = x + dx;
      if (sx < 0 || sx >= width) continue;
      sad += Math.abs(a[rowA + x]! - b[rowB + sx]!);
      n++;
    }
  }
  return { sad, n };
}

function bestTranslation(
  from: SourceClipFrame,
  to: SourceClipFrame,
  support: BinaryMask,
  searchRadius: number,
): { dx: number; dy: number; sadPerPixel: number; n: number } | null {
  const box = maskBBox(support);
  if (!box) return null;
  let bestDx = 0;
  let bestDy = 0;
  let bestSad = Number.POSITIVE_INFINITY;
  let bestN = 0;

  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const { sad, n } = sadPatch(
        from.luma,
        to.luma,
        from.width,
        from.height,
        box,
        support.data,
        dx,
        dy,
      );
      if (n === 0) continue;
      const score = sad / n;
      if (score < bestSad - 1e-9 || (Math.abs(score - bestSad) <= 1e-9 && n > bestN)) {
        bestSad = score;
        bestDx = dx;
        bestDy = dy;
        bestN = n;
      }
    }
  }
  if (!Number.isFinite(bestSad) || bestN === 0) return null;
  return { dx: bestDx, dy: bestDy, sadPerPixel: bestSad, n: bestN };
}

/**
 * Integer block-match translation of `support` from `from` → `to`, with a
 * backward check for confidence. Pure luma; no providers.
 */
export function estimateTranslation(
  from: SourceClipFrame,
  to: SourceClipFrame,
  support: BinaryMask,
  searchRadius = DEFAULT_SEARCH,
): TranslationEstimate {
  const fwd = bestTranslation(from, to, support, searchRadius);
  if (!fwd) {
    return {
      transform: translationTransform(0, 0),
      dx: 0,
      dy: 0,
      sadPerPixel: Number.POSITIVE_INFINITY,
      confidence: 0,
      matched: false,
    };
  }

  const guessed = {
    width: support.width,
    height: support.height,
    data: new Uint8Array(support.data.length),
  };
  // Shift support by the forward estimate so the backward search is localized.
  const { width, height } = support;
  for (let y = 0; y < height; y++) {
    const ny = y + fwd.dy;
    if (ny < 0 || ny >= height) continue;
    for (let x = 0; x < width; x++) {
      const nx = x + fwd.dx;
      if (nx < 0 || nx >= width) continue;
      if (support.data[y * width + x] === 1) guessed.data[ny * width + nx] = 1;
    }
  }

  const bwd = bestTranslation(to, from, guessed, searchRadius);
  const fbErr = bwd ? Math.hypot(fwd.dx + bwd.dx, fwd.dy + bwd.dy) : searchRadius * 2;
  const confidence = Math.max(0, Math.min(1, 1 / (1 + fbErr)));

  return {
    transform: translationTransform(fwd.dx, fwd.dy),
    dx: fwd.dx,
    dy: fwd.dy,
    sadPerPixel: fwd.sadPerPixel,
    confidence,
    matched: true,
  };
}
