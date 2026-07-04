// AVT edge — deterministic feathered masked recomposite
//
// The determinism gate for the jacket-only inpaint lane (spec §4 step 4).
//
// flux-general/inpainting re-encodes the WHOLE frame through the VAE, so every
// pixel drifts — including the face/scene we must keep real. We therefore never
// use the raw inpaint output directly. Instead we blend it back over the source
// using ONLY the (feathered) jacket mask:
//
//     out = source·(1 − α) + inpaint·α          α = feathered jacket mask ∈ [0,1]
//
// Where α == 0 (everything that is not jacket) the output bytes equal the source
// bytes EXACTLY. That is the hard proof for gate criterion (b): face, glasses,
// cap, hands, pants and background remain the real captured pixels. Only the
// jacket interior + a thin feathered seam ring ever changes.
//
// No diffusion, no heuristics — pure arithmetic over the mask.

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

export type RgbaImage = { width: number; height: number; data: Uint8Array };

export async function decodeToRgba(bytes: Uint8Array): Promise<RgbaImage> {
  const img = await Image.decode(bytes);
  return { width: img.width, height: img.height, data: new Uint8Array(img.bitmap) };
}

export async function encodePng(img: RgbaImage): Promise<Uint8Array> {
  const out = new Image(img.width, img.height);
  out.bitmap.set(img.data);
  return await out.encode();
}

export function resizeRgba(src: RgbaImage, dstW: number, dstH: number): RgbaImage {
  if (src.width === dstW && src.height === dstH) {
    return { width: dstW, height: dstH, data: new Uint8Array(src.data) };
  }
  const img = new Image(src.width, src.height);
  img.bitmap.set(src.data);
  const resized = img.resize(dstW, dstH);
  return { width: dstW, height: dstH, data: new Uint8Array(resized.bitmap) };
}

/** Next multiple of `m` ≥ n. Flux latents are 16-aligned; 1080 is not (→1088). */
export function ceilTo(n: number, m: number): number {
  return Math.ceil(n / m) * m;
}

/**
 * Pad `src` into a newW×newH canvas anchored top-left. The original pixels keep
 * their exact positions (so a later top-left crop is a perfect inverse). The
 * added right/bottom strip is either edge-replicated ("edge", for the scene /
 * depth map — avoids a hard seam) or zeroed ("black", for the mask — the pad
 * must read as NOT-jacket).
 */
export function padRgba(
  src: RgbaImage,
  newW: number,
  newH: number,
  fill: "edge" | "black",
): RgbaImage {
  const out = new Uint8Array(newW * newH * 4);
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const di = (y * newW + x) * 4;
      const inside = x < src.width && y < src.height;
      if (inside || fill === "edge") {
        const sx = x < src.width ? x : src.width - 1;
        const sy = y < src.height ? y : src.height - 1;
        const si = (sy * src.width + sx) * 4;
        out[di] = src.data[si];
        out[di + 1] = src.data[si + 1];
        out[di + 2] = src.data[si + 2];
        out[di + 3] = 255;
      } else {
        out[di] = 0;
        out[di + 1] = 0;
        out[di + 2] = 0;
        out[di + 3] = 255;
      }
    }
  }
  return { width: newW, height: newH, data: out };
}

/** Top-left w×h crop — the exact inverse of padRgba for the original region. */
export function cropRgba(src: RgbaImage, w: number, h: number): RgbaImage {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      const si = (y * src.width + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Build a normalized alpha channel (0..1) from a mask image. evf-sam returns a
 * white-on-black PNG where the jacket is bright; we read luminance and threshold
 * softly so anti-aliased edges survive. Returns one float per pixel (row-major).
 */
export function maskToAlpha(mask: RgbaImage): Float32Array {
  const n = mask.width * mask.height;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    // Perceptual luminance of the mask; evf-sam masks are effectively grayscale.
    const lum = (mask.data[p] * 0.299 + mask.data[p + 1] * 0.587 + mask.data[p + 2] * 0.114) / 255;
    a[i] = lum;
  }
  return a;
}

/**
 * Separable box blur on the alpha channel — cheap, deterministic feather.
 * radiusPx ≈ feather width; run twice to approximate a gaussian falloff.
 */
export function featherAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
  passes = 2,
): Float32Array {
  if (radiusPx <= 0) return alpha;
  const r = Math.max(1, Math.round(radiusPx));
  let src = alpha;
  const scratch = new Float32Array(alpha.length);
  for (let pass = 0; pass < passes; pass++) {
    // horizontal
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let cnt = 0;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += src[row + xx];
          cnt++;
        }
        scratch[row + x] = sum / cnt;
      }
    }
    // vertical
    const dst = pass === passes - 1 ? new Float32Array(alpha.length) : src === alpha ? new Float32Array(alpha.length) : src;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0;
        let cnt = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          sum += scratch[yy * width + x];
          cnt++;
        }
        dst[y * width + x] = sum / cnt;
      }
    }
    src = dst;
  }
  return src;
}

export type RecompositeResult = {
  image: RgbaImage;
  /** fraction of pixels with alpha > 0.5 — mask coverage for logging (spec §6). */
  maskCoverage: number;
  /** count of pixels that actually changed vs source (should be ~ mask + feather). */
  changedPixels: number;
};

/**
 * out = source·(1−α) + inpaint·α, all resized to (width×height).
 *
 * Guarantees: for α==0 the RGB bytes equal source exactly (proof of pixel
 * isolation). Alpha channel of the output is forced opaque.
 */
export function recomposite(
  source: RgbaImage,
  inpaint: RgbaImage,
  maskAlpha: Float32Array,
  width: number,
  height: number,
): RecompositeResult {
  const n = width * height;
  const out = new Uint8Array(n * 4);
  let covered = 0;
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = maskAlpha[i] < 0 ? 0 : maskAlpha[i] > 1 ? 1 : maskAlpha[i];
    if (a > 0.5) covered++;
    const inv = 1 - a;
    let pxChanged = false;
    for (let c = 0; c < 3; c++) {
      const s = source.data[p + c];
      if (a === 0) {
        out[p + c] = s; // byte-identical to source outside the mask
        continue;
      }
      const g = inpaint.data[p + c];
      const v = Math.round(s * inv + g * a);
      out[p + c] = v;
      if (v !== s) pxChanged = true;
    }
    out[p + 3] = 255;
    if (pxChanged) changed++;
  }
  return {
    image: { width, height, data: out },
    maskCoverage: covered / n,
    changedPixels: changed,
  };
}
