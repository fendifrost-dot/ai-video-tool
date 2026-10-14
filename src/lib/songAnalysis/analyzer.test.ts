import { describe, expect, it } from "vitest";
import { analyzeBeatGrid, detectBpm, projectBeats } from "./analyzer";

/** A click track: a short decaying burst on every beat, louder on the downbeat. */
function clickTrack(opts: { bpm: number; firstBeat: number; downbeat: number; seconds: number; sampleRate: number }): Float32Array {
  const { bpm, firstBeat, downbeat, seconds, sampleRate } = opts;
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const period = 60 / bpm;
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let k = 0; firstBeat + k * period < seconds; k++) {
    const start = Math.round((firstBeat + k * period) * sampleRate);
    const amp = (k - downbeat) % 4 === 0 && k >= downbeat ? 1 : 0.45;
    for (let j = 0; j < 0.03 * sampleRate && start + j < out.length; j++) out[start + j] += amp * noise() * Math.exp(-j / (0.006 * sampleRate));
  }
  return out;
}

describe("analyzeBeatGrid", () => {
  const sampleRate = 8000;

  it("recovers a tempo between whole-frame lags, the beat phase and the downbeat", () => {
    const mono = clickTrack({ bpm: 121.996, firstBeat: 0.31, downbeat: 2, seconds: 90, sampleRate });
    const g = analyzeBeatGrid(mono, sampleRate, 90)!;
    expect(g).not.toBeNull();
    expect(Math.abs(g.bpm - 121.996)).toBeLessThan(0.02);
    expect(Math.abs(g.phase - 0.31)).toBeLessThan(0.012);
    expect(g.downbeat).toBe(2);
    expect(Math.abs(g.firstBeat - (0.31 + 2 * (60 / 121.996)))).toBeLessThan(0.015);
    expect(g.contrast).toBeGreaterThan(2);
  });

  it("the v1 coarse tempo is off by a whole frame lag on the same track (why v2 exists)", () => {
    const mono = clickTrack({ bpm: 121.996, firstBeat: 0.31, downbeat: 0, seconds: 90, sampleRate });
    const coarse = detectBpm(mono, sampleRate)!;
    expect(Math.abs(coarse - 121.996)).toBeGreaterThan(0.2);
  });

  it("returns null on audio too short to have a tempo", () => {
    expect(analyzeBeatGrid(new Float32Array(sampleRate * 2), sampleRate, 2)).toBeNull();
  });
});

describe("projectBeats", () => {
  it("starts bar 1 on the first downbeat and numbers the pickup as bar 0", () => {
    const period = 60 / 120;
    const beats = projectBeats(120, 10, 1.25);
    expect(beats[0]).toEqual({ t: 0.25, beat: 3, bar: 0 });
    expect(beats[1]).toEqual({ t: 0.75, beat: 4, bar: 0 });
    expect(beats[2]).toEqual({ t: 1.25, beat: 1, bar: 1 });
    expect(beats[6]).toEqual({ t: 1.25 + 4 * period, beat: 1, bar: 2 });
  });

  it("is the v1 map when the first beat is 0:00", () => {
    const beats = projectBeats(122.4, 5);
    expect(beats[0]).toEqual({ t: 0, beat: 1, bar: 1 });
    expect(beats[4].bar).toBe(2);
  });
});
