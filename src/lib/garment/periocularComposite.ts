/**
 * Deterministic periocular (eye + eyewear) composite.
 *
 * Grok's image-edit regenerates the subject's glasses (it isn't identity- or
 * accessory-preserving), and the face-swap pass restores the face but keeps
 * Grok's invented eyewear. This helper restores the subject's REAL glasses by
 * compositing the periocular region from his hero frame onto the final
 * (face-swapped) image — his real pixels, so exact fidelity.
 *
 * Reuses the logo-composite engine's perspective quad warp (warpQuadAlpha,
 * inverse-bilinear + feathered alpha) and area-average resize, so the
 * resolution delta (hero ~406x720 vs output ~768x1360) and any pose-driven
 * perspective between the two quads are handled the same way logo placement is.
 * A mean/std (Reinhard) colour match shifts the warped patch to the destination
 * region's lighting so there's no seam.
 *
 * Pure (RgbaImage in / out) so it runs in the browser canvas AND is unit-tested
 * in Vitest, mirroring the other garment helpers.
 */

import {
  invBilinear,
  warpQuadAlpha,
  type Point,
  type QuadPts,
  type RgbaImage,
} from "./logoComposite";
import type { QuadNorm } from "./placementEngine";

export type ColorStats = { mean: [number, number, number]; std: [number, number, number] };

export type CompositePeriocularOptions = {
  /** Edge feather of the warped patch, in px (softens the boundary). Default 8. */
  featherPx?: number;
  /** Match the patch's colour distribution to the destination region. Default true. */
  colorMatch?: boolean;
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Normalised [0..1] quad (TL,TR,BR,BL) → pixel-space QuadPts for an image. */
export function normQuadToPx(quad: QuadNorm, width: number, height: number): QuadPts {
  return quad.map(([x, y]) => ({
    x: clamp(x, 0, 1) * (width - 1),
    y: clamp(y, 0, 1) * (height - 1),
  })) as unknown as QuadPts;
}

/** Bilinear RGBA sample at fractional (fx,fy), edge-clamped. */
function sampleBilinear(img: RgbaImage, fx: number, fy: number): [number, number, number, number] {
  const x = clamp(fx, 0, img.width - 1);
  const y = clamp(fy, 0, img.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const dx = x - x0;
  const dy = y - y0;
  const at = (px: number, py: number, c: number) => img.data[(py * img.width + px) * 4 + c];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = lerp(at(x0, y0, c), at(x1, y0, c), dx);
    const bot = lerp(at(x0, y1, c), at(x1, y1, c), dx);
    out[c] = lerp(top, bot, dy);
  }
  return out;
}

/** Forward-bilinear corner interpolation: (u,v) in [0..1]² → point inside quad. */
function quadPoint(quad: QuadPts, u: number, v: number): Point {
  const [tl, tr, br, bl] = quad;
  const topX = tl.x + (tr.x - tl.x) * u;
  const topY = tl.y + (tr.y - tl.y) * u;
  const botX = bl.x + (br.x - bl.x) * u;
  const botY = bl.y + (br.y - bl.y) * u;
  return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
}

/** Rectify a (possibly skewed) source quad into an axis-aligned RGBA patch. */
export function extractQuad(img: RgbaImage, quad: QuadPts, outW: number, outH: number): RgbaImage {
  const w = Math.max(1, Math.round(outW));
  const h = Math.max(1, Math.round(outH));
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      const p = quadPoint(quad, u, v);
      const [r, g, b] = sampleBilinear(img, p.x, p.y);
      const di = (j * w + i) * 4;
      data[di] = Math.round(r);
      data[di + 1] = Math.round(g);
      data[di + 2] = Math.round(b);
      data[di + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** Mean + std of opaque RGB over every pixel of a patch. */
export function patchStats(img: RgbaImage): ColorStats {
  let n = 0;
  const sum = [0, 0, 0];
  const sumSq = [0, 0, 0];
  for (let p = 0; p < img.width * img.height; p++) {
    const i = p * 4;
    if (img.data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) {
      const val = img.data[i + c];
      sum[c] += val;
      sumSq[c] += val * val;
    }
    n++;
  }
  if (n === 0) return { mean: [0, 0, 0], std: [0, 0, 0] };
  const mean = sum.map((s) => s / n) as [number, number, number];
  const std = sumSq.map((sq, c) => Math.sqrt(Math.max(0, sq / n - mean[c] * mean[c]))) as [
    number,
    number,
    number,
  ];
  return { mean, std };
}

/** Mean + std of RGB inside a destination quad region of an image. */
export function regionStats(img: RgbaImage, quad: QuadPts): ColorStats {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const right = Math.min(img.width - 1, Math.ceil(Math.max(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(img.height - 1, Math.ceil(Math.max(...ys)));
  const [tl, tr, br, bl] = quad;
  let n = 0;
  const sum = [0, 0, 0];
  const sumSq = [0, 0, 0];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      // Only count pixels actually inside the quad, not the whole bbox.
      if (!invBilinear(x + 0.5, y + 0.5, tl, tr, br, bl)) continue;
      const i = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const val = img.data[i + c];
        sum[c] += val;
        sumSq[c] += val * val;
      }
      n++;
    }
  }
  if (n === 0) return { mean: [0, 0, 0], std: [0, 0, 0] };
  const mean = sum.map((s) => s / n) as [number, number, number];
  const std = sumSq.map((sq, c) => Math.sqrt(Math.max(0, sq / n - mean[c] * mean[c]))) as [
    number,
    number,
    number,
  ];
  return { mean, std };
}

/**
 * Per-channel Reinhard colour transfer: shift/scale the patch so its mean &
 * spread match the destination region. When the source spread is ~0 (flat
 * patch) we fall back to a pure mean shift to avoid divide-by-zero blow-up.
 */
export function colorMatchPatch(patch: RgbaImage, src: ColorStats, dst: ColorStats): RgbaImage {
  const data = new Uint8Array(patch.data);
  for (let p = 0; p < patch.width * patch.height; p++) {
    const i = p * 4;
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) {
      const ratio = src.std[c] > 1 ? dst.std[c] / src.std[c] : 1;
      const out = (data[i + c] - src.mean[c]) * ratio + dst.mean[c];
      data[i + c] = clamp(Math.round(out), 0, 255);
    }
  }
  return { width: patch.width, height: patch.height, data };
}

function quadAvgDims(quad: QuadPts): { w: number; h: number } {
  const [tl, tr, br, bl] = quad;
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  return { w: (d(tl, tr) + d(bl, br)) / 2, h: (d(tl, bl) + d(tr, br)) / 2 };
}

/**
 * Composite the periocular region from `heroRgba` (source quad) onto
 * `finalRgba` (destination quad), aligned by the two quads, feathered, and
 * colour-matched to the destination lighting. Returns a new image at the
 * final image's resolution; pixels outside the destination quad are untouched.
 */
export function compositePeriocular(
  finalRgba: RgbaImage,
  heroRgba: RgbaImage,
  srcQuad: QuadNorm,
  dstQuad: QuadNorm,
  opts: CompositePeriocularOptions = {},
): RgbaImage {
  const featherPx = opts.featherPx ?? 8;
  const colorMatch = opts.colorMatch ?? true;

  const srcPx = normQuadToPx(srcQuad, heroRgba.width, heroRgba.height);
  const dstPx = normQuadToPx(dstQuad, finalRgba.width, finalRgba.height);

  // Rectify the source eyewear region at the destination quad's pixel size so
  // warpQuadAlpha resamples at ~1× (its prefilter handles any residual scale).
  const { w: outW, h: outH } = quadAvgDims(dstPx);
  let patch = extractQuad(heroRgba, srcPx, outW, outH);

  if (colorMatch) {
    patch = colorMatchPatch(patch, patchStats(patch), regionStats(finalRgba, dstPx));
  }

  return warpQuadAlpha(finalRgba, patch, dstPx, featherPx);
}
