import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frameAt, queued, samplesFor, spreadTimes } from "./frames";
import { probeVideo, type RangeRead } from "./probe";

const fixture = (name: string): RangeRead => {
  const file = readFileSync(resolve(__dirname, "__fixtures__", name));
  return async (start, end) => ({ status: 206, bytes: new Uint8Array(file.subarray(start, Math.min(end, file.byteLength - 1) + 1)), total: file.byteLength, contentType: "video/mp4" });
};

const decoded: { type: string; timestamp: number; bytes: number }[] = [];
let closed = 0;

beforeEach(() => {
  decoded.length = 0;
  closed = 0;
  class FakeDecoder {
    static isConfigSupported = async () => ({ supported: true });
    private pending: { timestamp: number }[] = [];
    constructor(private init: VideoDecoderInit) {}
    configure() {}
    decode(chunk: { type: string; timestamp: number; byteLength: number }) {
      decoded.push({ type: chunk.type, timestamp: chunk.timestamp, bytes: chunk.byteLength });
      this.pending.push({ timestamp: chunk.timestamp });
    }
    async flush() {
      // like a real decoder: every chunk comes back as a frame carrying its chunk's timestamp
      for (const p of this.pending) this.init.output({ timestamp: p.timestamp, displayWidth: 96, displayHeight: 54, close: () => (closed += 1) } as unknown as VideoFrame);
      this.pending = [];
    }
    close() {}
  }
  vi.stubGlobal("VideoDecoder", FakeDecoder);
  vi.stubGlobal(
    "EncodedVideoChunk",
    class {
      type: string;
      timestamp: number;
      byteLength: number;
      constructor(i: { type: string; timestamp: number; data: Uint8Array }) {
        this.type = i.type;
        this.timestamp = i.timestamp;
        this.byteLength = i.data.byteLength;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("a frame out of a file, without a player", () => {
  it("decodes from the sync frame before the moment through a little past it", async () => {
    const read = fixture("tiny_h264_faststart.mp4");
    const track = (await probeVideo(read)).video!;
    const plan = samplesFor(track, 1.7)!;
    const key = track.keyframeAt(1.7)!;
    const target = track.sampleAt(1.7)!;
    expect(plan.from).toBe(key.index);
    expect(plan.target).toBe(target.index);
    expect(plan.to).toBe(Math.min(track.sampleCount - 1, target.index + 4));

    const r = await frameAt(read, track, 1.7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // the first chunk is the sync frame, the rest are fed as they depend on it
    expect(decoded[0].type).toBe("key");
    expect(decoded).toHaveLength(plan.to - plan.from + 1);
    expect(decoded.every((d) => d.bytes > 0)).toBe(true);
    // of everything decoded, the frame handed back is the one at the moment asked for; the others are released
    expect(r.frame.timestamp).toBe(Math.round(target.dts * 1e6));
    expect(Math.abs(r.time - 1.7)).toBeLessThan(0.05);
    expect(closed).toBe(decoded.length - 1);
  });

  it("clamps a moment past the end to the last frame, and shows the sync frame when the way to the moment is too long", async () => {
    const read = fixture("tiny_vp9.mp4");
    const track = (await probeVideo(read)).video!;
    expect(samplesFor(track, 99)!.target).toBe(track.sampleCount - 1);
    const far = samplesFor(track, track.duration - 0.01, 2)!;
    expect(far.from).toBe(far.to);
    expect(far.target).toBe(far.from);
  });

  it("says why when there is nothing to decode with", async () => {
    const read = fixture("tiny_h264_faststart.mp4");
    const track = (await probeVideo(read)).video!;
    expect(await frameAt(read, { ...track, codec: null }, 0)).toMatchObject({ ok: false, note: expect.stringContaining("no decoder is known") });
    vi.stubGlobal("VideoDecoder", undefined);
    expect(await frameAt(read, track, 0)).toMatchObject({ ok: false, note: "this browser has no video decoder" });
  });

  it("spreads moments across a range, a little inside both ends", () => {
    expect(spreadTimes(10, 14, 5)).toEqual([10.15, 11.075, 12, 12.925, 13.85]);
    expect(spreadTimes(3, 3, 5)).toEqual([3]);
    expect(spreadTimes(0, 2, 1)).toEqual([1]);
  });

  it("runs at most three decodes at once", async () => {
    let now = 0;
    let most = 0;
    const job = () =>
      queued(async () => {
        now += 1;
        most = Math.max(most, now);
        await new Promise((r) => setTimeout(r, 5));
        now -= 1;
      });
    await Promise.all(Array.from({ length: 9 }, job));
    expect(most).toBe(3);
  });
});
