/**
 * A restaged clip against its take: lip timing and framing, from two series of faces.
 *
 * The series here are made, not filmed: a mouth that opens and closes like speech (irregular syllables, not a sine,
 * which would fit itself at every period), put through a known delay, a known change of speed, a camera that comes
 * closer, a stretch with no face. What the check says is held against what was put in.
 */
import { describe, expect, it } from "vitest";
import { closeOn, closerWindows } from "@/lib/media/faceSeries";
import { EYE_A, EYE_B, LIP_LOWER, LIP_UPPER, SYNC_SECONDS, WIDER_RATIO, checkAgainstTake, faceOf, fitLips, framingLine, framingOf, lipLine, minCorr, parseTakeCheck, type FaceFrame, type FaceSample } from "./takeCheck";

const FPS = 24;
/** A deterministic pseudo-random stream (so a failure is the same failure every run). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** Speech as a mouth: syllables of uneven length and height, with pauses. A function of time, so it can be read at any clock. */
function speech(seed: number, seconds = 12): (t: number) => number {
  const r = rng(seed);
  const beats: { at: number; len: number; height: number }[] = [];
  for (let t = 0; t < seconds; ) {
    const len = 0.09 + r() * 0.2;
    beats.push({ at: t, len, height: r() < 0.15 ? 0 : 0.15 + r() * 0.5 });
    t += len;
  }
  return (t) => {
    const b = beats.find((x) => t >= x.at && t < x.at + x.len);
    return b ? 0.04 + b.height * Math.sin((Math.PI * (t - b.at)) / b.len) : 0.04;
  };
}
/** A series of faces: `mouth(t)` on the clip's own clock, a small measuring noise, `reach` and `size` as given. */
function series(mouth: (t: number) => number, opts: { seconds?: number; from?: number; reach?: (t: number) => number; noise?: number; seed?: number; gap?: [number, number] } = {}): FaceSample[] {
  const r = rng(opts.seed ?? 7);
  const out: FaceSample[] = [];
  const n = Math.round((opts.seconds ?? 4) * FPS);
  for (let i = 0; i < n; i++) {
    const t = Math.round(((opts.from ?? 0) + i / FPS) * 1000) / 1000;
    if (opts.gap && t >= opts.gap[0] && t < opts.gap[1]) continue;
    const reach = opts.reach ? opts.reach(t) : 6;
    out.push({ t, mouth: Math.max(0, mouth(t) + (r() - 0.5) * (opts.noise ?? 0.02)), size: 1 / (reach * 1.3), cx: 0.5, cy: 0.25, reach });
  }
  return out;
}
const asFrames = (s: FaceSample[], seconds: number, from = 0): FaceFrame[] => {
  const byT = new Map(s.map((x) => [x.t, x]));
  return Array.from({ length: Math.round(seconds * FPS) }, (_, i) => {
    const t = Math.round((from + i / FPS) * 1000) / 1000;
    const f = byT.get(t);
    return { t, face: f ? { mouth: f.mouth, size: f.size, cx: f.cx, cy: f.cy, reach: f.reach } : null };
  });
};

describe("one face from its landmarks", () => {
  const points = (eyeY: number, gap: number, iod = 100, w = 720) => {
    const p: { x: number; y: number }[] = Array.from({ length: 300 }, () => ({ x: 0, y: 0 }));
    p[EYE_A] = { x: w / 2 - iod / 2, y: eyeY };
    p[EYE_B] = { x: w / 2 + iod / 2, y: eyeY };
    p[LIP_UPPER] = { x: w / 2, y: eyeY + 120 };
    p[LIP_LOWER] = { x: w / 2, y: eyeY + 120 + gap };
    return p;
  };
  it("measures the mouth in eye-distances, so a closer camera does not open it", () => {
    const near = faceOf(points(300, 30, 100), 720, 1280)!;
    const far = faceOf(points(300, 15, 50), 720, 1280)!;
    expect(near.mouth).toBeCloseTo(0.3, 4);
    expect(far.mouth).toBeCloseTo(0.3, 4);
  });
  it("measures how far below his eyes the frame goes, in eye-distances, whatever the frame's shape", () => {
    // eyes at 300 of 1280, 100 apart: 9.8 eye-distances of frame below them
    expect(faceOf(points(300, 20, 100), 720, 1280)!.reach).toBeCloseTo(9.8, 4);
    // the same man smaller in the same frame: the frame reaches further down him
    expect(faceOf(points(300, 10, 50), 720, 1280)!.reach).toBeCloseTo(19.6, 4);
    // a landscape frame cut at the same place on him has the same reach
    expect(faceOf(points(100, 20, 100, 1920), 1920, 1080)!.reach).toBeCloseTo(9.8, 4);
    expect(faceOf(points(300, 20, 100), 720, 1280)).toMatchObject({ size: 0.0781, cx: 0.5, cy: 0.2344 });
  });
  it("is no face when the eyes are on top of each other or the landmarks are missing", () => {
    expect(faceOf(points(300, 20, 1), 720, 1280)).toBeNull();
    expect(faceOf([], 720, 1280)).toBeNull();
  });
});

describe("lip sync: the clip's mouth against the take's", () => {
  const said = speech(11);
  const take = series(said, { seed: 1 });

  it("a clip on the take's clock is in sync, at retime 1 and no offset", () => {
    const lip = fitLips(take, series(said, { seed: 2 }));
    expect(lip.verdict).toBe("in_sync");
    expect(lip.best!.corr).toBeGreaterThan(0.9);
    expect(lip.best!.retime).toBe(1);
    expect(Math.abs(lip.best!.offset)).toBeLessThanOrEqual(0.021);
    expect(Math.abs(lip.worstLag!)).toBeLessThanOrEqual(0.021);
    expect(lip.onClock).toBeGreaterThan(0.9);
    expect(lip.compared).toBeGreaterThan(3.5);
  });

  it("a clip whose mouth is three frames late is off, and the lag is the delay put in", () => {
    const late = fitLips(take, series((t) => said(t - 0.125), { seed: 3 }));
    expect(late.verdict).toBe("off");
    expect(late.worstLag).toBeGreaterThan(SYNC_SECONDS);
    expect(late.worstLag!).toBeCloseTo(0.125, 1);
    expect(late.best!.corr).toBeGreaterThan(0.85);
    // and early is early
    const early = fitLips(take, series((t) => said(t + 0.2), { seed: 4 }));
    expect(early.verdict).toBe("off");
    expect(early.worstLag!).toBeCloseTo(-0.2, 1);
  });

  it("one frame late is still in sync", () => {
    const lip = fitLips(take, series((t) => said(t - 1 / 24), { seed: 5 }));
    expect(lip.verdict).toBe("in_sync");
    expect(lip.worstLag!).toBeCloseTo(0.042, 1);
  });

  it("a clip that starts on time and runs slow drifts out: the lag is judged at its worst, not at the start", () => {
    // the clip's time = 1.04 × the take's: on time at 0, four frames late by 4 s
    const slow = fitLips(take, series((t) => said(t / 1.04), { seed: 6 }));
    expect(slow.best!.retime).toBeCloseTo(1.04, 1);
    expect(slow.verdict).toBe("off");
    expect(slow.worstLag!).toBeGreaterThan(0.12);
  });

  it("another speed is taken only when it fits clearly better: a clip on the clock stays at the take's speed", () => {
    for (const seed of [51, 52, 53, 54]) expect(fitLips(series(speech(seed), { seed: 1 }), series(speech(seed), { seed: 2, noise: 0.2 })).best!.retime, `seed ${seed}`).toBe(1);
  });

  it("how well the mouths must agree depends on how long they were compared: sliding always finds some agreement", () => {
    expect([1.5, 2.5, 4, 6, 12].map(minCorr)).toEqual([0.86, 0.66, 0.53, 0.5, 0.5]);
    // sixty different performances against sixty takes, 4 s each: slid every way the fit allows, hardly any reach the bar
    let reached = 0;
    let highest = 0;
    for (let i = 0; i < 60; i++) {
      const other = fitLips(series(speech(1000 + i), { seed: 1 }), series(speech(5000 + i), { seed: 2 }));
      highest = Math.max(highest, other.best!.corr);
      if (other.verdict !== "unclear") reached++;
    }
    expect(reached).toBeLessThanOrEqual(1);
    // …and the agreement they do find is not small: without the bar, a fit like this would be read as lip sync
    expect(highest).toBeGreaterThan(0.35);
  });

  it("a still mouth, or too little of his face, is not measured", () => {
    expect(fitLips(take, series(() => 0.05, { noise: 0 })).verdict).toBe("unmeasured");
    expect(fitLips(take, series(said, { seconds: 0.6 })).verdict).toBe("unmeasured");
    expect(fitLips([], series(said)).verdict).toBe("unmeasured");
  });

  it("is measured on the part where his face is seen, and does not read across the part where it is not", () => {
    // the lights go out at 2.6 s: no face after that
    const lip = fitLips(take, series(said, { seed: 8, gap: [2.6, 4] }));
    expect(lip.verdict).toBe("in_sync");
    expect(lip.compared).toBeLessThan(2.7);
    expect(lip.compared).toBeGreaterThan(2.3);
  });
});

describe("framing: how much of him the clip shows, against the take", () => {
  const said = speech(31);
  const take = series(said, { reach: () => 6 });

  it("a clip framed as the take, or tighter, keeps the framing", () => {
    expect(framingOf(take, series(said, { reach: () => 6.2 }))).toMatchObject({ verdict: "kept", takeReach: 6, widestReach: 6.2, ratio: 1.03, openingSeen: true });
    const tighter = framingOf(take, series(said, { reach: () => 3 }));
    expect(tighter).toMatchObject({ verdict: "kept", ratio: 0.5 });
  });

  it("a clip that opens on the whole of him and pushes in is wider, at its opening", () => {
    // full-length at the start (the frame reaches 14 eye-widths below his eyes), the take's framing by the end
    const push = framingOf(take, series(said, { reach: (t) => 14 - 2 * t }));
    expect(push.verdict).toBe("wider");
    expect(push.ratio).toBeGreaterThan(WIDER_RATIO);
    expect(push.openingReach).toBeGreaterThan(13);
    expect(push.widestAt).toBeLessThan(0.2);
    expect(push.widestReach).toBeGreaterThan(13.5);
  });

  it("one odd frame does not make a clip wide", () => {
    const clip = series(said, { reach: () => 6 });
    clip[40] = { ...clip[40], reach: 30 };
    expect(framingOf(take, clip)).toMatchObject({ verdict: "kept", widestReach: 6 });
  });

  it("says when the opening itself could not be seen", () => {
    // his face is first found at 1.2 s (too small or too dark before)
    const f = framingOf(take, series(said, { reach: () => 6, gap: [0, 1.2] }), 0);
    expect(f).toMatchObject({ verdict: "kept", openingSeen: false, openingReach: null });
    expect(framingOf(take, [])).toMatchObject({ verdict: "unmeasured", openingSeen: false });
    expect(framingOf([], series(said))).toMatchObject({ verdict: "unmeasured" });
  });
});

describe("the whole check, its words and its record", () => {
  const said = speech(41);
  // the take's stretch starts at 155.99 s on the take's own clock
  const takeFrames = asFrames(series(said, { seed: 1, reach: () => 6 }).map((s) => ({ ...s, t: Math.round((s.t + 155.99) * 1000) / 1000 })), 4, 155.99);

  it("re-bases the take to its stretch, and reports both measures with what was seen", () => {
    const clip = asFrames(series(said, { seed: 2, reach: (t) => 14 - 2 * t, gap: [3, 4] }), 4);
    const c = checkAgainstTake(takeFrames, 155.99, clip, "2026-10-04T00:00:00Z");
    expect(c).toMatchObject({ version: 1, frames: 96, faceFrames: 72, faceFrom: 0, takeFrames: 96, takeFaceFrames: 96 });
    // what was measured is kept with the verdict: the take's mouth from 0 of its stretch, the clip's with its reach
    expect(c.series.take).toHaveLength(96);
    expect(c.series.take[0][0]).toBe(0);
    expect(c.series.clip).toHaveLength(72);
    expect(c.series.clip[0]).toHaveLength(3);
    expect(c.faceTo).toBeCloseTo(2.958, 2);
    expect(c.lip.verdict).toBe("in_sync");
    expect(c.framing.verdict).toBe("wider");
    expect(lipLine(c)).toContain("His mouth moves with the take's");
    expect(lipLine(c)).toContain("His face is found in 72 of 96 frames (to 2.96 s) — nothing is said about the rest.");
    expect(framingLine(c)).toContain("It shows more of his body than the take filmed");
    expect(framingLine(c)).toContain("the take's frame reaches 6.0 eye-widths below his eyes");
    // the record survives being stored and read back
    expect(parseTakeCheck(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it("says a lag as seconds and frames, and a speed when there is one", () => {
    const late = checkAgainstTake(takeFrames, 155.99, asFrames(series((t) => said(t - 0.125), { seed: 3 }), 4), "x");
    expect(late.lip.verdict).toBe("off");
    expect(lipLine(late)).toMatch(/\+0\.1[0-9] s \(3 frames late\) at its worst/);
    const slow = checkAgainstTake(takeFrames, 155.99, asFrames(series((t) => said(t / 1.04), { seed: 6 }), 4), "x");
    expect(lipLine(slow)).toContain("running at 1.04× the take's speed");
  });

  it("says plainly when nothing could be compared", () => {
    const dark = checkAgainstTake(takeFrames, 155.99, asFrames([], 4), "x");
    expect(dark.lip.verdict).toBe("unmeasured");
    expect(dark.framing.verdict).toBe("unmeasured");
    expect(lipLine(dark)).toContain("his face is found in 0 of 96 frames of the clip and 96 of 96 of the take");
    expect(framingLine(dark)).toContain("could not be measured");
  });

  it("is no check when the record is not one", () => {
    expect(parseTakeCheck(null)).toBeNull();
    expect(parseTakeCheck({ version: 2 })).toBeNull();
    expect(parseTakeCheck({ version: 1, measuredAt: "x", lip: { verdict: "fine" }, framing: { verdict: "kept" } })).toBeNull();
  });
});

describe("the closer squares a frame is looked at again in", () => {
  it("cover the whole frame, overlapping by half", () => {
    const wins = closerWindows(720, 1280);
    expect(wins.every(([x, y, side]) => side === 432 && x >= 0 && y >= 0 && x + side <= 720 && y + side <= 1280)).toBe(true);
    // every pixel is inside at least one
    for (const [px, py] of [[0, 0], [719, 1279], [360, 640], [719, 0], [0, 1279], [100, 900]] as const) {
      expect(wins.some(([x, y, side]) => px >= x && px < x + side && py >= y && py < y + side), `${px},${py}`).toBe(true);
    }
    expect(wins).toHaveLength(15);
    expect(closerWindows(1920, 1080).every(([x, y, side]) => side === 648 && x + side <= 1920 && y + side <= 1080)).toBe(true);
    expect(closerWindows(0, 0)).toEqual([]);
  });
  it("a face that was found is read again close on itself, inside the frame", () => {
    // a small face high in a tall frame: a square a little over twice its extent, centred on it
    const face = [{ x: 500, y: 300 }, { x: 600, y: 300 }, { x: 550, y: 420 }];
    expect(closeOn(face, 1080, 1920)).toEqual([418, 228, 264]);
    // at the edge of the frame the square stays inside it
    expect(closeOn([{ x: 0, y: 0 }, { x: 100, y: 120 }], 1080, 1920)).toEqual([0, 0, 264]);
    // a face that already fills the picture is not read again
    expect(closeOn([{ x: 100, y: 100 }, { x: 600, y: 700 }], 720, 1280)).toBeNull();
    expect(closeOn([], 720, 1280)).toBeNull();
  });
});
