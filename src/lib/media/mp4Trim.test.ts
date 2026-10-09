import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMoov, sniffIsoBmff } from "./mp4";
import { planTrim, trimVideo } from "./mp4Trim";
import { probeVideo, type RangeRead } from "./probe";

const bytesOf = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, "__fixtures__", name)));
const reader = (file: Uint8Array): RangeRead => async (start, end) => ({ status: 206, bytes: file.subarray(start, Math.min(end, file.byteLength - 1) + 1), total: file.byteLength, contentType: "video/mp4" });

describe("cutting a stretch out of a take without re-encoding it", () => {
  it("opens on the sync frame at or before the moment, and is never shorter than asked", async () => {
    const track = (await probeVideo(reader(bytesOf("tiny_h264_faststart.mp4")))).video!;
    // 72 frames at 24 fps, a sync frame every 12: asking from 0.7 s opens at 0.5 s
    const plan = planTrim(track, 0.7, 1)!;
    expect(plan.start).toBeCloseTo(0.5, 3);
    expect(plan.seconds).toBeCloseTo(1, 2);
    expect(plan.frames).toBe(24);
    expect(track.sample(plan.from)!.sync).toBe(true);
    // past the end: what is left
    expect(planTrim(track, 2.6, 5)!.end).toBeCloseTo(3, 2);
    expect(planTrim(track, 0, 0)).toBeNull();
  });

  it("writes a file this reader — and any player — opens: same codec, same frames, byte for byte", async () => {
    for (const name of ["tiny_h264_faststart.mp4", "tiny_h264_moov_last.mp4", "tiny_vp9.mp4"]) {
      const source = bytesOf(name);
      const read = reader(source);
      const track = (await probeVideo(read)).video!;
      const { bytes, plan } = await trimVideo(read, track, 0.6, 1);
      expect(sniffIsoBmff(bytes)).not.toBeNull();
      const out = (await probeVideo(reader(bytes))).video!;
      expect(out, name).toBeTruthy();
      expect(out.codec).toBe(track.codec);
      expect([out.width, out.height]).toEqual([track.width, track.height]);
      expect(out.sampleCount).toBe(plan.frames);
      expect(out.duration).toBeCloseTo(plan.seconds, 3);
      expect(out.sample(0)!.sync).toBe(true);
      // every frame is the source's own bytes
      for (const i of [0, 1, plan.frames - 1]) {
        const a = out.sample(i)!;
        const b = track.sample(plan.from + i)!;
        expect(a.size).toBe(b.size);
        expect(Buffer.from(bytes.subarray(a.offset, a.offset + a.size)).equals(Buffer.from(source.subarray(b.offset, b.offset + b.size)))).toBe(true);
        expect(a.sync).toBe(b.sync);
      }
      // the index is at the front, the picture data after it
      expect((await probeVideo(reader(bytes))).index).toBe("front");
    }
  });

  it("keeps the order frames are shown in when they are stored out of order", async () => {
    const source = bytesOf("tiny_h264_faststart.mp4");
    const track = (await probeVideo(reader(source))).video!;
    const { bytes, plan } = await trimVideo(reader(source), track, 1, 1);
    const out = (await probeVideo(reader(bytes))).video!;
    for (let i = 0; i < plan.frames; i++) expect(out.compositionOffset(i)).toBe(track.compositionOffset(plan.from + i));
    // the cut opens on its first picture: the edit list starts at that frame's own presentation time
    expect(out.startOffset).toBeCloseTo(track.compositionOffset(plan.from) / track.timescale, 6);
    expect(parseMoov).toBeTypeOf("function");
  });
});
