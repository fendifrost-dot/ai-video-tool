/**
 * Pure pixel helpers for SAM-3 → Grok outfit lock.
 *
 * SAM-3 `segment-image` (apply_mask:true) returns the source with non-prompted
 * regions blacked out. Luminance of that image is the clothing alpha.
 *
 *   out = hero·(1 − α) + grok·α
 *
 * Face / pose / background stay hero bytes where α≈0. Outfit appearance comes
 * from Grok inside α. Pose drift can mis-place Grok clothing — that is the
 * follow-on pose-restore stage, not a reason to swap with flux.
 */

export type RgbaImage = { width: number; height: number; data: Uint8Array };

/** Convert SAM-3 masked RGB (region visible, rest black) → α ∈ [0,1] per pixel. */
export function sam3MaskedRgbToAlpha(masked: RgbaImage): Float32Array {
  const n = masked.width * masked.height;
  const alpha = new Float32Array(n);
  const d = masked.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    // Rec. 601 luma; black → 0, garment pixels → high.
    const y = (0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) / 255;
    alpha[i] = y;
  }
  return alpha;
}

/** Nearest-neighbor resize of an alpha map (good enough for soft clothing mats). */
export function resizeAlpha(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  if (srcW === dstW && srcH === dstH) return new Float32Array(src);
  const out = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * srcH / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * srcW / dstW));
      out[y * dstW + x] = src[sy * srcW + sx];
    }
  }
  return out;
}

/**
 * Nearest-neighbor RGBA resize — matches alpha resize so Grok and mask stay aligned.
 */
export function resizeRgbaNearest(src: RgbaImage, dstW: number, dstH: number): RgbaImage {
  if (src.width === dstW && src.height === dstH) {
    return { width: dstW, height: dstH, data: new Uint8Array(src.data) };
  }
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y + 0.5) * src.height / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x + 0.5) * src.width / dstW));
      const si = (sy * src.width + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = 255;
    }
  }
  return { width: dstW, height: dstH, data: out };
}

/** Soften α edges with a box blur (odd radius ≥ 1). radius 0 = no-op. */
export function blurAlpha(
  alpha: Float32Array,
  w: number,
  h: number,
  radiusPx: number,
): Float32Array {
  const r = Math.max(0, Math.floor(radiusPx));
  if (r === 0) return new Float32Array(alpha);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const span = 2 * r + 1;
  // Horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        sum += alpha[y * w + xx];
        n++;
      }
      tmp[y * w + x] = n ? sum / n : 0;
    }
  }
  // Vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        sum += tmp[yy * w + x];
        n++;
      }
      out[y * w + x] = n ? sum / (n || span) : 0;
    }
  }
  return out;
}

/**
 * Lock outfit from Grok into the hero clothing region.
 * Hero and grok are resized to hero size; mask alpha is resized to match.
 */
export function lockGrokOutfitOntoHero(
  hero: RgbaImage,
  grok: RgbaImage,
  sam3MaskedRgb: RgbaImage,
  opts?: { featherPx?: number; minAlpha?: number },
): { image: RgbaImage; coverage: number } {
  const w = hero.width;
  const h = hero.height;
  const grokR = resizeRgbaNearest(grok, w, h);
  let alpha = sam3MaskedRgbToAlpha(sam3MaskedRgb);
  alpha = resizeAlpha(alpha, sam3MaskedRgb.width, sam3MaskedRgb.height, w, h);
  const feather = opts?.featherPx ?? 6;
  if (feather > 0) alpha = blurAlpha(alpha, w, h, feather);
  const minA = opts?.minAlpha ?? 0.08;

  const out = new Uint8Array(w * h * 4);
  let covered = 0;
  for (let i = 0; i < w * h; i++) {
    let a = alpha[i];
    if (a < minA) a = 0;
    if (a > 0.5) covered++;
    const o = i * 4;
    const inv = 1 - a;
    out[o] = Math.round(hero.data[o] * inv + grokR.data[o] * a);
    out[o + 1] = Math.round(hero.data[o + 1] * inv + grokR.data[o + 1] * a);
    out[o + 2] = Math.round(hero.data[o + 2] * inv + grokR.data[o + 2] * a);
    out[o + 3] = 255;
  }
  return {
    image: { width: w, height: h, data: out },
    coverage: covered / (w * h),
  };
}
