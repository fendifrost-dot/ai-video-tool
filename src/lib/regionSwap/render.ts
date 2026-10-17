/**
 * Region swap — the two renders, in the browser (WebCodecs, like the composite lane):
 *   1. renderCrop: every frame of the clip, the box cut out and enlarged to the clip's own size — what the swap model
 *      is given, so the piece in the box fills its picture;
 *   2. renderPutBack: every frame of the ORIGINAL clip, with the swapped crop drawn back down into the box and blended
 *      in over a soft edge (and only inside the window, when one is set). Outside the box every pixel is the
 *      original's.
 * Both keep the clip's frame times, so the result is as long as the clip and in sync by construction.
 */
import type { Mp4Track } from "@/lib/media/mp4";
import { dequeued, encoderConfig, muxAvc, shownAt, type EncodedSample } from "@/lib/media/mp4Cut";
import type { RangeRead } from "@/lib/media/probe";
import { readFrames } from "@/lib/composite/frameReader";
import { pairedReader } from "@/lib/composite/render";
import { edgeWeight, featherFor, windowWeight, type PixelRect } from "./plan";

export type Clip = { read: RangeRead; track: Mp4Track };
export type Rendered = {
  bytes: Uint8Array;
  frames: number;
  seconds: number;
  width: number;
  height: number;
  fps: number;
};

type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
function canvas(w: number, h: number): { c: Canvas; ctx: Ctx } {
  const c: Canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = c.getContext("2d", { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new Error("this browser gave no canvas to draw on");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

/**
 * The blend weights of a box: 1 inside, smoothly to 0 at its edges (plan.ts edgeWeight), one per pixel of the box.
 * With `frame`, the sides on the frame's border stay at 1.
 */
export function weightMap(
  rect: PixelRect,
  feather = featherFor(rect),
  frame?: { width: number; height: number },
): Float32Array {
  const m = new Float32Array(rect.w * rect.h);
  for (let y = 0; y < rect.h; y++)
    for (let x = 0; x < rect.w; x++)
      m[y * rect.w + x] = edgeWeight(rect.x + x, rect.y + y, rect, feather, frame);
  return m;
}

/**
 * Blend `patch` (the box's pixels, rect.w×rect.h RGBA) into `frame` (frameWidth wide, RGBA) at `rect`, each pixel by
 * its weight times `k` (the window's). Pure; changes `frame` in place.
 */
export function blendBox(
  frame: Uint8ClampedArray,
  frameWidth: number,
  patch: Uint8ClampedArray,
  rect: PixelRect,
  weights: Float32Array,
  k: number,
): void {
  if (k <= 0) return;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const a = weights[y * rect.w + x] * k;
      if (a <= 0) continue;
      const p = (y * rect.w + x) * 4;
      const o = ((rect.y + y) * frameWidth + rect.x + x) * 4;
      frame[o] = frame[o] * (1 - a) + patch[p] * a;
      frame[o + 1] = frame[o + 1] * (1 - a) + patch[p + 1] * a;
      frame[o + 2] = frame[o + 2] * (1 - a) + patch[p + 2] * a;
    }
  }
}

/** Encode frames as H.264 at the clip's frame times and mux them into an MP4 as long as the clip. */
async function encodeClip(
  clip: Clip,
  w: number,
  h: number,
  produce: (
    emit: (src: Canvas | Uint8ClampedArray, seconds: number) => Promise<void>,
  ) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<Rendered> {
  if (typeof VideoEncoder === "undefined") throw new Error("this browser has no video encoder");
  const frameSeconds = clip.track.sampleDelta(0) / clip.track.timescale || 1 / 24;
  const fps = Math.max(1, Math.min(120, Math.round(1 / frameSeconds)));
  const config = await encoderConfig(VideoEncoder, w, h, fps);
  if (!config) throw new Error("this browser has no H.264 encoder");
  const out: EncodedSample[] = [];
  let avcC: Uint8Array | null = null;
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description;
      if (d && !avcC)
        avcC =
          d instanceof ArrayBuffer
            ? new Uint8Array(d.slice(0))
            : new Uint8Array(
                (d as ArrayBufferView).buffer.slice(
                  (d as ArrayBufferView).byteOffset,
                  (d as ArrayBufferView).byteOffset + (d as ArrayBufferView).byteLength,
                ),
              );
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      out.push({ data, timestamp: chunk.timestamp, key: chunk.type === "key" });
    },
    error: (e) => {
      failure = failure ?? new Error(e.message || "the encoder failed");
    },
  });
  const frameUs = Math.round(frameSeconds * 1e6);
  let kept = 0;
  let lastUs = 0;
  try {
    encoder.configure(config);
    await produce(async (src, seconds) => {
      if (failure) throw failure;
      const timestamp = Math.max(0, Math.round(seconds * 1e6));
      const frame =
        src instanceof Uint8ClampedArray
          ? new VideoFrame(src, {
              format: "RGBA",
              codedWidth: w,
              codedHeight: h,
              timestamp,
              duration: frameUs,
            })
          : new VideoFrame(src as CanvasImageSource, { timestamp, duration: frameUs });
      try {
        encoder.encode(frame, { keyFrame: kept === 0 });
      } finally {
        frame.close();
      }
      kept += 1;
      lastUs = timestamp;
      while (!failure && encoder.encodeQueueSize > 4) await dequeued(encoder);
      onProgress?.(kept, clip.track.sampleCount);
      if (kept % 12 === 0) await new Promise((r) => setTimeout(r, 0));
    });
    if (!failure) await encoder.flush();
  } finally {
    try {
      encoder.close();
    } catch {
      // already closed
    }
  }
  if (failure) throw failure;
  if (!avcC) throw new Error("the encoder gave no stream description");
  if (out.length === 0) throw new Error("no frames came out of the clip");
  const first = clip.track.sampleCount > 0 ? clip.track.sample(0) : null;
  const t0 = first ? Math.max(0, shownAt(clip.track, first)) : 0;
  // the file is as long as the clip: its last frame runs to the clip's end
  const lengthUs = Math.round((clip.track.duration - t0) * 1e6);
  const tailUs = Math.max(1, lengthUs - lastUs);
  const bytes = muxAvc(out, avcC, w, h, tailUs);
  return { bytes, frames: out.length, seconds: (lastUs + tailUs) / 1e6, width: w, height: h, fps };
}

/** 1. The box of every frame, enlarged to the clip's size: the swap model's source. */
export async function renderCrop(input: {
  clip: Clip;
  rect: PixelRect;
  width: number;
  height: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<Rendered> {
  const { clip, rect, width: w, height: h } = input;
  const src = canvas(w, h);
  const dst = canvas(w, h);
  return encodeClip(
    clip,
    w,
    h,
    async (emit) => {
      let t0: number | null = null;
      for await (const f of readFrames(clip.read, clip.track)) {
        if (t0 == null) t0 = f.t;
        src.ctx.putImageData(
          new ImageData(f.rgba as Uint8ClampedArray<ArrayBuffer>, f.width, f.height),
          0,
          0,
        );
        dst.ctx.drawImage(src.c as CanvasImageSource, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
        await emit(dst.c, f.t - t0);
      }
    },
    input.onProgress,
  );
}

/** 2. The original, with the swapped crop drawn back down into the box and blended in (inside the window only). */
export async function renderPutBack(input: {
  original: Clip;
  swapped: Clip;
  rect: PixelRect;
  window: [number, number] | null;
  width: number;
  height: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<Rendered & { pairing: "index" | "time" }> {
  const { original, swapped, rect, width: w, height: h } = input;
  const byIndex = original.track.sampleCount === swapped.track.sampleCount;
  const reader = pairedReader(readFrames(swapped.read, swapped.track), "the swapped crop");
  const sw = canvas(w, h);
  const box = canvas(rect.w, rect.h);
  const weights = weightMap(rect, featherFor(rect), { width: w, height: h });
  try {
    const r = await encodeClip(
      original,
      w,
      h,
      async (emit) => {
        let t0: number | null = null;
        for await (const f of readFrames(original.read, original.track)) {
          if (t0 == null) t0 = f.t;
          const seconds = f.t - t0;
          if (f.width !== w || f.height !== h)
            throw new Error("the clip's frames are not the size it says");
          const s = byIndex
            ? await reader.step()
            : await reader.at(seconds, (t) => t - reader.first);
          sw.ctx.putImageData(
            new ImageData(s.rgba as Uint8ClampedArray<ArrayBuffer>, s.width, s.height),
            0,
            0,
          );
          box.ctx.clearRect(0, 0, rect.w, rect.h);
          box.ctx.drawImage(
            sw.c as CanvasImageSource,
            0,
            0,
            s.width,
            s.height,
            0,
            0,
            rect.w,
            rect.h,
          );
          const patch = box.ctx.getImageData(0, 0, rect.w, rect.h).data;
          const frame = new Uint8ClampedArray(f.rgba);
          blendBox(frame, w, patch, rect, weights, windowWeight(seconds, input.window));
          await emit(frame, seconds);
        }
      },
      input.onProgress,
    );
    return { ...r, pairing: byIndex ? "index" : "time" };
  } finally {
    await reader.close();
  }
}
