/**
 * The composite rendered in the browser: the dressed take and its alpha video are read frame by frame side by side,
 * each frame goes through pixels.ts over the plate, the handheld camera (camera.ts) moves the finished frame, and
 * the result is encoded as H.264 at the take's own size and frame times and written as a self-contained MP4 —
 * tagged with the colour the encoder says it wrote (BT.709 or BT.601), so no player guesses and shifts it.
 *
 * Timing is the take's: every frame keeps its presentation time, so the composite is exactly as long as the dressed
 * take and in sync by construction.
 *
 * The alpha video is paired FRAME BY FRAME when it has as many frames as the take — the matte model returns one
 * matte per source frame, and that pairing is exact. (v1 paired by time, each clock normalised to its file's HEADER
 * length; the matte of c044 declared itself one frame longer than the take, so from the middle of the window on the
 * matte ran a frame ahead of him, and the white wall behind him in the take showed along his outline — "pasted in".
 * Verified 16 Oct by replaying the pairing on the two files.) When the counts differ the pairing is by time, each
 * clock normalised to its LAST FRAME, which no muxer sets freely.
 *
 * The plate is a still, or a moving plate (a short clip made from the still): its frames are paired by time from
 * the take's first frame, and its last frame holds if the take runs longer.
 */
import type { Mp4Track } from "@/lib/media/mp4";
import {
  cutSize,
  dequeued,
  encoderConfig,
  muxAvc,
  shownAt,
  type ColrTag,
  type EncodedSample,
} from "@/lib/media/mp4Cut";
import type { RangeRead } from "@/lib/media/probe";
import { CAMERA, cameraPhases, cameraPose, cameraTransform, type CameraPose } from "./camera";
import { readFrames, type DecodedFrame } from "./frameReader";
import {
  alphaScratch,
  cleanEdges,
  compositeFrame,
  gradeForeground,
  grayFromRgba,
  keyGradient,
  plateScratchFor,
  prepareAlpha,
  preparePlate,
  RECIPE,
  seededRandom,
  type Gray,
  type Rgb,
} from "./pixels";

export type PlateInput =
  /** A still, already drawn at the take's size (cover-fitted): w·h·4 bytes. */
  | { kind: "still"; rgba: Uint8ClampedArray }
  /** A moving plate: read frame by frame and cover-fitted to the take's size here. */
  | { kind: "video"; read: RangeRead; track: Mp4Track };

export type RenderInput = {
  fg: { read: RangeRead; track: Mp4Track };
  alpha: { read: RangeRead; track: Mp4Track };
  plate: PlateInput;
  width: number;
  height: number;
  /** The grain's and the camera's seed: the same seed gives the same file. */
  seed?: number;
  /** The handheld camera (on unless said otherwise). */
  camera?: boolean;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};

export type CameraRecord = { version: string; settings: typeof CAMERA; seed: number };

export type RenderResult = {
  bytes: Uint8Array;
  frames: number;
  alphaFrames: number;
  /** How the matte was paired with the take. */
  pairing: "index" | "time";
  /** The moving plate's frames read, or null over a still. */
  plateFrames: number | null;
  seconds: number;
  width: number;
  height: number;
  fps: number;
  /** The colour the file is tagged with — what the encoder reported it wrote; null when it said nothing. */
  colr: ColrTag | null;
  recipe: typeof RECIPE;
  camera: CameraRecord | null;
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
 * A moving plate's frame cover-fitted (bilinear, centred) to `w`×`h`: the plate fills the frame, whatever its own
 * size and shape, the way a still plate is drawn by plateAtSize.
 */
export function coverRgba(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  w: number,
  h: number,
  out: Uint8ClampedArray = new Uint8ClampedArray(w * h * 4),
): Uint8ClampedArray {
  if (sw === w && sh === h) {
    out.set(src);
    return out;
  }
  const k = Math.max(w / sw, h / sh); // the scale that covers
  const ox = (sw - w / k) / 2; // the source's left edge of the shown part
  const oy = (sh - h / k) / 2;
  for (let y = 0; y < h; y++) {
    const fy = oy + (y + 0.5) / k - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < w; x++) {
      const fx = ox + (x + 0.5) / k - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0));
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[(y0 * sw + x0) * 4 + c] * (1 - tx) + src[(y0 * sw + x1) * 4 + c] * tx;
        const bot = src[(y1 * sw + x0) * 4 + c] * (1 - tx) + src[(y1 * sw + x1) * 4 + c] * tx;
        out[o + c] = Math.round(top * (1 - ty) + bot * ty);
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Whether the NEXT frame of a sequential reader is the better match for `target` (on whatever clock both are on).
 * The pairing advances while the next frame is at least as close as the current one.
 */
export function alphaShouldAdvance(target: number, current: number, next: number): boolean {
  return Math.abs(next - target) <= Math.abs(current - target);
}

/** A frame's place on its file's clock, 0 at the first frame and 1 at the last. */
export function normalizedTime(t: number, first: number, last: number): number {
  const span = last - first;
  return span > 0 ? (t - first) / span : 0;
}

/** The presentation time of a track's last frame — the end of its clock as the frames themselves say it. */
export function lastShownAt(track: Mp4Track): number {
  let last = 0;
  for (let i = 0; i < track.sampleCount; i++) {
    const s = track.sample(i);
    if (s) last = Math.max(last, shownAt(track, s));
  }
  return last;
}

/**
 * Whether the matte is paired frame by frame: one matte per take frame. (A matte with another count is paired by
 * time; a muxer's header length never comes into it.)
 */
export function pairingFor(takeFrames: number, alphaFrames: number): "index" | "time" {
  return takeFrames === alphaFrames ? "index" : "time";
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

/**
 * A sequential frame reader with one frame of look-ahead, so a caller can take the nearer of current and next, or
 * step one frame at a time. Over any async iterable of frames (readFrames in the browser; a list in a test).
 */
export function pairedReader(it: AsyncGenerator<DecodedFrame, void, void> | AsyncIterator<DecodedFrame>, what: string) {
  let cur: DecodedFrame | null = null;
  let next: DecodedFrame | null = null;
  let first = 0;
  let frames = 0;
  const pull = async (): Promise<DecodedFrame | null> => {
    const n = await it.next();
    if (n.done) return null;
    frames += 1;
    return n.value;
  };
  return {
    /** The frame at `target` on `clock` (which maps a frame's time to the target's clock). */
    async at(target: number, clock: (t: number) => number): Promise<DecodedFrame> {
      if (!cur) {
        cur = await pull();
        if (!cur) throw new Error(`${what} gave no frames`);
        first = cur.t;
        next = await pull();
      }
      while (next && alphaShouldAdvance(target, clock(cur.t), clock(next.t))) {
        cur = next;
        next = await pull();
      }
      return cur;
    },
    /** The next frame, one per call; the last one again once they run out. */
    async step(): Promise<DecodedFrame> {
      const n = await pull();
      if (n) cur = n;
      if (!cur) throw new Error(`${what} gave no frames`);
      return cur;
    },
    get first() {
      return first;
    },
    get frames() {
      return frames;
    },
    close: () => it.return?.(),
  };
}

/** The camera's canvases: the finished frame goes on one, the camera's view of it is drawn on the other. */
function cameraStage(w: number, h: number) {
  const make = () =>
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const src = make();
  const dst = make();
  const sctx = src.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const dctx = dst.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!sctx || !dctx) throw new Error("this browser gave no canvas for the camera");
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = "high";
  return {
    /** Draw `rgba` as the camera at `pose` sees it; returns the canvas to encode. */
    view(rgba: Uint8ClampedArray, pose: CameraPose) {
      sctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      dctx.setTransform(...cameraTransform(pose, w, h));
      dctx.drawImage(src as CanvasImageSource, -w / 2, -h / 2);
      return dst;
    },
  };
}

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
  const pairing = pairingFor(takeFrames, alphaFrames);
  const takeLast = lastShownAt(fg.track);
  const alphaLast = lastShownAt(alpha.track);
  const useCamera = input.camera !== false;
  const phases = cameraPhases(seed);
  const stage = useCamera ? cameraStage(w, h) : null;

  const grad = keyGradient(w, h);
  const scratch = alphaScratch(w, h);
  const plateScratch = input.plate.kind === "video" ? plateScratchFor(w, h) : undefined;
  const fgg = new Float32Array(w * h * 3);
  const outRgba = new Uint8ClampedArray(w * h * 4);

  // the plate: a still prepared once, or a moving plate prepared frame by frame as its frames come up
  let plateSoft: Rgb;
  let plateWide: Rgb;
  let plateReader: ReturnType<typeof pairedReader> | null = null;
  let plateCur: DecodedFrame | null = null;
  const plateFit = input.plate.kind === "video" ? new Uint8ClampedArray(w * h * 4) : null;
  if (input.plate.kind === "still") {
    const p = preparePlate(input.plate.rgba, w, h);
    plateSoft = p.soft;
    plateWide = p.wide;
  } else {
    if (input.plate.track.sampleCount === 0) throw new Error("the moving plate has no frames");
    plateReader = pairedReader(readFrames(input.plate.read, input.plate.track), "the moving plate");
    plateSoft = new Float32Array(0);
    plateWide = new Float32Array(0);
  }
  const plateAt = async (seconds: number): Promise<void> => {
    if (!plateReader || !plateFit) return;
    // the plate plays from the take's first frame at its own speed and holds its last frame
    const f = await plateReader.at(seconds, (t) => t - plateReader!.first);
    if (f === plateCur) return;
    plateCur = f;
    coverRgba(f.rgba, f.width, f.height, w, h, plateFit);
    const p = preparePlate(plateFit, w, h, plateScratch);
    plateSoft = p.soft;
    plateWide = p.wide;
  };

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

  const alphaReader = pairedReader(readFrames(alpha.read, alpha.track), "the matte");
  const alphaFor = async (takeTime: number, t0: number): Promise<DecodedFrame> => {
    if (pairing === "index") return alphaReader.step();
    const target = normalizedTime(takeTime, t0, takeLast);
    return alphaReader.at(target, (t) => normalizedTime(t, alphaReader.first, alphaLast));
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
      const seconds = f.t - t0;
      const a = await alphaFor(f.t, t0);
      await plateAt(seconds);
      const fgRgba = resampleRgba(f.rgba, f.width, f.height, w, h);
      const alphaGray = resampleGray(grayFromRgba(a.rgba), a.width, a.height, w, h);
      const { a1, edge } = prepareAlpha(alphaGray, w, h, scratch);
      gradeForeground(fgRgba, grad, w, h, fgg);
      cleanEdges(fgg, a1, alphaGray, w, h, scratch);
      compositeFrame({ fgg, a1, edge, soft: plateSoft, wide: plateWide, w, h, random }, outRgba);
      const timestamp = Math.max(0, Math.round(seconds * 1e6));
      const frame = stage
        ? new VideoFrame(stage.view(outRgba, cameraPose(seed, seconds, w, h, CAMERA, phases)) as CanvasImageSource, {
            timestamp,
            duration: frameUs,
          })
        : new VideoFrame(outRgba, {
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
    await alphaReader.close();
    if (plateReader) await plateReader.close();
  }
  if (failure) throw failure;
  if (!avcC) throw new Error("the encoder gave no stream description");
  if (out.length === 0 || t0 == null) throw new Error("no frames came out of the take");
  // frame by frame means exactly one matte per take frame: a matte the decoder cut short would have held its last
  // frame over the rest of him without a word — the very drift this pairing exists to end
  if (pairing === "index" && alphaReader.frames !== kept)
    throw new Error(`the matte gave ${alphaReader.frames} frames for ${kept} take frames — the files do not pair frame by frame`);
  // the file is as long as the take: its last frame runs to the take's end
  const lengthUs = Math.round((fg.track.duration - t0) * 1e6);
  const tailUs = Math.max(1, lengthUs - lastUs);
  const bytes = muxAvc(out, avcC, w, h, tailUs, colr ? { colr } : {});
  return {
    bytes,
    frames: out.length,
    alphaFrames: alphaReader.frames,
    pairing,
    plateFrames: plateReader ? plateReader.frames : null,
    seconds: (lastUs + tailUs) / 1e6,
    width: w,
    height: h,
    fps,
    colr,
    recipe: RECIPE,
    camera: useCamera ? { version: CAMERA.version, settings: CAMERA, seed } : null,
    seed,
  };
}
