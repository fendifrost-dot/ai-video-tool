/**
 * Architecture C still-repair occlusion + mask gating.
 *
 * Pure / dependency-free so Vitest and the Deno edge share the same math.
 * SAM-3 masks arrive as masked RGB (region visible, rest black) — same as
 * grokOutfitLock.sam3MaskedRgbToAlpha membership rule.
 *
 * Target alpha:
 *   garment/outfit − dilate(hands) − dilate(face/head)
 */

export type RgbaImage = { width: number; height: number; data: Uint8Array };

export type Point = { x: number; y: number };
export type QuadPts = [Point, Point, Point, Point];

export type OcclusionSource =
  | "sam3"
  | "skin_heuristic_fallback"
  | "none"
  | "unavailable";

/** SAM-3 masked RGB → α ∈ [0,1] (membership, not luma). */
export function sam3MaskedRgbToAlpha(masked: RgbaImage): Float32Array {
  const n = masked.width * masked.height;
  const alpha = new Float32Array(n);
  const d = masked.data;
  const BLACK_EPS = 8;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const maxCh = Math.max(d[o]!, d[o + 1]!, d[o + 2]!);
    alpha[i] = maxCh > BLACK_EPS ? 1 : 0;
  }
  return alpha;
}

/** Separable box max-dilate (same contract as maskMorphology.dilateAlpha). */
export function dilateAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
): Float32Array {
  if (radiusPx <= 0) return alpha;
  const r = Math.max(1, Math.round(radiusPx));
  const scratch = new Float32Array(alpha.length);
  const out = new Float32Array(alpha.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        const v = alpha[row + xx]!;
        if (v > m) m = v;
      }
      scratch[row + x] = m;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        const v = scratch[yy * width + x]!;
        if (v > m) m = v;
      }
      out[y * width + x] = m;
    }
  }
  return out;
}

export function subtractAlpha(base: Float32Array, guard: Float32Array): Float32Array {
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) {
    out[i] = Math.max(0, base[i]! - guard[i]!);
  }
  return out;
}

/**
 * Build compositing α = outfit − dilate(hands) − dilate(face).
 * Missing occluder maps are treated as empty (no subtraction).
 */
export function buildOutfitMinusOccludersAlpha(input: {
  width: number;
  height: number;
  outfit: Float32Array;
  hands?: Float32Array | null;
  face?: Float32Array | null;
  dilatePx?: number;
}): Float32Array {
  const { width, height, outfit } = input;
  const dilatePx = input.dilatePx ?? 12;
  let a = new Float32Array(outfit);
  if (input.hands && input.hands.length === outfit.length) {
    a = subtractAlpha(a, dilateAlpha(input.hands, width, height, dilatePx));
  }
  if (input.face && input.face.length === outfit.length) {
    a = subtractAlpha(a, dilateAlpha(input.face, width, height, dilatePx));
  }
  return a;
}

/**
 * Blend repaired onto source using α (repair only where α high).
 * out = source·(1−α) + repaired·α
 */
export function applyOcclusionAlphaComposite(
  source: RgbaImage,
  repaired: RgbaImage,
  alpha: Float32Array,
): RgbaImage {
  if (source.width !== repaired.width || source.height !== repaired.height) {
    throw new Error("occlusion_size_mismatch");
  }
  if (alpha.length !== source.width * source.height) {
    throw new Error("occlusion_alpha_size_mismatch");
  }
  const out = new Uint8Array(source.data.length);
  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    const a = Math.max(0, Math.min(1, alpha[i]!));
    const ia = 1 - a;
    out[p] = Math.round(source.data[p]! * ia + repaired.data[p]! * a);
    out[p + 1] = Math.round(source.data[p + 1]! * ia + repaired.data[p + 1]! * a);
    out[p + 2] = Math.round(source.data[p + 2]! * ia + repaired.data[p + 2]! * a);
    out[p + 3] = 255;
  }
  return { width: source.width, height: source.height, data: out };
}

/**
 * Expand a band quad along its thickness (average of top→bottom edge normals
 * inverted for the top edge). Keeps a narrow tilted band a narrow tilted band.
 */
export function expandQuadAlongBandNormal(quad: QuadPts, expandPx: number): QuadPts {
  const [tl, tr, br, bl] = quad;
  const downX = (bl.x - tl.x + (br.x - tr.x)) / 2;
  const downY = (bl.y - tl.y + (br.y - tr.y)) / 2;
  const len = Math.hypot(downX, downY) || 1;
  const nx = downX / len;
  const ny = downY / len;
  const e = Math.max(0, expandPx);
  return [
    { x: tl.x - nx * e, y: tl.y - ny * e },
    { x: tr.x - nx * e, y: tr.y - ny * e },
    { x: br.x + nx * e, y: br.y + ny * e },
    { x: bl.x + nx * e, y: bl.y + ny * e },
  ];
}

/** Axis-aligned bbox of pixels with α > thresh inside the requested band bbox. */
export function effectivePaintBBoxFromAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  bandBBox: { left: number; top: number; right: number; bottom: number },
  thresh = 0.5,
): { left: number; top: number; right: number; bottom: number; pixel_count: number } | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let count = 0;
  const x0 = Math.max(0, Math.floor(bandBBox.left));
  const x1 = Math.min(width - 1, Math.ceil(bandBBox.right));
  const y0 = Math.max(0, Math.floor(bandBBox.top));
  const y1 = Math.min(height - 1, Math.ceil(bandBBox.bottom));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (alpha[y * width + x]! <= thresh) continue;
      count++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (count === 0) return null;
  return { left, top, right, bottom, pixel_count: count };
}

export function quadToNormPairs(
  quad: QuadPts,
  width: number,
  height: number,
): [[number, number], [number, number], [number, number], [number, number]] {
  const n = (p: Point): [number, number] => [
    Math.max(0, Math.min(1, p.x / Math.max(1, width))),
    Math.max(0, Math.min(1, p.y / Math.max(1, height))),
  ];
  return [n(quad[0]), n(quad[1]), n(quad[2]), n(quad[3])];
}

/** Nearest-neighbor α resize (align SAM mask to frame). */
export function resizeAlphaNearest(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  if (srcW === dstW && srcH === dstH) return new Float32Array(src);
  const out = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / dstW));
      out[y * dstW + x] = src[sy * srcW + sx]!;
    }
  }
  return out;
}
