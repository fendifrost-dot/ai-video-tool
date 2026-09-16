/**
 * Browser-safe decode of a playable reconstructed MP4 → RGBA for Lane E2.
 *
 * Uses the existing client demux (`mp4Demux`) + WebCodecs `VideoDecoder`,
 * then copies pixels via `VideoFrame.copyTo({ format: "RGBA" })` or canvas
 * `getImageData` (same bridge as `src/lib/garment/canvasRgba.ts`).
 *
 * Hero Frame MAY import this module. Do **not** import `decodeMp4.ts`
 * (node/ffmpeg, `child_process`) from the UI graph.
 *
 * Live Export defaults to the full 72-frame gate
 * (`LIVE_PLAYABLE_DECODE_MAX_FRAMES`). Abort / OOM / timeout keep any
 * partial rasters or step down `LIVE_PLAYABLE_DECODE_FALLBACK_STEPS`
 * (24 then 8) — never a false E2 FAIL, never the 8-frame UI compose.
 *
 * Missing WebCodecs / fetch / sha mismatch → fail closed. Callers keep
 * encode-first INCOMPLETE (`awaiting decoded_frames`).
 */

import { demuxMp4Video, type Mp4Sample } from "@/lib/video/mp4Demux";
import { applyRotation, orientedSize, type WcVideoFrame } from "@/lib/video/webCodecsFrame";
import {
  CANONICAL_CLIP_FRAME_COUNT,
  LIVE_PLAYABLE_DECODE_MAX_FRAMES,
  PLAYABLE_WORKING_FPS,
  livePlayableDecodeTimeoutMs,
  resolveLivePlayableDecodeLadder,
} from "./contract";
import {
  PLAYABLE_MP4_BYTE_LENGTH,
  PLAYABLE_MP4_RELATIVE_PATH,
  PLAYABLE_MP4_SHA256,
  type PlayableDecodedRgba,
} from "./videoQaPlug";

export type LivePlayableDecodeFallbackReason =
  | "none"
  | "timeout"
  | "oom"
  | "abort"
  | "decode_error"
  | "progressive_ladder";

export type DecodePlayableMp4BrowserOk = {
  ok: true;
  decoder: "webcodecs";
  width: number;
  height: number;
  fps: number;
  sourceFrameCount: number;
  frameCount: number;
  truncated: boolean;
  liveSample: boolean;
  requestedMaxFrames: number;
  fallbackReason: LivePlayableDecodeFallbackReason;
  frames: PlayableDecodedRgba[];
  sha256?: string;
};

export type DecodePlayableMp4BrowserFailCode =
  | "webcodecs_unavailable"
  | "codec_unsupported"
  | "empty"
  | "decode_failed"
  | "canvas_unavailable"
  | "fetch_failed"
  | "sha256_mismatch"
  | "size_mismatch";

export type DecodePlayableMp4BrowserFail = {
  ok: false;
  decoder: "webcodecs" | "none";
  code: DecodePlayableMp4BrowserFailCode;
  message: string;
};

export type DecodePlayableMp4BrowserResult =
  | DecodePlayableMp4BrowserOk
  | DecodePlayableMp4BrowserFail;

export type DecodePlayableMp4BrowserInput = {
  mp4Bytes?: Uint8Array;
  /** Hard cap. Live Export defaults to LIVE_PLAYABLE_DECODE_MAX_FRAMES (72). Omit to decode all demuxed samples. */
  maxFrames?: number;
  /** 0-based source index to start. Must land on/after a sync sample. */
  startFrame?: number;
  /** In-flight RGBA copy wait. Default scales with maxFrames, capped at 60 s. */
  timeoutMs?: number;
  abortSignal?: AbortSignal;
};

interface WcDecoderConfig {
  codec: string;
  description?: ArrayBuffer | ArrayBufferView;
  codedWidth?: number;
  codedHeight?: number;
}

interface WcCopyVideoFrame extends WcVideoFrame {
  allocationSize?(options?: { format?: string }): number;
  copyTo?(destination: BufferSource, options?: { format?: string }): Promise<unknown>;
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
      output: (f: WcCopyVideoFrame) => void;
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

function fail(
  code: DecodePlayableMp4BrowserFailCode,
  message: string,
  decoder: DecodePlayableMp4BrowserFail["decoder"] = "webcodecs",
): DecodePlayableMp4BrowserFail {
  return { ok: false, decoder, code, message };
}

export function classifyLiveDecodeFailure(
  message: string,
): Exclude<LivePlayableDecodeFallbackReason, "none" | "progressive_ladder"> {
  const m = message.toLowerCase();
  if (m.includes("timeout") || m.includes("deadline") || m.includes("timed out")) {
    return "timeout";
  }
  if (
    m.includes("out of memory") ||
    m.includes("oom") ||
    m.includes("allocation failed") ||
    m.includes("allocationerror")
  ) {
    return "oom";
  }
  if (m.includes("abort")) return "abort";
  return "decode_error";
}

/** Abort / OOM / timeout / empty-after-decode may retry a smaller sample. */
export function isRecoverableLiveDecodeFailure(result: DecodePlayableMp4BrowserFail): boolean {
  if (result.code === "decode_failed") return true;
  if (result.code === "empty" && /decoded no frames|timeout|abort|oom/i.test(result.message)) {
    return true;
  }
  return false;
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

/** True when this runtime can construct a WebCodecs VideoDecoder. */
export function webCodecsVideoDecoderAvailable(): boolean {
  const g = globalThis as unknown as WcGlobals;
  return typeof g.VideoDecoder === "function" && typeof g.EncodedVideoChunk === "function";
}

function inferSourceFps(samples: Mp4Sample[]): number {
  if (samples.length < 2) return PLAYABLE_WORKING_FPS;
  const deltas: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i]!.timeSec - samples[i - 1]!.timeSec;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return PLAYABLE_WORKING_FPS;
  deltas.sort((a, b) => a - b);
  const mid = deltas[Math.floor(deltas.length / 2)]!;
  return mid > 0 ? 1 / mid : PLAYABLE_WORKING_FPS;
}

function drawUpright(
  frame: WcCopyVideoFrame,
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
    if (!ctx) throw new Error("decodeMp4Browser: no OffscreenCanvas 2d context");
    applyRotation(ctx, w, h, rot);
    ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, w, h);
    return canvas;
  }
  if (typeof document === "undefined") {
    throw new Error("decodeMp4Browser: no canvas available");
  }
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("decodeMp4Browser: no canvas 2d context");
  applyRotation(ctx, w, h, rot);
  ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, w, h);
  return canvas;
}

function rgbaFromCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  width: number,
  height: number,
): Uint8Array {
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx || typeof ctx.getImageData !== "function") {
    throw new Error("decodeMp4Browser: canvas getImageData unavailable");
  }
  const id = ctx.getImageData(0, 0, width, height);
  return new Uint8Array(id.data);
}

async function rgbaFromVideoFrame(
  frame: WcCopyVideoFrame,
  g: WcGlobals,
  rotation: number,
): Promise<{ width: number; height: number; data: Uint8Array }> {
  const rot = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
  const canCopy =
    rot === 0 && typeof frame.copyTo === "function" && typeof frame.allocationSize === "function";
  if (canCopy) {
    try {
      const size = frame.allocationSize!({ format: "RGBA" });
      const data = new Uint8Array(size);
      await frame.copyTo!(data, { format: "RGBA" });
      const width = frame.displayWidth;
      const height = frame.displayHeight;
      if (data.byteLength !== width * height * 4) {
        throw new Error(`decodeMp4Browser: copyTo size ${data.byteLength} != ${width}×${height}×4`);
      }
      return { width, height, data };
    } catch {
      // Fall through to canvas (some browsers reject RGBA copyTo).
    }
  }

  const canvas = drawUpright(frame, g, rotation);
  const width = canvas.width;
  const height = canvas.height;
  return { width, height, data: rgbaFromCanvas(canvas, width, height) };
}

/**
 * Decode playable MP4 bytes with WebCodecs. Empty / unsupported → fail object,
 * never throws for the unsupported-browser case.
 */
export async function decodePlayableMp4Browser(
  input: DecodePlayableMp4BrowserInput,
): Promise<DecodePlayableMp4BrowserResult> {
  if (!webCodecsVideoDecoderAvailable()) {
    return fail(
      "webcodecs_unavailable",
      "WebCodecs (VideoDecoder) is unavailable in this browser.",
      "none",
    );
  }

  const bytes = input.mp4Bytes;
  if (!bytes || bytes.byteLength === 0) {
    return fail("empty", "decode_empty_mp4", "none");
  }

  const g = globalThis as unknown as WcGlobals;
  const VideoDecoderCtor = g.VideoDecoder!;
  const EncodedVideoChunkCtor = g.EncodedVideoChunk!;

  let track;
  try {
    track = demuxMp4Video(bytes);
  } catch (e) {
    return fail("decode_failed", e instanceof Error ? e.message : String(e));
  }
  if (track.samples.length === 0) {
    return fail("empty", "decode_empty_source");
  }

  const startFrame = Math.max(0, Math.floor(input.startFrame ?? 0));
  const sourceFrameCount = track.samples.length;
  if (startFrame >= sourceFrameCount) {
    return fail("empty", `startFrame ${startFrame} >= sourceFrameCount ${sourceFrameCount}`);
  }

  if (isAborted(input.abortSignal)) {
    return fail("decode_failed", "decode_aborted");
  }

  const remaining = sourceFrameCount - startFrame;
  const requestedMaxFrames = Math.max(1, input.maxFrames ?? remaining);
  const frameCount = Math.min(remaining, requestedMaxFrames);
  const timeoutMs = Math.max(1, input.timeoutMs ?? livePlayableDecodeTimeoutMs(frameCount));

  const config: WcDecoderConfig = {
    codec: track.codec,
    codedWidth: track.width || undefined,
    codedHeight: track.height || undefined,
  };
  if (track.description) config.description = track.description;

  try {
    const support = await VideoDecoderCtor.isConfigSupported(config);
    if (support.supported === false) {
      return fail("codec_unsupported", `WebCodecs cannot decode "${track.codec}" in this browser.`);
    }
  } catch (e) {
    return fail("codec_unsupported", e instanceof Error ? e.message : String(e));
  }

  const pending: Array<{ timeUs: number; image: PlayableDecodedRgba["image"] }> = [];
  let decodeError: Error | null = null;
  let inFlight = 0;
  let keptCount = 0;
  const startTimeUs = Math.round(track.samples[startFrame]!.timeSec * 1e6);

  const decoder = new VideoDecoderCtor({
    output: (frame) => {
      const timeUs = frame.timestamp;
      if (decodeError || timeUs < startTimeUs || keptCount >= frameCount) {
        frame.close();
        return;
      }
      keptCount++;
      inFlight++;
      void rgbaFromVideoFrame(frame, g, track.rotation)
        .then((image) => {
          pending.push({
            timeUs,
            image: { width: image.width, height: image.height, data: image.data },
          });
        })
        .catch((e) => {
          decodeError ??= e instanceof Error ? e : new Error(String(e));
        })
        .finally(() => {
          inFlight--;
          try {
            frame.close();
          } catch {
            /* already closed */
          }
        });
    },
    error: (e) => {
      decodeError ??= new Error(`VideoDecoder error: ${e.message}`);
    },
  });

  try {
    decoder.configure(config);
    const end = startFrame + frameCount;
    // Always start at the previous sync sample so P-frames after `startFrame` decode.
    let from = startFrame;
    while (from > 0 && !track.samples[from]!.isSync) from--;
    for (let i = from; i < end; i++) {
      if (decodeError || isAborted(input.abortSignal)) break;
      const sample = track.samples[i]!;
      decoder.decode(
        new EncodedVideoChunkCtor({
          type: sample.isSync ? "key" : "delta",
          timestamp: Math.round(sample.timeSec * 1e6),
          data: bytes.subarray(sample.offset, sample.offset + sample.size),
        }),
      );
    }
    await decoder.flush();
  } catch (e) {
    decodeError ??= e instanceof Error ? e : new Error(String(e));
  } finally {
    if (decoder.state !== "closed") decoder.close();
  }

  const deadline = Date.now() + timeoutMs;
  while (inFlight > 0 && Date.now() < deadline) {
    if (isAborted(input.abortSignal)) break;
    await new Promise((r) => setTimeout(r, 0));
  }

  if (isAborted(input.abortSignal)) {
    decodeError ??= new Error("decode_aborted");
  } else if (inFlight > 0 && !decodeError) {
    decodeError = new Error("decode_timeout");
  }

  if (pending.length === 0) {
    if (decodeError) return fail("decode_failed", decodeError.message);
    return fail("empty", "WebCodecs decoded no frames.");
  }

  pending.sort((a, b) => a.timeUs - b.timeUs);
  const sliced = pending.slice(0, frameCount);
  const first = sliced[0]!.image;
  if (sliced.some((f) => f.image.width !== first.width || f.image.height !== first.height)) {
    return fail("size_mismatch", "decoded frames have mixed dimensions");
  }

  const frames: PlayableDecodedRgba[] = sliced.map((p, i) => ({
    index: startFrame + i,
    image: p.image,
  }));

  const actualCount = frames.length;
  const truncated = startFrame + actualCount < sourceFrameCount;
  const liveSample = truncated || actualCount < CANONICAL_CLIP_FRAME_COUNT;
  const fallbackReason: LivePlayableDecodeFallbackReason = decodeError
    ? classifyLiveDecodeFailure(decodeError.message)
    : "none";

  return {
    ok: true,
    decoder: "webcodecs",
    width: first.width,
    height: first.height,
    fps: inferSourceFps(track.samples),
    sourceFrameCount,
    frameCount: actualCount,
    truncated,
    liveSample,
    requestedMaxFrames,
    fallbackReason,
    frames,
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fetch candidates for the committed gate MP4 after Lovable frontend Publish.
 * `docs/` is not a published static tree. Prefer a same-origin Vite/`public`
 * URL, then GitHub raw of canonical `main` (CORS is environment-dependent).
 */
export function committedPlayableMp4FetchCandidates(overrideUrl?: string): string[] {
  const extra = overrideUrl?.trim() ? [overrideUrl.trim()] : [];
  return [
    ...extra,
    "/reconstruct/playable-76fe7438.mp4",
    `/${PLAYABLE_MP4_RELATIVE_PATH}`,
    `https://raw.githubusercontent.com/fendifrost-dot/ai-video-tool/main/${PLAYABLE_MP4_RELATIVE_PATH}`,
  ];
}

export async function fetchPlayableMp4Bytes(input: {
  url?: string;
  expectedSha256?: string;
  expectedByteLength?: number;
}): Promise<
  | { ok: true; bytes: Uint8Array; url: string; sha256: string }
  | { ok: false; code: "fetch_failed" | "sha256_mismatch"; message: string }
> {
  const urls = committedPlayableMp4FetchCandidates(input.url);
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        errors.push(`${url} HTTP ${res.status}`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength === 0) {
        errors.push(`${url} empty`);
        continue;
      }
      const sha = await sha256Hex(bytes);
      if (input.expectedByteLength !== undefined && bytes.byteLength !== input.expectedByteLength) {
        errors.push(`${url} byteLength ${bytes.byteLength} != ${input.expectedByteLength}`);
        continue;
      }
      if (input.expectedSha256 && sha !== input.expectedSha256) {
        return {
          ok: false,
          code: "sha256_mismatch",
          message: `sha256 ${sha.slice(0, 8)}… != expected ${input.expectedSha256.slice(0, 8)}…`,
        };
      }
      return { ok: true, bytes, url, sha256: sha };
    } catch (e) {
      errors.push(`${url} ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: false, code: "fetch_failed", message: errors.join("; ") || "fetch_failed" };
}

/**
 * Live Export helper: fetch the committed gate MP4 (or use injected bytes)
 * and decode up to `maxFrames` (default 72). Abort / OOM / timeout keep a
 * partial sample when any rasters landed, else step down the fallback
 * ladder. Fail closed → caller keeps INCOMPLETE. Never pairs the 8-frame
 * UI compose onto the gate.
 */
export async function decodeCommittedPlayableMp4ForLive(
  input: {
    mp4Bytes?: Uint8Array;
    mp4Url?: string;
    maxFrames?: number;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
    /** Default true: 72 → 24 → 8 when a larger attempt yields 0 frames. */
    progressiveFallback?: boolean;
  } = {},
): Promise<DecodePlayableMp4BrowserResult> {
  const requestedMaxFrames = Math.max(1, input.maxFrames ?? LIVE_PLAYABLE_DECODE_MAX_FRAMES);
  const ladder =
    input.progressiveFallback === false
      ? [requestedMaxFrames]
      : resolveLivePlayableDecodeLadder(requestedMaxFrames);

  let bytes = input.mp4Bytes;
  let sha: string | undefined;
  if (!bytes) {
    const fetched = await fetchPlayableMp4Bytes({
      url: input.mp4Url,
      expectedSha256: PLAYABLE_MP4_SHA256,
      expectedByteLength: PLAYABLE_MP4_BYTE_LENGTH,
    });
    if (!fetched.ok) {
      return fail(fetched.code, fetched.message, "none");
    }
    bytes = fetched.bytes;
    sha = fetched.sha256;
  } else {
    sha = await sha256Hex(bytes);
    if (sha !== PLAYABLE_MP4_SHA256) {
      return fail(
        "sha256_mismatch",
        `injected bytes sha256 ${sha.slice(0, 8)}… != gate ${PLAYABLE_MP4_SHA256.slice(0, 8)}…`,
        "none",
      );
    }
  }

  let lastFail: DecodePlayableMp4BrowserFail | null = null;
  for (let i = 0; i < ladder.length; i++) {
    const cap = ladder[i]!;
    if (isAborted(input.abortSignal)) {
      return fail("decode_failed", "decode_aborted");
    }
    const decoded = await decodePlayableMp4Browser({
      mp4Bytes: bytes,
      maxFrames: cap,
      timeoutMs: input.timeoutMs ?? livePlayableDecodeTimeoutMs(cap),
      abortSignal: input.abortSignal,
    });
    if (decoded.ok) {
      const steppedDown = cap < requestedMaxFrames && decoded.fallbackReason === "none";
      return {
        ...decoded,
        sha256: sha,
        requestedMaxFrames,
        fallbackReason: steppedDown ? "progressive_ladder" : decoded.fallbackReason,
      };
    }
    lastFail = decoded;
    const canRetry = isRecoverableLiveDecodeFailure(decoded) && i < ladder.length - 1;
    if (!canRetry) return decoded;
  }
  return lastFail ?? fail("decode_failed", "live_decode_exhausted");
}

export function formatPlayableBrowserDecodeNote(result: DecodePlayableMp4BrowserResult): string {
  if (!result.ok) {
    return `browserDecode=${result.code} (INCOMPLETE awaiting decoded_frames preserved).`;
  }
  if (!result.liveSample) {
    return `browserDecode=webcodecs ${result.width}×${result.height} fullDecode frames=${result.frameCount} source=${result.sourceFrameCount}.`;
  }
  const fallback = result.fallbackReason !== "none" ? ` (fallback=${result.fallbackReason})` : "";
  return `browserDecode=webcodecs ${result.width}×${result.height} liveSample maxFrames=${result.frameCount} of source=${result.sourceFrameCount}${fallback} (not the 8-frame UI compose).`;
}
