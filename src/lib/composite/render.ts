/**
 * The composite rendered in the browser: the dressed take and its alpha video are read frame by frame side by side,
 * each frame goes through pixels.ts over the plate, and the result is encoded as H.264 at the take's own size and
 * frame times and written as a self-contained MP4 — tagged with the colour the encoder says it wrote (BT.709 or
 * BT.601), so no player guesses and shifts it.
 *
 * Timing is the take's: every frame keeps its presentation time, so the composite is exactly as long as the dressed
 * take and in sync by construction. The alpha video is paired by TIME (each take frame takes the alpha frame nearest
 * to it on its own clock, both clocks normalised to their files' lengths), so a frame the model dropped or doubled
 * costs one frame, not a drift across the window.
 */
import type { Mp4Track } from "@/lib/media/mp4";
import {
  cutSize,
  dequeued,
  encoderConfig,
  muxAvc,
  type ColrTag,
  type EncodedSample,
} from "@/lib/media/mp4Cut";
import type { RangeRead } from "@/lib/media/probe";
import { readFrames, type DecodedFrame } from "./frameReader";
import {
  alphaScratch,
  compositeFrame,
  gradeForeground,
  grayFromRgba,
  keyGradient,
  prepareAlpha,
  preparePlate,
  RECIPE,
  seededRandom,
  type Gray,
} from "./pixels";

export type RenderInput = {
  fg: { read: RangeRead; track: Mp4Track };
  alpha: { read: RangeRead; track: Mp4Track };
  /** The plate, already drawn at the take's size (cover-fitted): w·h·4 bytes. */
  plate: Uint8ClampedArray;
  width: number;
  height: number;
  /** The grain's seed: the same seed gives the same file. */
  seed?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};

export type RenderResult = {
  bytes: Uint8Array;
  frames: number;
  alphaFrames: number;
  seconds: number;
  width: number;
  height: number;
  fps: number;
  /** The colour the file is tagged with — what the encoder reported it wrote; null when it said nothing. */
  colr: ColrTag | null;
  recipe: typeof RECIPE;
  seed: number;
};

/** The take's size as the composite is written: its own, inside a 1080p frame, even numbers. An upright take only. */
export function renderSize(track: Pick<Mp4Track, "width" | "height" | "rotation">): {
  width: number;
  height: number;
} {
  if (!track.width || !track.height) throw new Error("the take's size is not known");
  if (track.rotation % 360 !== 0)
    throw new Error("the take is stored turned; the composite reads upright takes only");
  return cutSize(track.width, track.height);
}

/** The plate drawn to `w`×`h`, cover-fitted and centred, as RGBA bytes. */
export function plateAtSize(
  image: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
): Uint8ClampedArray {
  const iw = image.width;
  const ih = image.height;
  if (!(iw > 0 && ih > 0)) throw new Error("the plate has no size");
  const k = Math.max(w / iw, h / ih);
  const dw = iw * k;
  const dh = ih * k;
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("this browser gave no canvas to draw the plate on");
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return ctx.getImageData(0, 0, w, h).data;
}

/** A grey picture resampled (bilinear) to another size — for an alpha video not the take's size. */
export function resampleGray(src: Gray, sw: number, sh: number, w: number, h: number): Gray {
  if (sw === w && sh === h) return src;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = ((y + 0.5) * sh) / h - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) * sw) / w - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0));
      const top = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
      const bot = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
      out[y * w + x] = top * (1 - ty) + bot * ty;
    }
  }
  return out;
}

/** RGBA resampled (nearest) to another size — only for a take whose size is scaled to fit 1080p. */
function resampleRgba(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  w: number,
  h: number,
): Uint8ClampedArray {
  if (sw === w && sh === h) return src;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / w));
      const i = (sy * sw + sx) * 4;
      const o = (y * w + x) * 4;
      out[o] = src[i];
      out[o + 1] = src[i + 1];
      out[o + 2] = src[i + 2];
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Whether the NEXT alpha frame is the better match for a take frame at `target` (both on a 0–1 clock: a frame's time
 * over its file's length). The alpha reader is sequential, so the pairing advances while the next frame is at least
 * as close as the current one.
 */
export function alphaShouldAdvance(target: number, current: number, next: number): boolean {
  return Math.abs(next - target) <= Math.abs(current - target);
}

/** A frame's place on its file's clock, 0 at the first frame and 1 at the end. */
export function normalizedTime(t: number, first: number, duration: number): number {
  const span = duration - first;
  return span > 0 ? (t - first) / span : 0;
}

/** The colour tag for what the encoder reported it wrote, or null when it said nothing this reader knows. */
export function colrOf(
  colorSpace:
    | { matrix?: string | null; primaries?: string | null; transfer?: string | null }
    | null
    | undefined,
): ColrTag | null {
  if (!colorSpace) return null;
  if (colorSpace.matrix === "bt709" || colorSpace.primaries === "bt709") return "bt709";
  if (colorSpace.matrix === "smpte170m" || colorSpace.matrix === "bt470bg") return "bt601";
  return null;
}

/** A yield the browser does not throttle in a background tab (a timer would wait a second, then a minute). */
const channel = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
function yieldToUi(): Promise<void> {
  if (!channel) return new Promise<void>((r) => setTimeout(r, 0));
  return new Promise<void>((r) => {
    channel.port1.onmessage = () => r();
    channel.port2.postMessage(null);
  });
}
const YIELD_EVERY = 4;

export async function renderComposite(input: RenderInput): Promise<RenderResult> {
  if (typeof VideoEncoder === "undefined") throw new Error("this browser has no video encoder");
  const { fg, alpha, width: w, height: h } = input;
  const takeFrames = fg.track.sampleCount;
  const alphaFrames = alpha.track.sampleCount;
  if (takeFrames === 0) throw new Error("the take has no frames");
  if (alphaFrames === 0) throw new Error("the matte has no frames");
  const frameSeconds = fg.track.sampleDelta(0) / fg.track.timescale || 1 / 24;
  const fps = Math.max(1, Math.min(120, Math.round(1 / frameSeconds)));
  const config = await encoderConfig(VideoEncoder, w, h, fps);
  if (!config) throw new Error("this browser has no H.264 encoder");
  const seed = input.seed ?? (Date.now() % 2147483647) >>> 0;
  const random = seededRandom(seed);

  const grad = keyGradient(w, h);
  const plate = preparePlate(input.plate, w, h);
  const scratch = alphaScratch(w, h);
  const fgg = new Float32Array(w * h * 3);
  const outRgba = new Uint8ClampedArray(w * h * 4);

  const out: EncodedSample[] = [];
  let avcC: Uint8Array | null = null;
  let colr: ColrTag | null = null;
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description;
      if (d && !avcC) {
        avcC =
          d instanceof ArrayBuffer
            ? new Uint8Array(d.slice(0))
            : new Uint8Array(
                (d as ArrayBufferView).buffer.slice(
                  (d as ArrayBufferView).byteOffset,
                  (d as ArrayBufferView).byteOffset + (d as ArrayBufferView).byteLength,
                ),
              );
        colr = colrOf(meta?.decoderConfig?.colorSpace as Parameters<typeof colrOf>[0]);
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      out.push({ data, timestamp: chunk.timestamp, key: chunk.type === "key" });
    },
    error: (e) => {
      failure = failure ?? new Error(e.message || "the encoder failed");
    },
  });

  // the alpha reader runs one frame ahead so each take frame can take the nearer of the current and the next
  const alphaIt = readFrames(alpha.read, alpha.track);
  let alphaCur: DecodedFrame | null = null;
  let alphaNext: DecodedFrame | null = null;
  let alphaFirst = 0;
  const pullAlpha = async (): Promise<DecodedFrame | null> => {
    const n = await alphaIt.next();
    return n.done ? null : n.value;
  };
  const alphaFor = async (target: number): Promise<DecodedFrame> => {
    if (!alphaCur) {
      alphaCur = await pullAlpha();
      if (!alphaCur) throw new Error("the matte gave no frames");
      alphaFirst = alphaCur.t;
      alphaNext = await pullAlpha();
    }
    while (
      alphaNext &&
      alphaShouldAdvance(
        target,
        normalizedTime(alphaCur.t, alphaFirst, alpha.track.duration),
        normalizedTime(alphaNext.t, alphaFirst, alpha.track.duration),
      )
    ) {
      alphaCur = alphaNext;
      alphaNext = await pullAlpha();
    }
    return alphaCur;
  };

  let t0: number | null = null;
  let lastUs = 0;
  let kept = 0;
  const frameUs = Math.round(frameSeconds * 1e6);
  try {
    encoder.configure(config);
    for await (const f of readFrames(fg.read, fg.track)) {
      if (input.signal?.aborted) throw new Error("stopped");
      if (failure) throw failure;
      if (t0 == null) t0 = f.t;
      const a = await alphaFor(normalizedTime(f.t, t0, fg.track.duration));
      const fgRgba = resampleRgba(f.rgba, f.width, f.height, w, h);
      const alphaGray = resampleGray(grayFromRgba(a.rgba), a.width, a.height, w, h);
      const { a1, edge } = prepareAlpha(alphaGray, w, h, scratch);
      gradeForeground(fgRgba, grad, w, h, fgg);
      compositeFrame({ fgg, a1, edge, soft: plate.soft, wide: plate.wide, w, h, random }, outRgba);
      const timestamp = Math.max(0, Math.round((f.t - t0) * 1e6));
      const frame = new VideoFrame(outRgba, {
        format: "RGBA",
        codedWidth: w,
        codedHeight: h,
        timestamp,
        duration: frameUs,
      });
      try {
        encoder.encode(frame, { keyFrame: kept === 0 });
      } finally {
        frame.close();
      }
      kept += 1;
      lastUs = timestamp;
      while (!failure && encoder.encodeQueueSize > 4) await dequeued(encoder);
      input.onProgress?.(kept, takeFrames);
      if (kept % YIELD_EVERY === 0) await yieldToUi();
    }
    if (!failure) await encoder.flush();
  } finally {
    try {
      encoder.close();
    } catch {
      // already closed
    }
    await alphaIt.return();
  }
  if (failure) throw failure;
  if (!avcC) throw new Error("the encoder gave no stream description");
  if (out.length === 0 || t0 == null) throw new Error("no frames came out of the take");
  // the file is as long as the take: its last frame runs to the take's end
  const lengthUs = Math.round((fg.track.duration - t0) * 1e6);
  const tailUs = Math.max(1, lengthUs - lastUs);
  const bytes = muxAvc(out, avcC, w, h, tailUs, colr ? { colr } : {});
  return {
    bytes,
    frames: out.length,
    alphaFrames,
    seconds: (lastUs + tailUs) / 1e6,
    width: w,
    height: h,
    fps,
    colr,
    recipe: RECIPE,
    seed,
  };
}
