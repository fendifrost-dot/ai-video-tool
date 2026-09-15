/**
 * Pure pixel helpers for Lane E visual evaluation.
 * No Architecture C paint / occlusion imports.
 */

import type { PixelBox, Point, QuadPts, RgbaImage } from "./types";

export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function lumaAt(img: RgbaImage, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return luma(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
}

export function rgbAt(img: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
}

export function pixelsMatch(a: RgbaImage, b: RgbaImage, x: number, y: number): boolean {
  const i = (y * a.width + x) * 4;
  return (
    a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2]
  );
}

export function cloneRgba(img: RgbaImage): RgbaImage {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

export function solidRgba(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

export function fillRect(img: RgbaImage, box: PixelBox, r: number, g: number, b: number): void {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.min(box.x0, box.x1)));
  const x1 = Math.max(0, Math.min(img.width - 1, Math.max(box.x0, box.x1)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.min(box.y0, box.y1)));
  const y1 = Math.max(0, Math.min(img.height - 1, Math.max(box.y0, box.y1)));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
}

/** Even-odd point-in-polygon. Call with pixel centers (x+0.5, y+0.5). */
export function pointInPolygon(px: number, py: number, pts: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x;
    const yi = pts[i]!.y;
    const xj = pts[j]!.x;
    const yj = pts[j]!.y;
    const denom = yj - yi;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (denom === 0 ? 1 : denom) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInQuad(x: number, y: number, quad: QuadPts): boolean {
  return pointInPolygon(x + 0.5, y + 0.5, quad);
}

export function quadFromNorm(
  width: number,
  height: number,
  norm: [[number, number], [number, number], [number, number], [number, number]],
): QuadPts {
  return norm.map(([nx, ny]) => ({ x: nx * width, y: ny * height })) as QuadPts;
}

/** Scale a box defined on a 720×1280 reference frame onto the actual image. */
export function scaleBox(
  box: PixelBox,
  width: number,
  height: number,
  refW = 720,
  refH = 1280,
): PixelBox {
  return {
    x0: Math.round((box.x0 * width) / refW),
    x1: Math.round((box.x1 * width) / refW),
    y0: Math.round((box.y0 * height) / refH),
    y1: Math.round((box.y1 * height) / refH),
  };
}

export function clampBox(box: PixelBox, width: number, height: number): PixelBox {
  return {
    x0: Math.max(0, Math.min(width - 1, Math.min(box.x0, box.x1))),
    x1: Math.max(0, Math.min(width - 1, Math.max(box.x0, box.x1))),
    y0: Math.max(0, Math.min(height - 1, Math.min(box.y0, box.y1))),
    y1: Math.max(0, Math.min(height - 1, Math.max(box.y0, box.y1))),
  };
}

export function cropRgba(img: RgbaImage, box: PixelBox): RgbaImage {
  const b = clampBox(box, img.width, img.height);
  const width = b.x1 - b.x0 + 1;
  const height = b.y1 - b.y0 + 1;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = ((b.y0 + y) * img.width + (b.x0 + x)) * 4;
      const di = (y * width + x) * 4;
      data[di] = img.data[si]!;
      data[di + 1] = img.data[si + 1]!;
      data[di + 2] = img.data[si + 2]!;
      data[di + 3] = img.data[si + 3]!;
    }
  }
  return { width, height, data };
}

/** |Δluma| × 2, clipped, as grayscale RGB. */
export function absDiffLuma(source: RgbaImage, output: RgbaImage): RgbaImage {
  const width = Math.min(source.width, output.width);
  const height = Math.min(source.height, output.height);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.min(
        255,
        Math.round(Math.abs(lumaAt(output, x, y) - lumaAt(source, x, y)) * 2),
      );
      const i = (y * width + x) * 4;
      data[i] = d;
      data[i + 1] = d;
      data[i + 2] = d;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function countChangedOutsideRows(
  source: RgbaImage,
  output: RgbaImage,
  yBelowExclusive: number,
  yAboveExclusive: number,
): number {
  const w = Math.min(source.width, output.width);
  const h = Math.min(source.height, output.height);
  let changed = 0;
  for (let y = 0; y < h; y++) {
    if (y >= yBelowExclusive && y <= yAboveExclusive) continue;
    for (let x = 0; x < w; x++) {
      if (!pixelsMatch(source, output, x, y)) changed++;
    }
  }
  return changed;
}

/** Binary PPM (P6). Portable, no compression deps. */
export function encodePpm(img: RgbaImage): Uint8Array {
  const header = new TextEncoder().encode(`P6\n${img.width} ${img.height}\n255\n`);
  const rgb = new Uint8Array(img.width * img.height * 3);
  for (let p = 0, q = 0; p < img.data.length; p += 4) {
    rgb[q++] = img.data[p]!;
    rgb[q++] = img.data[p + 1]!;
    rgb[q++] = img.data[p + 2]!;
  }
  const out = new Uint8Array(header.length + rgb.length);
  out.set(header, 0);
  out.set(rgb, header.length);
  return out;
}

/** Uncompressed 24-bit BMP (bottom-up BGR). Opens without extra deps. */
export function encodeBmp24(img: RgbaImage): Uint8Array {
  const w = img.width;
  const h = img.height;
  const rowStride = (w * 3 + 3) & ~3;
  const pixelSize = rowStride * h;
  const out = new Uint8Array(54 + pixelSize);
  const view = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  view.setUint32(2, out.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, h, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelSize, true);
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y;
    let p = 54 + y * rowStride;
    for (let x = 0; x < w; x++) {
      const i = (srcY * w + x) * 4;
      out[p++] = img.data[i + 2]!;
      out[p++] = img.data[i + 1]!;
      out[p++] = img.data[i]!;
    }
  }
  return out;
}
