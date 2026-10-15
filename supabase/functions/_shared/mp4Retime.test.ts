import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMoov, readBoxHeader } from "../../../src/lib/media/mp4";
import { avcSampleDescription, writeMp4 } from "../../../src/lib/media/mp4Trim";
import { mp4Durations, retimeMp4 } from "./mp4Retime";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(here, "../../../src/lib/media/__fixtures__", name)));

/** The top-level boxes of a file: type → [start, end). */
function topBoxes(bytes: Uint8Array): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  let o = 0;
  while (o < bytes.byteLength) {
    const h = readBoxHeader(bytes, o);
    if (!h || h.size <= 0) break;
    out.set(h.type, [o, o + h.size]);
    o += h.size;
  }
  return out;
}

/** The file read back by the app's own MP4 reader (an independent parser), from its moov box. */
function readBack(bytes: Uint8Array) {
  const [s, e] = topBoxes(bytes).get("moov")!;
  return parseMoov(bytes.subarray(s, e));
}

/**
 * A clip shaped like the object-swap's output: 24 fps on a 12 288 timescale, 89 frames = 3.708 s, a sync frame every
 * 24, and a few reordered frames (ctts), so a retime has every kind of time in the file to move.
 */
function providerLikeClip(): Uint8Array {
  const frames = 89;
  const sizes = Array.from({ length: frames }, (_, i) => 40 + (i % 7));
  const payload = new Uint8Array(sizes.reduce((a, b) => a + b, 0));
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 31) & 0xff;
  return writeMp4({
    timescale: 12288,
    width: 720,
    height: 1280,
    stsd: avcSampleDescription(720, 1280, new Uint8Array([1, 0x64, 0, 0x1f, 0xff, 0xe1, 0, 0])),
    deltas: Array(frames).fill(512),
    offsets: Array.from({ length: frames }, (_, i) => (i % 3 === 1 ? 1024 : 0)),
    syncs: Array.from({ length: frames }, (_, i) => i % 24 === 0),
    sizes,
    payload,
  });
}

describe("mp4Durations", () => {
  it("measures the provider-shaped clip at 89 frames of 1/24 s", () => {
    const d = mp4Durations(providerLikeClip());
    expect(d.videoSeconds).toBeCloseTo(89 / 24, 6);
    expect(d.movieSeconds).toBeCloseTo(89 / 24, 3);
    expect(d.tracks).toEqual([
      { kind: "video", timescale: 12288, seconds: expect.closeTo(89 / 24, 6) },
    ]);
  });

  it("agrees with the app's own reader on a file ffmpeg wrote", () => {
    const bytes = fixture("tiny_h264_faststart.mp4");
    const d = mp4Durations(bytes);
    const v = readBack(bytes).tracks.find((t) => t.kind === "video")!;
    expect(d.videoSeconds).toBeCloseTo(v.duration, 6);
    expect(d.videoSeconds).toBeCloseTo(3, 3);
  });

  it("refuses what is not an MP4", () => {
    expect(() =>
      mp4Durations(new TextEncoder().encode("not a video, just some text here")),
    ).toThrow(/no moov/);
  });
});

describe("retimeMp4 — the object-swap's ~7 % fast output, conformed to its source", () => {
  it("makes a 3.708 s clip play for exactly the 4.004 s it was cut from, and moves no picture byte", () => {
    const src = providerLikeClip();
    const r = retimeMp4(src, 4.004);
    expect(r.before).toBeCloseTo(3.7083, 4);
    expect(Math.abs(r.after - 4.004)).toBeLessThan(5e-4);
    expect(r.ratio).toBeCloseTo(4.004 / (89 / 24), 3);
    expect(r.droppedAudio).toBe(0);
    // same size, same picture data, same sample tables: only header numbers changed
    expect(r.bytes.byteLength).toBe(src.byteLength);
    const [ms, me] = topBoxes(src).get("mdat")!;
    expect(Buffer.from(r.bytes.subarray(ms, me)).equals(Buffer.from(src.subarray(ms, me)))).toBe(
      true,
    );
    // an independent reader sees the new length, every frame, and the frame times stretched by the same factor
    const v = readBack(r.bytes).tracks[0];
    expect(v.duration).toBeCloseTo(4.004, 3);
    expect(v.sampleCount).toBe(89);
    expect(v.syncCount).toBe(4);
    const k = r.ratio;
    expect(v.sample(24)!.dts).toBeCloseTo((24 / 24) * k, 4);
    expect(v.compositionOffset(1) / v.timescale).toBeCloseTo((1024 / 12288) * k, 4);
    expect(v.startOffset).toBeCloseTo(0, 6);
    expect(readBack(r.bytes).duration).toBeCloseTo(4.004, 3);
    // the input is untouched
    expect(mp4Durations(src).videoSeconds).toBeCloseTo(89 / 24, 6);
  });

  it("shortens as exactly as it lengthens, and a second retime to the same length changes nothing", () => {
    const src = fixture("tiny_h264_faststart.mp4");
    const shorter = retimeMp4(src, 2.5);
    expect(Math.abs(shorter.after - 2.5)).toBeLessThan(5e-4);
    const back = retimeMp4(shorter.bytes, 3);
    expect(Math.abs(back.after - 3)).toBeLessThan(5e-4);
    const again = retimeMp4(back.bytes, 3);
    expect(again.ratio).toBeCloseTo(1, 6);
  });

  it("drops an audio track (the song is the sound) without moving any byte offset", () => {
    const src = fixture("tiny_h264_moov_last.mp4");
    expect(mp4Durations(src).tracks.map((t) => t.kind)).toContain("audio");
    const r = retimeMp4(src, 2.2);
    expect(r.droppedAudio).toBe(1);
    expect(r.bytes.byteLength).toBe(src.byteLength);
    const after = mp4Durations(r.bytes);
    expect(after.tracks.map((t) => t.kind)).toEqual(["video"]);
    expect(Math.abs((after.videoSeconds ?? 0) - 2.2)).toBeLessThan(5e-4);
    const v = readBack(r.bytes).tracks.find((t) => t.kind === "video")!;
    // the samples are still where the index says they are
    const before = readBack(src).tracks.find((t) => t.kind === "video")!;
    expect(v.sample(30)!.offset).toBe(before.sample(30)!.offset);
    expect(v.sample(30)!.size).toBe(before.sample(30)!.size);
  });

  it("can keep the audio and stretch it with the picture when asked", () => {
    const src = fixture("tiny_h264_moov_last.mp4");
    const r = retimeMp4(src, 2.2, { dropAudio: false });
    expect(r.droppedAudio).toBe(0);
    const d = mp4Durations(r.bytes);
    const audio = d.tracks.find((t) => t.kind === "audio")!;
    const audioBefore = mp4Durations(src).tracks.find((t) => t.kind === "audio")!;
    expect(audio.seconds / audioBefore.seconds).toBeCloseTo(r.ratio, 2);
  });

  it("refuses a length that is not a length", () => {
    const src = providerLikeClip();
    expect(() => retimeMp4(src, 0)).toThrow();
    expect(() => retimeMp4(src, Number.NaN)).toThrow();
  });
});
