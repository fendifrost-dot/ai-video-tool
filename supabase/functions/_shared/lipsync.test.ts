import { describe, expect, it } from "vitest";
import {
  buildLipsyncInput,
  buildStemInput,
  buildWav,
  isFalOutputUrl,
  lipsyncEstimateUsd,
  parseWavHead,
  songWindowOf,
  vocalsUrlOf,
  wavSeconds,
  wavSliceRange,
} from "./lipsync";

/** A 16-bit stereo PCM WAV whose sample frame n holds the value n (both channels), with a LIST chunk before data. */
function wav(frames: number, rate = 1000): Uint8Array {
  const fmt = new Uint8Array(24);
  const fv = new DataView(fmt.buffer);
  fmt.set([0x66, 0x6d, 0x74, 0x20]);
  fv.setUint32(4, 16, true);
  fv.setUint16(8, 1, true);
  fv.setUint16(10, 2, true);
  fv.setUint32(12, rate, true);
  fv.setUint32(16, rate * 4, true);
  fv.setUint16(20, 4, true);
  fv.setUint16(22, 16, true);
  const list = new Uint8Array([0x4c, 0x49, 0x53, 0x54, 3, 0, 0, 0, 1, 2, 3, 0]); // odd size, padded
  const samples = new Uint8Array(frames * 4);
  const sv = new DataView(samples.buffer);
  for (let n = 0; n < frames; n++) { sv.setInt16(n * 4, n, true); sv.setInt16(n * 4 + 2, n, true); }
  const body = buildWav(fmt, samples);
  // put the LIST chunk between fmt and data, as real writers do
  const out = new Uint8Array(body.length + list.length);
  out.set(body.subarray(0, 12 + fmt.length));
  out.set(list, 12 + fmt.length);
  out.set(body.subarray(12 + fmt.length), 12 + fmt.length + list.length);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

describe("the lip-sync lane, pure half", () => {
  it("finds the samples past other chunks and slices whole frames at the right time", () => {
    const f = wav(5000);
    const w = parseWavHead(f.subarray(0, 200), f.length);
    expect(w.sampleRate).toBe(1000);
    expect(w.blockAlign).toBe(4);
    expect(wavSeconds(w)).toBeCloseTo(5, 6);
    const r = wavSliceRange(w, 1.25, 2);
    const slice = buildWav(w.fmtChunk, f.subarray(r.from, r.to), r.padHeadBytes);
    const s = parseWavHead(slice, slice.length);
    expect(wavSeconds(s)).toBeCloseTo(2, 6);
    const dv = new DataView(slice.buffer);
    expect(dv.getInt16(s.dataOffset, true)).toBe(1250); // the first frame is the one at 1.25 s
    expect(dv.getInt16(s.dataOffset + s.dataBytes - 4, true)).toBe(3249);
  });

  it("clamps to the file and pads silence before the song begins", () => {
    const f = wav(1000);
    const w = parseWavHead(f, f.length);
    const tail = wavSliceRange(w, 0.8, 1);
    expect((tail.to - tail.from) / 4).toBe(200);
    const head = wavSliceRange(w, -0.1, 0.5);
    expect(head.padHeadBytes).toBe(400);
    expect((head.to - head.from) / 4).toBe(400);
  });

  it("reads a data chunk whose size a streaming writer left open", () => {
    const f = wav(100);
    const dv = new DataView(f.buffer);
    const w0 = parseWavHead(f, f.length);
    dv.setUint32(w0.dataOffset - 4, 0xffffffff, true);
    expect(parseWavHead(f, f.length).dataBytes).toBe(400);
  });

  it("refuses what is not a WAV", () => {
    expect(() => parseWavHead(new Uint8Array(64), 64)).toThrow(/not a WAV/);
  });

  it("asks the models for the vocals and a cut-off lip-sync, and prices it by the second", () => {
    expect(buildStemInput("https://x/a.wav")).toEqual({ audio_url: "https://x/a.wav", model: "htdemucs", stems: ["vocals"], output_format: "wav" });
    expect(buildLipsyncInput("https://x/v.mp4", "https://x/a.wav")).toEqual({ video_url: "https://x/v.mp4", audio_url: "https://x/a.wav", model: "lipsync-2", sync_mode: "cut_off" });
    expect(lipsyncEstimateUsd(4.042)).toBe(0.202);
    expect(songWindowOf(63.066, 4.042)).toEqual([63.066, 67.608]);
  });

  it("only fetches results from Fal's own hosts", () => {
    expect(isFalOutputUrl("https://v3.fal.media/files/x/vocals.wav")).toBe(true);
    expect(isFalOutputUrl("http://v3.fal.media/files/x.wav")).toBe(false);
    expect(isFalOutputUrl("https://fal.media.evil.com/x.wav")).toBe(false);
    expect(vocalsUrlOf({ vocals: { url: "https://v3.fal.media/a.wav" } })).toBe("https://v3.fal.media/a.wav");
    expect(vocalsUrlOf({})).toBeNull();
  });
});
