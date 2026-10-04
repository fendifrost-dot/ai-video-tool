/**
 * Measuring whether footage changed when it was asked to. The clips here are made of numbers: a picture (a grid of
 * colour), a man moving in the middle of it in every frame, and a change of light or of layout at a known moment —
 * so the measurement can be held against what is true.
 */
import { describe, expect, it } from "vitest";
import { askedBeats, temporalPlan } from "./temporal";
import { resolveEvents } from "./events";
import { beatLine, checkAnswers, findChanges, isDrift, measureBeats, ON_TIME_SECONDS, pairBeats, parseBeatCheck, unaskedLine, VERDICT_LABEL, type AskedChange, type FrameSig } from "./beatCheck";
import { C038, FIRST_C035, framesOf, RETEST_C035 } from "./__fixtures__/realCurves";

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
    const sway = Math.sin(t * 9) * 1.2 + (r() - 0.5) * 0.15; // he moves
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const sx = x + (look.shift ?? 0);
        const room = 0.08 + 0.1 * (y / GRID) + 0.05 * Math.sin(sx * 0.9);
        // a figure with a soft edge (a cell he half covers is half his), so moving him moves the picture, not its sum
        const cover = y > 2 ? Math.max(0, Math.min(1, 2.1 - Math.abs(x - GRID / 2 - sway))) : 0;
        const figure = cover * (0.25 + 0.04 * Math.sin(t * 13 + y));
        const v = (room + figure) * look.light;
        for (let c = 0; c < 3; c++) cells.push(Math.max(0, Math.min(1, v * tint[c] + (r() - 0.5) * 0.012)));
      }
    }
    frames.push({ t, cells });
  }
  return frames;
}

/** The same picture turned upside down and moved half a frame sideways: another picture, under the same light. */
function flip(cells: number[]): number[] {
  const out: number[] = [];
  for (let y = GRID - 1; y >= 0; y--) for (let x = 0; x < GRID; x++) out.push(...cells.slice((y * GRID + ((x + GRID / 2) % GRID)) * 3, (y * GRID + ((x + GRID / 2) % GRID)) * 3 + 3));
  return out;
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

  it("a camera pushing in on a lit floor is one drift, not a string of events", () => {
    // the brightness of a real restaged take whose camera pushed in on a pool of light, every sixth of a second
    const measured = [0.122, 0.125, 0.133, 0.138, 0.147, 0.155, 0.165, 0.173, 0.186, 0.202, 0.218, 0.237, 0.26, 0.286, 0.3, 0.295, 0.289, 0.284, 0.276, 0.269, 0.26, 0.264, 0.265, 0.266, 0.265];
    const at = (t: number) => {
      const i = Math.min(measured.length - 2, Math.floor(t * 6));
      return measured[i] + (measured[i + 1] - measured[i]) * (t * 6 - i);
    };
    const { changes } = findChanges(clip(4, (t) => ({ light: at(t) / 0.122 })));
    expect(changes).toHaveLength(1);
    expect(changes[0].begins).toBeLessThan(1.1);
    expect(changes[0].arrived).toBeGreaterThan(1.7);
    expect(isDrift(changes[0])).toBe(true);
    expect(unaskedLine(changes[0])).toMatch(/^the picture brightens between \d\.\d\d s and \d\.\d\d s — a drift/);
    // a light that snaps is said as a moment
    const snap = findChanges(clip(4, step(1.9, 1, 0.25))).changes[0];
    expect(isDrift(snap)).toBe(false);
    expect(unaskedLine(snap)).toBe("the light changes at 1.92 s — nothing in the request asked for a change there");
  });

  it("a change of colour with the brightness held is a change of light", () => {
    const { changes } = findChanges(clip(4, (t) => ({ light: 1, tint: t < 2 ? [1, 1, 1] : [1.45, 1, 0.55] })));
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("light");
    expect(changes[0].begins).toBeCloseTo(2, 1);
  });

  it("the picture sliding sideways under a steady light is movement, not a change of state", () => {
    // a camera that drifts for the whole shot, and a subject that steps to a new place half-way through
    expect(findChanges(clip(4, (t) => ({ light: 1, shift: t * 1.2 }))).changes).toEqual([]);
    expect(findChanges(clip(4, (t) => ({ light: 1, shift: t < 2.5 ? 0 : 3.5 }))).changes).toEqual([]);
  });

  it("two neighbouring frames that are different pictures are a jump", () => {
    // from 2.5 s the clip is another picture altogether (the room upside down), under the same light
    const frames = clip(4, () => ({ light: 1 })).map((f) => (f.t < 2.5 ? f : { t: f.t, cells: flip(f.cells) }));
    const { changes } = findChanges(frames);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("picture");
    expect(changes[0].begins).toBeCloseTo(2.5, 2);
    expect(changes[0].arrived).toBe(changes[0].begins);
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
    expect(beatLine(check.beats[0])).toBe("asked at 1.90 s — no change of the light was found near it");
  });

  it("a beat that asked for a camera move is not failed for want of a change of light: it is for the eye", () => {
    const push: AskedChange = { id: "e1", offset: 1.9, kinds: ["camera"], says: "camera: a slow push toward him begins" };
    const check = measureBeats(clip(4, (t) => ({ light: 1, shift: t < 1.9 ? 0 : (t - 1.9) * 1.5 })), [push], AT);
    expect(check.beats[0]).toMatchObject({ verdict: "unmeasured", change: null, error: null });
    expect(check.verdict).toBe("kept");
    expect(beatLine(check.beats[0])).toBe("asked at 1.90 s — not a change of light, and colour cannot time it: look at the frames");
    // a beat that asked for light AND a camera move is held to the light
    const both = measureBeats(clip(4, () => ({ light: 1 })), [{ ...push, kinds: ["lighting", "camera"] }], AT);
    expect(both.beats[0].verdict).toBe("not_seen");
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
    expect(parseBeatCheck({ version: 2, beats: [], measuredAt: AT })).toBeNull();
    // a check made before "cannot tell which" existed may hold a timing against the wrong change: it is measured again
    expect(parseBeatCheck({ ...check, version: 3 })).toBeNull();
  });
});

describe("which change is the one that was asked for", () => {
  it("more changes of light than were asked for: no beat is timed, and the changes it could be are listed", () => {
    // the clip opens dark, comes up at 0.6 s, and the change that was asked for at 1.9 s happens at 1.9 s
    const check = measureBeats(clip(4, (t) => ({ light: t < 0.6 ? 0.3 : t < 1.9 ? 1 : 1.6 })), [beat(1.9, "light: the mirror ball comes alive")], AT);
    expect(check.verdict).toBe("undetermined");
    const b = check.beats[0];
    expect(b).toMatchObject({ verdict: "undetermined", change: null, error: null, askedNear: 1 });
    expect(b.candidates!.map((c) => Math.round(c.begins * 10) / 10)).toEqual([0.6, 1.9]);
    // neither is called unasked: one of them was asked for
    expect(check.unasked).toEqual([]);
    expect(beatLine(b)).toMatch(/^asked at 1\.90 s — the light changes twice near it \(0\.\d\d s, brighter; 1\.\d\d s, brighter\) and one change was asked for\. Which of them is the one asked for cannot be told from the light, so no timing is given: the frames are the check$/);
    expect(VERDICT_LABEL.undetermined).toBe("cannot tell which");
  });

  it("a room that goes dark and comes up again has changed twice — and a beat that asked for the blackout is not told nothing was seen", () => {
    // before, the two were joined into a change from the light it had to the light it has again (none), dropped, and
    // reported as two jumps of the picture; the beat was "not seen"
    const frames = clip(8, (t) => ({ light: t < 2 ? 1 : t < 6.5 ? 0.3 : 1 }));
    const { changes } = findChanges(frames);
    expect(changes.map((c) => [c.kind, Math.round(c.begins * 10) / 10, c.lumaAfter < c.lumaBefore ? "darker" : "brighter"])).toEqual([
      ["light", 2, "darker"],
      ["light", 6.5, "brighter"],
    ]);
    const check = measureBeats(frames, [beat(1.9, "light: the room goes dark", "e1"), beat(6.5, "light: the room comes back", "e2")], AT);
    expect(check.beats.map((b) => b.verdict)).toEqual(["on_time", "on_time"]);
    expect(check.unasked).toEqual([]);
    // a short one, inside a clip that changes again after it
    const short = findChanges(clip(6, (t) => ({ light: t < 1 ? 0.3 : t < 2 ? 1 : t < 3 ? 0.3 : 1.5 })), 5).changes;
    expect(short.map((c) => [c.kind, Math.round(c.begins)])).toEqual([
      ["light", 1],
      ["light", 2],
      ["light", 3],
    ]);
  });

  it("looking for a stretch lit differently from both its sides finds none in a room that does not change", () => {
    let found = 0;
    for (let seed = 101; seed <= 160; seed++) found += findChanges(clip(seed % 2 ? 4 : 8, () => ({ light: 1 }), seed), 5).changes.length;
    expect(found).toBe(0);
  });

  it("three changes for two beats: neither beat is timed", () => {
    const check = measureBeats(clip(6, (t) => ({ light: t < 1 ? 0.3 : t < 2 ? 1 : t < 3 ? 0.3 : 1.5 })), [beat(1.5, "a", "e1"), beat(2.6, "b", "e2")], AT);
    expect(check.beats.map((b) => [b.verdict, b.error, b.askedNear, b.candidates?.length])).toEqual([
      ["undetermined", null, 2, 3],
      ["undetermined", null, 2, 2],
    ]);
    expect(check.verdict).toBe("undetermined");
  });

  it("a change out of reach of the beat is another event and does not make the beat's own change uncertain", () => {
    const check = measureBeats(clip(8, (t) => ({ light: t < 2 ? 1 : t < 6.5 ? 0.3 : 1 })), [beat(1.9)], AT);
    expect(check.beats[0].verdict).toBe("on_time");
    expect(check.unasked).toHaveLength(1);
  });

  it("a beat that was not seen outranks one that could not be told", () => {
    const check = measureBeats(clip(8, (t) => ({ light: t < 0.6 ? 0.3 : t < 1.9 ? 1 : 1.6 })), [beat(1.9, "a", "e1"), beat(6, "b", "e2")], AT);
    expect(check.beats.map((b) => b.verdict)).toEqual(["undetermined", "not_seen"]);
    expect(check.verdict).toBe("not_kept");
  });

  it("a camera's drift near the beat does not make a change that happens at a moment uncertain", () => {
    // the picture brightens slowly for the whole clip, and the room goes dark at 2 s
    const check = measureBeats(clip(4, (t) => ({ light: (1 + 0.12 * t) * (t < 2 ? 1 : 0.3) })), [beat(1.9)], AT);
    expect(check.beats[0].verdict).toBe("on_time");
  });

  describe("on the light of real clips (the fresh section, 3–4 October 2026)", () => {
    const asked = (offset: number): AskedChange[] => [{ id: "e1", offset, kinds: ["lighting"], says: "light: the mirror ball comes alive" }];

    it("the retest — opens dark, comes up, THEN the mirror ball: it does not time the opening as the mirror ball", () => {
      const check = measureBeats(framesOf(RETEST_C035), asked(1.9), AT);
      const b = check.beats[0];
      // the first version of this check answered "displaced, −1.40 s": the opening coming up, timed as the change asked for
      expect(b.verdict).toBe("undetermined");
      expect(b.error).toBeNull();
      expect(b.change).toBeNull();
      expect(check.verdict).toBe("undetermined");
      expect(b.candidates).toHaveLength(2);
      const [opening, ball] = b.candidates!;
      expect(opening.begins).toBeGreaterThanOrEqual(0.33);
      expect(opening.begins).toBeLessThanOrEqual(0.58);
      // what a person read off the frames (the ball comes alive at 0.96 s) is one of the two — and the check does not pick it
      expect(ball.begins).toBeGreaterThanOrEqual(0.9);
      expect(ball.begins).toBeLessThanOrEqual(1.05);
      expect(check.unasked.filter((c) => c.kind === "light")).toEqual([]);
    });

    it("the first clip of the same shot and the blackout shot each change once: they keep their timing", () => {
      const first = measureBeats(framesOf(FIRST_C035), asked(1.9), AT).beats[0];
      expect(first.verdict).toBe("displaced");
      expect(first.error).toBeGreaterThan(-1.03);
      expect(first.error).toBeLessThan(-0.9);
      const blackout = measureBeats(framesOf(C038), asked(4.69), AT).beats[0];
      expect(blackout.verdict).toBe("displaced");
      expect(blackout.error).toBeCloseTo(-1.02, 1);
    });
  });
});
