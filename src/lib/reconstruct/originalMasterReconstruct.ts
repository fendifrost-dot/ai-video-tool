/**
 * Lane D — original-master reconstruction / compositing.
 *
 * Product rule: a Grok (or any) full rerender cannot become the final master.
 * It softens identity, background, and detail. Reconstruction always starts
 * from the original master and admits generated pixels only where masks
 * authorize them:
 *
 *     authorized = clamp(segmentation) − clamp(repair)
 *     out = original · (1 − α) + generated · α
 *
 * Where α === 0 the output RGB bytes are copied from the original — not
 * blended — so they are byte-identical. That is the hard proof that
 * transformation is refused wherever it is unnecessary.
 *
 * Isolated on purpose. Does not import or rewrite:
 *   - src/lib/garment/stillRepairOcclusion.ts (Architecture C occlusion)
 *   - src/lib/garment/logoComposite.ts
 *   - supabase/functions/_shared/jacketRecomposite.ts
 *   - architecture-c-still-repair-proxy
 *
 * Callers that already feather a mask may pass the feathered α as
 * `segmentation`. This stage does not feather, dilate, or invent geometry.
 */

import type { ReconstructInput, ReconstructResult, RgbaImage } from "./types";

export type { ReconstructInput, ReconstructMetrics, ReconstructResult, RgbaImage } from "./types";

export const RECONSTRUCT_SIZE_MISMATCH = "reconstruct_size_mismatch";
export const RECONSTRUCT_ALPHA_SIZE_MISMATCH = "reconstruct_alpha_size_mismatch";

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function assertSameSize(a: RgbaImage, b: RgbaImage, label: string): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`${RECONSTRUCT_SIZE_MISMATCH}:${label}`);
  }
}

function assertAlphaSize(alpha: Float32Array, width: number, height: number, label: string): void {
  if (alpha.length !== width * height) {
    throw new Error(`${RECONSTRUCT_ALPHA_SIZE_MISMATCH}:${label}`);
  }
}

/**
 * authorized = max(0, clamp(seg) − clamp(repair)).
 * Repair punches original-must-keep holes in the transform region.
 */
export function buildAuthorizedAlpha(
  width: number,
  height: number,
  segmentation: Float32Array,
  repair?: Float32Array,
): Float32Array {
  assertAlphaSize(segmentation, width, height, "segmentation");
  if (repair) assertAlphaSize(repair, width, height, "repair");
  const n = width * height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const seg = clamp01(segmentation[i]!);
    const keep = repair ? clamp01(repair[i]!) : 0;
    const a = seg - keep;
    out[i] = a > 0 ? a : 0;
  }
  return out;
}

function rgbEqual(a: Uint8Array, b: Uint8Array, p: number): boolean {
  return a[p] === b[p] && a[p + 1] === b[p + 1] && a[p + 2] === b[p + 2];
}

/**
 * Reconstruct a master from original + generated + masks.
 *
 * Guarantees: for every pixel with authorized α === 0, output RGB equals
 * original RGB exactly. Generated never becomes the master on its own —
 * a zero segmentation (and/or full repair) returns the original bytes.
 */
export function reconstructOriginalMaster(input: ReconstructInput): ReconstructResult {
  const { original, generated, segmentation, repair } = input;
  assertSameSize(original, generated, "original_vs_generated");
  const { width, height } = original;
  const n = width * height;
  if (original.data.length !== n * 4 || generated.data.length !== n * 4) {
    throw new Error(`${RECONSTRUCT_SIZE_MISMATCH}:rgba_byte_length`);
  }

  const authorizedAlpha = buildAuthorizedAlpha(width, height, segmentation, repair);
  const out = new Uint8Array(n * 4);
  let covered = 0;
  let changed = 0;
  let unauthorized = 0;
  let unauthorizedPreserved = 0;

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = authorizedAlpha[i]!;
    if (a > 0.5) covered++;
    if (a === 0) {
      unauthorized++;
      out[p] = original.data[p]!;
      out[p + 1] = original.data[p + 1]!;
      out[p + 2] = original.data[p + 2]!;
      out[p + 3] = 255;
      unauthorizedPreserved++;
      continue;
    }
    const inv = 1 - a;
    out[p] = Math.round(original.data[p]! * inv + generated.data[p]! * a);
    out[p + 1] = Math.round(original.data[p + 1]! * inv + generated.data[p + 1]! * a);
    out[p + 2] = Math.round(original.data[p + 2]! * inv + generated.data[p + 2]! * a);
    out[p + 3] = 255;
    if (!rgbEqual(out, original.data, p)) changed++;
  }

  return {
    image: { width, height, data: out },
    authorizedAlpha,
    maskCoverage: covered / n,
    changedPixels: changed,
    preservedPixels: n - changed,
    unauthorizedPixels: unauthorized,
    originalPixelsPreservedWhereUnauthorized: unauthorizedPreserved === unauthorized,
  };
}

/** Count RGB mismatches between two same-size images. */
export function countRgbMismatches(a: RgbaImage, b: RgbaImage): number {
  assertSameSize(a, b, "mismatch_compare");
  let n = 0;
  for (let p = 0; p < a.data.length; p += 4) {
    if (!rgbEqual(a.data, b.data, p)) n++;
  }
  return n;
}

/**
 * Every pixel with α === 0 must be byte-identical to `original`.
 * Used by fixture tests as the Lane D acceptance predicate.
 */
export function unauthorizedPixelsMatchOriginal(
  original: RgbaImage,
  reconstructed: RgbaImage,
  authorizedAlpha: Float32Array,
): boolean {
  assertSameSize(original, reconstructed, "preservation_compare");
  assertAlphaSize(authorizedAlpha, original.width, original.height, "preservation_alpha");
  const n = original.width * original.height;
  for (let i = 0; i < n; i++) {
    if (authorizedAlpha[i] !== 0) continue;
    const p = i * 4;
    if (!rgbEqual(original.data, reconstructed.data, p)) return false;
  }
  return true;
}
