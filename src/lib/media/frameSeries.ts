/**
 * Every frame of a clip, reduced to a small grid of colour — what a measurement of the picture over time is made
 * from (storyboard/beatCheck.ts). frames.ts is for LOOKING at one frame and says so; this is for MEASURING: every
 * frame is decoded in order and carries its own presentation time, so "when did the picture change" is answered to
 * the frame.
 *
 * No media element: the file is read by byte range and decoded with WebCodecs, so it works in a window that is not
 * on screen.
 */
import type { Mp4Sample, Mp4Track } from "./mp4";
import { shownAt } from "./mp4Cut";
import type { RangeRead } from "./probe";

/** One frame: seconds on the file's own clock, and the mean r, g, b of each cell of a `grid` × `grid` raster, 0–1. */
export type SeriesFrame = { t: number; cells: number[] };

export const SERIES_GRID = 12;
/** The picture is drawn this many pixels to a cell before averaging, so a cell is a mean and not one sampled pixel. */
const PIXELS_PER_CELL = 4;
/** A clip longer than this is not measured frame by frame (a take of the whole song is not a generated shot). */
export const SERIES_MAX_SECONDS = 20;

function dequeued(codec: { addEventListener: (type: "dequeue", fn: () => void, opts?: { once: boolean }) => void }): Promise<void> {
  return new Promise((resolve) => codec.addEventListener("dequeue", () => resolve(), { once: true }));
}

/** The cells of one raster of pixels (rgba, `side` × `side`): mean r, g, b per cell, 0–1. Pure — exported for its test. */
export function cellsOf(rgba: Uint8ClampedArray | Uint8Array, side: number, grid: number): number[] {
  const per = side / grid;
  const out: number[] = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = Math.floor(gy * per); y < Math.floor((gy + 1) * per); y++) {
        for (let x = Math.floor(gx * per); x < Math.floor((gx + 1) * per); x++) {
          const i = (y * side + x) * 4;
          r += rgba[i];
          g += rgba[i + 1];
          b += rgba[i + 2];
          n++;
        }
      }
      const k = n > 0 ? 1 / (n * 255) : 0;
      out.push(Math.round(r * k * 1000) / 1000, Math.round(g * k * 1000) / 1000, Math.round(b * k * 1000) / 1000);
    }
  }
  return out;
}

/**
 * Decode [from, to) of a file and hand every frame shown in it to `onFrame` with its own presentation time (seconds
 * on the file's clock). The frame is closed when `onFrame` returns, so it is read inside the call. Frames arrive in
 * the order the decoder gives them — collect and sort by time when order matters. Throws when the browser cannot
 * decode the file or the stretch is too long to read frame by frame.
 */
export async function eachFrame(read: RangeRead, track: Mp4Track, from: number, to: number, onFrame: (frame: VideoFrame, t: number) => void): Promise<void> {
  if (typeof VideoDecoder === "undefined" || typeof EncodedVideoChunk === "undefined") throw new Error("this browser has no video decoder");
  if (!track.codec) throw new Error(`no decoder is known here for ${track.format || "this file"}`);
  const start = Math.max(0, from);
  const end = Math.min(track.duration, Math.max(start, to));
  if (end - start > SERIES_MAX_SECONDS) throw new Error(`a stretch of ${(end - start).toFixed(0)} s is too long to measure frame by frame`);
  const key = track.keyframeAt(start);
  const last = track.sampleAt(Math.max(0, end - 0.001));
  if (!key || !last) throw new Error("there is no footage at that moment");
  const lastIndex = Math.min(track.sampleCount - 1, last.index + 8);
  const samples: Mp4Sample[] = [];
  for (let i = key.index; i <= lastIndex; i++) {
    const s = track.sample(i);
    if (!s) throw new Error("the file's index is incomplete");
    samples.push(s);
  }
  const lo = Math.min(...samples.map((s) => s.offset));
  const hi = Math.max(...samples.map((s) => s.offset + s.size));
  const got = await read(lo, hi - 1);
  if (got.bytes.byteLength < hi - lo) throw new Error("the footage could not be read in full");
  const config: VideoDecoderConfig = { codec: track.codec, codedWidth: track.width ?? undefined, codedHeight: track.height ?? undefined, ...(track.description ? { description: track.description } : {}) };
  if (!(await VideoDecoder.isConfigSupported(config).then((s) => s.supported, () => false))) throw new Error(`this browser cannot decode ${track.codec}`);

  let failure: Error | null = null;
  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        const t = frame.timestamp / 1e6;
        if (failure || t < start - 1e-4 || t >= end - 1e-4) return;
        onFrame(frame, Math.round(t * 1000) / 1000);
      } catch (e) {
        failure = failure ?? (e instanceof Error ? e : new Error(String(e)));
      } finally {
        frame.close();
      }
    },
    error: (e) => {
      failure = failure ?? new Error(e.message || "the decoder refused the file");
    },
  });
  try {
    decoder.configure(config);
    for (const s of samples) {
      if (failure) break;
      // the chunk carries the time its frame is SHOWN, so the frame that comes out says when it is on screen
      decoder.decode(new EncodedVideoChunk({ type: s.sync ? "key" : "delta", timestamp: Math.round(shownAt(track, s) * 1e6), data: got.bytes.subarray(s.offset - lo, s.offset - lo + s.size) }));
      while (!failure && decoder.decodeQueueSize > 8) await dequeued(decoder);
    }
    if (!failure) await decoder.flush();
  } finally {
    try {
      decoder.close();
    } catch {
      // already closed
    }
  }
  if (failure) throw failure;
}

/**
 * Decode [from, to) of a file and return every frame shown in it, in order, each reduced to a small grid of colour.
 * Throws when the browser cannot decode the file or the stretch is too long to measure.
 */
export async function frameSeries(read: RangeRead, track: Mp4Track, from = 0, to: number = track.duration, grid = SERIES_GRID): Promise<SeriesFrame[]> {
  const side = grid * PIXELS_PER_CELL;
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(side, side) : Object.assign(document.createElement("canvas"), { width: side, height: side });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("this browser gave no canvas to measure on");
  const out: SeriesFrame[] = [];
  await eachFrame(read, track, from, to, (frame, t) => {
    // the whole frame squeezed onto the raster: the measure is of the picture's layout, not its shape
    ctx.drawImage(frame, 0, 0, side, side);
    out.push({ t, cells: cellsOf(ctx.getImageData(0, 0, side, side).data, side, grid) });
  });
  return out.sort((a, b) => a.t - b.t);
}
