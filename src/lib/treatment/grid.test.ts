import { describe, expect, it } from "vitest";
import type { SongAnalysis } from "@/lib/songAnalysis/types";
import { projectBeats } from "@/lib/songAnalysis/analyzer";
import { buildClipGrid, type GridClip } from "./grid";

const DURATION = 120;

function analysis(over: Partial<SongAnalysis> = {}): SongAnalysis {
  // a slow swell: low → high → low, so all three clip lengths occur
  const energy = Array.from({ length: DURATION * 4 }, (_, k) => ({ t: k / 4, energy: Math.sin((Math.PI * k) / (DURATION * 4)) }));
  return {
    id: "a",
    project_id: "p",
    bpm: 122.4,
    duration_seconds: DURATION,
    energy_curve_json: energy,
    beat_map_json: [],
    sections_json: [],
    drops_json: [],
    hooks_json: [],
    analysis_provider: "test",
    analyzed_at: "2026-10-14T00:00:00Z",
    ...over,
  };
}

/** The pre-2026-10-14 cut loop, kept here as the reference the v1 behaviour must still match. */
function v1Cuts(a: SongAnalysis): number[] {
  const duration = a.duration_seconds!;
  const barSec = (4 * 60) / a.bpm!;
  const curve = a.energy_curve_json;
  const sorted = curve.map((s) => s.energy).sort((x, y) => x - y);
  const lo = sorted[Math.floor(sorted.length / 3)];
  const hi = sorted[Math.floor((sorted.length * 2) / 3)];
  const energyAt = (t: number) => curve.reduce((b, s) => (Math.abs(s.t - t) < Math.abs(b.t - t) ? s : b), curve[0]).energy;
  const cuts: number[] = [];
  let t = 0;
  while (t < duration - 1) {
    const e = energyAt(t + 1);
    const target = e >= hi ? 3 : e >= lo ? 4 : 5;
    const bars = Math.max(1, Math.round(target / barSec));
    let end = t + bars * barSec;
    if (end - t > 6 && bars > 1) end = t + (bars - 1) * barSec;
    if (end - t < 2.5) end = t + Math.max(1, bars + 1) * barSec;
    end = Math.min(end, duration);
    if (duration - end < 2.5) end = duration;
    cuts.push(Math.round(end * 100) / 100);
    t = end;
  }
  return cuts;
}

const ends = (g: GridClip[]) => g.map((c) => c.end);

describe("buildClipGrid — bar lines", () => {
  it("matches the v1 cuts exactly when there is no beat map and no lyrics", () => {
    const a = analysis();
    expect(ends(buildClipGrid({ pace: "cinematic", analysis: a }))).toEqual(v1Cuts(a));
  });

  it("cuts the same with a v1 beat map as with none, across tempos and tie-prone energy curves", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const [bpm, dur] of [[81.7, 61.3], [179.2, 187.77], [122.4, 241.05], [96.3, 187.77], [140, 61.3]] as const) {
      const energy = Array.from({ length: Math.ceil(dur * 4) }, (_, k) => ({ t: k / 4, energy: rnd() }));
      const base = analysis({ bpm, duration_seconds: dur, energy_curve_json: energy });
      const none = ends(buildClipGrid({ pace: "cinematic", analysis: base }));
      const mapped = ends(buildClipGrid({ pace: "cinematic", analysis: { ...base, beat_map_json: projectBeats(bpm, dur) } }));
      expect(mapped.length).toBe(none.length);
      mapped.forEach((t, k) => expect(Math.abs(t - none[k])).toBeLessThanOrEqual(0.011));
    }
  });

  it("matches the v1 cuts (to 0.01 s) with a v1 beat map counted from 0:00", () => {
    const a = analysis({ beat_map_json: projectBeats(122.4, DURATION) });
    const got = ends(buildClipGrid({ pace: "cinematic", analysis: a }));
    const want = v1Cuts(a);
    expect(got.length).toBe(want.length);
    got.forEach((t, k) => expect(Math.abs(t - want[k])).toBeLessThanOrEqual(0.011));
  });

  it("cuts on the measured downbeats when the beat map has a phase and a refined tempo", () => {
    const bpm = 121.996;
    const firstBeat = 0.5;
    const map = projectBeats(bpm, DURATION, firstBeat);
    const a = analysis({ bpm: 122, beat_map_json: map });
    const downbeats = map.filter((b) => b.beat === 1).map((b) => b.t);
    const grid = buildClipGrid({ pace: "cinematic", analysis: a });
    for (const c of grid.slice(0, -1)) {
      const nearest = downbeats.reduce((b, d) => (Math.abs(d - c.end) < Math.abs(b - c.end) ? d : b), downbeats[0]);
      expect(Math.abs(nearest - c.end)).toBeLessThanOrEqual(0.006);
    }
    // the v1 grid counted from 0:00 at 122 BPM would be ~0.5 s early on every cut
    expect(grid[0].end).toBeGreaterThan(4);
  });

  it("keeps every clip within the length bounds", () => {
    const a = analysis({ bpm: 122, beat_map_json: projectBeats(121.996, DURATION, 0.0225) });
    const beat = 60 / 121.996;
    for (const c of buildClipGrid({ pace: "cinematic", analysis: a }).slice(0, -1)) {
      expect(c.end - c.start).toBeGreaterThanOrEqual(2.5 - beat - 0.01);
      expect(c.end - c.start).toBeLessThanOrEqual(6 + beat + 0.01);
    }
  });
});

describe("buildClipGrid — lyric line starts", () => {
  const bpm = 122;
  const beat = 60 / bpm;
  const map = projectBeats(bpm, DURATION, 0);
  const base = analysis({ bpm, beat_map_json: map });
  const plain = buildClipGrid({ pace: "cinematic", analysis: base });
  const cut = plain[3].end; // a cut well inside the song

  it("moves a cut onto the beat nearest a trusted line that starts within one beat of it", () => {
    const lineStart = cut + 0.8 * beat; // e.g. "cut the lights on" sung just after the bar line
    const grid = buildClipGrid({ pace: "cinematic", analysis: base, lyrics: [{ start: lineStart, end: lineStart + 1.2, confidence: 0.9 }] });
    const moved = grid[3];
    expect(moved.cutOnLyric).toBe(true);
    expect(Math.abs(moved.end - (cut + beat))).toBeLessThanOrEqual(0.011);
    expect(grid[4].start).toBe(moved.end);
  });

  it("also moves a cut earlier when the line starts just before it", () => {
    const lineStart = cut - 0.9 * beat;
    const grid = buildClipGrid({ pace: "cinematic", analysis: base, lyrics: [{ start: lineStart, end: lineStart + 1, confidence: 1 }] });
    expect(grid[3].cutOnLyric).toBe(true);
    expect(Math.abs(grid[3].end - (cut - beat))).toBeLessThanOrEqual(0.011);
  });

  it("ignores lines that are untrusted, too long (aligner bridges) or more than a beat away", () => {
    const lyrics = [
      { start: cut + 0.5 * beat, end: cut + 1.5, confidence: 0.25 }, // low confidence
      { start: cut + 0.5 * beat, end: cut + 30, confidence: 1 }, // 30 s "line" = a bridge
      { start: cut + 1.6 * beat, end: cut + 3, confidence: 1 }, // too far
    ];
    expect(ends(buildClipGrid({ pace: "cinematic", analysis: base, lyrics }))).toEqual(ends(plain));
  });

  it("returns to the bar lines after a lyric cut", () => {
    const lineStart = cut + beat;
    const grid = buildClipGrid({ pace: "cinematic", analysis: base, lyrics: [{ start: lineStart, end: lineStart + 1, confidence: 1 }] });
    const downbeats = new Set(map.filter((b) => b.beat === 1).map((b) => Math.round(b.t * 100) / 100));
    expect(downbeats.has(grid[4].end) || grid[4].end === DURATION).toBe(true);
  });

  it("does nothing without a tempo (commercial mode)", () => {
    const grid = buildClipGrid({ pace: "cinematic", durationSeconds: 30, lyrics: [{ start: 4.2, end: 5, confidence: 1 }] });
    expect(grid.every((c) => !c.cutOnLyric)).toBe(true);
  });
});

describe("buildClipGrid — malformed data", () => {
  it("terminates with forward clips for absurd tempos and broken beat maps", () => {
    const cases: Partial<SongAnalysis>[] = [
      { bpm: 1e9 },
      { bpm: 0.001 },
      { bpm: Number.NaN },
      { bpm: 122, beat_map_json: Array.from({ length: 50 }, () => ({ t: 3, beat: 1, bar: 1 })) },
      { bpm: 122, beat_map_json: Array.from({ length: 50 }, (_, k) => ({ t: k * 1e-6, beat: 1, bar: k })) },
      { bpm: 122, beat_map_json: [{ t: Number.NaN, beat: 1, bar: 1 }, ...projectBeats(122, DURATION)] },
      { bpm: 122, beat_map_json: projectBeats(122, DURATION).reverse() },
    ];
    for (const over of cases) {
      const grid = buildClipGrid({ pace: "cinematic", analysis: analysis(over), lyrics: [{ start: 10, end: 11, confidence: 1 }] });
      expect(grid.length).toBeGreaterThan(0);
      expect(grid.length).toBeLessThanOrEqual(120);
      for (const c of grid) expect(c.end).toBeGreaterThan(c.start);
      expect(grid[grid.length - 1].end).toBe(DURATION);
    }
  });
});

describe("buildClipGrid — fast pace (the default)", () => {
  const measured = (bpm: number, first = 0.029) => analysis({ bpm, beat_map_json: projectBeats(bpm, DURATION, first) });
  const lens = (g: GridClip[]) => g.map((c) => c.end - c.start);

  it("is the default and cuts 1–3.5 s shots", () => {
    const a = measured(121.998);
    expect(buildClipGrid({ analysis: a })).toEqual(buildClipGrid({ analysis: a, pace: "fast" }));
    const g = buildClipGrid({ analysis: a });
    for (const l of lens(g).slice(0, -1)) {
      expect(l).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(l).toBeLessThanOrEqual(3.5 + 1e-6);
    }
    const avg = lens(g).reduce((x, y) => x + y, 0) / g.length;
    expect(avg).toBeLessThan(2.6);
    expect(g.length).toBeGreaterThan(buildClipGrid({ analysis: a, pace: "cinematic" }).length * 1.6);
  });

  it("puts every cut on a measured beat, at any tempo", () => {
    for (const bpm of [70, 95, 121.998, 140, 174]) {
      const a = measured(bpm);
      const beats = a.beat_map_json.map((b) => b.t);
      const g = buildClipGrid({ analysis: a });
      for (const c of g.slice(0, -1)) expect(beats.some((t) => Math.abs(t - c.end) < 0.006)).toBe(true);
      expect(g[0].start).toBe(0);
      expect(g[g.length - 1].end).toBe(DURATION);
      for (let i = 1; i < g.length; i++) expect(g[i].start).toBe(g[i - 1].end);
    }
  });

  it("cuts shorter where the energy is high than where it is low", () => {
    const g = buildClipGrid({ analysis: measured(121.998) });
    const mean = (e: string) => {
      const xs = g.filter((c) => c.energy === e).slice(0, -1).map((c) => c.end - c.start);
      return xs.reduce((x, y) => x + y, 0) / xs.length;
    };
    expect(mean("high")).toBeLessThan(mean("low"));
    expect(mean("high")).toBeLessThan(1.8);
    expect(mean("low")).toBeGreaterThan(2.5);
  });

  it("moves a cut onto a trusted lyric line start within one beat", () => {
    const a = measured(121.998);
    const plain = buildClipGrid({ analysis: a });
    const target = plain[10].end;
    const beatSec = 60 / 121.998;
    const lineStart = target + 0.8 * beatSec;
    const g = buildClipGrid({ analysis: a, lyrics: [{ start: lineStart, end: lineStart + 1.5, confidence: 0.9 }] });
    const moved = g.find((c) => c.cutOnLyric);
    expect(moved).toBeDefined();
    expect(Math.abs(moved!.end - lineStart)).toBeLessThanOrEqual(beatSec / 2 + 0.01);
  });

  it("falls back to seconds without a beat, and stays under the writer's shot ceiling", () => {
    const g = buildClipGrid({ durationSeconds: 30 });
    expect(g.length).toBeGreaterThan(8);
    expect(g[g.length - 1].end).toBe(30);
    const long = buildClipGrid({ durationSeconds: 600 });
    expect(long.length).toBeLessThanOrEqual(160);
    // the whole song is covered (cut at the cinematic pace when fast would not fit)
    expect(long[long.length - 1].end).toBe(600);
    expect(long).toEqual(buildClipGrid({ durationSeconds: 600, pace: "cinematic" }));
  });
});
