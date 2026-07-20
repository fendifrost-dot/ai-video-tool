/**
 * Canvas ↔ RgbaImage bridge for the browser-side composites (eyewear restore,
 * face restore). Kept apart from the pure pixel helpers so those stay testable
 * in Vitest without a DOM.
 */

import type { RgbaImage } from "./logoComposite";

/** Load an image URL into an RGBA buffer via canvas (CORS-clean signed URLs). */
export async function loadRgba(url: string): Promise<RgbaImage> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Image load failed: ${url.slice(0, 80)}`));
    img.src = url;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error("Image has no dimensions");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: new Uint8Array(id.data) };
}

export async function rgbaToPngBlob(img: RgbaImage): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Canvas toBlob failed");
  return blob;
}
