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

/** Navy-ish pixel heuristic for chest stripe detection on VTON output. */
export function isNavyPixel(r: number, g: number, b: number): boolean {
  if (r > 95 || g > 95) return false;
  if (b < 45) return false;
  return b > r + 8 && b > g + 5;
}

/**
 * Find horizontal chest band in upper torso (roughly 12%–58% of frame height).
 */
export function detectChestBand(img: RgbaImage): PixelRect | null {
  const { width, height, data } = img;
  const yStart = Math.floor(height * 0.12);
  const yEnd = Math.floor(height * 0.58);
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
  const threshold = 0.08;
  let bandStart = -1;
  let bandEnd = -1;
  for (let i = 0; i < rowScores.length; i++) {
    if (rowScores[i] >= threshold) {
      if (bandStart < 0) bandStart = i;
      bandEnd = i;
    }
  }
  if (bandStart < 0 || bandEnd - bandStart < 2) {
    return {
      left: Math.floor(width * 0.2),
      top: Math.floor(height * 0.22),
      right: Math.floor(width * 0.8),
      bottom: Math.floor(height * 0.42),
    };
  }
  const top = yStart + bandStart;
  const bottom = yStart + bandEnd + 1;
  let left = width;
  let right = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!isNavyPixel(data[i], data[i + 1], data[i + 2])) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
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
  let targetW = Math.round(bandW * 0.38);
  let targetH = Math.round(targetW / Math.max(logoAspect, 0.1));
  if (targetH > bandH * 0.75) {
    targetH = Math.round(bandH * 0.75);
    targetW = Math.round(targetH * logoAspect);
  }
  const padX = hint === "center_chest"
    ? Math.round((bandW - targetW) / 2)
    : Math.round(bandW * 0.06);
  const padY = Math.round((bandH - targetH) * 0.2);
  const left = band.left + padX;
  const top = band.top + padY;
  return {
    left,
    top,
    right: left + targetW,
    bottom: top + targetH,
  };
}

/** Nearest-neighbor resize RGBA */
export function resizeRgba(src: RgbaImage, dstW: number, dstH: number): RgbaImage {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / dstH) * src.height));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / dstW) * src.width));
      const si = (sy * src.width + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
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

export function cropNormBbox(img: RgbaImage, norm: [number, number, number, number]): RgbaImage {
  const [nx, ny, nw, nh] = norm;
  const left = Math.round(nx * img.width);
  const top = Math.round(ny * img.height);
  const w = Math.max(1, Math.round(nw * img.width));
  const h = Math.max(1, Math.round(nh * img.height));
  return cropRgba(img, left, top, w, h);
}
