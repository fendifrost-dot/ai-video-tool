/**
 * Measuring whether footage changed when it was asked to. The clips here are made of numbers: a picture (a grid of
 * colour), a man moving in the middle of it in every frame, and a change of light or of layout at a known moment —
 * so the measurement can be held against what is true.
 */
import { describe, expect, it } from "vitest";
import { askedBeats, temporalPlan } from "./temporal";
import { resolveEvents } from "./events";
import { beatLine, checkAnswers, findChanges, measureBeats, ON_TIME_SECONDS, pairBeats, parseBeatCheck, type AskedChange, type FrameSig } from "./beatCheck";

const GRID = 12;
const FPS = 24;
const AT = "2026-10-03T19:00:00Z";

/** A small deterministic generator, so a failing test fails the same way twice. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

type Look = { light: number; tint?: [number, number, number]; shift?: number };

/**
 * A clip: a dim room with a brighter floor, a figure in the middle who moves every frame, sensor noise everywhere.
 * `lookAt(t)` says how lit the room is (and its colour, and how far the layout has slid) at time t.
 */
function clip(seconds: number, lookAt: (t: number) => Look, seed = 7, fps = FPS): FrameSig[] {
  const r = rng(seed);
  const frames: FrameSig[] = [];
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const look = lookAt(t);
    const tint = look.tint ?? [1, 1, 1];
    const cells: number[] = [];
    const sway = Math.sin(t * 9) * 1.2 + (r() - 0.5) * 0.8; // he moves
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const sx = x + (look.shift ?? 0);
        const room = 0.08 + 0.1 * (y / GRID) + 0.05 * Math.sin(sx * 0.9);
        const figure = Math.abs(x - GRID / 2 - sway) < 1.6 && y > 2 ? 0.25 + 0.1 * Math.sin(t * 13 + y) : 0;
        const v = (room + figure) * look.light;
        for (let c = 0; c < 3; c++) cells.push(Math.max(0, Math.min(1, v * tint[c] + (r() - 0.5) * 0.012)));
      }
    }
    frames.push({ t, cells });
  }
  return frames;
}

const beat = (offset: number, says = "light: the room goes dark", id = "e1"): AskedChange => ({ id, offset, kinds: ["lighting"], says });
const step = (at: number, from: number, to: number) => (t: number): Look => ({ light: t < at ? from : to });

describe("finding where a picture changes", () => {
  it("a clip that never changes has no change, however much he moves", () => {
    const found = findChanges(clip(4, () => ({ light: 1 })));
    expect(found.changes).toEqual([]);
    expect(found.fps).toBeCloseTo(24, 0);
    expect(found.clipSeconds).toBeCloseTo(4, 1);
    expect(found.series.length).toBe(96);
  });

  it("finds none in twenty different clips of a man moving in a room that does not change", () => {
    for (let seed = 1; seed <= 20; seed++) expect(findChanges(clip(4, () => ({ light: 1 }), seed)).changes).toEqual([]);
  });

  it("finds the frame the light dies on", () => {
    const { changes } = findChanges(clip(4, step(1.9, 1, 0.25)));
    expect(changes).toHaveLength(1);
    // 1.9 s is between frames 45 (1.875) and 46 (1.917): the first changed frame is 46
    expect(changes[0].begins).toBeCloseTo(46 / 24, 3);
    expect(changes[0].arrived).toBeCloseTo(46 / 24, 3);
    expect(changes[0].kind).toBe("light");
    expect(changes[0].lumaAfter).toBeLessThan(changes[0].lumaBefore);
  });

  it("a change that takes time has a beginning and an arrival", () => {
    // the light falls from 1.5 s to 2.5 s
    const { changes } = findChanges(clip(4, (t) => ({ light: t < 1.5 ? 1 : t > 2.5 ? 0.2 : 1 - 0.8 * (t - 1.5) })));
    expect(changes).toHaveLength(1);
    expect(changes[0].begins).toBeGreaterThan(1.5);
    expect(changes[0].begins).toBeLessThan(1.85);
    expect(changes[0].arrived).toBeGreaterThan(2.15);
    expect(changes[0].arrived).toBeLessThanOrEqual(2.5);
    expect(changes[0].half).toBeGreaterThan(changes[0].begins);
  });

  it("a change of colour with the brightness held is a change of light", () => {
    const { changes } = findChanges(clip(4, (t) => ({ light: 1, tint: t < 2 ? [1, 1, 1] : [1.45, 1, 0.55] })));
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("light");
    expect(changes[0].begins).toBeCloseTo(2, 1);
  });

  it("a change of layout with the light held is a change of picture", () => {
    const { changes } = findChanges(clip(4, (t) => ({ light: 1, shift: t < 2.5 ? 0 : 3.5 })));
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("picture");
    expect(changes[0].begins).toBeCloseTo(2.5, 1);
  });

  it("finds two changes in order", () => {
    const { changes } = findChanges(clip(6, (t) => ({ light: t < 1.5 ? 1 : t < 4 ? 0.3 : 1.4 })));
    expect(changes.map((c) => Math.round(c.begins * 10) / 10)).toEqual([1.5, 4]);
  });
});

describe("holding the footage against the script", () => {
  it("on time: the change begins within a quarter of a second of where it was asked", () => {
    const check = measureBeats(clip(4, step(2.0, 1, 0.25)), [beat(1.9)], AT);
    expect(check.verdict).toBe("kept");
    expect(check.beats[0].verdict).toBe("on_time");
    expect(check.beats[0].error).toBeCloseTo(0.1, 1);
    expect(Math.abs(check.beats[0].error!)).toBeLessThanOrEqual(ON_TIME_SECONDS);
    expect(check.unasked).toEqual([]);
    expect(beatLine(check.beats[0])).toMatch(/^asked at 1\.90 s — the light begins to change at 2\.00 s \(\+0\.10 s\)$/);
  });

  it("it happened, but not when asked: the displacement is the result, not a pass", () => {
    const check = measureBeats(clip(4, step(2.9, 1, 0.25)), [beat(1.9)], AT);
    expect(check.verdict).toBe("displaced");
    expect(check.beats[0].verdict).toBe("displaced");
    expect(check.beats[0].error).toBeCloseTo(1.0, 1);
    // and early is displaced too
    const early = measureBeats(clip(4, step(0.9, 1, 0.25)), [beat(1.9)], AT);
    expect(early.beats[0].error).toBeCloseTo(-1.0, 1);
    expect(early.beats[0].verdict).toBe("displaced");
    expect(beatLine(early.beats[0])).toContain("(−0.98 s)");
  });

  it("it never happened: not seen — and nothing is made up to fill the line", () => {
    const check = measureBeats(clip(4, () => ({ light: 1 })), [beat(1.9)], AT);
    expect(check.verdict).toBe("not_kept");
    expect(check.beats[0]).toMatchObject({ verdict: "not_seen", change: null, error: null });
    expect(beatLine(check.beats[0])).toBe("asked at 1.90 s — no change of the picture was found near it");
  });

  it("a change far from the beat is another event, not the beat arriving late", () => {
    const check = measureBeats(clip(6, step(5.0, 1, 0.25)), [beat(1.0)], AT);
    expect(check.beats[0].verdict).toBe("not_seen");
    expect(check.unasked).toHaveLength(1);
    expect(check.unasked[0].begins).toBeCloseTo(5, 1);
  });

  it("two beats are each held against their own change, in order", () => {
    const frames = clip(6, (t) => ({ light: t < 1.6 ? 1 : t < 4.4 ? 0.3 : 1.4 }));
    const check = measureBeats(frames, [beat(4.0, "light: gold light comes up", "e2"), beat(1.5, "light: the room goes dark", "e1")], AT);
    expect(check.beats.map((b) => [b.id, b.verdict, Math.round(b.error! * 10) / 10])).toEqual([
      ["e1", "on_time", 0.1],
      ["e2", "displaced", 0.4],
    ]);
    expect(check.verdict).toBe("displaced");
  });

  it("one change for two beats goes to the beat it is nearest; the other is not seen", () => {
    const check = measureBeats(clip(4, step(2.6, 1, 0.25)), [beat(1.2, "a", "e1"), beat(2.5, "b", "e2")], AT);
    expect(check.beats.map((b) => b.verdict)).toEqual(["not_seen", "on_time"]);
  });

  it("a state the clip opens in is not a change inside it and is not timed", () => {
    const check = measureBeats(clip(4, step(2.0, 1, 0.25)), [{ id: "open", offset: 0, kinds: ["lighting"], says: "light: dark" }, beat(2.0)], AT);
    expect(check.beats.map((b) => b.id)).toEqual(["e1"]);
  });

  it("pairs in order and never beyond its reach", () => {
    const c = (begins: number) => ({ begins, half: begins, arrived: begins, size: 0.1, strength: 9, kind: "light" as const, lumaBefore: 0.3, lumaAfter: 0.1 });
    expect(pairBeats([beat(1), beat(3, "", "e2")], [c(1.2), c(2.8)], 1.5)).toEqual([0, 1]);
    expect(pairBeats([beat(1)], [c(3.1)], 1.5)).toEqual([null]);
    expect(pairBeats([beat(1), beat(1.4, "", "e2")], [c(1.5)], 1.5)).toEqual([null, 0]);
    expect(pairBeats([], [c(1)], 1.5)).toEqual([]);
  });
});

describe("the check is a record", () => {
  it("is measured against the script the request was made from", () => {
    const resolved = resolveEvents(
      [{ id: "e1", at: 1.9, trigger: { kind: "time", ref: "" }, visual: "", camera: "", lighting: "the room goes dark", action: "", lightingState: null, effect: null }],
      { start: 156.86, end: 160.78 },
      {},
    );
    const plan = temporalPlan({ route: "seedance_ref", resolved, shotSeconds: 3.92 });
    expect(plan.mode).toBe("timed_script");
    const asked = plan.mode === "timed_script" ? plan.asked : [];
    expect(asked).toEqual(askedBeats(resolved, 3.92));
    expect(asked).toEqual([{ id: "e1", offset: 1.9, kinds: ["lighting"], says: "light: the room goes dark" }]);
    const check = measureBeats(clip(4, step(1.9, 1, 0.25)), asked, AT);
    expect(check.beats[0]).toMatchObject({ id: "e1", offset: 1.9, verdict: "on_time", says: "light: the room goes dark" });
    // stored and read back, it still answers that script — and not a script that has since changed
    const stored = parseBeatCheck(JSON.parse(JSON.stringify(check)));
    expect(checkAnswers(stored, asked)).toBe(true);
    expect(checkAnswers(stored, [{ ...asked[0], offset: 2.4 }])).toBe(false);
    expect(checkAnswers(null, asked)).toBe(false);
    expect(parseBeatCheck({ version: 1, beats: [] })).toBeNull();
  });
});
