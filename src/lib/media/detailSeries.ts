/**
 * Every frame of a clip reduced to what a picture's SHAPE is measured from — how sharp it is where, how much of it
 * moved since the frame before, and how its light sits. frameSeries.ts reduces a frame to colour (where the light
 * is); faceSeries.ts reads one face. This reads the rest: focus, blur, camera movement, clipping.
 *
 * Why a third series rather than more of the second: colour cells are a 12 × 12 mean, which cannot see sharpness at
 * all (a blurred frame and a sharp one average the same). Sharpness needs real pixels, so this draws a larger raster
 * and keeps a per-tile reading, which is also what lets the analyzer ask "is the background softer than the man" —
 * a question neither existing series can answer.
 *
 * No media element: frames come from eachFrame (byte range + WebCodecs), the same path the other two use.
 *
 * What it does NOT claim. The shift below is the whole frame's best WHOLE-PIXEL translation, which is not camera
 * motion: a man crossing a still frame moves most of the picture too. Separating the two is the analyzer's job, from
 * `shift` and `borderShift` together, and it is allowed to answer "cannot tell". Nothing here estimates depth,
 * focal length, or rotation of the camera.
 */
import type { Mp4Track } from "./mp4";
import type { RangeRead } from "./probe";
import { eachFrame } from "./frameSeries";

/** The frame is drawn this many pixels on its longer side before anything is measured. */
export const DETAIL_SIDE = 256;
/** …and read as this many tiles across and down. 8 × 8 = 64 readings of a frame. */
export const DETAIL_TILES = 8;
/** The raster matched against the frame before, to find how far the picture moved. */
const MATCH_SIDE = 64;
/** The furthest the picture is looked for, in cells of that raster (≈ 12 % of the frame). */
const MATCH_RADIUS = 8;
/** At or below this the picture is black; at or above it, white. 8-bit, out of 255. */
const BLACK = 6;
const WHITE = 249;

/**
 * One frame's shape.
 *
 * `sharp` is DETAIL_TILES² readings, row by row: the mean absolute Laplacian of luma in that tile, 0–1. It is a
 * relative measure — a number that is only meaningful against other tiles of the same clip, or the same tile over
 * time. It is not "lines per millimetre" and is not comparable between clips of different size or compression.
 */
export type DetailFrame = {
  t: number;
  sharp: number[];
  /** Mean luma of the frame, 0–1, and the share of pixels crushed to black or blown to white. */
  luma: number;
  clipLow: number;
  clipHigh: number;
  /**
   * Where the whole picture best matches the frame before, as a share of the frame's width and height. Null on the
   * first frame, and whenever the match is no better than no shift at all.
   */
  shift: [number, number] | null;
  /** The same, found from the frame's BORDER only — the part a man in the middle is least likely to occupy. */
  borderShift: [number, number] | null;
  /** How much of the picture did not follow `shift`: mean absolute luma difference after it, 0–1. */
  residual: number | null;
};

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function canvasOf(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx } {
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new Error("this browser gave no canvas to measure on");
  return { canvas, ctx };
}

/** Luma 0–255 of an rgba raster, one byte per pixel. Pure — exported for its test. */
export function lumaOf(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba.length >> 2);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    out[p] = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) | 0;
  }
  return out;
}

/**
 * Mean absolute Laplacian per tile, 0–1. The Laplacian of a blurred edge is small and of a crisp one large, so this
 * is the ordinary "is it in focus" reading — with the ordinary caveat that a tile of flat wall reads low because
 * there is nothing in it to be sharp, not because it is soft. Pure — exported for its test.
 */
export function sharpTiles(luma: Uint8Array, w: number, h: number, tiles: number): number[] {
  const out = new Array<number>(tiles * tiles).fill(0);
  const counts = new Array<number>(tiles * tiles).fill(0);
  for (let y = 1; y < h - 1; y++) {
    const ty = Math.min(tiles - 1, ((y * tiles) / h) | 0);
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = Math.abs(4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w]);
      const k = ty * tiles + Math.min(tiles - 1, ((x * tiles) / w) | 0);
      out[k] += lap;
      counts[k]++;
    }
  }
  for (let k = 0; k < out.length; k++)
    out[k] = counts[k] ? Math.round((out[k] / counts[k] / 255) * 10000) / 10000 : 0;
  return out;
}

/**
 * The [dx, dy] in cells that best lines `now` up with `before`, searched to ±`radius`, and the mean absolute
 * difference it leaves. `mask`, when given, is the only cells compared (1 = compare). Null when no shift beats
 * staying put. Pure — exported for its test.
 */
export function bestShift(
  before: Uint8Array,
  now: Uint8Array,
  side: number,
  radius: number,
  mask?: Uint8Array,
): { shift: [number, number]; residual: number } | null {
  const score = (dx: number, dy: number): number => {
    let sum = 0;
    let n = 0;
    for (let y = Math.max(0, -dy); y < Math.min(side, side - dy); y++) {
      for (let x = Math.max(0, -dx); x < Math.min(side, side - dx); x++) {
        const i = y * side + x;
        if (mask && !mask[i]) continue;
        sum += Math.abs(now[i] - before[(y + dy) * side + (x + dx)]);
        n++;
      }
    }
    return n > 0 ? sum / n : Infinity;
  };
  const still = score(0, 0);
  let best = still;
  let bx = 0;
  let by = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const s = score(dx, dy);
      if (s < best) {
        best = s;
        bx = dx;
        by = dy;
      }
    }
  }
  // a shift that barely improves on staying put is noise, not movement
  if (!(best < still * 0.98)) return null;
  return { shift: [bx, by], residual: Math.round((best / 255) * 10000) / 10000 };
}

/** Cells of a `side` × `side` raster that lie in its outer border, `band` cells deep. Pure — exported for its test. */
export function borderMask(side: number, band: number): Uint8Array {
  const m = new Uint8Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if (y < band || y >= side - band || x < band || x >= side - band) m[y * side + x] = 1;
    }
  }
  return m;
}

/**
 * Decode [from, to) of a file and return each frame's shape, in order. Throws where eachFrame throws (no decoder,
 * the stretch too long to read frame by frame).
 */
export async function detailSeries(
  read: RangeRead,
  track: Mp4Track,
  from = 0,
  to: number = track.duration,
): Promise<DetailFrame[]> {
  const w = track.width ?? 0;
  const h = track.height ?? 0;
  if (!(w > 0) || !(h > 0)) throw new Error("the file does not say how large its picture is");
  const scale = DETAIL_SIDE / Math.max(w, h);
  const dw = Math.max(8, Math.round(w * scale));
  const dh = Math.max(8, Math.round(h * scale));
  const big = canvasOf(dw, dh);
  const small = canvasOf(MATCH_SIDE, MATCH_SIDE);
  const mask = borderMask(MATCH_SIDE, Math.max(2, Math.round(MATCH_SIDE * 0.18)));
  let previous: Uint8Array | null = null;
  const out: DetailFrame[] = [];

  await eachFrame(read, track, from, to, (frame, t) => {
    big.ctx.drawImage(frame, 0, 0, dw, dh);
    const rgba = big.ctx.getImageData(0, 0, dw, dh).data;
    const luma = lumaOf(rgba);
    let sum = 0;
    let low = 0;
    let high = 0;
    for (let i = 0; i < luma.length; i++) {
      sum += luma[i];
      if (luma[i] <= BLACK) low++;
      else if (luma[i] >= WHITE) high++;
    }
    const n = luma.length || 1;
    small.ctx.drawImage(frame, 0, 0, MATCH_SIDE, MATCH_SIDE);
    const match = lumaOf(small.ctx.getImageData(0, 0, MATCH_SIDE, MATCH_SIDE).data);
    const whole = previous ? bestShift(previous, match, MATCH_SIDE, MATCH_RADIUS) : null;
    const border = previous ? bestShift(previous, match, MATCH_SIDE, MATCH_RADIUS, mask) : null;
    const asShare = (s: [number, number] | undefined): [number, number] | null =>
      s
        ? [
            Math.round((s[0] / MATCH_SIDE) * 10000) / 10000,
            Math.round((s[1] / MATCH_SIDE) * 10000) / 10000,
          ]
        : null;
    out.push({
      t,
      sharp: sharpTiles(luma, dw, dh, DETAIL_TILES),
      luma: Math.round((sum / n / 255) * 10000) / 10000,
      clipLow: Math.round((low / n) * 10000) / 10000,
      clipHigh: Math.round((high / n) * 10000) / 10000,
      shift: asShare(whole?.shift),
      borderShift: asShare(border?.shift),
      residual: whole ? whole.residual : null,
    });
    previous = match;
  });
  return out.sort((a, b) => a.t - b.t);
}
