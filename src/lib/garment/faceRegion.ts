/**
 * Face-region detection for the identity composite.
 *
 * The Grok image-edit lane re-renders the whole subject, so the output face is
 * a reconstruction — it does not read as him. The face-swap identity pass then
 * generates *another* face rather than restoring his real pixels. The fix is to
 * paste his actual face from the hero frame back onto the Grok result, which
 * needs a face region on BOTH images.
 *
 * Two detectors, in order:
 *   1. The Shape Detection API (`window.FaceDetector`) when the browser exposes
 *      it — a real detector, so it wins whenever available.
 *   2. A skin-tone + connected-component heuristic (below), pure and testable,
 *      mirroring how detectChestBand() finds the chest stripe in logoComposite.
 *
 * The heuristic is deliberately conservative: it reports a confidence and the
 * caller refuses to composite below MIN_FACE_CONFIDENCE rather than pasting a
 * patch of someone's hand onto their forehead. Both images are measured by the
 * SAME procedure, so its systematic bias (skin bbox ≈ forehead-to-lip on a
 * bearded subject, since beard and hair aren't skin) cancels between them.
 */

import { resizeAreaAverage, type PixelRect, type RgbaImage } from "./logoComposite";
import type { QuadNorm } from "./placementEngine";

export type FaceDetectMethod = "shape-detector" | "skin-heuristic";

export type FaceRegion = PixelRect & {
  /** 0..1. Below MIN_FACE_CONFIDENCE the caller must not composite. */
  confidence: number;
  method: FaceDetectMethod;
};

/** Analysis width — the heuristic is shape-based, so full resolution is waste. */
const ANALYSIS_WIDTH = 160;
/** Heads live in the upper part of a hero frame; below this is torso and hands. */
const SEARCH_TOP_FRAC = 0.72;
/** Smaller skin blobs than this (fraction of the searched area) are noise. */
const MIN_BLOB_AREA_FRAC = 0.0015;
/** A face fills most of its own bbox; a scattered blob is not a face. */
const MIN_FILL_RATIO = 0.35;
/** Plausible face bbox height/width. Skin-only bboxes run wide, hence the low end. */
const MIN_ASPECT = 0.55;
const MAX_ASPECT = 2.4;
/** Below this we don't trust the detection and refuse to composite. */
export const MIN_FACE_CONFIDENCE = 0.5;

/**
 * Skin-tone test: the classic RGB rule ANDed with the YCbCr chroma range. Either
 * alone over-fires (RGB on warm wood/brick, YCbCr on desaturated highlights);
 * the intersection is what makes this usable on an uncontrolled hero frame.
 */
export function isSkinPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const rgbRule =
    r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b;
  if (!rgbRule) return false;

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

type Blob = PixelRect & { area: number };

/** 4-connected components over a boolean mask, iterative (no recursion depth risk). */
function findBlobs(mask: Uint8Array, width: number, height: number): Blob[] {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const blobs: Blob[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);

    let area = 0;
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx - x) / width;
      area++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;

      if (x > 0 && mask[idx - 1] && !seen[idx - 1]) (seen[idx - 1] = 1), stack.push(idx - 1);
      if (x < width - 1 && mask[idx + 1] && !seen[idx + 1])
        (seen[idx + 1] = 1), stack.push(idx + 1);
      if (y > 0 && mask[idx - width] && !seen[idx - width])
        (seen[idx - width] = 1), stack.push(idx - width);
      if (y < height - 1 && mask[idx + width] && !seen[idx + width])
        (seen[idx + width] = 1), stack.push(idx + width);
    }

    blobs.push({ left, top, right, bottom, area });
  }

  return blobs;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Detect the subject's face as a pixel rect. Pure — RgbaImage in, region out —
 * so it is unit-tested in Vitest alongside the other garment helpers. Returns
 * null when nothing plausible is found; check `confidence` on what it does
 * return before acting on it.
 */
export function detectFaceRegionHeuristic(img: RgbaImage): FaceRegion | null {
  if (img.width < 8 || img.height < 8) return null;

  const scale = img.width > ANALYSIS_WIDTH ? ANALYSIS_WIDTH / img.width : 1;
  const w = Math.max(8, Math.round(img.width * scale));
  const h = Math.max(8, Math.round(img.height * scale));
  const small = scale < 1 ? resizeAreaAverage(img, w, h) : img;

  const searchRows = Math.max(1, Math.round(h * SEARCH_TOP_FRAC));
  const mask = new Uint8Array(w * h);
  let skinCount = 0;
  for (let y = 0; y < searchRows; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (isSkinPixel(small.data[i], small.data[i + 1], small.data[i + 2])) {
        mask[p] = 1;
        skinCount++;
      }
    }
  }
  if (skinCount === 0) return null;

  const searchArea = w * searchRows;
  const minArea = searchArea * MIN_BLOB_AREA_FRAC;

  let best: Blob | null = null;
  let bestScore = 0;
  for (const blob of findBlobs(mask, w, h)) {
    if (blob.area < minArea) continue;
    const bw = blob.right - blob.left + 1;
    const bh = blob.bottom - blob.top + 1;
    const fill = blob.area / (bw * bh);
    const aspect = bh / bw;
    if (fill < MIN_FILL_RATIO) continue;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;

    // Prefer big, well-filled blobs high in the frame — that is the head, while
    // hands are smaller and sit lower even inside the searched region.
    const areaScore = clamp01(blob.area / (searchArea * 0.06));
    const heightScore = 1 - clamp01((blob.top + bh / 2) / searchRows);
    const score = areaScore * 0.5 + fill * 0.25 + heightScore * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = blob;
    }
  }

  if (!best) return null;

  const inv = 1 / scale;
  return {
    left: Math.round(best.left * inv),
    top: Math.round(best.top * inv),
    right: Math.round((best.right + 1) * inv) - 1,
    bottom: Math.round((best.bottom + 1) * inv) - 1,
    confidence: clamp01(bestScore),
    method: "skin-heuristic",
  };
}

export type FaceQuadOptions = {
  /** Grow the region sideways, as a fraction of its width. Default 0.30. */
  padX?: number;
  /** Grow upward (hair/forehead), as a fraction of its height. Default 0.35. */
  padTop?: number;
  /** Grow downward (beard/chin/jaw), as a fraction of its height. Default 0.55. */
  padBottom?: number;
};

/**
 * Expand a detected region into the normalised quad to composite. The skin bbox
 * covers roughly forehead-to-upper-lip on a bearded subject — beard and hair
 * aren't skin — so it is padded out to the whole head. The ellipse mask and
 * feather in compositePeriocular() make the exact edge forgiving.
 */
export function faceRegionToQuad(
  region: PixelRect,
  imgWidth: number,
  imgHeight: number,
  opts: FaceQuadOptions = {},
): QuadNorm {
  const padX = opts.padX ?? 0.3;
  const padTop = opts.padTop ?? 0.35;
  const padBottom = opts.padBottom ?? 0.55;

  const w = region.right - region.left + 1;
  const h = region.bottom - region.top + 1;
  const x0 = clamp01((region.left - w * padX) / imgWidth);
  const x1 = clamp01((region.right + w * padX) / imgWidth);
  const y0 = clamp01((region.top - h * padTop) / imgHeight);
  const y1 = clamp01((region.bottom + h * padBottom) / imgHeight);

  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export type RegionAgreement = {
  /** dst size ÷ src size, in normalised units (1 = same relative head size). */
  scaleRatio: number;
  /** Centre-to-centre distance in normalised units. */
  centerOffset: number;
  ok: boolean;
  reason?: string;
};

/** Normalised centre + size of a region within its image. */
function normMetrics(region: PixelRect, imgWidth: number, imgHeight: number) {
  const w = (region.right - region.left + 1) / imgWidth;
  const h = (region.bottom - region.top + 1) / imgHeight;
  return {
    cx: (region.left + region.right + 1) / 2 / imgWidth,
    cy: (region.top + region.bottom + 1) / 2 / imgHeight,
    size: Math.sqrt(Math.max(1e-6, w * h)),
  };
}

/** Scale ratio outside this band means the two detections aren't the same head. */
const MIN_SCALE_RATIO = 0.6;
const MAX_SCALE_RATIO = 1.65;
/** Grok holds the framing, so the head should not have moved more than this. */
const MAX_CENTER_OFFSET = 0.25;

/**
 * Cross-check two independent detections before compositing. Grok keeps the
 * camera and crop, so his head must land at a similar size and place in both
 * images; when it doesn't, one of the two detections locked onto something that
 * isn't a face and pasting would produce a visible mess. Caller must refuse.
 */
export function compareFaceRegions(
  src: PixelRect,
  srcImg: { width: number; height: number },
  dst: PixelRect,
  dstImg: { width: number; height: number },
): RegionAgreement {
  const a = normMetrics(src, srcImg.width, srcImg.height);
  const b = normMetrics(dst, dstImg.width, dstImg.height);
  const scaleRatio = b.size / a.size;
  const centerOffset = Math.hypot(b.cx - a.cx, b.cy - a.cy);

  if (scaleRatio < MIN_SCALE_RATIO || scaleRatio > MAX_SCALE_RATIO) {
    return {
      scaleRatio,
      centerOffset,
      ok: false,
      reason: `face size disagrees between hero frame and output (ratio ${scaleRatio.toFixed(2)})`,
    };
  }
  if (centerOffset > MAX_CENTER_OFFSET) {
    return {
      scaleRatio,
      centerOffset,
      ok: false,
      reason: `face position disagrees between hero frame and output (offset ${centerOffset.toFixed(2)})`,
    };
  }
  return { scaleRatio, centerOffset, ok: true };
}
