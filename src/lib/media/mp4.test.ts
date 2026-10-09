import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { avcCodec, hevcCodec, parseWavHeader, sniffIsoBmff, vp9Codec, rotationFromMatrix } from "./mp4";
import { decodeFrameAt, probeAudio, probeVideo, type RangeRead } from "./probe";

/**
 * The reader against files written by ffmpeg, with ffprobe's account of them as the truth (the numbers below are
 * ffprobe's: `-show_entries packet=pts_time,dts_time,flags,pos,size`).
 */
const here = dirname(fileURLToPath(import.meta.url));
const file = (name: string) => new Uint8Array(readFileSync(join(here, "__fixtures__", name)));

/** Range reads of a file on disk, counting what is asked for. */
function reader(bytes: Uint8Array, calls: [number, number][] = [], status = 206): RangeRead {
  return async (start, end) => {
    calls.push([start, end]);
    return { status, bytes: bytes.subarray(start, Math.min(bytes.byteLength, end + 1)), total: bytes.byteLength, contentType: "video/mp4" };
  };
}

describe("reading an MP4 without a media element", () => {
  it("reads a file whose index is at the front", async () => {
    const p = await probeVideo(reader(file("tiny_h264_faststart.mp4")));
    expect(p).toMatchObject({ resolves: true, container: "mp4", index: "front", hasAudio: false, note: null });
    expect(p.video).toMatchObject({ kind: "video", format: "avc1", width: 96, height: 54, sampleCount: 72, syncCount: 6 });
    expect(p.video!.duration).toBeCloseTo(3, 3);
    expect(p.video!.codec).toMatch(/^avc1\.64[0-9a-f]{4}$/); // High profile
    expect(p.video!.description!.byteLength).toBeGreaterThan(10);
  });

  it("finds the index when it is at the end of the file, past the picture data", async () => {
    const calls: [number, number][] = [];
    const bytes = file("tiny_h264_moov_last.mp4");
    // make the file "large" for the reader: only the first 64 bytes come back from the first read
    const read: RangeRead = async (start, end) => {
      calls.push([start, end]);
      const cappedEnd = start === 0 ? Math.min(end, 63) : end;
      return { status: 206, bytes: bytes.subarray(start, Math.min(bytes.byteLength, cappedEnd + 1)), total: bytes.byteLength, contentType: "video/mp4" };
    };
    const p = await probeVideo(read);
    expect(p.index).toBe("front"); // a 24 KB file: its end is still within the first read's reach
    expect(p.video).toMatchObject({ format: "avc1", width: 54, height: 96, sampleCount: 60, syncCount: 4 });
    expect(p.video!.codec).toMatch(/^avc1\.42/); // Baseline
    expect(p.hasAudio).toBe(true);
    // it walked ftyp → free → mdat by their sizes and fetched the moov by its own range
    expect(calls).toContainEqual([20764, 20764 + 3090 - 1]);
  });

  it("finds the frame a moment lands on, and the sync frame a player would decode first", async () => {
    const v = (await probeVideo(reader(file("tiny_h264_faststart.mp4")))).video!;
    // ffprobe: sync frames at packets 0, 12, 24, 36, 48, 60 — packet 12 at byte 5325, 1391 bytes
    expect(v.keyframeAt(0)).toMatchObject({ index: 0, offset: 1615, size: 1875, sync: true });
    expect(v.keyframeAt(0.7)).toMatchObject({ index: 12, offset: 5325, size: 1391, sync: true });
    expect(v.keyframeAt(2.95)).toMatchObject({ index: 60, offset: 19015, size: 1510 });
    expect(v.sampleAt(0.7)!.index).toBeGreaterThan(12);
    expect(v.sampleAt(0.7)!.sync).toBe(false);
    // past the end: the last frame, not nothing
    expect(v.keyframeAt(99)).toMatchObject({ index: 60 });
    const m = (await probeVideo(reader(file("tiny_h264_moov_last.mp4")))).video!;
    expect(m.keyframeAt(1.2)).toMatchObject({ index: 30, offset: 10586, size: 1592 });
  });

  it("reads a VP9 MP4 and names its codec", async () => {
    const p = await probeVideo(reader(file("tiny_vp9.mp4")));
    expect(p.video).toMatchObject({ format: "vp09", width: 64, height: 64, sampleCount: 48, syncCount: 4, description: null });
    expect(p.video!.codec).toMatch(/^vp09\.00\.\d\d\.08$/);
    expect(p.video!.keyframeAt(0.9)).toMatchObject({ index: 12, offset: 3641, size: 1815 });
  });

  it("says what it could not do rather than guessing", async () => {
    expect(await probeVideo(reader(file("tiny_h264_faststart.mp4"), [], 403))).toMatchObject({ resolves: false, status: 403, note: "the link answered 403" });
    expect(await probeVideo(reader(new TextEncoder().encode("not a video at all, just text".repeat(4))))).toMatchObject({ resolves: true, container: "unknown", note: "not an MP4 or MOV file" });
    expect(await probeVideo(reader(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8])))).toMatchObject({ container: "webm" });
    const failing: RangeRead = async () => {
      throw new Error("offline");
    };
    expect(await probeVideo(failing)).toMatchObject({ resolves: false, note: "offline" });
  });

  it("hands the decoder the sync frame's own bytes and the file's decoder record", async () => {
    const bytes = file("tiny_h264_faststart.mp4");
    const calls: [number, number][] = [];
    const v = (await probeVideo(reader(bytes))).video!;
    const seen: { config?: VideoDecoderConfig; chunk?: { type: string; timestamp: number; byteLength: number } } = {};
    class FakeDecoder {
      static async isConfigSupported(config: VideoDecoderConfig) {
        return { supported: config.codec.startsWith("avc1"), config };
      }
      constructor(private init: { output: (f: unknown) => void; error: (e: Error) => void }) {}
      configure(config: VideoDecoderConfig) {
        seen.config = config;
      }
      decode(chunk: { type: string; timestamp: number; byteLength: number }) {
        seen.chunk = { type: chunk.type, timestamp: chunk.timestamp, byteLength: chunk.byteLength };
        this.init.output({ displayWidth: 96, displayHeight: 54, close() {} });
      }
      async flush() {}
      close() {}
    }
    class FakeChunk {
      type: string;
      timestamp: number;
      byteLength: number;
      constructor(init: { type: string; timestamp: number; data: Uint8Array }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.byteLength = init.data.byteLength;
      }
    }
    (globalThis as unknown as { EncodedVideoChunk: unknown }).EncodedVideoChunk = FakeChunk;
    const r = await decodeFrameAt(reader(bytes, calls), v, 0.7, FakeDecoder as unknown as typeof VideoDecoder);
    expect(r).toMatchObject({ ok: true, requested: 0.7, width: 96, height: 54, note: null });
    expect(r.keyframeTime).toBeCloseTo(0.4167, 3); // the sync frame's decode time, as ffprobe gives it
    expect(calls).toEqual([[5325, 5325 + 1391 - 1]]);
    expect(seen.chunk).toMatchObject({ type: "key", byteLength: 1391 });
    expect(seen.config).toMatchObject({ codec: v.codec, codedWidth: 96, codedHeight: 54 });
    expect(seen.config!.description).toBe(v.description);
    // a codec the browser does not have is reported, not thrown
    const hevc = { ...v, codec: "hvc1.1.6.L93.B0" };
    expect(await decodeFrameAt(reader(bytes), hevc, 0, FakeDecoder as unknown as typeof VideoDecoder)).toMatchObject({ ok: false, note: "this browser cannot decode hvc1.1.6.L93.B0" });
    expect(await decodeFrameAt(reader(bytes), v, 0, undefined)).toMatchObject({ ok: false, note: "this browser has no video decoder to check with" });
  });

  it("builds codec names from the decoder records", () => {
    expect(avcCodec("avc1", new Uint8Array([1, 0x64, 0x00, 0x28, 0xff]))).toBe("avc1.640028");
    expect(avcCodec("avc3", new Uint8Array([1, 0x42, 0xe0, 0x1e]))).toBe("avc3.42e01e");
    // Main profile, level 3.1, main tier, compatibility 0x60000000, constraint B0
    expect(hevcCodec("hvc1", new Uint8Array([1, 0x01, 0x60, 0, 0, 0, 0xb0, 0, 0, 0, 0, 0, 93]))).toBe("hvc1.1.6.L93.b0");
    expect(hevcCodec("hev1", new Uint8Array([1, 0x22, 0x20, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 153]))).toBe("hev1.2.4.H153.90");
    expect(vp9Codec(new Uint8Array([1, 0, 0, 0, 0, 31, 0x80]))).toBe("vp09.00.31.08");
  });

  it("recognises what kind of file the first bytes are", () => {
    expect(sniffIsoBmff(file("tiny_h264_faststart.mp4").subarray(0, 32))).toBe("isom");
    expect(sniffIsoBmff(file("tiny.wav").subarray(0, 32))).toBeNull();
  });
});

describe("reading the song", () => {
  it("reads a WAV's length from its header", async () => {
    const bytes = file("tiny.wav");
    expect(parseWavHeader(bytes.subarray(0, 100), bytes.byteLength)).toMatchObject({ sampleRate: 8000, channels: 1, bitsPerSample: 16 });
    const a = await probeAudio(reader(bytes));
    expect(a).toMatchObject({ resolves: true, format: "wav", sampleRate: 8000, channels: 1 });
    expect(a.seconds).toBeCloseTo(1.5, 2);
  });

  it("reads an MP4 audio file's length from its index", async () => {
    const a = await probeAudio(reader(file("tiny_h264_moov_last.mp4")));
    expect(a).toMatchObject({ resolves: true, format: "mp4" });
    expect(a.seconds).toBeCloseTo(2, 1);
  });

  it("reports a link that does not resolve", async () => {
    expect(await probeAudio(reader(file("tiny.wav"), [], 404))).toMatchObject({ resolves: false, status: 404 });
  });
});

describe("rotationFromMatrix", () => {
  // the first two values of a tkhd display matrix, as 16.16 fixed read into floats
  it("reads the four turns a camera writes", () => {
    expect(rotationFromMatrix(1, 0)).toBe(0);
    expect(rotationFromMatrix(0, 1)).toBe(90);
    expect(rotationFromMatrix(-1, 0)).toBe(180);
    expect(rotationFromMatrix(0, -1)).toBe(270);
  });

  it("never returns a negative turn", () => {
    expect(rotationFromMatrix(0, -1)).toBeGreaterThanOrEqual(0);
    expect(rotationFromMatrix(-0.0001, -1)).toBeGreaterThanOrEqual(0);
  });
});
