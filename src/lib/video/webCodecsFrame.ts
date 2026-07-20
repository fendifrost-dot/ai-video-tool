/**
 * WebCodecs frame grab — decodes straight from the MP4 bytes, bypassing <video>.
 * Backgrounded/headless tabs throttle media elements to the point where they never
 * decode (duration NaN, `seeked` never fires); VideoDecoder has no such dependency.
 */
import { demuxMp4Video, selectSampleRange } from "./mp4Demux";

// WebCodecs is absent from the DOM lib in this TS version — declare only what we use.
interface WcVideoFrame {
  readonly timestamp: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  close(): void;
}

type WcData = ArrayBuffer | ArrayBufferView;

interface WcChunkInit {
  type: "key" | "delta";
  timestamp: number;
  data: WcData;
}

interface WcDecoderConfig {
  codec: string;
  description?: WcData;
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
    new (init: { output: (frame: WcVideoFrame) => void; error: (e: DOMException) => void }): WcVideoDecoder;
    isConfigSupported(config: WcDecoderConfig): Promise<{ supported?: boolean }>;
  };
  EncodedVideoChunk?: new (init: WcChunkInit) => object;
  OffscreenCanvas?: new (w: number, h: number) => OffscreenCanvas;
}

export async function decodeFrameWithWebCodecs(srcUrl: string, timeSec: number): Promise<Blob> {
  const g = globalThis as unknown as WcGlobals;
  const VideoDecoderCtor = g.VideoDecoder;
  const EncodedVideoChunkCtor = g.EncodedVideoChunk;
  if (!VideoDecoderCtor || !EncodedVideoChunkCtor) {
    throw new Error("WebCodecs (VideoDecoder) is unavailable in this browser.");
  }
  if (!srcUrl) throw new Error("WebCodecs fallback needs a video source URL.");

  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`Could not fetch video source (HTTP ${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const track = demuxMp4Video(bytes);
  const range = selectSampleRange(track.samples, timeSec);
  if (range.length === 0) throw new Error("WebCodecs fallback found no decodable samples.");

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

  // Keep the latest frame at/before the target; frames after it are closed immediately.
  const targetUs = Math.round(timeSec * 1e6);
  // Held in an object so TS doesn't narrow these to `null` across the decoder callbacks.
  const held: { kept: WcVideoFrame | null; last: WcVideoFrame | null } = { kept: null, last: null };
  let decodeError: Error | null = null;

  const decoder = new VideoDecoderCtor({
    output: (frame) => {
      if (frame.timestamp <= targetUs) {
        held.kept?.close();
        held.kept = frame;
        return;
      }
      held.last?.close();
      held.last = frame;
    },
    error: (e) => {
      decodeError = new Error(`VideoDecoder error: ${e.message}`);
    },
  });

  try {
    decoder.configure(config);
    for (const sample of range) {
      decoder.decode(
        new EncodedVideoChunkCtor({
          type: sample.isSync ? "key" : "delta",
          timestamp: Math.round(sample.timeSec * 1e6),
          data: bytes.subarray(sample.offset, sample.offset + sample.size),
        }),
      );
    }
    await decoder.flush();
    if (decodeError) throw decodeError;

    // Fall back to the last frame emitted if nothing landed at/before the target.
    const frame = held.kept ?? held.last;
    if (!frame) throw new Error("WebCodecs decoded no frames for this timestamp.");
    return await frameToJpeg(frame, g);
  } finally {
    held.kept?.close();
    held.last?.close();
    if (decoder.state !== "closed") decoder.close();
  }
}

async function frameToJpeg(frame: WcVideoFrame, g: WcGlobals): Promise<Blob> {
  const w = frame.displayWidth;
  const h = frame.displayHeight;
  if (!w || !h) throw new Error("Decoded frame has no dimensions.");

  if (g.OffscreenCanvas) {
    const canvas = new g.OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
    if (ctx) {
      ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, w, h);
      return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    }
  }

  if (typeof document === "undefined") {
    throw new Error("No canvas available to encode the decoded frame.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Frame encode failed");
  return blob;
}
