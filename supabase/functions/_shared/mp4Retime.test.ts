import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMoov, readBoxHeader } from "../../../src/lib/media/mp4";
import { avcSampleDescription, writeMp4 } from "../../../src/lib/media/mp4Trim";
import { isIsoBmff, mp4Durations, retimeMp4 } from "./mp4Retime";

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

describe("hostile bytes — refused cleanly, nothing read or written outside its box", () => {
  /** The first box of a given type, walking the file's own sizes: [start, end). */
  function find(bytes: Uint8Array, path: string[]): [number, number] {
    let from = 0;
    let to = bytes.byteLength;
    for (const type of path) {
      let o = from;
      let hit: [number, number] | null = null;
      while (o + 8 <= to) {
        const h = readBoxHeader(bytes, o)!;
        if (h.type === type) {
          hit = [o + h.headerSize, o + h.size];
          break;
        }
        o += h.size;
      }
      if (!hit) throw new Error(`no ${type}`);
      [from, to] = hit;
    }
    return [from, to];
  }
  const u32 = (bytes: Uint8Array, at: number, n: number) =>
    new DataView(bytes.buffer, bytes.byteOffset).setUint32(at, n);
  /** The retime must throw and leave the input byte-for-byte as it was, in both modes. */
  function refuses(bytes: Uint8Array, why: RegExp) {
    const before = bytes.slice();
    expect(() => retimeMp4(bytes, 4)).toThrow(why);
    expect(Buffer.from(bytes).equals(Buffer.from(before))).toBe(true);
    expect(() => mp4Durations(bytes)).toThrow(why);
  }

  it("an stts that claims more entries than it holds", () => {
    const bytes = providerLikeClip();
    const [body] = find(bytes, ["moov", "trak", "mdia", "minf", "stbl", "stts"]);
    u32(bytes, body + 4, 0xffffffff);
    refuses(bytes, /stts box claims 4294967295 entries/);
    u32(bytes, body + 4, 2); // one more than the single run the file has: still past the box
    refuses(bytes, /stts box claims 2 entries but has room for 1/);
  });

  it("an elst that claims more entries than it holds", () => {
    const bytes = providerLikeClip();
    const [body] = find(bytes, ["moov", "trak", "edts", "elst"]);
    u32(bytes, body + 4, 1_000_000);
    const before = bytes.slice();
    expect(() => retimeMp4(bytes, 4, { inPlace: true })).toThrow(/elst box claims 1000000 entries/);
    // in place and refused: not one byte was written
    expect(Buffer.from(bytes).equals(Buffer.from(before))).toBe(true);
  });

  it("a header box whose version says it is longer than it is (reads would run into the next box)", () => {
    // mdhd version 1 puts the timescale at +20 and a 64-bit duration after it: 32 bytes the 24-byte v0 body has not got
    const bytes = providerLikeClip();
    const [body] = find(bytes, ["moov", "trak", "mdia", "mdhd"]);
    bytes[body] = 1;
    refuses(bytes, /mdhd box is truncated/);
  });

  it("header boxes cut short by their own size field", () => {
    for (const path of [
      ["moov", "trak", "mdia", "mdhd"],
      ["moov", "mvhd"],
      ["moov", "trak", "tkhd"],
      ["moov", "trak", "mdia", "hdlr"],
    ]) {
      const bytes = providerLikeClip();
      const [body] = find(bytes, path);
      u32(bytes, body - 8, 12); // the box now ends 4 bytes into its body; what follows is read as boxes, not as its fields
      const before = bytes.slice();
      expect(() => retimeMp4(bytes, 4)).toThrow();
      expect(Buffer.from(bytes).equals(Buffer.from(before))).toBe(true);
    }
  });

  it("a size-0 box and a size-1 (64-bit) box whose large size is cut off", () => {
    const zero = providerLikeClip();
    const [body] = find(zero, ["moov"]);
    u32(zero, body - 8, 0); // "to the end of the file": the mdat is swallowed, the moov is still parsed inside its bytes
    const r = retimeMp4(zero, 4);
    expect(Math.abs(r.after - 4)).toBeLessThan(5e-4);

    const wide = providerLikeClip();
    u32(wide, find(wide, ["moov"])[0] - 8, 1); // declares a 64-bit size, but the next 8 bytes are the mvhd header, not a size
    refuses(wide, /no moov|truncated|fragmented/);
  });

  it("a moov cut off mid-way, and random bytes", () => {
    const bytes = providerLikeClip();
    const [, end] = find(bytes, ["moov"]);
    const cut = bytes.subarray(0, end - 40);
    expect(() => retimeMp4(cut, 4)).toThrow();
    const noise = new Uint8Array(4096);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) & 0xff;
    expect(() => retimeMp4(noise, 4)).toThrow(/no moov/);
    expect(isIsoBmff(noise)).toBe(false);
    expect(isIsoBmff(providerLikeClip())).toBe(true);
    expect(isIsoBmff(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]))).toBe(false); // claims 24 bytes, has 8
  });

  it("in place: the caller's own buffer is retimed with no second copy", () => {
    const bytes = providerLikeClip();
    const r = retimeMp4(bytes, 4.004, { inPlace: true });
    expect(r.bytes).toBe(bytes);
    expect(Math.abs(r.after - 4.004)).toBeLessThan(5e-4);
  });
});

describe("shapes a real provider file may take", () => {
  it("a moov written with a 64-bit (size = 1) header is read and retimed", () => {
    const src = providerLikeClip();
    const [ms, me] = topBoxes(src).get("moov")!;
    const moovBody = src.subarray(ms + 8, me);
    const [ds, de] = topBoxes(src).get("mdat")!;
    const ftyp = src.subarray(0, ms);
    const head = new Uint8Array(16);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 1);
    head.set([0x6d, 0x6f, 0x6f, 0x76], 4); // moov
    hv.setUint32(8, 0);
    hv.setUint32(12, 16 + moovBody.byteLength);
    const wide = new Uint8Array([...ftyp, ...head, ...moovBody, ...src.subarray(ds, de)]);
    expect(mp4Durations(wide).videoSeconds).toBeCloseTo(89 / 24, 6);
    const r = retimeMp4(wide, 4.004);
    expect(Math.abs(r.after - 4.004)).toBeLessThan(5e-4);
    expect(r.bytes.byteLength).toBe(wide.byteLength);
  });

  it("an edit list that starts the picture inside the track (non-zero media_time) is scaled with it", () => {
    const frames = 48;
    const src = writeMp4({
      timescale: 12288,
      width: 720,
      height: 1280,
      stsd: avcSampleDescription(720, 1280, new Uint8Array([1, 0x64, 0, 0x1f, 0xff, 0xe1, 0, 0])),
      deltas: Array(frames).fill(512),
      // the first frame is shown 2 frames after it decodes: the writer's elst then opens on media_time 1024
      offsets: Array.from({ length: frames }, (_, i) => (i === 0 ? 1024 : i % 2 ? 512 : 0)),
      syncs: Array.from({ length: frames }, (_, i) => i === 0),
      sizes: Array(frames).fill(12),
      payload: new Uint8Array(12 * frames),
    });
    const before = readBack(src).tracks[0];
    expect(before.startOffset).toBeCloseTo(1024 / 12288, 6);
    const r = retimeMp4(src, 3);
    expect(Math.abs(r.after - 3)).toBeLessThan(5e-4);
    const after = readBack(r.bytes).tracks[0];
    // media_time is in track units, untouched; on the new timescale it is the same number of frames, longer in seconds
    expect(after.startOffset).toBeCloseTo((1024 / 12288) * r.ratio, 5);
    expect(after.compositionOffset(0)).toBe(1024);
    expect(readBack(r.bytes).duration).toBeCloseTo(3, 3);
  });

  it("a fragmented file (moof) is refused: its times are not in the moov", () => {
    const src = providerLikeClip();
    const moof = new Uint8Array(8);
    new DataView(moof.buffer).setUint32(0, 8);
    moof.set([0x6d, 0x6f, 0x6f, 0x66], 4);
    const frag = new Uint8Array([...src, ...moof]);
    expect(() => retimeMp4(frag, 4)).toThrow(/fragmented \(moof\)/);
    expect(() => mp4Durations(frag)).toThrow(/fragmented/);
  });
});
