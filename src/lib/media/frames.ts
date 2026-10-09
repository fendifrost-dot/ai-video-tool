/**
 * Pictures out of a video file without a media element: the frame showing at a given moment, decoded from the sync
 * frame before it. What the storyboard's frame strips and Review's contact sheet are drawn from — and the only way to
 * LOOK at a project's footage in a window that is not on screen, where a browser loads no <video> at all.
 *
 * It is for looking, not for measuring: a frame is chosen by decode time, so in a file with reordered frames it can
 * be a frame or two away from the one a player would show.
 */
import type { Mp4Sample, Mp4Track } from "./mp4";
import { httpRange, probeVideo, type RangeRead, type VideoProbe } from "./probe";

/** Frames fed past the wanted one, so a decoder that reorders has what it needs to hand the wanted one back. */
const LOOKAHEAD = 4;
/** More frames than this between the sync frame and the wanted one: show the sync frame instead of decoding them all. */
export const MAX_SAMPLES_PER_FRAME = 240;

export type FrameResult = { ok: true; frame: VideoFrame; time: number; requested: number } | { ok: false; requested: number; note: string };

type DecoderCtor = typeof VideoDecoder;

/** The samples to decode to show `seconds`: from its sync frame through a little past it. */
export function samplesFor(track: Mp4Track, seconds: number, maxSamples = MAX_SAMPLES_PER_FRAME): { from: number; to: number; target: number } | null {
  const clamped = Math.max(0, Math.min(seconds, Math.max(0, track.duration - 0.001)));
  const target = track.sampleAt(clamped);
  const key = track.keyframeAt(clamped);
  if (!target || !key) return null;
  if (target.index - key.index > maxSamples) return { from: key.index, to: key.index, target: key.index };
  return { from: key.index, to: Math.min(track.sampleCount - 1, target.index + LOOKAHEAD), target: target.index };
}

export async function frameAt(
  read: RangeRead,
  track: Mp4Track,
  seconds: number,
  Decoder: DecoderCtor | undefined = typeof VideoDecoder === "undefined" ? undefined : VideoDecoder,
): Promise<FrameResult> {
  const fail = (note: string): FrameResult => ({ ok: false, requested: seconds, note });
  if (!track.codec) return fail(`no decoder is known here for ${track.format || "this file"}`);
  if (!Decoder) return fail("this browser has no video decoder");
  const plan = samplesFor(track, seconds);
  if (!plan) return fail("no frame at that time");
  const samples: Mp4Sample[] = [];
  for (let i = plan.from; i <= plan.to; i++) {
    const s = track.sample(i);
    if (!s) return fail("the file's index is incomplete");
    samples.push(s);
  }
  const first = Math.min(...samples.map((s) => s.offset));
  const last = Math.max(...samples.map((s) => s.offset + s.size));
  let bytes: Uint8Array;
  try {
    bytes = (await read(first, last - 1)).bytes;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "the frame could not be fetched");
  }
  if (bytes.byteLength < last - first) return fail("the frame's bytes could not be fetched");
  const config: VideoDecoderConfig = { codec: track.codec, codedWidth: track.width ?? undefined, codedHeight: track.height ?? undefined, ...(track.description ? { description: track.description } : {}) };
  try {
    const support = await Decoder.isConfigSupported(config);
    if (!support.supported) return fail(`this browser cannot decode ${track.codec}`);
  } catch {
    return fail(`this browser cannot decode ${track.codec}`);
  }
  const want = Math.round((track.sample(plan.target)?.dts ?? 0) * 1e6);
  return await new Promise<FrameResult>((resolve) => {
    let best: VideoFrame | null = null;
    let done = false;
    const finish = (r: FrameResult) => {
      if (done) return;
      done = true;
      try {
        decoder.close();
      } catch {
        // already closed
      }
      if (!r.ok && best) best.close();
      resolve(r);
    };
    const decoder = new Decoder({
      output: (frame) => {
        if (done) return frame.close();
        if (!best || Math.abs(frame.timestamp - want) < Math.abs(best.timestamp - want)) {
          best?.close();
          best = frame;
        } else frame.close();
      },
      error: (e) => finish(fail(e.message || "the decoder refused the file")),
    });
    try {
      decoder.configure(config);
      for (const s of samples) {
        decoder.decode(new EncodedVideoChunk({ type: s.sync ? "key" : "delta", timestamp: Math.round(s.dts * 1e6), data: bytes.subarray(s.offset - first, s.offset - first + s.size) }));
      }
      void decoder.flush().then(
        () => (best ? finish({ ok: true, frame: best, time: Math.max(0, best.timestamp / 1e6 - track.startOffset), requested: seconds }) : finish(fail("the decoder returned no picture"))),
        (e: unknown) => finish(fail(e instanceof Error ? e.message : "the decoder refused the file")),
      );
    } catch (e) {
      finish(fail(e instanceof Error ? e.message : "the decoder refused the file"));
    }
    setTimeout(() => finish(fail("the decoder did not answer in time")), 25000);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// One index per file, a few decodes at a time

type Opened = { read: RangeRead; probe: VideoProbe };
const opened = new Map<string, Promise<Opened>>();

/** A file's index, read once per page for a given key (the file's own identity, not its signed link). */
export function openVideo(key: string, url: string): Promise<Opened> {
  let hit = opened.get(key);
  if (!hit) {
    const read = httpRange(url);
    hit = probeVideo(read).then((probe) => ({ read, probe }));
    opened.set(key, hit);
    // a failed open is not remembered: the link may have expired
    hit.then((o) => !o.probe.video && opened.delete(key)).catch(() => opened.delete(key));
  }
  return hit;
}

const MAX_AT_ONCE = 3;
let running = 0;
const waiting: (() => void)[] = [];

/** Run `job` when fewer than three decodes are in flight. */
export async function queued<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_AT_ONCE) await new Promise<void>((r) => waiting.push(r));
  running += 1;
  try {
    return await job();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/** The frame of a file at a moment, by the file's key and link. */
export async function frameOf(key: string, url: string, seconds: number): Promise<FrameResult> {
  return queued(async () => {
    const { read, probe } = await openVideo(key, url);
    if (!probe.resolves) return { ok: false, requested: seconds, note: probe.note ?? "the file could not be opened" };
    if (!probe.video) return { ok: false, requested: seconds, note: probe.note ?? "no video in this file" };
    return frameAt(read, probe.video, seconds);
  });
}

/** `n` moments spread across [start, end]: the first a little in, the last a little before the end. */
export function spreadTimes(start: number, end: number, n: number): number[] {
  const span = Math.max(0, end - start);
  if (n <= 1 || span === 0) return [start + span / 2];
  const inset = Math.min(0.15, span / (n * 2));
  return Array.from({ length: n }, (_, i) => Math.round((start + inset + ((span - 2 * inset) * i) / (n - 1)) * 1000) / 1000);
}
