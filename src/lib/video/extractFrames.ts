/**
 * Batch frame extraction — decode EVERY frame of an MP4 master straight from its
 * bytes with WebCodecs, bypassing <video> (which backgrounded/headless tabs
 * throttle to a standstill). Built on the same mp4Demux + VideoDecoder path the
 * single-frame hero grab uses (webCodecsFrame.ts), extended to walk the whole
 * sample table and emit frames in presentation order.
 *
 * WHY here and not on Fal: Fal's ffmpeg endpoints only extract first/middle/last
 * frames, never a full sequence — so extraction stays client-side, at full master
 * resolution, and reassembly (frames → video) runs on Fal via CC. See
 * supabase/functions/wardrobe-video-reassemble-proxy.
 *
 * MEMORY DISCIPLINE: a decoded 4K RGBA frame is ~33 MB, so we NEVER hold raw
 * frames. Each frame is drawn to a canvas (a synchronous pixel copy), the frame
 * is closed immediately, and the canvas is JPEG-encoded with bounded concurrency.
 * Phase 2a is bounded to short clips; `maxFrames` is a hard guard so a long 4K
 * master can't OOM the tab — the caller lowers `targetFps` or trims the clip.
 */
import { demuxMp4Video, type Mp4Sample } from "./mp4Demux";
import { applyRotation, orientedSize, type WcVideoFrame } from "./webCodecsFrame";

export interface ExtractedFrame {
  /** 0-based presentation order. */
  index: number;
  /** Presentation timestamp in seconds. */
  timeSec: number;
  blob: Blob;
}

export interface ExtractFramesResult {
  frames: ExtractedFrame[];
  /** Frame rate inferred from the sample table. */
  sourceFps: number;
  /** Effective sampled rate after any decimation. */
  fps: number;
  width: number;
  height: number;
  /** Container display rotation already baked into each emitted frame. */
  rotation: number;
  /** True when `maxFrames` clipped the sequence before the clip ended. */
  truncated: boolean;
}

export interface ExtractFramesOptions {
  /**
   * Decimate to at most this many frames per second. Omit / >= source fps keeps
   * every frame. Lower it to bound cost + memory on long or high-fps masters.
   */
  targetFps?: number;
  /** Hard cap on emitted frames (OOM guard). Default 900 (~30s at 30fps). */
  maxFrames?: number;
  /** JPEG quality for each frame. Default 0.92 (matches the hero grab). */
  quality?: number;
  /** Bounded encode concurrency. Default 4. */
  concurrency?: number;
}

const DEFAULT_MAX_FRAMES = 900;

// Minimal WebCodecs surface (absent from this TS lib version) — same shape the
// single-frame path declares locally.
interface WcDecoderConfig {
  codec: string;
  description?: ArrayBuffer | ArrayBufferView;
  codedWidth?: number;
  codedHeight?: number;
}
interface WcVideoDecoder {
  configure(config: WcDecoderConfig): void;
  decode(chunk: object): void;
  flush(): Promise<void>;
  close(): void;
  readonly state: string;
}
interface WcGlobals {
  VideoDecoder?: {
    new (init: {
      output: (f: WcVideoFrame) => void;
      error: (e: DOMException) => void;
    }): WcVideoDecoder;
    isConfigSupported(config: WcDecoderConfig): Promise<{ supported?: boolean }>;
  };
  EncodedVideoChunk?: new (init: {
    type: "key" | "delta";
    timestamp: number;
    data: ArrayBuffer | ArrayBufferView;
  }) => object;
  OffscreenCanvas?: new (w: number, h: number) => OffscreenCanvas;
}

/** Median inter-sample interval → source fps, robust to a stray long gap. */
function inferSourceFps(samples: Mp4Sample[]): number {
  if (samples.length < 2) return 30;
  const deltas: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].timeSec - samples[i - 1].timeSec;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return 30;
  deltas.sort((a, b) => a - b);
  const mid = deltas[Math.floor(deltas.length / 2)];
  return mid > 0 ? 1 / mid : 30;
}

/** Draw a decoded frame upright into a fresh canvas; caller encodes + releases it. */
function drawUpright(
  frame: WcVideoFrame,
  g: WcGlobals,
  rotation: number,
): OffscreenCanvas | HTMLCanvasElement {
  const w = frame.displayWidth;
  const h = frame.displayHeight;
  const rot = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
  const { cw, ch } = orientedSize(w, h, rot);

  if (g.OffscreenCanvas) {
    const canvas = new g.OffscreenCanvas(cw, ch);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("extractFrames: no OffscreenCanvas 2d context");
    applyRotation(ctx, w, h, rot);
    ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, w, h);
    return canvas;
  }
  if (typeof document === "undefined") throw new Error("extractFrames: no canvas available");
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("extractFrames: no canvas 2d context");
  applyRotation(ctx, w, h, rot);
  ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, w, h);
  return canvas;
}

function canvasToJpeg(canvas: OffscreenCanvas | HTMLCanvasElement, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return new Promise<Blob>((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("extractFrames: frame encode failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

/**
 * Extract frames from raw MP4 master bytes. Pass the bytes (e.g. from a signed
 * master URL); keeping I/O out of here makes the decode path unit-friendly.
 */
export async function extractFramesFromBytes(
  bytes: Uint8Array,
  opts: ExtractFramesOptions = {},
): Promise<ExtractFramesResult> {
  const g = globalThis as unknown as WcGlobals;
  const VideoDecoderCtor = g.VideoDecoder;
  const EncodedVideoChunkCtor = g.EncodedVideoChunk;
  if (!VideoDecoderCtor || !EncodedVideoChunkCtor) {
    throw new Error("WebCodecs (VideoDecoder) is unavailable in this browser.");
  }

  const quality = opts.quality ?? 0.92;
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const maxFrames = Math.max(1, opts.maxFrames ?? DEFAULT_MAX_FRAMES);

  const track = demuxMp4Video(bytes);
  if (track.samples.length === 0) throw new Error("extractFrames: no decodable samples.");
  const sourceFps = inferSourceFps(track.samples);
  const targetFps =
    opts.targetFps && opts.targetFps > 0 ? Math.min(opts.targetFps, sourceFps) : sourceFps;
  const decimate = targetFps < sourceFps - 1e-6;
  const slotUs = decimate ? 1e6 / targetFps : 0;

  const config: WcDecoderConfig = {
    codec: track.codec,
    codedWidth: track.width || undefined,
    codedHeight: track.height || undefined,
  };
  if (track.description) config.description = track.description;
  const support = await VideoDecoderCtor.isConfigSupported(config);
  if (support.supported === false) {
    throw new Error(`WebCodecs cannot decode "${track.codec}" in this browser.`);
  }

  const keptSlots = new Set<number>();
  const pending: Array<{ timeUs: number; blob: Blob }> = [];
  const encodeQueue: Array<{ timeUs: number; canvas: OffscreenCanvas | HTMLCanvasElement }> = [];
  let inFlight = 0;
  let encodeError: Error | null = null;
  let truncated = false;
  let keptCount = 0;

  const pump = () => {
    while (inFlight < concurrency && encodeQueue.length > 0) {
      const job = encodeQueue.shift()!;
      inFlight++;
      canvasToJpeg(job.canvas, quality)
        .then((blob) => pending.push({ timeUs: job.timeUs, blob }))
        .catch((e) => {
          encodeError ??= e instanceof Error ? e : new Error(String(e));
        })
        .finally(() => {
          inFlight--;
          pump();
        });
    }
  };

  const decoder = new VideoDecoderCtor({
    output: (frame) => {
      try {
        if (encodeError || keptCount >= maxFrames) {
          if (keptCount >= maxFrames) truncated = true;
          frame.close();
          return;
        }
        const timeUs = frame.timestamp; // read before close() invalidates the frame.
        if (decimate) {
          const slot = Math.round(timeUs / slotUs);
          if (keptSlots.has(slot)) {
            frame.close();
            return;
          }
          keptSlots.add(slot);
        }
        keptCount++;
        const canvas = drawUpright(frame, g, track.rotation);
        frame.close(); // pixels are now in the canvas — release the frame promptly.
        encodeQueue.push({ timeUs, canvas });
        pump();
      } catch (e) {
        encodeError ??= e instanceof Error ? e : new Error(String(e));
        try {
          frame.close();
        } catch {
          /* already closed */
        }
      }
    },
    error: (e) => {
      encodeError ??= new Error(`VideoDecoder error: ${e.message}`);
    },
  });

  try {
    decoder.configure(config);
    for (const sample of track.samples) {
      if (encodeError) break;
      decoder.decode(
        new EncodedVideoChunkCtor({
          type: sample.isSync ? "key" : "delta",
          timestamp: Math.round(sample.timeSec * 1e6),
          data: bytes.subarray(sample.offset, sample.offset + sample.size),
        }),
      );
    }
    await decoder.flush();
  } finally {
    if (decoder.state !== "closed") decoder.close();
  }

  // Drain any encodes still in flight after flush.
  while (inFlight > 0 || encodeQueue.length > 0) {
    pump();
    await new Promise((r) => setTimeout(r, 10));
  }
  if (encodeError) throw encodeError;

  pending.sort((a, b) => a.timeUs - b.timeUs);
  const frames: ExtractedFrame[] = pending.map((p, index) => ({
    index,
    timeSec: p.timeUs / 1e6,
    blob: p.blob,
  }));

  return {
    frames,
    sourceFps,
    fps: decimate ? targetFps : sourceFps,
    width: track.width,
    height: track.height,
    rotation: track.rotation,
    truncated,
  };
}

/** Fetch a signed master URL and extract its frames. */
export async function extractFramesFromUrl(
  srcUrl: string,
  opts: ExtractFramesOptions = {},
): Promise<ExtractFramesResult> {
  if (!srcUrl) throw new Error("extractFrames: missing source URL.");
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`extractFrames: could not fetch master (HTTP ${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return extractFramesFromBytes(bytes, opts);
}
