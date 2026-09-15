/**
 * Isolated raster helpers for visible sleeve-panel repair.
 * Not a chest-band / Architecture C cover path.
 */

import type { BinaryMask, NormBbox, Point, QuadNorm, QuadPts, RgbaImage } from "./types";

export function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function createRgba(width: number, height: number, r: number, g: number, b: number, a = 255): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = a;
  }
  return { width, height, data };
}

export function cloneRgba(img: RgbaImage): RgbaImage {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

export function createMask(width: number, height: number, fill = 0): BinaryMask {
  const data = new Uint8Array(width * height);
  if (fill) data.fill(fill);
  return { width, height, data };
}

export function cloneMask(mask: BinaryMask): BinaryMask {
  return { width: mask.width, height: mask.height, data: new Uint8Array(mask.data) };
}

export function fillRect(
  img: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
): void {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(img.width, Math.ceil(x1));
  const bottom = Math.min(img.height, Math.ceil(y1));
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
}

export function fillMaskRect(
  mask: BinaryMask,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: 0 | 1,
): void {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(mask.width, Math.ceil(x1));
  const bottom = Math.min(mask.height, Math.ceil(y1));
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      mask.data[y * mask.width + x] = value;
    }
  }
}

export function countMask(mask: BinaryMask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) n++;
  return n;
}

export function intersectMasks(a: BinaryMask, b: BinaryMask): BinaryMask {
  assertSameSize(a, b, "mask");
  const out = createMask(a.width, a.height);
  for (let i = 0; i < a.data.length; i++) out.data[i] = a.data[i] && b.data[i] ? 1 : 0;
  return out;
}

export function subtractMasks(a: BinaryMask, b: BinaryMask): BinaryMask {
  assertSameSize(a, b, "mask");
  const out = createMask(a.width, a.height);
  for (let i = 0; i < a.data.length; i++) out.data[i] = a.data[i] && !b.data[i] ? 1 : 0;
  return out;
}

export function unionMasks(a: BinaryMask, b: BinaryMask): BinaryMask {
  assertSameSize(a, b, "mask");
  const out = createMask(a.width, a.height);
  for (let i = 0; i < a.data.length; i++) out.data[i] = a.data[i] || b.data[i] ? 1 : 0;
  return out;
}

export function assertSameSize(
  a: { width: number; height: number },
  b: { width: number; height: number },
  label: string,
): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`${label}_size_mismatch:${a.width}x${a.height}!=${b.width}x${b.height}`);
  }
}

export function isQuadNorm(v: unknown): v is QuadNorm {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1),
    )
  );
}

export function isNormBbox(v: unknown): v is NormBbox {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) &&
    v[2] > 0 &&
    v[3] > 0 &&
    v[0] + v[2] <= 1 + 1e-9 &&
    v[1] + v[3] <= 1 + 1e-9
  );
}

export function quadNormToPts(quad: QuadNorm, width: number, height: number): QuadPts {
  return quad.map(([x, y]) => ({ x: x * width, y: y * height })) as QuadPts;
}

export function quadPtsToNorm(quad: QuadPts, width: number, height: number): QuadNorm {
  return quad.map((p) => [clamp01(p.x / width), clamp01(p.y / height)]) as QuadNorm;
}

/**
 * Inverse bilinear map (Iqilez). Returns null when (px, py) is outside the quad.
 */
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
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      v = (-k1 + w) / (2 * k2);
      u = uFromV(v);
    }
  }
  if (u < -1e-6 || u > 1 + 1e-6 || v < -1e-6 || v > 1 + 1e-6) return null;
  return { u: clamp01(u), v: clamp01(v) };
}

export function rasterizeQuadMask(width: number, height: number, quad: QuadPts): BinaryMask {
  const mask = createMask(width, height);
  const [tl, tr, br, bl] = quad;
  const left = Math.max(0, Math.floor(Math.min(tl.x, tr.x, br.x, bl.x)));
  const top = Math.max(0, Math.floor(Math.min(tl.y, tr.y, br.y, bl.y)));
  const right = Math.min(width, Math.ceil(Math.max(tl.x, tr.x, br.x, bl.x)));
  const bottom = Math.min(height, Math.ceil(Math.max(tl.y, tr.y, br.y, bl.y)));
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const uv = invBilinear(x + 0.5, y + 0.5, tl, tr, br, bl);
      if (!uv) continue;
      mask.data[y * width + x] = 1;
    }
  }
  return mask;
}

export function cropNormBbox(img: RgbaImage, bbox: NormBbox): RgbaImage {
  const [nx, ny, nw, nh] = bbox;
  const sx = Math.max(0, Math.floor(nx * img.width));
  const sy = Math.max(0, Math.floor(ny * img.height));
  const w = Math.max(1, Math.min(img.width - sx, Math.ceil(nw * img.width)));
  const h = Math.max(1, Math.min(img.height - sy, Math.ceil(nh * img.height)));
  const out = createRgba(w, h, 0, 0, 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((sy + y) * img.width + (sx + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

export function sampleNearest(img: RgbaImage, u: number, v: number): [number, number, number, number] {
  const x = Math.max(0, Math.min(img.width - 1, Math.round(clamp01(u) * (img.width - 1))));
  const y = Math.max(0, Math.min(img.height - 1, Math.round(clamp01(v) * (img.height - 1))));
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

export function pixelAt(img: RgbaImage, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

export function rgbaFingerprint(img: RgbaImage): string {
  let h = 2166136261;
  for (let i = 0; i < img.data.length; i++) {
    h ^= img.data[i];
    h = Math.imul(h, 16777619);
  }
  return `${img.width}x${img.height}:${(h >>> 0).toString(16)}`;
}
