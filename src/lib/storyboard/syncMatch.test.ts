import { describe, expect, it } from "vitest";
import { bestLag, fft, isConfidentMatch, matchTakeToSong, nextPow2, onsetEnvelope } from "./syncMatch";

/** Deterministic noise (mulberry32) so the tests are repeatable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SR = 4000;

/** A "song": bursts of noise at irregular times over a quiet bed — onsets a correlation can lock to. */
function song(seconds: number, seed = 7): Float32Array {
  const r = rng(seed);
  const x = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < x.length; i++) x[i] = (r() - 0.5) * 0.02;
  let t = 0.2;
  while (t < seconds - 0.3) {
    const len = Math.round((0.05 + r() * 0.15) * SR);
    const start = Math.round(t * SR);
    const amp = 0.3 + r() * 0.6;
    for (let i = 0; i < len && start + i < x.length; i++) x[start + i] += (r() - 0.5) * 2 * amp * (1 - i / len);
    t += 0.18 + r() * 0.55;
  }
  return x;
}

/** The take: the song as heard from `offset` seconds in, for `seconds`, with room noise and a level change. */
function takeOf(s: Float32Array, offset: number, seconds: number, noise = 0.05, seed = 99): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.round(seconds * SR));
  const shift = Math.round(offset * SR);
  for (let i = 0; i < out.length; i++) {
    const j = i + shift;
    out[i] = (j >= 0 && j < s.length ? s[j] * 0.6 : 0) + (r() - 0.5) * 2 * noise;
  }
  return out;
}

describe("fft", () => {
  it("round-trips", () => {
    const n = 64;
    const re = new Float64Array(n).map((_, i) => Math.sin(i * 0.3) + 0.2 * i);
    const im = new Float64Array(n);
    const orig = Float64Array.from(re);
    fft(re, im);
    fft(re, im, true);
    for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(orig[i], 9);
    expect(nextPow2(65)).toBe(128);
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow();
  });

  it("finds a known lag in both directions", () => {
    const r = rng(3);
    const a = new Float64Array(500).map(() => r() - 0.5);
    const later = new Float64Array(600);
    for (let i = 0; i < 500; i++) later[i + 37] = a[i];
    expect(bestLag(a, later, 100)?.lag).toBe(37);
    expect(bestLag(later, a, 100)?.lag).toBe(-37);
    expect(bestLag(a, later, 100, { phat: true })?.lag).toBe(37);
  });
});

describe("matching a take to the song", () => {
  const s = song(60);

  it("recovers the offset when the recording started after the song (positive)", () => {
    const m = matchTakeToSong(s, takeOf(s, 0.8538, 50), SR)!;
    expect(m).not.toBeNull();
    expect(m.offsetSeconds).toBeCloseTo(0.8538, 2);
    expect(m.confidence.windowsConsistent).toBeGreaterThanOrEqual(3);
    expect(isConfidentMatch(m)).toBe(true);
  });

  it("recovers the offset when the recording started before the song (negative)", () => {
    const m = matchTakeToSong(s, takeOf(s, -2.25, 55), SR)!;
    expect(m.offsetSeconds).toBeCloseTo(-2.25, 2);
  });

  it("a take from the top of the song is offset zero", () => {
    const m = matchTakeToSong(s, takeOf(s, 0, 40), SR)!;
    expect(Math.abs(m.offsetSeconds)).toBeLessThan(0.01);
  });

  it("holds up under heavy room noise", () => {
    const m = matchTakeToSong(s, takeOf(s, 1.5, 45, 0.25), SR)!;
    expect(m.offsetSeconds).toBeCloseTo(1.5, 2);
  });

  it("returns null for a silent take, and for audio that is not the song", () => {
    expect(matchTakeToSong(s, new Float32Array(30 * SR), SR)).toBeNull();
    const other = matchTakeToSong(s, song(40, 1234), SR);
    expect(other === null || !isConfidentMatch(other)).toBe(true);
  });

  it("the onset envelope is zero-mean and rises where the sound starts", () => {
    const x = new Float32Array(SR);
    for (let i = SR / 2; i < SR; i++) x[i] = 0.5;
    const e = onsetEnvelope(x, SR, 100);
    const peak = e.indexOf(Math.max(...e));
    expect(peak).toBe(50);
    expect(Math.abs(e.reduce((a, b) => a + b, 0))).toBeLessThan(1e-6);
  });
});
