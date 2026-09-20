import { describe, expect, it } from "vitest";
import {
  YSL_ICE_ON_GRID,
  YSL_ICE_ON_PERFORMANCE_SYNC,
  barStartSeconds,
  isSyncProductionReady,
  performanceToSong,
  songSecondsToFrame,
  songToPerformance,
  sourceRangeForSongRange,
} from "./performanceSync";

describe("performance sync mapping", () => {
  const sync = YSL_ICE_ON_PERFORMANCE_SYNC;

  it("song time = master time + 0.8538 s (drift negligible)", () => {
    expect(performanceToSong(0, sync)).toBeCloseTo(0.8538, 4);
    expect(performanceToSong(75, sync)).toBeCloseTo(75.8538, 3);
    expect(songToPerformance(0.8538, sync)).toBeCloseTo(0, 4);
  });

  it("round-trips within 1 ms across the whole master", () => {
    for (const t of [0, 9.42, 46.36, 89.64, 190.33]) {
      expect(songToPerformance(performanceToSong(t, sync), sync)).toBeCloseTo(t, 3);
    }
  });

  it("resolves the validation section (bars 24–46) to the master range", () => {
    const songRange = { start: barStartSeconds(24), end: barStartSeconds(46) };
    expect(songRange.start).toBeCloseTo(47.2131, 3);
    expect(songRange.end).toBeCloseTo(90.4918, 3);
    const src = sourceRangeForSongRange(songRange, sync, 190.33);
    expect(src).not.toBeNull();
    expect(src!.start).toBeCloseTo(46.3593, 3);
    expect(src!.end).toBeCloseTo(89.638, 3);
  });

  it("refuses song ranges the recording does not cover", () => {
    expect(sourceRangeForSongRange({ start: 0, end: 0.5 }, sync, 190.33)).toBeNull();
    expect(sourceRangeForSongRange({ start: 195, end: 200 }, sync, 190.33)).toBeNull();
  });

  it("frame mapping on a 24 fps song clock", () => {
    expect(songSecondsToFrame(0, 24)).toBe(0);
    expect(songSecondsToFrame(47.2131, 24)).toBe(1133);
  });

  it("canonical sync is production-ready by evidence", () => {
    expect(isSyncProductionReady(sync)).toBe(true);
    expect(isSyncProductionReady({ ...sync, status: "rejected" })).toBe(false);
    expect(
      isSyncProductionReady({
        ...sync,
        confidence: { windowsTotal: 30, windowsConsistent: 10, medianOffsetSeconds: 1, minOffsetSeconds: 0.5, maxOffsetSeconds: 1.5 },
      }),
    ).toBe(false);
  });

  it("grid: 122 BPM, bar = 1.9672 s", () => {
    expect(YSL_ICE_ON_GRID.barSeconds).toBeCloseTo(1.9672, 4);
    expect(barStartSeconds(32)).toBeCloseTo(62.9508, 3);
  });
});
