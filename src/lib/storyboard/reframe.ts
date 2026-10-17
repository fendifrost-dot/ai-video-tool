/**
 * A shot's reframe — a punch-in on its media, decided in the edit (Fendi, 2026-10-17: "if the shot comes out good
 * except the pants we can edit the zoom or angle to get them out the frame. We don't always need to regenerate
 * shots if we have enough good to work with").
 *
 * Stored on the shot as `override_json.reframe = { scale, x, y }` (the key `framing` there is already the shot's
 * framing vocabulary — wide, close-up …). `scale` is the zoom (1 = as filmed), `x`/`y` the centre of what is kept,
 * as fractions of the source picture.
 *
 * What it means, in one rule both the player and the renderer follow: a reframe picks a RECT OF THE SOURCE, and that
 * rect is then fitted whole into the frame exactly as an unframed picture is (aspect.ts: "contain"). The rect is the
 * part of the source a zoom of `scale` about (x, y) leaves in the frame; it is clamped inside the source, so a
 * reframe never shows anything the footage does not have. On footage the frame's own shape the rect keeps that
 * shape; on footage of another shape a zoom first fills the bars, then crops.
 *
 * Pure module: the board's preview (SequencePlayer) and the render contract (renderContract.ts → scripts/render)
 * both read it.
 */

export type ShotReframe = {
  /** Zoom, 1 (as filmed) to REFRAME_MAX_SCALE. */
  scale: number;
  /** The centre of what is kept, as fractions of the source's width and height (0.5 / 0.5 = the middle). */
  x: number;
  y: number;
};

export const IDENTITY_REFRAME: ShotReframe = { scale: 1, x: 0.5, y: 0.5 };
/** The most a picture can be pushed in on and still be the same picture. The card offers up to 2×. */
export const REFRAME_MAX_SCALE = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const finite = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Any value → a reframe in range (identity for anything that is not one). */
export function normalizeReframe(value: unknown): ShotReframe {
  if (!value || typeof value !== "object") return IDENTITY_REFRAME;
  const v = value as Record<string, unknown>;
  return {
    scale: round4(clamp(finite(v.scale, 1), 1, REFRAME_MAX_SCALE)),
    x: round4(clamp(finite(v.x, 0.5), 0, 1)),
    y: round4(clamp(finite(v.y, 0.5), 0, 1)),
  };
}

/** True when the reframe leaves the picture as filmed (at a zoom of 1 the centre does not matter). */
export function isIdentityReframe(value: unknown): boolean {
  return normalizeReframe(value).scale <= 1;
}

/** A stored value → the reframe it states, or null when it states none (nothing to keep on the shot). */
export function parseReframe(value: unknown): ShotReframe | null {
  const r = normalizeReframe(value);
  return r.scale <= 1 ? null : r;
}

export type SourceRect = { sx: number; sy: number; sw: number; sh: number };

/**
 * The rect of a `srcW` × `srcH` source a reframe keeps, in source pixels — fitted whole into a frame of `frame`'s
 * shape it is what the shot shows. Without a frame the frame is taken to be the source's own shape (a plain crop).
 *
 * The zoom is about the picture as it sits in the frame: at `scale` the fitted picture is `scale` times larger, and
 * the rect is what of it is still inside the frame. On each side it is the smaller of the whole source and the
 * frame's span at that zoom; its centre is (x, y), moved only as far as it takes to keep the rect inside the source.
 */
export function reframeRect(srcW: number, srcH: number, reframe: unknown, frame?: { width: number; height: number }): SourceRect {
  const r = normalizeReframe(reframe);
  const fr = frame && frame.width > 0 && frame.height > 0 ? frame.width / frame.height : srcW / srcH;
  // the frame's span on each side, in source pixels, at a zoom of 1 (contain: the larger of the source and that)
  const sw = Math.min(srcW, Math.max(srcW, srcH * fr) / r.scale);
  const sh = Math.min(srcH, Math.max(srcH, srcW / fr) / r.scale);
  return { sx: clamp(r.x * srcW - sw / 2, 0, srcW - sw), sy: clamp(r.y * srcH - sh / 2, 0, srcH - sh), sw, sh };
}

/**
 * Where the WHOLE source sits in the frame so that its reframe rect shows fitted whole — percentages of the frame,
 * for a media element positioned absolutely inside a frame that hides its overflow. Null for an identity reframe
 * (the element keeps its ordinary whole-picture fit). The overflow is only ever on a side the rect crops, and on
 * that side the rect fills the frame, so the frame's own edge is the crop.
 */
export function reframeStyle(
  srcW: number,
  srcH: number,
  reframe: unknown,
  frame: { width: number; height: number },
): { left: number; top: number; width: number; height: number } | null {
  if (isIdentityReframe(reframe) || !(srcW > 0 && srcH > 0 && frame.width > 0 && frame.height > 0)) return null;
  const { sx, sy, sw, sh } = reframeRect(srcW, srcH, reframe, frame);
  const k = Math.min(frame.width / sw, frame.height / sh);
  const left = (frame.width - sw * k) / 2 - sx * k;
  const top = (frame.height - sh * k) / 2 - sy * k;
  return { left: (left / frame.width) * 100, top: (top / frame.height) * 100, width: ((srcW * k) / frame.width) * 100, height: ((srcH * k) / frame.height) * 100 };
}
