import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cutSize, cutVideoExact, muxAvc, shownAt, type EncodedSample } from "./mp4Cut";
import { probeVideo, type RangeRead } from "./probe";

const bytesOf = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, "__fixtures__", name)));
const reader = (file: Uint8Array): RangeRead => async (start, end) => ({ status: 206, bytes: file.subarray(start, Math.min(end, file.byteLength - 1) + 1), total: file.byteLength, contentType: "video/mp4" });

describe("the size a cut is written at", () => {
  it("is the source's own up to a 1080p frame, either way up, and even", () => {
    expect(cutSize(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(cutSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(cutSize(2160, 3840)).toEqual({ width: 1080, height: 1920 });
    expect(cutSize(721, 1281)).toEqual({ width: 722, height: 1282 });
  });
});

describe("laying encoded frames into a file", () => {
  it("writes an MP4 this reader opens, with every frame where it was put", async () => {
    const source = bytesOf("tiny_h264_faststart.mp4");
    const track = (await probeVideo(reader(source))).video!;
    // re-lay the fixture's own frames (decode order, presentation times) as if an encoder had just produced them
    const samples: EncodedSample[] = [];
    const base = shownAt(track, track.sample(0)!);
    for (let i = 0; i < 24; i++) {
      const s = track.sample(i)!;
      samples.push({ data: source.subarray(s.offset, s.offset + s.size), timestamp: Math.round((shownAt(track, s) - base) * 1e6), key: s.sync });
    }
    const out = muxAvc(samples, track.description!, track.width!, track.height!, Math.round(1e6 / 24));
    const probe = await probeVideo(reader(out));
    const t = probe.video!;
    expect(probe.index).toBe("front");
    expect(t.codec).toBe(track.codec);
    expect([t.width, t.height]).toEqual([track.width, track.height]);
    expect(t.sampleCount).toBe(24);
    expect(t.duration).toBeCloseTo(1, 2);
    expect(t.sample(0)!.sync).toBe(true);
    // each frame is shown when it was shown in the source, and its bytes are its own
    for (let i = 0; i < 24; i++) {
      const a = t.sample(i)!;
      expect(shownAt(t, a)).toBeCloseTo(samples[i].timestamp / 1e6, 3);
      expect(a.size).toBe(samples[i].data.byteLength);
    }
  });
});

describe("cutting to the frame", () => {
  // stand-ins for the browser's codecs: the decoder hands back one "frame" per chunk in presentation order, the
  // encoder turns each frame into one sample. What is under test is which frames are kept and how they are timed.
  type Frame = { timestamp: number; close: () => void };
  function codecs(log: { encoded: number[]; keyRequests: boolean[] }) {
    class Decoder extends EventTarget {
      decodeQueueSize = 0;
      private pending: Frame[] = [];
      constructor(private init: { output: (f: Frame) => void; error: (e: Error) => void }) {
        super();
      }
      static async isConfigSupported() {
        return { supported: true };
      }
      configure() {}
      decode(chunk: { timestamp: number }) {
        this.pending.push({ timestamp: chunk.timestamp, close: () => undefined });
      }
      async flush() {
        for (const f of this.pending.sort((a, b) => a.timestamp - b.timestamp)) this.init.output(f);
        this.pending = [];
      }
      close() {}
    }
    class Encoder extends EventTarget {
      encodeQueueSize = 0;
      private queue: { timestamp: number; key: boolean }[] = [];
      constructor(private init: { output: (c: unknown, m: unknown) => void; error: (e: Error) => void }) {
        super();
      }
      static async isConfigSupported() {
        return { supported: true };
      }
      configure() {}
      encode(frame: Frame, opts: { keyFrame: boolean }) {
        log.encoded.push(frame.timestamp);
        log.keyRequests.push(opts.keyFrame);
        this.queue.push({ timestamp: frame.timestamp, key: opts.keyFrame });
      }
      async flush() {
        this.queue.forEach((q, i) =>
          this.init.output(
            { byteLength: 3, timestamp: q.timestamp, type: q.key ? "key" : "delta", copyTo: (d: Uint8Array) => d.set([1, 2, 3]) },
            i === 0 ? { decoderConfig: { description: new Uint8Array([1, 100, 0, 40, 255, 225, 0, 0, 1, 0, 0]).buffer } } : undefined,
          ),
        );
      }
      close() {}
    }
    class Chunk {
      timestamp: number;
      constructor(init: { timestamp: number }) {
        this.timestamp = init.timestamp;
      }
    }
    return { Decoder, Encoder, Chunk } as never;
  }

  it("keeps the frame showing at the moment asked for and every frame after it, retimed from zero — nothing before", async () => {
    const source = bytesOf("tiny_h264_faststart.mp4");
    const read = reader(source);
    const track = (await probeVideo(read)).video!;
    const g = globalThis as unknown as { VideoFrame?: unknown };
    const had = g.VideoFrame;
    g.VideoFrame = class {
      timestamp: number;
      constructor(_src: unknown, init: { timestamp: number }) {
        this.timestamp = init.timestamp;
      }
      close() {}
    };
    try {
      const log = { encoded: [] as number[], keyRequests: [] as boolean[] };
      // 24 fps, a sync frame every 12 frames: 0.7 s is frame 17 (16.8), well inside a group
      const cut = await cutVideoExact(read, track, 0.7, 1, codecs(log));
      expect(cut.method).toBe("exact");
      expect(cut.frames).toBe(24);
      // the cut starts on the frame nearest 0.7 s — not on the sync frame at 0.5 s
      expect(cut.start).toBeCloseTo(17 / 24, 3);
      expect(cut.seconds).toBeCloseTo(1, 2);
      expect(log.encoded[0]).toBe(0);
      expect(log.encoded[1]).toBeCloseTo(1e6 / 24, -1);
      expect(log.keyRequests[0]).toBe(true);
      expect(log.keyRequests.slice(1).every((k) => !k)).toBe(true);
      const out = (await probeVideo(reader(cut.bytes))).video!;
      expect(out.sampleCount).toBe(24);
      expect(out.duration).toBeCloseTo(1, 2);
    } finally {
      g.VideoFrame = had;
    }
  });

  it("refuses plainly where the browser has no encoder", async () => {
    const source = bytesOf("tiny_h264_faststart.mp4");
    const track = (await probeVideo(reader(source))).video!;
    await expect(cutVideoExact(reader(source), track, 0.7, 1, null)).rejects.toThrow(/no video encoder/);
  });
});
