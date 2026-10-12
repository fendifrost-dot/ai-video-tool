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

