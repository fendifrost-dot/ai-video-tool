/**
 * Region swap — swap a piece of his wardrobe inside a BOX of a clip, not across the whole frame.
 *
 * Why (17 Oct 2026): the object swap (Genjutsu, dress-clip) changes what is big in the picture. On a wide montage his
 * shoes are a few dozen pixels — c044's Nikes at the far pillar and c045's sneakers by the walrus came back
 * unchanged — and in a crowd it changes other people too (c041's dice players). So the box around the piece is cut
 * out of the clip and ENLARGED to the clip's own frame, the swap is made on that (the shoes now fill it, and nobody
 * outside the box is in it), and the swapped picture is put back into the box over the original with a soft edge.
 * Everything outside the box is the original footage, pixel for pixel.
 *
 * Pure: the box on the frame, the put-back weights, the timing. The rendering is render.ts; the filing is file.ts.
 */

export const REGION_SWAP_VERSION = "region-swap-v2-2026-10-17";

/** A box on the clip's frame, 0–1 of its width and height. */
export type Box = { x: number; y: number; w: number; h: number };
/** A box in pixels: even numbers, inside the frame. */
export type PixelRect = { x: number; y: number; w: number; h: number };

/** The smallest box worth enlarging (a quarter of the frame's width): smaller is upscaled past what the swap can read. */
export const MIN_BOX_FRACTION = 0.25;
/** The soft edge the swapped picture is blended in over, as a fraction of the box's shorter side. */
export const FEATHER_FRACTION = 0.12;
/** How long the swap fades in and out at the ends of its window, seconds. */
export const WINDOW_FADE_SECONDS = 0.08;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * The box as it is cut: grown to the frame's own shape around its centre (so the crop enlarges to the frame without
 * stretching), never smaller than MIN_BOX_FRACTION of the frame, moved — not shrunk — to lie inside it, in even
 * pixels. The model sees exactly this rectangle, enlarged to `width`×`height`.
 */
export function cropRect(box: Box, width: number, height: number): PixelRect {
  if (!(width > 0 && height > 0)) throw new Error("the clip's size is not known");
  if (!(box.w > 0 && box.h > 0)) throw new Error("the box is empty");
  const aspect = width / height;
  const cx = (box.x + box.w / 2) * width;
  const cy = (box.y + box.h / 2) * height;
  let w = box.w * width;
  let h = box.h * height;
  // the frame's shape, around the box's centre: grow the short side
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  const minW = width * MIN_BOX_FRACTION;
  if (w < minW) {
    w = minW;
    h = w / aspect;
  }
  if (w > width) {
    w = width;
    h = height;
  }
  w = Math.min(width, even(w));
  h = Math.min(height, even(w / aspect));
  const x = Math.max(0, Math.min(width - w, Math.round(cx - w / 2)));
  const y = Math.max(0, Math.min(height - h, Math.round(cy - h / 2)));
  return { x: x - (x % 2), y: y - (y % 2), w, h };
}

/** The pixel rectangle back as a 0–1 box (what is recorded and sent with the swap). */
export function boxOf(rect: PixelRect, width: number, height: number): Box {
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return {
    x: r(rect.x / width),
    y: r(rect.y / height),
    w: r(rect.w / width),
    h: r(rect.h / height),
  };
}

/**
 * How far the swapped picture is blended in at a point of the box: 1 inside, falling smoothly to 0 at its edges.
 * A side of the box that lies on the frame's own border (given `frame`) is not faded: there is no original picture
 * beyond it to meet, and fading it would bring the original back exactly where the piece runs out of frame.
 */
export function edgeWeight(
  px: number,
  py: number,
  rect: PixelRect,
  feather: number,
  frame?: { width: number; height: number },
): number {
  if (px < rect.x || px > rect.x + rect.w - 1 || py < rect.y || py > rect.y + rect.h - 1) return 0;
  const open = (onBorder: boolean, d: number) => (onBorder ? Infinity : d);
  const dx = Math.min(
    open(!!frame && rect.x <= 0, px - rect.x),
    open(!!frame && rect.x + rect.w >= frame.width, rect.x + rect.w - 1 - px),
  );
  const dy = Math.min(
    open(!!frame && rect.y <= 0, py - rect.y),
    open(!!frame && rect.y + rect.h >= frame.height, rect.y + rect.h - 1 - py),
  );
  const d = Math.min(dx, dy);
  if (feather <= 0 || d >= feather) return 1;
  const t = d / feather;
  return t * t * (3 - 2 * t); // smoothstep: no visible line where the blend starts
}

/** The feather for a box, in pixels. */
export function featherFor(rect: PixelRect): number {
  return Math.max(2, Math.round(Math.min(rect.w, rect.h) * FEATHER_FRACTION));
}

/** How much of the swap shows at a moment of the clip: 1 inside its window, faded at the ends; the whole clip when null. */
export function windowWeight(seconds: number, window: [number, number] | null): number {
  if (!window) return 1;
  const [a, b] = window;
  if (seconds < a - WINDOW_FADE_SECONDS || seconds > b + WINDOW_FADE_SECONDS) return 0;
  if (seconds < a) return (seconds - (a - WINDOW_FADE_SECONDS)) / WINDOW_FADE_SECONDS;
  if (seconds > b) return (b + WINDOW_FADE_SECONDS - seconds) / WINDOW_FADE_SECONDS;
  return 1;
}

/** A box from text: "x,y,w,h" in 0–1 (a page link, the agent's press). Null when it is not one. */
export function parseBox(text: string | null | undefined): Box | null {
  if (!text) return null;
  const n = text.split(",").map((v) => Number(v.trim()));
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  const [x, y, w, h] = n;
  if (!(w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= 1.0001 && y + h <= 1.0001)) return null;
  return { x, y, w, h };
}

/** A window from text: "a,b" seconds. Null when absent or not one. */
export function parseWindow(text: string | null | undefined): [number, number] | null {
  if (!text) return null;
  const n = text.split(",").map((v) => Number(v.trim()));
  if (n.length !== 2 || n.some((v) => !Number.isFinite(v)) || !(n[1] > n[0]) || n[0] < 0)
    return null;
  return [n[0], n[1]];
}
