/**
 * Pure video-QA probes. No paint, no temporal core, no reconstruct imports.
 */

import { absDiffLuma, cropRgba, lumaAt, pixelsMatch } from "./pixelMath";
import type { EvalCrop, PixelBox, RgbaImage } from "./types";
import { MASK_INSIDE_THRESHOLD, SEAM_ALPHA_MAX, SEAM_ALPHA_MIN } from "./videoQaCriteria";
import type { VideoQaFrame, VideoQaPerFrame } from "./videoQaTypes";

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function alphaAt(alpha: Float32Array | undefined, i: number): number | null {
  if (!alpha) return null;
  const v = alpha[i];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function rasterOk(img: RgbaImage | undefined): img is RgbaImage {
  return !!img && img.width > 0 && img.height > 0 && img.data.length === img.width * img.height * 4;
}

export function sameSize(a: RgbaImage, b: RgbaImage): boolean {
  return a.width === b.width && a.height === b.height;
}

export function alphaLenOk(alpha: Float32Array | undefined, n: number): boolean {
  if (!alpha) return true;
  return alpha.length === n;
}

export type FrameScore = {
  perFrame: VideoQaPerFrame;
  unexplained: string[];
  seamIndices: number[];
  changedInsideIndices: number[];
  maskCx: number | null;
  maskCy: number | null;
  changedCx: number | null;
  changedCy: number | null;
};

function centroid(indices: number[], width: number): { cx: number; cy: number } | null {
  if (indices.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const i of indices) {
    sx += i % width;
    sy += Math.floor(i / width);
  }
  return { cx: sx / indices.length, cy: sy / indices.length };
}

export function scoreFrame(frame: VideoQaFrame): FrameScore {
  const unexplained: string[] = [];
  const empty: VideoQaPerFrame = {
    index: frame.index,
    repairCoverage: null,
    maskCoverage: null,
    unauthorizedPixels: null,
    unauthorizedChangedPixels: null,
    unauthorizedChangedFrac: null,
    seamPixelCount: null,
  };

  if (!rasterOk(frame.original) || !rasterOk(frame.reconstructed)) {
    unexplained.push(`frame ${frame.index}: missing or truncated raster`);
    return {
      perFrame: empty,
      unexplained,
      seamIndices: [],
      changedInsideIndices: [],
      maskCx: null,
      maskCy: null,
      changedCx: null,
      changedCy: null,
    };
  }
  if (!sameSize(frame.original, frame.reconstructed)) {
    unexplained.push(
      `frame ${frame.index}: original ${frame.original.width}×${frame.original.height} vs reconstructed ${frame.reconstructed.width}×${frame.reconstructed.height}`,
    );
    return {
      perFrame: empty,
      unexplained,
      seamIndices: [],
      changedInsideIndices: [],
      maskCx: null,
      maskCy: null,
      changedCx: null,
      changedCy: null,
    };
  }

  const { width, height } = frame.original;
  const n = width * height;
  if (!alphaLenOk(frame.authorizedAlpha, n)) {
    unexplained.push(`frame ${frame.index}: authorizedAlpha length mismatch`);
  }
  if (!alphaLenOk(frame.repairAlpha, n)) {
    unexplained.push(`frame ${frame.index}: repairAlpha length mismatch`);
  }
  if (!alphaLenOk(frame.segmentationAlpha, n)) {
    unexplained.push(`frame ${frame.index}: segmentationAlpha length mismatch`);
  }

  const seamSet = new Set<number>();
  const maskInside: number[] = [];
  const changedInside: number[] = [];
  let repairOn = 0;
  let unauthorized = 0;
  let unauthorizedChanged = 0;
  let maskKnown = 0;

  const hasRepair = !!frame.repairAlpha && frame.repairAlpha.length === n;
  const hasAuth = !!frame.authorizedAlpha && frame.authorizedAlpha.length === n;

  for (let i = 0; i < n; i++) {
    if (hasRepair) {
      const r = alphaAt(frame.repairAlpha, i);
      if (r !== null && r > MASK_INSIDE_THRESHOLD) repairOn++;
    }
    if (!hasAuth) continue;
    const a = alphaAt(frame.authorizedAlpha, i);
    if (a === null) continue;
    maskKnown++;
    const x = i % width;
    const y = Math.floor(i / width);
    if (a > MASK_INSIDE_THRESHOLD) maskInside.push(i);
    if (a > SEAM_ALPHA_MIN && a < SEAM_ALPHA_MAX) seamSet.add(i);
    if (a === 0) {
      unauthorized++;
      if (!pixelsMatch(frame.original, frame.reconstructed, x, y)) unauthorizedChanged++;
    } else if (a > MASK_INSIDE_THRESHOLD) {
      if (!pixelsMatch(frame.original, frame.reconstructed, x, y)) changedInside.push(i);
    }
  }

  if (hasAuth) {
    for (const i of maskInside) {
      const x = i % width;
      const y = Math.floor(i / width);
      const neigh = [
        x > 0 ? i - 1 : -1,
        x + 1 < width ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y + 1 < height ? i + width : -1,
      ];
      for (const j of neigh) {
        if (j < 0) continue;
        const na = alphaAt(frame.authorizedAlpha, j);
        if (na === null) continue;
        if (na <= MASK_INSIDE_THRESHOLD) {
          seamSet.add(i);
          seamSet.add(j);
        }
      }
    }
  }

  const maskC = centroid(maskInside, width);
  const changedC = centroid(changedInside, width);
  const seamIndices = Array.from(seamSet);

  return {
    perFrame: {
      index: frame.index,
      repairCoverage: hasRepair ? round6(repairOn / n) : null,
      maskCoverage: hasAuth && maskKnown > 0 ? round6(maskInside.length / n) : null,
      unauthorizedPixels: hasAuth ? unauthorized : null,
      unauthorizedChangedPixels: hasAuth ? unauthorizedChanged : null,
      unauthorizedChangedFrac:
        hasAuth && unauthorized > 0
          ? round6(unauthorizedChanged / unauthorized)
          : hasAuth
            ? 0
            : null,
      seamPixelCount: hasAuth ? seamIndices.length : null,
    },
    unexplained,
    seamIndices,
    changedInsideIndices: changedInside,
    maskCx: maskC?.cx ?? null,
    maskCy: maskC?.cy ?? null,
    changedCx: changedC?.cx ?? null,
    changedCy: changedC?.cy ?? null,
  };
}

export type PairScore = {
  maskXorFrac: number | null;
  outsideExcessMeanAbsLuma: number | null;
  insideMeanAbsLumaDelta: number | null;
  seamTemporalMeanAbsLuma: number | null;
};

export function scorePair(prev: VideoQaFrame, next: VideoQaFrame): PairScore {
  if (!rasterOk(prev.original) || !rasterOk(prev.reconstructed)) {
    return {
      maskXorFrac: null,
      outsideExcessMeanAbsLuma: null,
      insideMeanAbsLumaDelta: null,
      seamTemporalMeanAbsLuma: null,
    };
  }
  if (!rasterOk(next.original) || !rasterOk(next.reconstructed)) {
    return {
      maskXorFrac: null,
      outsideExcessMeanAbsLuma: null,
      insideMeanAbsLumaDelta: null,
      seamTemporalMeanAbsLuma: null,
    };
  }
  if (
    !sameSize(prev.original, next.original) ||
    !sameSize(prev.reconstructed, next.reconstructed)
  ) {
    return {
      maskXorFrac: null,
      outsideExcessMeanAbsLuma: null,
      insideMeanAbsLumaDelta: null,
      seamTemporalMeanAbsLuma: null,
    };
  }

  const { width, height } = prev.original;
  const n = width * height;
  const hasAuth =
    !!prev.authorizedAlpha &&
    prev.authorizedAlpha.length === n &&
    !!next.authorizedAlpha &&
    next.authorizedAlpha.length === n;

  let xor = 0;
  let xorKnown = 0;
  let outsideN = 0;
  let outsideExcess = 0;
  let insideN = 0;
  let insideAbs = 0;
  let seamN = 0;
  let seamAbs = 0;

  for (let i = 0; i < n; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const reconAbs = Math.abs(lumaAt(next.reconstructed, x, y) - lumaAt(prev.reconstructed, x, y));
    const origAbs = Math.abs(lumaAt(next.original, x, y) - lumaAt(prev.original, x, y));

    if (!hasAuth) continue;
    const a0 = alphaAt(prev.authorizedAlpha, i);
    const a1 = alphaAt(next.authorizedAlpha, i);
    if (a0 === null || a1 === null) continue;

    const in0 = a0 > MASK_INSIDE_THRESHOLD;
    const in1 = a1 > MASK_INSIDE_THRESHOLD;
    xorKnown++;
    if (in0 !== in1) xor++;

    const seam =
      (a0 > SEAM_ALPHA_MIN && a0 < SEAM_ALPHA_MAX) ||
      (a1 > SEAM_ALPHA_MIN && a1 < SEAM_ALPHA_MAX) ||
      in0 !== in1;
    if (seam) {
      seamN++;
      seamAbs += reconAbs;
    }

    if (a0 === 0 && a1 === 0) {
      outsideN++;
      outsideExcess += Math.max(0, reconAbs - origAbs);
    }
    if (in0 && in1) {
      insideN++;
      insideAbs += reconAbs;
    }
  }

  return {
    maskXorFrac: hasAuth && xorKnown > 0 ? round6(xor / xorKnown) : null,
    outsideExcessMeanAbsLuma: hasAuth && outsideN > 0 ? round6(outsideExcess / outsideN) : null,
    insideMeanAbsLumaDelta: hasAuth && insideN > 0 ? round6(insideAbs / insideN) : null,
    seamTemporalMeanAbsLuma: hasAuth && seamN > 0 ? round6(seamAbs / seamN) : null,
  };
}

export function meanOf(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length === 0) return null;
  return round6(xs.reduce((a, b) => a + b, 0) / xs.length);
}

export function maxOf(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length === 0) return null;
  return round6(Math.max(...xs));
}

export function hypot(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/** Bounding box of pixel indices, expanded by pad, clamped to the image. */
export function boxFromIndices(
  indices: number[],
  width: number,
  height: number,
  pad = 2,
): PixelBox | null {
  if (indices.length === 0) return null;
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (const i of indices) {
    const x = i % width;
    const y = Math.floor(i / width);
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return {
    x0: Math.max(0, x0 - pad),
    y0: Math.max(0, y0 - pad),
    x1: Math.min(width - 1, x1 + pad),
    y1: Math.min(height - 1, y1 + pad),
  };
}

export function makeCrop(id: string, img: RgbaImage, box: PixelBox): EvalCrop {
  return { id, box, image: cropRgba(img, box) };
}

export function worstAbsDiffCrop(
  original: RgbaImage,
  reconstructed: RgbaImage,
  id: string,
): EvalCrop {
  const diff = absDiffLuma(original, reconstructed);
  const box: PixelBox = { x0: 0, x1: diff.width - 1, y0: 0, y1: diff.height - 1 };
  return { id, box, image: cropRgba(diff, box) };
}
