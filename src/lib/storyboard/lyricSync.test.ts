/**
 * The lyric-sync arithmetic, on the real YSL numbers: the hand-made sync (+0.8538 s), the ending's lyric lines and
 * the 10 s continuous takes made for c033/c034 (first frame at 53.8 s).
 */
import { describe, expect, it } from "vitest";
import type { PerformanceSync } from "@/lib/sync/performanceSync";
import { planFootageEdit, takeCoverage, editOf, coverageLabel } from "./footageEdit";
import { footageOnSong, linesOfShot, lyricFit, lyricWindowOf, slipToLine } from "./lyricSync";
import type { Assignment } from "./media";

const SYNC = { offsetSeconds: 0.8538, driftPpm: 0, status: "manual" } as PerformanceSync;
const LINES = [
  { lineIndex: 40, text: "Laugh cause we did it", start: 58.02, end: 58.8 },
  { lineIndex: 41, text: "what im whippin cost a home", start: 58.8, end: 59.68 },
  { lineIndex: 42, text: "Got everything but the kitchen", start: 59.68, end: 60.8 },
  { lineIndex: 43, text: "You don’t gotta", start: 60.8, end: 61.6 },
  { lineIndex: 99, text: "an aligner bridge, not a line", start: 20, end: 45 },
];

describe("a slip moves the take on one shot, and the sync is never written", () => {
  const box = { start: 15.68, end: 19.6 };
  it("plays the take later by the slip: the in-point moves back by the same seconds", () => {
    const plain = takeCoverage({ box, sync: SYNC, takeDurationSeconds: 190.34 });
    const slipped = takeCoverage({
      box,
      sync: SYNC,
      takeDurationSeconds: 190.34,
      edit: { head: 0, tail: 0, excluded: false, slip: 0.25 },
    });
    expect(slipped.sourceIn).toBeCloseTo(plain.sourceIn! - 0.25, 4);
    expect(slipped.from).toBe("slipped");
    expect(slipped.slip).toBe(0.25);
    expect(coverageLabel(slipped)).toMatch(/moved \+0\.25 s by hand/);
  });

  it("is written as this variation's own row — inserted for an offered take, updated on a row", () => {
    const first = planFootageEdit({
      assignments: [],
      box: { id: "b1", ...box },
      assetId: "take",
      action: { do: "slip", seconds: -0.125 },
    });
    expect(first.refused).toBeNull();
    expect(first.ops).toEqual([
      expect.objectContaining({ op: "insert", slip_seconds: -0.125, isPrimary: true }),
    ]);
    const row = {
      id: "a1",
      shotId: "b1",
      assetId: "take",
      role: "performance",
      trimHead: 0.5,
      trimTail: 0,
      excluded: false,
      slip: -0.125,
    } as Assignment;
    const again = planFootageEdit({
      assignments: [row],
      box: { id: "b1", ...box },
      assetId: "take",
      action: { do: "slip", seconds: 0 },
    });
    expect(again.ops).toEqual([
      {
        op: "update",
        id: "a1",
        patch: expect.objectContaining({ slip_seconds: 0, trim_head_seconds: 0.5 }),
      },
    ]);
    // a trim keeps the slip, and leaves the column alone (a backend without it still trims)
    const trim = planFootageEdit({
      assignments: [row],
      box: { id: "b1", ...box },
      assetId: "take",
      action: { do: "trim", head: 0.25, tail: 0 },
    });
    expect(trim.ops[0]).toMatchObject({ op: "update", patch: { trim_head_seconds: 0.25 } });
    expect((trim.ops[0] as { patch: Record<string, unknown> }).patch).not.toHaveProperty(
      "slip_seconds",
    );
    expect(editOf(row).slip).toBe(-0.125);
    // reset is back to the sync, slip included
    const reset = planFootageEdit({
      assignments: [row],
      box: { id: "b1", ...box },
      assetId: "take",
      action: { do: "reset" },
    });
    expect(reset.ops[0]).toMatchObject({ patch: { slip_seconds: 0, trim_head_seconds: 0 } });
  });

  it("refuses a slip past the bound instead of storing it", () => {
    const r = planFootageEdit({
      assignments: [],
      box: { id: "b1", ...box },
      assetId: "take",
      action: { do: "slip", seconds: 31 },
    });
    expect(r.ops).toEqual([]);
    expect(r.refused).toMatch(/at most 30 s/);
  });
});

describe("the frame he starts a line on goes on that line", () => {
  it("is the slip that maps that frame of the take onto the line's start", () => {
    // frame 57.5 s of the take plays at 58.3538 s on the sync; the line starts at 58.02 s
    const s = slipToLine({ sync: SYNC, takeSeconds: 57.5, songSeconds: 58.02 })!;
    expect(s).toBeCloseTo(-0.3338, 4);
    expect(57.5 + SYNC.offsetSeconds + s).toBeCloseTo(58.02, 6);
  });
  it("carries drift, and gives up past the bound", () => {
    const drift = { offsetSeconds: 0, driftPpm: 1000 };
    expect(slipToLine({ sync: drift, takeSeconds: 100, songSeconds: 100.1 })).toBeCloseTo(0, 4);
    expect(slipToLine({ sync: SYNC, takeSeconds: 0, songSeconds: 120 })).toBeNull();
  });
});

describe("a shot against its lyric window", () => {
  const c033 = { start: 58.06, end: 59.54 };
  it("carries the lines it overlaps, whole; a touch and an aligner bridge are not its lines", () => {
    const l = linesOfShot(LINES, { start: 58.75, end: 59.68 });
    expect(l.map((x) => x.lineIndex)).toEqual([41]);
    expect(lyricWindowOf(linesOfShot(LINES, c033))).toEqual({ start: 58.02, end: 59.68 });
    expect(linesOfShot(LINES, { start: 30, end: 31 })).toEqual([]);
  });

  it("is ok when the shot cuts between words and the clip covers the shot", () => {
    // E1: 10 s from 53.8 s on the song. The shot ends 0.14 s before the line, with no word timings:
    // that is a cut, not a short shot.
    const footage = footageOnSong({
      shotStart: c033.start,
      sourceIn: 4.26,
      leadIn: 0,
      durationSeconds: 10.04,
    });
    expect(footage.start).toBeCloseTo(53.8, 3);
    const fit = lyricFit({ shot: c033, lines: LINES, footage });
    expect(fit.status).toBe("ok");
    expect(fit.shotShortTail).toBe(0);
    expect(fit.lyricWindow).toEqual({ start: 58.02, end: 59.68 });
  });

  it("does not ask for a new clip when the file covers the shot and only the rest of the line is past it", () => {
    // a 4 s take whose last frame is at 59.6 s; the shot ends at 59.54
    const footage = footageOnSong({
      shotStart: c033.start,
      sourceIn: 2.46,
      leadIn: 0,
      durationSeconds: 4,
    });
    const fit = lyricFit({ shot: c033, lines: LINES, footage });
    expect(fit.status).toBe("ok");
    expect(fit.clipShortTail).toBe(0);
  });

  it("needs a new clip when the clip runs out inside the shot itself", () => {
    const fit = lyricFit({ shot: c033, lines: LINES, footage: { start: 58.06, end: 59.0 } });
    expect(fit.status).toBe("needs_clip");
    expect(fit.message).toMatch(/ends 0\.54 s early/);
  });

  it("is ok when the shot holds its lines and the clip covers it; says so when there are none", () => {
    expect(
      lyricFit({ shot: { start: 58.0, end: 59.7 }, lines: LINES, footage: { start: 50, end: 70 } })
        .status,
    ).toBe("ok");
    expect(
      lyricFit({ shot: { start: 30, end: 31 }, lines: LINES, footage: { start: 0, end: Infinity } })
        .status,
    ).toBe("no_lyrics");
    expect(lyricFit({ shot: c033, lines: LINES, footage: null }).status).toBe("no_clip");
  });

  it("flags a word the shot cuts in half, and ignores a cut that falls between words", () => {
    const words = [
      { w: "what", start: 58.8, end: 59.0 },
      { w: "home", start: 59.4, end: 59.7 },
    ];
    const lines = [
      { lineIndex: 41, text: "what im whippin cost a home", start: 58.8, end: 59.68, words },
    ];
    const between = lyricFit({
      shot: { start: 59.05, end: 59.35 },
      lines,
      footage: { start: 50, end: 70 },
    });
    expect(between.status).toBe("ok");
    const bisect = lyricFit({
      shot: { start: 58.9, end: 59.5 },
      lines,
      footage: { start: 50, end: 70 },
    });
    expect(bisect.status).toBe("extend_shot");
    expect(bisect.message).toMatch(/word “what”/);
    const short = lyricFit({
      shot: { start: 58.9, end: 59.5 },
      lines,
      footage: { start: 58.95, end: 59.5 },
    });
    expect(short.status).toBe("needs_clip");
  });

  it("drops a held-note bridge and a near-zero line, and stays inside the shot's section", () => {
    const lines = [
      {
        lineIndex: 16,
        section: "verse",
        text: "know you see it",
        start: 41.04,
        end: 47.6,
        words: [],
      },
      { lineIndex: 37, section: "verse", text: "", start: 66.0, end: 66.01, words: [] },
      { lineIndex: 40, section: "verse", text: "a real line", start: 42.0, end: 43.2, words: [] },
      {
        lineIndex: 43,
        section: "hook",
        text: "You don't gotta",
        start: 60.8,
        end: 63.16,
        words: [],
      },
    ];
    const shot = { start: 42.2, end: 44.0, section: "verse" };
    expect(linesOfShot(lines, shot).map((l) => l.lineIndex)).toEqual([40]);
    const fit = lyricFit({
      shot,
      lines,
      footage: { start: 40, end: 48 },
    });
    expect(fit.status).toBe("ok");
    expect(fit.lines.map((l) => l.lineIndex)).toEqual([40]);
    const hook = lyricFit({
      shot: { start: 60.5, end: 62.0, section: "verse" },
      lines,
      footage: { start: 60, end: 64 },
    });
    expect(hook.status).toBe("no_lyrics");
  });
});
