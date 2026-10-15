import { describe, expect, it } from "vitest";
import { DEFAULT_CUT, gridPaceOptions, parseCutSettings, withCutSettings } from "./cutSettings";
import { buildClipGrid } from "./grid";
import { projectBeats } from "@/lib/songAnalysis/analyzer";
import type { SongAnalysis } from "@/lib/songAnalysis/types";

const DUR = 90;
const analysis = (over: Partial<SongAnalysis> = {}): SongAnalysis => ({
  id: "a", project_id: "p", bpm: 121.998, duration_seconds: DUR,
  energy_curve_json: Array.from({ length: DUR * 4 }, (_, k) => ({ t: k / 4, energy: Math.sin((Math.PI * k) / (DUR * 4)) })),
  beat_map_json: projectBeats(121.998, DUR, 0.029), sections_json: [], drops_json: [], hooks_json: [],
  analysis_provider: "test", analyzed_at: "2026-10-15T00:00:00Z", ...over,
});
const lens = (g: { start: number; end: number }[]) => g.map((c) => c.end - c.start);

describe("cut settings", () => {
  it("defaults to the fast cut when nothing is saved or the value is junk", () => {
    expect(parseCutSettings(null)).toEqual(DEFAULT_CUT);
    expect(parseCutSettings({ cut: { pace: "warp", targets: { high: -3, mid: "x", low: 99 } } })).toEqual(DEFAULT_CUT);
  });

  it("round-trips through the treatment record and keeps everything else in it", () => {
    const rec = withCutSettings({ treatment: { text: "t" }, clips: [1] }, { pace: "cinematic", targets: { ...DEFAULT_CUT.targets, high: 1 } });
    expect(rec.treatment).toEqual({ text: "t" });
    expect(rec.clips).toEqual([1]);
    expect(parseCutSettings(rec)).toEqual({ pace: "cinematic", targets: { ...DEFAULT_CUT.targets, high: 1 } });
  });

  it("the director's lengths change the cut: longer settings give fewer, longer shots, every cut still on a beat", () => {
    const a = analysis();
    const quick = buildClipGrid({ analysis: a, ...gridPaceOptions(DEFAULT_CUT) });
    const slow = buildClipGrid({ analysis: a, ...gridPaceOptions({ pace: "fast", targets: { high: 3, drop: 3, mid: 4, low: 5 } }) });
    expect(slow.length).toBeLessThan(quick.length * 0.7);
    const beats = a.beat_map_json.map((b) => b.t);
    for (const c of slow.slice(0, -1)) expect(beats.some((t) => Math.abs(t - c.end) < 0.006)).toBe(true);
    const avg = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
    expect(avg(lens(slow))).toBeGreaterThan(avg(lens(quick)) + 1);
  });

  it("cinematic in the settings gives the cinematic cut", () => {
    const a = analysis();
    expect(buildClipGrid({ analysis: a, ...gridPaceOptions({ ...DEFAULT_CUT, pace: "cinematic" }) })).toEqual(buildClipGrid({ analysis: a, pace: "cinematic" }));
  });

  it("very short lengths still cover the song to its end (no uncovered tail)", () => {
    for (const dur of [30.3, 30.4, 30.45, 44.12, 59.97]) {
      const a = analysis({ duration_seconds: dur, beat_map_json: projectBeats(121.998, dur, 0.029) });
      const g = buildClipGrid({ analysis: a, ...gridPaceOptions({ pace: "fast", targets: { high: 0.5, drop: 0.5, mid: 0.5, low: 0.5 } }) });
      expect(g[g.length - 1].end).toBe(Math.round(dur * 100) / 100);
      expect(lens(g).every((l) => l > 0.3)).toBe(true);
    }
  });

  it("no shot shorter than the minimum when the beat map ends before the song does", () => {
    const short = projectBeats(121.998, 50, 0.029); // map covers 50 s of a 90 s song
    const g = buildClipGrid({ analysis: analysis({ beat_map_json: short }) });
    for (const l of lens(g)) expect(l).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(g[g.length - 1].end).toBe(DUR);
  });
});
