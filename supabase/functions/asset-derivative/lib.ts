// Pure input rules for asset-derivative, kept free of remote imports so vitest can cover them.
type Box = { x: number; y: number; w: number; h: number }; // fractions of the source, 0..1
export type DerivativeRequest = { assetId: string; box: Box; label: string; note?: string };

/** Pixel rectangle for a fractional box; refuses degenerate or out-of-range boxes. */
export function pixelBox(box: unknown, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
  const b = box as Partial<Box> | null;
  const f = [b?.x, b?.y, b?.w, b?.h];
  if (!b || f.some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  const { x, y, w, h } = b as Box;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) return null;
  const px = Math.round(x * width), py = Math.round(y * height);
  const pw = Math.min(width - px, Math.round(w * width)), ph = Math.min(height - py, Math.round(h * height));
  return pw >= 16 && ph >= 16 ? { x: px, y: py, w: pw, h: ph } : null;
}

export function cleanLabel(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const l = label.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return l.length >= 2 ? l : null;
}


/** Largest source we will decode: 40 megapixels (imagescript expands to RGBA, 4 bytes per pixel = 160 MB). */
export const MAX_SOURCE_PIXELS = 40_000_000;

/**
 * Width/height read from the first bytes of a PNG, JPEG or WebP without decoding; null when the header is not one
 * of those. Used to refuse decode bombs (a 12 MB PNG can declare 30000x30000 and expand to 3.6 GB) before decoding.
 */
export function headerDimensions(b: Uint8Array): { width: number; height: number; kind: "png" | "jpeg" | "webp" } | null {
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && String.fromCharCode(b[12], b[13], b[14], b[15]) === "IHDR") {
    return { width: u32(16), height: u32(20), kind: "png" };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { i += 2; continue; }
      const len = u16(i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: u16(i + 5), width: u16(i + 7), kind: "jpeg" };
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  if (b.length >= 30 && String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === "VP8X") return { width: u24le(24) + 1, height: u24le(27) + 1, kind: "webp" };
    if (chunk === "VP8L") return { width: (b[21] | ((b[22] & 0x3f) << 8)) + 1, height: ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) + 1, kind: "webp" };
    if (chunk === "VP8 ") return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff, kind: "webp" };
  }
  return null;
}
