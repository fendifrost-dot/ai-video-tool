/**
 * Pure RGBA helpers for post-VTON logo composite (testable in Vitest).
 * Edge function mirrors this logic in supabase/functions/_shared/logoComposite.ts.
 */

import type { LogoPlacementHint } from "./logoPlacement";

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type PixelRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const LOGO_WIDTH_FRAC = 0.55;
const MIN_TARGET_HEIGHT_FRAC = 0.065;
const MAX_CHEST_BAND_HEIGHT_FRAC = 0.1;
const CHEST_SCAN_Y_START_FRAC = 0.18;
const CHEST_SCAN_Y_END_FRAC = 0.58;
const NAVY_ROW_THRESHOLD = 0.08;
/**
 * Wide exterior chest stripe: a horizontal band where most of the torso width
 * is navy. A high threshold separates the wide stripe from the narrow vertical
 * placket / collar lining that otherwise bridge collar→stripe into one tall run.
 */
const STRIPE_ROW_THRESHOLD = 0.3;
/** Below this native cap-height a wordmark upscale reads as soft/merged letters. */
const MIN_READABLE_CAP_PX = 22;

/** Navy-ish pixel heuristic for chest stripe detection on VTON output. */
export function isNavyPixel(r: number, g: number, b: number): boolean {
  if (r > 95 || g > 95) return false;
  if (b < 45) return false;
  return b > r + 8 && b > g + 5;
}

type NavyRun = { start: number; end: number };

function findNavyRuns(rowScores: number[], threshold: number): NavyRun[] {
  const runs: NavyRun[] = [];
  let start = -1;
  for (let i = 0; i < rowScores.length; i++) {
    if (rowScores[i] >= threshold) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push({ start, end: i - 1 });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ start, end: rowScores.length - 1 });
  return runs;
}

/**
 * Pick the chest stripe: the LOWEST thin run. The exterior chest stripe sits
 * below the collar lining, so among thin horizontal navy runs we prefer the one
 * with the lowest center (tie-break thinner). Falls back to the lowest run when
 * none are thin.
 */
function pickChestStripeRun(runs: NavyRun[], imgHeight: number): NavyRun | null {
  if (runs.length === 0) return null;
  const maxThin = Math.floor(imgHeight * 0.14);
  const thin = runs.filter((r) => r.end - r.start + 1 <= maxThin);
  const pool = thin.length > 0 ? thin : runs;
  return pool.reduce((best, r) => {
    const c = (r.start + r.end) / 2;
    const bc = (best.start + best.end) / 2;
    if (c > bc + 1) return r;
    if (Math.abs(c - bc) <= 1 && r.end - r.start < best.end - best.start) return r;
    return best;
  });
}

function clampBandHeight(top: number, bottom: number, imgHeight: number): { top: number; bottom: number } {
  const maxH = Math.max(24, Math.floor(imgHeight * MAX_CHEST_BAND_HEIGHT_FRAC));
  if (bottom - top <= maxH) return { top, bottom };
  return { top: bottom - maxH, bottom };
}

function horizontalExtents(
  img: RgbaImage,
  top: number,
  bottom: number,
): { left: number; right: number } {
  let left = img.width;
  let right = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (!isNavyPixel(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  return { left, right };
}

/**
 * Find the chest stripe band — prefer the lowest thin horizontal navy run,
 * not the collar region above it.
 */
export function detectChestBand(img: RgbaImage): PixelRect | null {
  const { width, height, data } = img;
  const yStart = Math.floor(height * CHEST_SCAN_Y_START_FRAC);
  const yEnd = Math.floor(height * CHEST_SCAN_Y_END_FRAC);
  const rowScores: number[] = [];
  for (let y = yStart; y < yEnd; y++) {
    let navy = 0;
    let samples = 0;
    for (let x = Math.floor(width * 0.15); x < Math.floor(width * 0.85); x++) {
      const i = (y * width + x) * 4;
      if (isNavyPixel(data[i], data[i + 1], data[i + 2])) navy++;
      samples++;
    }
    rowScores.push(samples > 0 ? navy / samples : 0);
  }

  // Isolate the wide exterior stripe first: at the strong threshold the narrow
  // placket/collar bridge drops out, so a merged collar+stripe blob splits into
  // separate runs and we can target the lower (stripe) one. Fall back to the
  // weak threshold only when no wide stripe is present (thin trims).
  let picked = pickChestStripeRun(
    findNavyRuns(rowScores, STRIPE_ROW_THRESHOLD),
    height,
  );
  if (!picked || picked.end - picked.start < 2) {
    picked = pickChestStripeRun(findNavyRuns(rowScores, NAVY_ROW_THRESHOLD), height);
  }

  if (!picked || picked.end - picked.start < 2) {
    return {
      left: Math.floor(width * 0.2),
      top: Math.floor(height * 0.22),
      right: Math.floor(width * 0.8),
      bottom: Math.floor(height * 0.42),
    };
  }

  let top = yStart + picked.start;
  let bottom = yStart + picked.end + 1;
  ({ top, bottom } = clampBandHeight(top, bottom, height));

  const { left, right } = horizontalExtents(img, top, bottom);
  if (right <= left) {
    return {
      left: Math.floor(width * 0.2),
      top,
      right: Math.floor(width * 0.8),
      bottom,
    };
  }
  return { left, top, right: right + 1, bottom };
}

export function targetRectForLogo(
  img: RgbaImage,
  band: PixelRect,
  logoAspect: number,
  hint: LogoPlacementHint = "upper_left_chest",
  manualNorm?: [number, number, number, number] | null,
  minTargetHeightPx?: number | null,
  anchorXNorm?: number | null,
): PixelRect {
  if (manualNorm) {
    const [nx, ny, nw, nh] = manualNorm;
    return {
      left: Math.round(nx * img.width),
      top: Math.round(ny * img.height),
      right: Math.round((nx + nw) * img.width),
      bottom: Math.round((ny + nh) * img.height),
    };
  }
  const bandW = band.right - band.left;
  const bandH = band.bottom - band.top;
  let targetW = Math.round(bandW * LOGO_WIDTH_FRAC);
  let targetH = Math.round(targetW / Math.max(logoAspect, 0.1));
  const minH = minTargetHeightPx ?? Math.max(32, Math.round(img.height * MIN_TARGET_HEIGHT_FRAC));
  if (targetH < minH) {
    targetH = minH;
    targetW = Math.round(targetH * logoAspect);
  }
  const maxInBand = Math.round(bandH * 0.95);
  if (targetH > maxInBand && maxInBand >= minH) {
    targetH = maxInBand;
    targetW = Math.round(targetH * logoAspect);
  }
  // Horizontal placement: when the SKU bbox gives a source x-center, anchor the
  // logo there (VTON roughly preserves horizontal position), clamped into the
  // stripe — this lands the wordmark right-of-center per the placement data.
  // Otherwise fall back to the coarse hint (left-padded vs centered).
  let left: number;
  if (anchorXNorm != null && Number.isFinite(anchorXNorm)) {
    const center = anchorXNorm * img.width;
    const lo = band.left;
    const hi = Math.max(band.left, band.right - targetW);
    left = Math.round(center - targetW / 2);
    left = Math.max(lo, Math.min(hi, left));
  } else {
    const padX = hint === "center_chest"
      ? Math.round((bandW - targetW) / 2)
      : Math.round(bandW * 0.06);
    left = band.left + padX;
  }
  const padY = Math.round((bandH - targetH) / 2);
  const top = band.top + padY;
  return {
    left,
    top,
    right: left + targetW,
    bottom: top + targetH,
  };
}

function sampleBilinear(
  src: RgbaImage,
  sx: number,
  sy: number,
): [number, number, number, number] {
  const x0 = Math.max(0, Math.floor(sx));
  const y0 = Math.max(0, Math.floor(sy));
  const x1 = Math.min(src.width - 1, x0 + 1);
  const y1 = Math.min(src.height - 1, y0 + 1);
  const fx = sx - x0;
  const fy = sy - y0;
  const i00 = (y0 * src.width + x0) * 4;
  const i10 = (y0 * src.width + x1) * 4;
  const i01 = (y1 * src.width + x0) * 4;
  const i11 = (y1 * src.width + x1) * 4;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const v00 = src.data[i00 + c];
    const v10 = src.data[i10 + c];
    const v01 = src.data[i01 + c];
    const v11 = src.data[i11 + c];
    out[c] = Math.round(
      v00 * (1 - fx) * (1 - fy) +
        v10 * fx * (1 - fy) +
        v01 * (1 - fx) * fy +
        v11 * fx * fy,
    );
  }
  return out;
}

/** Bilinear resize RGBA (anti-aliased downscale for serif text). */
export function resizeRgba(src: RgbaImage, dstW: number, dstH: number): RgbaImage {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = ((y + 0.5) / dstH) * src.height - 0.5;
    for (let x = 0; x < dstW; x++) {
      const sx = ((x + 0.5) / dstW) * src.width - 0.5;
      const [r, g, b, a] = sampleBilinear(src, sx, sy);
      const di = (y * dstW + x) * 4;
      out[di] = r;
      out[di + 1] = g;
      out[di + 2] = b;
      out[di + 3] = a;
    }
  }
  return { width: dstW, height: dstH, data: out };
}

export function cropRgba(
  img: RgbaImage,
  left: number,
  top: number,
  width: number,
  height: number,
): RgbaImage {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, left + x));
      const sy = Math.min(img.height - 1, Math.max(0, top + y));
      const si = (sy * img.width + sx) * 4;
      const di = (y * width + x) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = img.data[si + 3];
    }
  }
  return { width, height, data: out };
}

/** Dark bluish pixel that isn't a strict navy but borders the keyed stripe — the
 * anti-aliased fringe between cream letters and navy ground. Feathering these
 * avoids a hard navy rectangle/seam when the crop is pasted over the stripe. */
function isSemiNavyEdge(r: number, g: number, b: number): boolean {
  if (b <= r + 2 || b <= g) return false;
  return (r + g + b) / 3 < 130;
}

/**
 * Key navy stripe background to transparent for front-flat crops, then feather
 * the semi-navy fringe so the keyed wordmark blends into the destination stripe
 * with no hard rectangle. Bright letter ink stays fully opaque.
 */
export function keyNavyBackground(logo: RgbaImage): RgbaImage {
  const { width, height } = logo;
  const data = new Uint8Array(logo.data);
  const keyed = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (isNavyPixel(data[o], data[o + 1], data[o + 2])) {
      data[o + 3] = 0;
      keyed[i] = 1;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (keyed[i]) continue;
      const o = i * 4;
      if (data[o + 3] === 0) continue;
      if (!isSemiNavyEdge(data[o], data[o + 1], data[o + 2])) continue;
      let adjacent = false;
      for (let dy = -1; dy <= 1 && !adjacent; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (keyed[ny * width + nx]) { adjacent = true; break; }
        }
      }
      if (adjacent) data[o + 3] = Math.round(data[o + 3] * 0.4);
    }
  }
  return { width, height, data };
}

function averageNavyInBand(img: RgbaImage, band: PixelRect): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = band.top; y < band.bottom; y++) {
    for (let x = band.left; x < band.right; x++) {
      const i = (y * img.width + x) * 4;
      if (!isNavyPixel(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
      r += img.data[i];
      g += img.data[i + 1];
      b += img.data[i + 2];
      n++;
    }
  }
  if (n === 0) return [25, 30, 95];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function fillRectNavy(
  out: Uint8Array,
  width: number,
  height: number,
  rect: PixelRect,
  nr: number,
  ng: number,
  nb: number,
): void {
  for (let y = rect.top; y < rect.bottom; y++) {
    if (y < 0 || y >= height) continue;
    for (let x = rect.left; x < rect.right; x++) {
      if (x < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      out[i] = nr;
      out[i + 1] = ng;
      out[i + 2] = nb;
      out[i + 3] = 255;
    }
  }
}

/**
 * Repaint the chest stripe with its own average navy before compositing. VTON
 * renders its own garbled "Saint Laurent" somewhere on the real stripe, so we
 * flat-fill the whole detected band (the stripe is solid navy → seamless) plus
 * the target rect, guaranteeing the VTON mark is erased and only ONE clean
 * wordmark remains after the paste.
 */
export function coverTargetOnBand(
  base: RgbaImage,
  band: PixelRect,
  target: PixelRect,
): RgbaImage {
  const out = new Uint8Array(base.data);
  const [nr, ng, nb] = averageNavyInBand(base, band);
  fillRectNavy(out, base.width, base.height, band, nr, ng, nb);
  fillRectNavy(out, base.width, base.height, target, nr, ng, nb);
  return { width: base.width, height: base.height, data: out };
}

/** Alpha-blend logo onto base at target rect (clipped). */
export function alphaComposite(
  base: RgbaImage,
  logo: RgbaImage,
  target: PixelRect,
): RgbaImage {
  const out = new Uint8Array(base.data);
  const tw = target.right - target.left;
  const th = target.bottom - target.top;
  const scaled = resizeRgba(logo, tw, th);
  for (let y = 0; y < th; y++) {
    const dy = target.top + y;
    if (dy < 0 || dy >= base.height) continue;
    for (let x = 0; x < tw; x++) {
      const dx = target.left + x;
      if (dx < 0 || dx >= base.width) continue;
      const li = (y * tw + x) * 4;
      const bi = (dy * base.width + dx) * 4;
      const a = scaled.data[li + 3] / 255;
      if (a <= 0.01) continue;
      const ia = 1 - a;
      out[bi] = Math.round(scaled.data[li] * a + out[bi] * ia);
      out[bi + 1] = Math.round(scaled.data[li + 1] * a + out[bi + 1] * ia);
      out[bi + 2] = Math.round(scaled.data[li + 2] * a + out[bi + 2] * ia);
      out[bi + 3] = 255;
    }
  }
  return { width: base.width, height: base.height, data: out };
}

export type LogoQuality = {
  upscaled: boolean;
  scale_ratio: number;
  native_height_px: number;
  target_height_px: number;
  /** front_crop pushed past its native resolution → letters will read soft. */
  quality_warning: boolean;
};

/**
 * Quality flag for the composite. The high-res transparent asset downscales
 * cleanly; a front_crop upscaled past its native cap-height (or below the
 * readable floor) cannot be made crisp and must be flagged for a real asset.
 */
export function logoQuality(
  nativeHeightPx: number,
  targetHeightPx: number,
  source: "asset" | "front_crop",
): LogoQuality {
  const ratio = targetHeightPx / Math.max(1, nativeHeightPx);
  const upscaled = ratio > 1.05;
  const lowRes = nativeHeightPx < MIN_READABLE_CAP_PX;
  return {
    upscaled,
    scale_ratio: Math.round(ratio * 100) / 100,
    native_height_px: nativeHeightPx,
    target_height_px: targetHeightPx,
    quality_warning: source === "front_crop" && (upscaled || lowRes),
  };
}

export function cropNormBbox(img: RgbaImage, norm: [number, number, number, number]): RgbaImage {
  const [nx, ny, nw, nh] = norm;
  const left = Math.round(nx * img.width);
  const top = Math.round(ny * img.height);
  const w = Math.max(1, Math.round(nw * img.width));
  const h = Math.max(1, Math.round(nh * img.height));
  return cropRgba(img, left, top, w, h);
}
