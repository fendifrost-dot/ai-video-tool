/**
 * Post-VTON logo composite for Deno edge (ImageScript decode/encode).
 */

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

export type LogoPlacementHint = "upper_left_chest" | "center_chest";

export type LogoPlacement = {
  logo_asset_id?: string | null;
  front_asset_id?: string | null;
  source_bbox_norm: [number, number, number, number];
  target_region?: "chest_band";
  placement_hint?: LogoPlacementHint;
  target_bbox_norm?: [number, number, number, number] | null;
  min_target_height_px?: number | null;
};

export type PixelRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

const LOGO_WIDTH_FRAC = 0.55;
const MIN_TARGET_HEIGHT_FRAC = 0.065;
const MAX_CHEST_BAND_HEIGHT_FRAC = 0.1;
const CHEST_SCAN_Y_START_FRAC = 0.18;
// Extends past mid-torso so a LOWER stripe on a turned pose is still scanned,
// but stops above the waist so navy lower-body garments aren't mistaken for it.
const CHEST_SCAN_Y_END_FRAC = 0.66;
const NAVY_ROW_THRESHOLD = 0.08;
/** Half-width of the anchored scan column (fraction of image width). */
const ANCHOR_HALF_FRAC = 0.13;
/** Navy gaps narrower than this (fraction of width) are letter gaps to fill over. */
const MAX_LETTER_GAP_FRAC = 0.06;
/**
 * Wide exterior chest stripe: a horizontal band where most of the torso width
 * is navy. A high threshold separates the wide stripe from the narrow vertical
 * placket / collar lining that otherwise bridge collar→stripe into one tall run.
 */
const STRIPE_ROW_THRESHOLD = 0.3;
/** Below this native cap-height a wordmark upscale reads as soft/merged letters. */
const MIN_READABLE_CAP_PX = 22;
// --- Stripe-vs-collar discrimination & confidence (all ratios, not coordinates) ---
/** A torso-crossing stripe spans at least this fraction of image width; a small
 *  collar patch is narrower, so this gate drops it from the candidate pool. A
 *  diagonal stripe only shows a slice of its width in the band, so keep this
 *  modest — the "pick the lowest band" rule then separates stripe from collar. */
const STRIPE_MIN_WIDTH_FRAC = 0.25;
/** Width at/above which the width component of confidence saturates to 1. */
const STRIPE_WIDTH_REF_FRAC = 0.55;
/** Below this confidence we don't trust detection and fall back to SKU placement. */
const MIN_STRIPE_CONFIDENCE = 0.5;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function parseLogoPlacement(raw: unknown): LogoPlacement | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const bbox = o.source_bbox_norm;
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const nums = bbox.map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return null;
  const [x, y, w, h] = nums;
  if (w <= 0 || h <= 0) return null;
  const hint = o.placement_hint;
  const placement_hint =
    hint === "center_chest" || hint === "upper_left_chest" ? hint : "upper_left_chest";
  let target_bbox_norm: LogoPlacement["target_bbox_norm"] = null;
  if (Array.isArray(o.target_bbox_norm) && o.target_bbox_norm.length === 4) {
    const t = o.target_bbox_norm.map((n) => Number(n));
    if (t.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
      target_bbox_norm = t as [number, number, number, number];
    }
  }
  let min_target_height_px: LogoPlacement["min_target_height_px"] = null;
  if (o.min_target_height_px != null) {
    const n = Number(o.min_target_height_px);
    if (Number.isFinite(n) && n >= 16 && n <= 256) {
      min_target_height_px = Math.round(n);
    }
  }
  return {
    logo_asset_id: typeof o.logo_asset_id === "string" ? o.logo_asset_id : null,
    front_asset_id: typeof o.front_asset_id === "string" ? o.front_asset_id : null,
    source_bbox_norm: [x, y, w, h],
    target_region: "chest_band",
    placement_hint,
    target_bbox_norm,
    min_target_height_px,
  };
}

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

function clampBandHeight(top: number, bottom: number, imgHeight: number): { top: number; bottom: number } {
  const maxH = Math.max(24, Math.floor(imgHeight * MAX_CHEST_BAND_HEIGHT_FRAC));
  if (bottom - top <= maxH) return { top, bottom };
  return { top: bottom - maxH, bottom };
}

/** A pixel-colour predicate (r,g,b) → matches. Default detection uses navy; the
 *  placement engine passes HSV-profile predicates for other detail colours. */
export type PixelMatch = (r: number, g: number, b: number) => boolean;

function horizontalExtents(
  img: RgbaImage,
  top: number,
  bottom: number,
  match: PixelMatch,
): { left: number; right: number } {
  let left = img.width;
  let right = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (!match(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  return { left, right };
}

/** Horizontal scan window — narrow column around the anchor, or full torso. */
function scanWindow(width: number, anchorXNorm?: number | null): { x0: number; x1: number } {
  if (anchorXNorm != null && Number.isFinite(anchorXNorm)) {
    const c = Math.max(0, Math.min(1, anchorXNorm));
    let x0 = Math.floor(width * Math.max(0.04, c - ANCHOR_HALF_FRAC));
    let x1 = Math.floor(width * Math.min(0.96, c + ANCHOR_HALF_FRAC));
    const minW = Math.floor(width * 0.12);
    if (x1 - x0 < minW) {
      const mid = (x0 + x1) / 2;
      x0 = Math.max(0, Math.floor(mid - minW / 2));
      x1 = Math.min(width, Math.floor(mid + minW / 2));
    }
    return { x0, x1 };
  }
  return { x0: Math.floor(width * 0.15), x1: Math.floor(width * 0.85) };
}

/** A detected band plus a 0–1 confidence that it is a real torso-crossing stripe. */
export type StripeBand = PixelRect & { confidence: number };

type RunCandidate = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  widthPx: number;
  coverage: number;
  confidence: number;
};

/** Evaluate one navy run: clamp its height, measure its full-width navy extent,
 *  and score how stripe-like it is (wide AND solidly navy). */
function evaluateRun(
  img: RgbaImage,
  rowScores: number[],
  run: NavyRun,
  yStart: number,
  match: PixelMatch,
): RunCandidate {
  let top = yStart + run.start;
  let bottom = yStart + run.end + 1;
  ({ top, bottom } = clampBandHeight(top, bottom, img.height));
  const { left, right } = horizontalExtents(img, top, bottom, match);
  const widthPx = right > left ? right - left : 0;
  let sum = 0;
  let n = 0;
  for (let i = run.start; i <= run.end; i++) {
    sum += rowScores[i];
    n++;
  }
  const coverage = n > 0 ? sum / n : 0;
  const widthScore = clamp01(widthPx / (img.width * STRIPE_WIDTH_REF_FRAC));
  const confidence = Math.min(widthScore, clamp01(coverage));
  return { top, bottom, left, right, widthPx, coverage, confidence };
}

/**
 * Detect the navy chest stripe on the VTON output from the garment pixels —
 * general across pose, stripe geometry (horizontal/diagonal/curved), and
 * position (upper or lower chest). Strategy:
 *  1. Anchor a narrow scan column on the SKU x-center so a stripe that no longer
 *     spans the body on a turned/angled pose still fills the column.
 *  2. Take navy row-runs (strong threshold, weak fallback) as band candidates.
 *  3. Prefer candidates WIDE enough to cross the torso (gate out the small collar
 *     lining patch); among those pick the LOWEST (chest stripe sits below collar).
 *  4. Return a confidence (width × navy-density) so the caller can fall back to
 *     the SKU placement when no stripe is found rather than painting tan.
 * Returns null only when there is no navy at all in the scan region.
 */
export function detectChestBand(
  img: RgbaImage,
  anchorXNorm?: number | null,
  match: PixelMatch = isNavyPixel,
): StripeBand | null {
  const { width, height, data } = img;
  const yStart = Math.floor(height * CHEST_SCAN_Y_START_FRAC);
  const yEnd = Math.floor(height * CHEST_SCAN_Y_END_FRAC);
  const { x0, x1 } = scanWindow(width, anchorXNorm);
  const rowScores: number[] = [];
  for (let y = yStart; y < yEnd; y++) {
    let navy = 0;
    let samples = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (match(data[i], data[i + 1], data[i + 2])) navy++;
      samples++;
    }
    rowScores.push(samples > 0 ? navy / samples : 0);
  }

  // Strong threshold first (splits a collar+stripe blob bridged by the placket);
  // fall back to the weak threshold when no strong band is present (faint navy).
  let runs = findNavyRuns(rowScores, STRIPE_ROW_THRESHOLD).filter((r) => r.end > r.start);
  if (runs.length === 0) {
    runs = findNavyRuns(rowScores, NAVY_ROW_THRESHOLD).filter((r) => r.end > r.start);
  }
  if (runs.length === 0) return null;

  const candidates = runs.map((r) => evaluateRun(img, rowScores, r, yStart, match));
  // Torso-crossing stripes only; if none qualify, keep all but damp confidence.
  const minWidth = width * STRIPE_MIN_WIDTH_FRAC;
  const wide = candidates.filter((c) => c.widthPx >= minWidth);
  const pool = wide.length > 0 ? wide : candidates;
  // Lowest band in the pool (chest stripe is below the collar/shoulder).
  const chosen = pool.reduce((best, c) => (c.top + c.bottom > best.top + best.bottom ? c : best));
  const confidence = wide.length > 0 ? chosen.confidence : chosen.confidence * 0.5;

  const left = chosen.right > chosen.left ? chosen.left : Math.floor(width * 0.2);
  const right = chosen.right > chosen.left ? chosen.right + 1 : Math.floor(width * 0.8);
  return { left, top: chosen.top, right, bottom: chosen.bottom, confidence };
}

/** Map a normalized [x,y,w,h] bbox (SKU placement) to a pixel band — the
 *  fallback target region when no confident stripe is detected. */
export function bandFromNormBbox(
  img: RgbaImage,
  norm: [number, number, number, number],
): PixelRect {
  const [nx, ny, nw, nh] = norm;
  return {
    left: Math.round(nx * img.width),
    top: Math.round(ny * img.height),
    right: Math.round((nx + nw) * img.width),
    bottom: Math.round((ny + nh) * img.height),
  };
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

function resizeRgbaBilinear(src: RgbaImage, dstW: number, dstH: number): RgbaImage {
  const img = new Image(src.width, src.height);
  img.bitmap.set(src.data);
  const resized = img.resize(dstW, dstH);
  return { width: dstW, height: dstH, data: new Uint8Array(resized.bitmap) };
}

function cropRgba(
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

// --- Glyph-only keying: keep only the bright cream/gold wordmark, drop BOTH the
//     navy stripe AND the tan fabric background, so a loose source bbox never
//     paints a background sliver. All thresholds are named ratios, not per-image.
const GLYPH_BRIGHT_DROP = 188;
const GLYPH_BRIGHT_KEEP = 212;
const GLYPH_WARM_HUE_MIN = 18;
const GLYPH_WARM_HUE_MAX = 70;
const GLYPH_GOLD_SAT_DROP = 0.4;
const GLYPH_GOLD_SAT_KEEP = 0.55;
const GLYPH_GOLD_VAL_MIN = 0.5;
// Dilate the confirmed-glyph mask outward to rebuild the anti-aliased stroke
// edges the key strips — grows the GLYPH region (not the luma threshold), so tan
// fabric with no glyph neighbour is never re-admitted.
const GLYPH_CONFIRM = 0.5;
const GLYPH_DILATE_RADIUS = 1;
const GLYPH_DILATE_FEATHER = 0.7;

function lumaOf(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function hsvOf(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x >= b ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Per-pixel "glyph-ness" in [0,1]: bright cream OR warm-saturated gold; navy and
 *  tan score 0. The soft ramps give a feathered alpha at glyph/background edges. */
export function glyphAlphaFactor(r: number, g: number, b: number): number {
  const bright = smoothstep(GLYPH_BRIGHT_DROP, GLYPH_BRIGHT_KEEP, lumaOf(r, g, b));
  const { h, s, v } = hsvOf(r, g, b);
  const gold =
    h >= GLYPH_WARM_HUE_MIN && h <= GLYPH_WARM_HUE_MAX && v >= GLYPH_GOLD_VAL_MIN
      ? smoothstep(GLYPH_GOLD_SAT_DROP, GLYPH_GOLD_SAT_KEEP, s)
      : 0;
  return Math.max(bright, gold);
}

/**
 * Derive the logo's alpha from the WORDMARK GLYPHS ONLY: keep bright cream/gold
 * glyph pixels opaque and key out BOTH the navy stripe and the tan fabric
 * backgrounds of a front-flat crop, with a feathered edge. After this, no
 * source-background pixel paints regardless of how loose the crop bbox is.
 */
export function keyGlyphForeground(logo: RgbaImage, dilateRadius = GLYPH_DILATE_RADIUS): RgbaImage {
  const { width, height } = logo;
  const data = new Uint8Array(logo.data);
  const base = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    base[i] = glyphAlphaFactor(data[o], data[o + 1], data[o + 2]);
  }
  const R = Math.max(0, dilateRadius);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      let f = base[idx];
      if (R > 0 && f < 1) {
        let best = 0;
        for (let dy = -R; dy <= R && best < 1; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (base[ny * width + nx] >= GLYPH_CONFIRM) {
              const d = Math.max(Math.abs(dx), Math.abs(dy));
              const contrib = GLYPH_DILATE_FEATHER * (1 - (d - 1) / Math.max(1, R));
              if (contrib > best) best = contrib;
            }
          }
        }
        if (best > f) f = best;
      }
      const o = idx * 4;
      data[o + 3] = Math.round(data[o + 3] * f);
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

/** Navy runs on one row, restricted to the torso x-span. */
function rowNavyRuns(base: RgbaImage, y: number, x0: number, x1: number): NavyRun[] {
  const scores: number[] = [];
  for (let x = x0; x < x1; x++) {
    const i = (y * base.width + x) * 4;
    scores.push(isNavyPixel(base.data[i], base.data[i + 1], base.data[i + 2]) ? 1 : 0);
  }
  return findNavyRuns(scores, 1).map((r) => ({ start: r.start + x0, end: r.end + x0 }));
}

/**
 * Repaint the chest stripe with its own average navy before compositing. VTON
 * renders its own garbled "Saint Laurent" on the real stripe, so we erase it
 * first. We walk each row of the band and fill the navy SEGMENT nearest the
 * anchor — merging navy runs across letter-sized gaps (so the VTON wordmark
 * holes are filled) but NOT across a wide tan gap to a sleeve. This follows a
 * diagonal/lower stripe and never paints the tan corners of the band bbox, so
 * there is no hard navy rectangle/halo. The target rect is also filled.
 */
export function coverTargetOnBand(
  base: RgbaImage,
  band: PixelRect,
  target: PixelRect,
  anchorXNorm?: number | null,
): RgbaImage {
  const out = new Uint8Array(base.data);
  const [nr, ng, nb] = averageNavyInBand(base, band);
  const xLo = Math.floor(base.width * 0.08);
  const xHi = Math.floor(base.width * 0.92);
  const gap = Math.floor(base.width * MAX_LETTER_GAP_FRAC);
  const anchorX = anchorXNorm != null && Number.isFinite(anchorXNorm)
    ? anchorXNorm * base.width
    : (band.left + band.right) / 2;
  for (let y = band.top; y < band.bottom; y++) {
    if (y < 0 || y >= base.height) continue;
    const runs = rowNavyRuns(base, y, xLo, xHi);
    if (runs.length === 0) continue;
    const segs: NavyRun[] = [];
    for (const run of runs) {
      const last = segs[segs.length - 1];
      if (last && run.start - last.end - 1 <= gap) last.end = run.end;
      else segs.push({ ...run });
    }
    let best = segs[0];
    let bestDist = Infinity;
    for (const s of segs) {
      const mid = (s.start + s.end) / 2;
      const dist = anchorX < s.start ? s.start - anchorX
        : anchorX > s.end ? anchorX - s.end
        : 0;
      const tie = Math.abs(mid - anchorX);
      if (dist < bestDist - 0.5 || (Math.abs(dist - bestDist) <= 0.5 && tie < Math.abs((best.start + best.end) / 2 - anchorX))) {
        best = s;
        bestDist = dist;
      }
    }
    for (let x = best.start; x <= best.end; x++) {
      if (x < 0 || x >= base.width) continue;
      const i = (y * base.width + x) * 4;
      out[i] = nr;
      out[i + 1] = ng;
      out[i + 2] = nb;
      out[i + 3] = 255;
    }
  }
  fillRectNavy(out, base.width, base.height, target, nr, ng, nb);
  return { width: base.width, height: base.height, data: out };
}

export function alphaComposite(
  base: RgbaImage,
  logo: RgbaImage,
  target: PixelRect,
): RgbaImage {
  const out = new Uint8Array(base.data);
  const tw = target.right - target.left;
  const th = target.bottom - target.top;
  const scaled = resizeRgbaBilinear(logo, tw, th);
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

// ---------------------------------------------------------------------------
// Perspective (quad) warp — map a logo onto an arbitrary 4-corner target quad
// (TL, TR, BR, BL). Inverse-map each destination pixel to logo UV and sample
// bilinearly (ImageScript has no perspective transform).
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number };
export type QuadPts = [Point, Point, Point, Point];

function sampleBilinearPt(src: RgbaImage, sx: number, sy: number): [number, number, number, number] {
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
    const v = src.data[i00 + c] * (1 - fx) * (1 - fy) +
      src.data[i10 + c] * fx * (1 - fy) +
      src.data[i01 + c] * (1 - fx) * fy +
      src.data[i11 + c] * fx * fy;
    out[c] = Math.round(v);
  }
  return out;
}

/** Inverse bilinear: pixel (px,py) → (u,v) in quad TL,TR,BR,BL, or null when
 *  outside. u runs TL→TR, v runs TL→BL (Quilez closed form). */
export function invBilinear(
  px: number,
  py: number,
  tl: Point,
  tr: Point,
  br: Point,
  bl: Point,
): { u: number; v: number } | null {
  const ex = tr.x - tl.x;
  const ey = tr.y - tl.y;
  const fx = bl.x - tl.x;
  const fy = bl.y - tl.y;
  const gx = tl.x - tr.x + br.x - bl.x;
  const gy = tl.y - tr.y + br.y - bl.y;
  const hx = px - tl.x;
  const hy = py - tl.y;
  const k2 = gx * fy - gy * fx;
  const k1 = ex * fy - ey * fx + (hx * gy - hy * gx);
  const k0 = hx * ey - hy * ex;
  const uFromV = (v: number): number => {
    const du = ex + gx * v;
    if (Math.abs(du) > 1e-9) return (hx - fx * v) / du;
    const dv = ey + gy * v;
    return Math.abs(dv) > 1e-9 ? (hy - fy * v) / dv : -1;
  };
  let u: number;
  let v: number;
  if (Math.abs(k2) < 1e-9) {
    if (Math.abs(k1) < 1e-12) return null;
    v = -k0 / k1;
    u = uFromV(v);
  } else {
    let w = k1 * k1 - 4 * k0 * k2;
    if (w < 0) return null;
    w = Math.sqrt(w);
    v = (-k1 - w) / (2 * k2);
    u = uFromV(v);
    if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) {
      v = (-k1 + w) / (2 * k2);
      u = uFromV(v);
    }
  }
  if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) return null;
  return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadBbox(q: QuadPts): PixelRect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of q) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  return { left: Math.floor(left), top: Math.floor(top), right: Math.ceil(right), bottom: Math.ceil(bottom) };
}

function scanlineSpan(q: QuadPts, y: number): { xL: number; xR: number } | null {
  const xs: number[] = [];
  for (let k = 0; k < 4; k++) {
    const p1 = q[k];
    const p2 = q[(k + 1) % 4];
    const ylo = Math.min(p1.y, p2.y);
    const yhi = Math.max(p1.y, p2.y);
    if (y < ylo || y > yhi || p1.y === p2.y) continue;
    xs.push(p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x));
  }
  if (xs.length === 0) return null;
  return { xL: Math.round(Math.min(...xs)), xR: Math.round(Math.max(...xs)) };
}

/** Alpha-blend a logo onto the base mapped to a quad (TL,TR,BR,BL), 2–4px feather. */
export function warpQuadAlpha(
  base: RgbaImage,
  logo: RgbaImage,
  quad: QuadPts,
  featherPx = 3,
): RgbaImage {
  const out = new Uint8Array(base.data);
  const [tl, tr, br, bl] = quad;
  const bbox = quadBbox(quad);
  const quadW = (dist(tl, tr) + dist(bl, br)) / 2;
  const quadH = (dist(tl, bl) + dist(tr, br)) / 2;
  const fu = featherPx > 0 ? featherPx / Math.max(1, quadW) : 0;
  const fv = featherPx > 0 ? featherPx / Math.max(1, quadH) : 0;
  for (let y = Math.max(0, bbox.top); y < Math.min(base.height, bbox.bottom); y++) {
    for (let x = Math.max(0, bbox.left); x < Math.min(base.width, bbox.right); x++) {
      const uv = invBilinear(x, y, tl, tr, br, bl);
      if (!uv) continue;
      const [r, g, b, al] = sampleBilinearPt(logo, uv.u * (logo.width - 1), uv.v * (logo.height - 1));
      let a = al / 255;
      if (fu > 0) a *= Math.max(0, Math.min(1, Math.min(uv.u, 1 - uv.u) / fu));
      if (fv > 0) a *= Math.max(0, Math.min(1, Math.min(uv.v, 1 - uv.v) / fv));
      if (a <= 0.003) continue;
      const bi = (y * base.width + x) * 4;
      const ia = 1 - a;
      out[bi] = Math.round(r * a + out[bi] * ia);
      out[bi + 1] = Math.round(g * a + out[bi + 1] * ia);
      out[bi + 2] = Math.round(b * a + out[bi + 2] * ia);
      out[bi + 3] = 255;
    }
  }
  return { width: base.width, height: base.height, data: out };
}

/** Cover the VTON's rendered logo at a manual quad: fill each row of the quad
 *  with the locally-sampled average navy so the double-logo is erased with no
 *  tan halo (the quad sits on the real stripe). */
// Cover expansion: snap the navy cover to the local navy-stripe extent a few px
// beyond the quad, so the VTON mark's overhang and the navy→tan transition just
// outside the quad get covered too. Parameterized ratios, pose-general.
const COVER_ROW_NAVY_FRAC = 0.35;
const COVER_MAX_EXPAND_FRAC = 0.03;
const COVER_SIDE_MARGIN_FRAC = 0.012;
const COVER_FEATHER_PX = 3; // soft feather rows above the snapped band top
// Vertical gap (×height) bridged when tracing a column's stripe bottom, so a
// mid-tone remnant inside the stripe is crossed but the tan body still stops it.
const COVER_BRIDGE_FRAC = 0.006;

function rowNavyFrac(base: RgbaImage, y: number, xL: number, xR: number): number {
  let navy = 0;
  let n = 0;
  for (let x = xL; x <= xR; x++) {
    const i = (y * base.width + x) * 4;
    if (isNavyPixel(base.data[i], base.data[i + 1], base.data[i + 2])) navy++;
    n++;
  }
  return n > 0 ? navy / n : 0;
}

function navyExtentRow(base: RgbaImage, y: number, xL: number, xR: number): { l: number; r: number } | null {
  let l = -1;
  let r = -1;
  for (let x = xL; x <= xR; x++) {
    const i = (y * base.width + x) * 4;
    if (isNavyPixel(base.data[i], base.data[i + 1], base.data[i + 2])) {
      if (l < 0) l = x;
      r = x;
    }
  }
  return l >= 0 ? { l, r } : null;
}

/**
 * Cover the VTON's rendered logo at a manual quad. Snaps the navy cover to the
 * local navy-stripe band: expands vertically to the actual navy extent a few px
 * beyond the quad (covering a descender overhang / the stripe transition), fills
 * each row to the navy horizontal extent unioned with the quad span (following
 * the stripe shape so no tan halo), and feathers the outer transition rows.
 */
export function coverTargetQuad(base: RgbaImage, quad: QuadPts): RgbaImage {
  const out = new Uint8Array(base.data);
  const bbox = quadBbox(quad);
  const xL = Math.max(0, bbox.left - Math.round(base.width * COVER_SIDE_MARGIN_FRAC));
  const xR = Math.min(base.width - 1, bbox.right + Math.round(base.width * COVER_SIDE_MARGIN_FRAC));
  const [nr, ng, nb] = averageNavyInBand(base, {
    left: Math.max(0, bbox.left),
    top: Math.max(0, bbox.top),
    right: Math.min(base.width, bbox.right),
    bottom: Math.min(base.height, bbox.bottom),
  });
  const maxExpand = Math.round(base.height * COVER_MAX_EXPAND_FRAC);

  let top = Math.max(0, bbox.top);
  let bottom = Math.min(base.height, bbox.bottom);
  const upLimit = Math.max(0, top - maxExpand);
  const downLimit = Math.min(base.height, bottom + maxExpand);
  for (let y = top - 1; y >= upLimit; y--) {
    if (rowNavyFrac(base, y, xL, xR) >= COVER_ROW_NAVY_FRAC) top = y;
    else break;
  }
  for (let y = bottom; y < downLimit; y++) {
    if (rowNavyFrac(base, y, xL, xR) >= COVER_ROW_NAVY_FRAC) bottom = y + 1;
    else break;
  }

  const fillRow = (y: number, l: number, r: number, alpha: number) => {
    for (let x = Math.max(0, l); x <= Math.min(base.width - 1, r); x++) {
      const i = (y * base.width + x) * 4;
      if (alpha >= 1) {
        out[i] = nr;
        out[i + 1] = ng;
        out[i + 2] = nb;
      } else {
        const ia = 1 - alpha;
        out[i] = Math.round(nr * alpha + out[i] * ia);
        out[i + 1] = Math.round(ng * alpha + out[i + 1] * ia);
        out[i + 2] = Math.round(nb * alpha + out[i + 2] * ia);
      }
      out[i + 3] = 255;
    }
  };

  // SOLID-fill the snapped band: paint the full per-row span (navy ∪ quad) with
  // no per-pixel skipping, so any mid-tone VTON remnant inside the band is covered.
  let spanL = Infinity;
  let spanR = -Infinity;
  for (let y = top; y < bottom; y++) {
    const insideQuad = y >= bbox.top && y < bbox.bottom;
    const qspan = insideQuad ? scanlineSpan(quad, y) : null;
    const nspan = navyExtentRow(base, y, xL, xR);
    let l = Infinity;
    let r = -Infinity;
    if (qspan) {
      l = Math.min(l, qspan.xL);
      r = Math.max(r, qspan.xR);
    }
    if (nspan) {
      l = Math.min(l, nspan.l);
      r = Math.max(r, nspan.r);
    }
    if (r >= l) {
      fillRow(y, l, r, 1);
      spanL = Math.min(spanL, l);
      spanR = Math.max(spanR, r);
    }
  }
  if (spanR < spanL) {
    spanL = Math.max(0, bbox.left);
    spanR = Math.min(base.width - 1, bbox.right);
  }

  // Above the band: soft feather into the transition.
  for (let k = 1; k <= COVER_FEATHER_PX; k++) {
    const alpha = 1 - k / (COVER_FEATHER_PX + 1);
    const yt = top - k;
    if (yt >= 0) {
      const s = navyExtentRow(base, yt, xL, xR);
      if (s) fillRow(yt, s.l, s.r, alpha);
    }
  }

  // Below the band: follow the PER-COLUMN navy-stripe bottom (the stripe's lower
  // contour — horizontal, diagonal, or curved). For each column, solid-fill navy
  // only down to that column's true stripe lower edge, bridging a small mid-tone
  // remnant gap but never crossing into the tan body. This avoids a flat over-
  // extension / navy bulge below a diagonal stripe.
  const bridge = Math.max(2, Math.round(base.height * COVER_BRIDGE_FRAC));
  for (let x = spanL; x <= spanR; x++) {
    if (x < 0 || x >= base.width) continue;
    let lastNavy = -1;
    let gap = 0;
    for (let y = top; y < downLimit; y++) {
      const i = (y * base.width + x) * 4;
      if (isNavyPixel(base.data[i], base.data[i + 1], base.data[i + 2])) {
        lastNavy = y;
        gap = 0;
      } else if (lastNavy >= 0 && ++gap > bridge) {
        break;
      }
    }
    for (let y = bottom; y <= lastNavy; y++) {
      const i = (y * base.width + x) * 4;
      out[i] = nr;
      out[i + 1] = ng;
      out[i + 2] = nb;
      out[i + 3] = 255;
    }
  }

  return { width: base.width, height: base.height, data: out };
}

export async function decodeToRgba(bytes: Uint8Array): Promise<RgbaImage> {
  const img = await Image.decode(bytes);
  return {
    width: img.width,
    height: img.height,
    data: new Uint8Array(img.bitmap),
  };
}

export async function encodePng(img: RgbaImage): Promise<Uint8Array> {
  const out = new Image(img.width, img.height);
  out.bitmap.set(img.data);
  return await out.encode();
}

export type LogoQuality = {
  upscaled: boolean;
  scale_ratio: number;
  native_height_px: number;
  target_height_px: number;
  stripe_confidence: number | null;
  placement_fallback: boolean;
  quality_warning: boolean;
};

/**
 * Quality flag for the composite. The high-res transparent asset downscales
 * cleanly; a front_crop upscaled past its native cap-height (or below the
 * readable floor) cannot be made crisp. We also warn when the stripe could not
 * be confidently located (so the placement fell back to the SKU bbox).
 */
export function logoQuality(
  nativeHeightPx: number,
  targetHeightPx: number,
  source: "asset" | "front_crop",
  stripeConfidence: number | null = null,
  placementFallback = false,
): LogoQuality {
  const ratio = targetHeightPx / Math.max(1, nativeHeightPx);
  const upscaled = ratio > 1.05;
  const lowRes = nativeHeightPx < MIN_READABLE_CAP_PX;
  const lowConfidence = stripeConfidence != null && stripeConfidence < MIN_STRIPE_CONFIDENCE;
  return {
    upscaled,
    scale_ratio: Math.round(ratio * 100) / 100,
    native_height_px: nativeHeightPx,
    target_height_px: targetHeightPx,
    stripe_confidence: stripeConfidence,
    placement_fallback: placementFallback,
    quality_warning:
      (source === "front_crop" && (upscaled || lowRes)) || placementFallback || lowConfidence,
  };
}

export type LogoCompositeResultLike = {
  method: string;
  logo_source: "asset" | "front_crop";
  band: PixelRect;
  target: PixelRect;
  quality: LogoQuality;
  /** Placement engine outputs (present once the composite consumes the engine). */
  placement_source?: string;
  fallback_reason?: string;
  placement_confidence?: number;
  warp_mode?: string;
  target_quad?: [number, number][];
};

/**
 * Build the persisted `logo_composite` audit metadata from a composite result.
 * The proxy spreads this into composition_recipe_json — keeping it here (and
 * unit-tested in the Vitest mirror) guards against the recipe silently dropping
 * `quality` / `quality_warning` (or the engine placement fields).
 */
export function logoCompositeMetaCore(c: LogoCompositeResultLike): Record<string, unknown> {
  return {
    composite_method: c.method,
    method: c.method,
    logo_source: c.logo_source,
    band: c.band,
    target: c.target,
    target_quad: c.target_quad ?? null,
    warp_mode: c.warp_mode ?? null,
    quality: c.quality,
    quality_warning: c.quality.quality_warning,
    placement_source: c.placement_source ?? null,
    fallback_reason: c.fallback_reason ?? null,
    placement_confidence: c.placement_confidence ?? null,
  };
}

function cropNormBbox(img: RgbaImage, norm: [number, number, number, number]): RgbaImage {
  const [nx, ny, nw, nh] = norm;
  const left = Math.round(nx * img.width);
  const top = Math.round(ny * img.height);
  const w = Math.max(1, Math.round(nw * img.width));
  const h = Math.max(1, Math.round(nh * img.height));
  return cropRgba(img, left, top, w, h);
}


export type ResolvedLogoAssets = {
  placement: LogoPlacement;
  logoBytes: Uint8Array;
  logoSource: "asset" | "front_crop";
  /** Raw product_truth_json blob (parsed by the engine) — carries manual quads. */
  productTruthRaw: unknown;
};

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = { storage: any; from: (t: string) => any };

export async function downloadStoragePath(
  admin: SupabaseAdmin,
  path: string,
): Promise<Uint8Array> {
  const buckets = ["product-assets", "wardrobe-refs"];
  for (const bucket of buckets) {
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (!error && data) return new Uint8Array(await data.arrayBuffer());
  }
  throw new Error(`asset_download_failed:${path}`);
}

export async function resolveLogoAssets(
  admin: SupabaseAdmin,
  wardrobeFeatureId: string,
): Promise<ResolvedLogoAssets | null> {
  const { data: wardrobe } = await admin
    .from("character_features")
    .select("metadata_json")
    .eq("id", wardrobeFeatureId)
    .maybeSingle();

  let placement = parseLogoPlacement(
    (wardrobe?.metadata_json as Record<string, unknown> | null)?.logo_placement,
  );
  let productTruthRaw: unknown =
    (wardrobe?.metadata_json as Record<string, unknown> | null)?.product_truth ?? null;

  let productId: string | null = null;
  if (!placement) {
    const { data: link } = await admin
      .from("product_wardrobe_links")
      .select("product_id")
      .eq("character_feature_id", wardrobeFeatureId)
      .maybeSingle();
    productId = link?.product_id ?? null;
    if (productId) {
      const { data: product } = await admin
        .from("products")
        .select("metadata_json")
        .eq("id", productId)
        .maybeSingle();
      placement = parseLogoPlacement(
        (product?.metadata_json as Record<string, unknown> | null)?.logo_placement,
      );
      productTruthRaw = productTruthRaw ??
        (product?.metadata_json as Record<string, unknown> | null)?.product_truth ?? null;
    }
  } else {
    const { data: link } = await admin
      .from("product_wardrobe_links")
      .select("product_id")
      .eq("character_feature_id", wardrobeFeatureId)
      .maybeSingle();
    productId = link?.product_id ?? null;
  }

  if (!placement) return null;

  let logoBytes: Uint8Array | null = null;
  let logoSource: "asset" | "front_crop" = "front_crop";

  if (placement.logo_asset_id && productId) {
    const { data: logoAsset } = await admin
      .from("product_assets")
      .select("storage_path, file_url")
      .eq("id", placement.logo_asset_id)
      .eq("product_id", productId)
      .maybeSingle();
    const logoPath = logoAsset?.storage_path ?? logoAsset?.file_url;
    if (logoPath) {
      logoBytes = await downloadStoragePath(admin, logoPath);
      logoSource = "asset";
    }
  }

  if (!logoBytes && productId) {
    const frontId = placement.front_asset_id;
    let frontPath: string | null = null;
    if (frontId) {
      const { data: frontAsset } = await admin
        .from("product_assets")
        .select("storage_path, file_url")
        .eq("id", frontId)
        .eq("product_id", productId)
        .maybeSingle();
      frontPath = frontAsset?.storage_path ?? frontAsset?.file_url ?? null;
    }
    if (!frontPath) {
      const { data: frontAsset } = await admin
        .from("product_assets")
        .select("storage_path, file_url")
        .eq("product_id", productId)
        .eq("asset_role", "front")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      frontPath = frontAsset?.storage_path ?? frontAsset?.file_url ?? null;
    }
    if (!frontPath) return null;
    const frontBytes = await downloadStoragePath(admin, frontPath);
    const frontImg = await decodeToRgba(frontBytes);
    const cropped = cropNormBbox(frontImg, placement.source_bbox_norm);
    logoBytes = await encodePng(cropped);
    logoSource = "front_crop";
  }

  if (!logoBytes) return null;

  // If the truth blob wasn't on the wardrobe metadata, pull it from the product.
  if (!productTruthRaw && productId) {
    const { data: prod } = await admin
      .from("products")
      .select("metadata_json")
      .eq("id", productId)
      .maybeSingle();
    productTruthRaw =
      (prod?.metadata_json as Record<string, unknown> | null)?.product_truth ?? null;
  }

  return { placement, logoBytes, logoSource, productTruthRaw };
}
