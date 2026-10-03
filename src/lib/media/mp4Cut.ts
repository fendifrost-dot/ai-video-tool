/**
 * Cut a stretch out of a video to the frame — the cut starts on the frame SHOWING at the moment asked for (the one
 * whose time on screen contains that moment, so the cut never begins after it), not on
 * the sync frame before it (which in a long-GOP master can be seconds earlier).
 *
 * The frames are decoded from the sync frame, the ones before the moment are dropped, and the rest are encoded
 * again as H.264 at the source's size and written as a self-contained MP4 whose first frame is time zero. Timing is
 * carried frame by frame from the source's own presentation times: nothing is retimed, resampled or stretched.
 *
 * Where the browser has no encoder, `cutVideo` falls back to copying samples from the sync frame (mp4Trim.ts) and
 * says so: that cut starts early and is longer.
 */
import type { Mp4Sample, Mp4Track } from "./mp4";
import { avcSampleDescription, trimVideo, writeMp4 } from "./mp4Trim";
import type { RangeRead } from "./probe";

export type CutResult = {
  bytes: Uint8Array;
  /** Where the cut really starts in the source, and how long it runs, seconds. */
  start: number;
  seconds: number;
  frames: number;
  /** "exact" = starts on the frame asked for (re-encoded). "copied" = starts on the sync frame before it (untouched samples). */
  method: "exact" | "copied";
  width: number;
  height: number;
};

/** Frames fed past the last wanted one, so a decoder that reorders hands every wanted frame back. */
const LOOKAHEAD = 8;
const TIMESCALE = 90000;
/** The largest picture the cut is written at (a 1080p frame, either way up). Larger sources are scaled to fit. */
const MAX_LONG_SIDE = 1920;
const MAX_SHORT_SIDE = 1080;

type Codecs = { Decoder: typeof VideoDecoder; Encoder: typeof VideoEncoder; Chunk: typeof EncodedVideoChunk };

function globals(): Codecs | null {
  if (typeof VideoDecoder === "undefined" || typeof VideoEncoder === "undefined" || typeof EncodedVideoChunk === "undefined") return null;
  return { Decoder: VideoDecoder, Encoder: VideoEncoder, Chunk: EncodedVideoChunk };
}

/** The size the cut is encoded at: the source's, scaled down to fit a 1080p frame, even numbers. */
export function cutSize(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const k = Math.min(1, MAX_LONG_SIDE / long, MAX_SHORT_SIDE / short);
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** Presentation time of a sample on the file's own clock, seconds. */
export function shownAt(track: Mp4Track, s: Mp4Sample): number {
  return s.dts + track.compositionOffset(s.index) / track.timescale - track.startOffset;
}

export type EncodedSample = { data: Uint8Array; timestamp: number; key: boolean };

/**
 * Lay encoded samples (decode order, presentation timestamps in microseconds from zero) into an MP4. `frameUs` is the
 * length of the last frame.
 */
export function muxAvc(samples: readonly EncodedSample[], avcC: Uint8Array, width: number, height: number, frameUs: number): Uint8Array {
  if (samples.length === 0) throw new Error("nothing was encoded");
  const units = (us: number) => Math.round((us * TIMESCALE) / 1e6);
  const shown = samples.map((s) => units(s.timestamp));
  // decode times are the presentation times in order: with no reordering the two are the same list
  const decode = [...shown].sort((a, b) => a - b);
  const deltas = decode.map((t, i) => (i + 1 < decode.length ? decode[i + 1] - t : Math.max(1, units(frameUs))));
  const raw = shown.map((t, i) => t - decode[i]);
  const shift = Math.max(0, -Math.min(...raw));
  const total = samples.reduce((n, s) => n + s.data.byteLength, 0);
  const payload = new Uint8Array(total);
  let o = 0;
  for (const s of samples) {
    payload.set(s.data, o);
    o += s.data.byteLength;
  }
  return writeMp4({
    timescale: TIMESCALE,
    width,
    height,
    stsd: avcSampleDescription(width, height, avcC),
    deltas,
    offsets: raw.map((r) => r + shift),
    syncs: samples.map((s) => s.key),
    sizes: samples.map((s) => s.data.byteLength),
    payload,
  });
}

const H264_CODECS = ["avc1.640028", "avc1.64002a", "avc1.640033", "avc1.4d0028", "avc1.42e028"];

async function encoderConfig(Encoder: typeof VideoEncoder, width: number, height: number, framerate: number): Promise<VideoEncoderConfig | null> {
  // enough bits that the cut is not visibly softer than the take it came from
  const bitrate = Math.round(Math.max(4_000_000, Math.min(16_000_000, width * height * framerate * 0.16)));
  for (const codec of H264_CODECS) {
    const config: VideoEncoderConfig = { codec, width, height, bitrate, framerate, bitrateMode: "variable", latencyMode: "quality", avc: { format: "avc" } };
    try {
      const support = await Encoder.isConfigSupported(config);
      if (support.supported) return config;
    } catch {
      // try the next profile
    }
  }
  return null;
}

/** Resolves the next time the codec takes something off its queue (event-driven: timers stall in a hidden window). */
function dequeued(codec: { addEventListener: (type: "dequeue", fn: () => void, opts?: { once: boolean }) => void }): Promise<void> {
  return new Promise((resolve) => codec.addEventListener("dequeue", () => resolve(), { once: true }));
}

/** Whether this browser can cut to the frame. */
export async function canCutExact(track: Mp4Track, codecs: Codecs | null = globals()): Promise<boolean> {
  if (!codecs || !track.codec || !track.width || !track.height) return false;
  const size = cutSize(track.width, track.height);
  return !!(await encoderConfig(codecs.Encoder, size.width, size.height, 30));
}

/**
 * Cut [start, start + seconds) to the frame. Throws when the browser cannot (no decoder for the file, no encoder).
 */
export async function cutVideoExact(read: RangeRead, track: Mp4Track, start: number, seconds: number, codecs: Codecs | null = globals()): Promise<CutResult> {
  if (!codecs) throw new Error("this browser has no video encoder");
  if (!track.codec || !track.width || !track.height) throw new Error(`no decoder is known here for ${track.format || "this file"}`);
  const { Decoder, Encoder, Chunk } = codecs;
  const key = track.keyframeAt(Math.max(0, start));
  const endSample = track.sampleAt(Math.max(0, Math.min(start + seconds, track.duration - 0.001)));
  if (!key || !endSample) throw new Error("there is no footage at that moment to cut");
  const lastIndex = Math.min(track.sampleCount - 1, endSample.index + LOOKAHEAD);
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

  const frameSeconds = track.sampleDelta(key.index) / track.timescale || 1 / 30;
  const framerate = Math.max(1, Math.min(120, Math.round(1 / frameSeconds)));
  const size = cutSize(track.width, track.height);
  const decoderConfig: VideoDecoderConfig = { codec: track.codec, codedWidth: track.width, codedHeight: track.height, ...(track.description ? { description: track.description } : {}) };
  if (!(await Decoder.isConfigSupported(decoderConfig).then((s) => s.supported, () => false))) throw new Error(`this browser cannot decode ${track.codec}`);
  const config = await encoderConfig(Encoder, size.width, size.height, framerate);
  if (!config) throw new Error("this browser has no H.264 encoder");

  const startUs = Math.round(start * 1e6);
  const frameUs = Math.round(frameSeconds * 1e6);
  const lengthUs = Math.round(seconds * 1e6);
  const out: EncodedSample[] = [];
  let avcC: Uint8Array | null = null;
  let firstUs: number | null = null;
  let failure: Error | null = null;
  let kept = 0;

  const encoder = new Encoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description;
      if (d && !avcC) avcC = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array((d as ArrayBufferView).buffer.slice((d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteOffset + (d as ArrayBufferView).byteLength));
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      out.push({ data, timestamp: chunk.timestamp, key: chunk.type === "key" });
    },
    error: (e) => {
      failure = failure ?? new Error(e.message || "the encoder failed");
    },
  });
  const decoder = new Decoder({
    output: (frame) => {
      try {
        // the first frame kept is the one SHOWING at `start`: it came on at or before that moment and is still up
        if (failure || frame.timestamp + frameUs <= startUs + 500) return;
        if (firstUs == null) firstUs = frame.timestamp;
        const timestamp = frame.timestamp - firstUs;
        if (timestamp < 0 || timestamp >= lengthUs - 500) return; // before the opening frame, or past the length asked for
        const retimed = new VideoFrame(frame, { timestamp, duration: Math.round(frameSeconds * 1e6) });
        try {
          encoder.encode(retimed, { keyFrame: kept === 0 });
          kept += 1;
        } finally {
          retimed.close();
        }
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
    encoder.configure(config);
    decoder.configure(decoderConfig);
    for (const s of samples) {
      if (failure) break;
      decoder.decode(new Chunk({ type: s.sync ? "key" : "delta", timestamp: Math.round(shownAt(track, s) * 1e6), data: got.bytes.subarray(s.offset - lo, s.offset - lo + s.size) }));
      // keep the pipeline short: a hundred 1080p frames waiting in a queue is a gigabyte
      while (!failure && (decoder.decodeQueueSize > 6 || encoder.encodeQueueSize > 6)) {
        await Promise.race([dequeued(decoder), dequeued(encoder)]);
      }
    }
    if (!failure) await decoder.flush();
    if (!failure) await encoder.flush();
  } finally {
    try {
      decoder.close();
    } catch {
      // already closed
    }
    try {
      encoder.close();
    } catch {
      // already closed
    }
  }
  if (failure) throw failure;
  if (!avcC) throw new Error("the encoder gave no stream description");
  if (out.length === 0 || firstUs == null) throw new Error("no frames came out of that stretch of the file");
  const bytes = muxAvc(out, avcC, size.width, size.height, Math.round(frameSeconds * 1e6));
  const lastUs = Math.max(...out.map((s) => s.timestamp));
  return { bytes, start: firstUs / 1e6, seconds: (lastUs + frameSeconds * 1e6) / 1e6, frames: out.length, method: "exact", width: size.width, height: size.height };
}

/**
 * Cut [start, start + seconds): to the frame where the browser can encode, otherwise from the sync frame before
 * `start` (and at least `seconds` long from there).
 */
export async function cutVideo(read: RangeRead, track: Mp4Track, start: number, seconds: number): Promise<CutResult> {
  if (await canCutExact(track)) return cutVideoExact(read, track, start, seconds);
  const copied = await trimVideo(read, track, start, seconds);
  return { bytes: copied.bytes, start: copied.plan.start, seconds: copied.plan.seconds, frames: copied.plan.frames, method: "copied", width: track.width ?? 0, height: track.height ?? 0 };
}
