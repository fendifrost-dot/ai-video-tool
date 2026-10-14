import { describe, expect, it } from "vitest";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { projectBeats } from "@/lib/songAnalysis/analyzer";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "./boxes";
import { inferBoardGrid, measuredBeatMap, measuredBeats, planConformToBeats } from "./conform";

const AT = "2026-10-14T12:00:00Z";
const DURATION = 120;

function box(key: string, start: number, end: number, id = `r-${key}`, opts: { locked?: boolean; history?: StoryboardBox["history"] } = {}): StoryboardBox {
  const spec = parseShotSpec({ id: key, purpose: "a rider in a burning forest", shotType: "b_roll", kind: "broll", timeline: { start, end } });
  const w = boxWrite({ key, start, end, section: "verse", generated: spec, override: null, locked: opts.locked ?? false, origin: "treatment", history: opts.history ?? [] });
  return boxFromRow({ id, project_id: "p1", shot_number: 1, ...w, updated_at: AT } as BoxRow)!;
}

/** A board cut the v1 way: two-bar shots counted from 0:00 at 122.4 BPM. */
function v1Board(): StoryboardBox[] {
  const bar = (4 * 60) / 122.4;
  const out: StoryboardBox[] = [];
  let t = 0;
  for (let i = 0; t < DURATION - 0.01; i++) {
    const end = Math.min(DURATION, Math.round((t + 2 * bar) * 100) / 100);
    out.push(box(`c${String(i + 1).padStart(3, "0")}`, Math.round(t * 100) / 100, DURATION - end < 2.5 ? DURATION : end));
    t = out[out.length - 1].end;
  }
  return out;
}

const measured = projectBeats(121.998, DURATION, 0.029).map((b) => b.t);

describe("measuredBeats", () => {
  it("only a v2 analysis counts as measured", () => {
    const map = projectBeats(121.998, DURATION, 0.029);
    expect(measuredBeats({ analysis_provider: "web-audio-builtin-v2", beat_map_json: map })).not.toBeNull();
    expect(measuredBeats({ analysis_provider: "web-audio-builtin-v2-downbeat-uncertain", beat_map_json: map })).not.toBeNull();
    expect(measuredBeats({ analysis_provider: "web-audio-builtin", beat_map_json: map })).toBeNull();
    expect(measuredBeats({ analysis_provider: "web-audio-builtin-v2", beat_map_json: [] })).toBeNull();
    expect(measuredBeats({ analysis_provider: "web-audio-builtin-v2", beat_map_json: {} as never })).toBeNull();
  });
});

describe("planConformToBeats", () => {
  const board = v1Board();
  // a hand-cut board (edges nudged off any regular grid) takes the nearest beat
  const jitter = [0.07, -0.05, 0.11, -0.09, 0.03, -0.12, 0.08];
  const handCut = (() => {
    const edges = board.map((b) => b.end);
    const moved = edges.map((e, i) => (e === DURATION ? e : Math.round((e + jitter[i % jitter.length]) * 100) / 100));
    return board.map((b, i) => box(b.key, i === 0 ? 0 : moved[i - 1], moved[i], b.id));
  })();
  const plan = planConformToBeats(handCut, measured, DURATION, AT);

  it("rebases a board cut on an old grid beat for beat: every cut on a measured downbeat, every shot keeps its bars", () => {
    const map = measuredBeatMap({ analysis_provider: "web-audio-builtin-v2", beat_map_json: projectBeats(121.998, DURATION, 0.029) })!;
    const p = planConformToBeats(board, map, DURATION, AT);
    expect(p.method).toBe("rebase");
    const downbeats = projectBeats(121.998, DURATION, 0.029).filter((b) => b.beat === 1).map((b) => b.t);
    const after = new Map(p.moved.map((mv) => [mv.key, mv.to]));
    const beat = 60 / 121.998;
    for (const b of board.slice(0, -1)) {
      const to = after.get(b.key)!;
      expect(downbeats.some((d) => Math.abs(d - to.end) <= 0.006)).toBe(true);
      expect(Math.round((to.end - to.start) / beat)).toBe(Math.round((b.end - b.start) / (60 / 122.4)));
    }
  });

  it("infers the grid a board was cut on, and none for a hand-cut board", () => {
    const inner = board.slice(0, -1).map((b) => b.end);
    expect(60 / inferBoardGrid(inner, 60 / 121.998)!.beatSec).toBeCloseTo(122.4, 1);
    expect(inferBoardGrid([3.1, 7.43, 9.9, 15.2, 18.77, 23.05], 60 / 121.998)).toBeNull();
  });

  it("puts every inner edge on a measured beat, moving it at most half a beat (no grid to rebase from)", () => {
    expect(plan.method).toBe("nearest");
    const after = new Map(plan.moved.map((m) => [m.key, m.to]));
    const beat = 60 / 121.998;
    for (const b of handCut) {
      const to = after.get(b.key) ?? { start: b.start, end: b.end };
      for (const [was, now] of [[b.start, to.start], [b.end, to.end]] as const) {
        if (was === 0 || was === DURATION) {
          expect(now).toBe(was);
          continue;
        }
        const nearest = measured.reduce((x, y) => (Math.abs(y - now) < Math.abs(x - now) ? y : x), measured[0]);
        expect(Math.abs(nearest - now)).toBeLessThanOrEqual(0.006);
        expect(Math.abs(now - was)).toBeLessThanOrEqual(beat / 2 + 0.006);
      }
    }
    expect(plan.moved.length).toBeGreaterThan(handCut.length / 2);
  });

  it("keeps shots back to back and in order", () => {
    const after = new Map(plan.moved.map((m) => [m.key, m.to]));
    const windows = handCut.map((b) => after.get(b.key) ?? { start: b.start, end: b.end });
    for (let i = 1; i < windows.length; i++) expect(windows[i].start).toBe(windows[i - 1].end);
    for (const w of windows) expect(w.end).toBeGreaterThan(w.start);
  });

  it("writes only the new window and one restorable conform entry", () => {
    const u = plan.updates[1];
    const b = handCut.find((x) => x.id === u.id)!;
    expect(Object.keys(u).sort()).toEqual(["end", "history", "id", "start"]);
    expect(u.history.at(-1)).toMatchObject({ event: "conform", at: AT, from: { start: b.start, end: b.end } });
    expect(u.history.length).toBe(b.history.length + 1);
  });

  it("a second conform replaces the first entry and keeps the original window", () => {
    const first = { at: "2026-10-01T00:00:00Z", event: "conform" as const, note: "earlier", from: { start: 3.5, end: 7.5 } };
    const b = box("q", 3.6, 7.7, "r-q", { history: [first] });
    const p = planConformToBeats([box("p", 0, 3.6), b, box("r", 7.7, 12)], measured, null, AT);
    const u = p.updates.find((x) => x.id === "r-q")!;
    expect(u.history.filter((h) => h.event === "conform")).toHaveLength(1);
    expect(u.history.at(-1)).toMatchObject({ at: AT, from: { start: 3.5, end: 7.5 } });
  });

  it("conforms a locked shot too (locked is a content lock, not a timing lock)", () => {
    const p = planConformToBeats([box("a", 0, 3.92), box("b", 3.92, 7.84, "r-b", { locked: true }), box("c", 7.84, 11.76)], measured, null, AT);
    expect(p.moved.map((m) => m.key)).toContain("b");
  });

  it("keeps the start of a shot with a beat-triggered event (beat N counts from the start)", () => {
    const spec = parseShotSpec({ id: "b", purpose: "x", shotType: "b_roll", kind: "broll", timeline: { start: 3.92, end: 7.84 }, events: [{ id: "e1", at: 1, action: "flash", trigger: { kind: "beat", ref: "2" } }] });
    const w = boxWrite({ key: "b", start: 3.92, end: 7.84, section: "verse", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
    const beatBox = boxFromRow({ id: "r-b", project_id: "p1", shot_number: 2, ...w, updated_at: AT } as BoxRow)!;
    const p = planConformToBeats([box("a", 0, 3.92), beatBox, box("c", 7.84, 11.76)], measured, null, AT);
    const b = p.moved.find((mv) => mv.key === "b");
    expect(b?.to.start ?? 3.92).toBe(3.92);
    expect(p.edgesKept).toBeGreaterThanOrEqual(1);
  });

  it("never collapses a shot that is already under the minimum", () => {
    const p = planConformToBeats([box("a", 0, 10.05), box("tiny", 10.05, 10.2), box("c", 10.2, 16)], measured, null, AT);
    for (const m of p.moved) expect(m.to.end).toBeGreaterThan(m.to.start);
    const t = p.moved.find((m) => m.key === "tiny");
    if (t) expect(t.to.end - t.to.start).toBeGreaterThanOrEqual(0.149);
  });

  it("is idempotent", () => {
    const after = new Map(plan.moved.map((m) => [m.key, m.to]));
    const conformed = handCut.map((b) => {
      const w = after.get(b.key);
      return w ? box(b.key, w.start, w.end, b.id) : b;
    });
    expect(planConformToBeats(conformed, measured, DURATION, AT).updates).toEqual([]);
  });

  it("leaves an edge alone where the map has a hole, and never squashes a short shot", () => {
    const holey = measured.filter((t) => t < 30 || t > 40);
    const p = planConformToBeats([box("a", 0, 29.5), box("b", 29.5, 35.27), box("c", 35.27, 41)], holey, null, AT);
    const moved = new Map(p.moved.map((m) => [m.key, m.to]));
    expect(moved.get("b")?.end ?? 35.27).toBe(35.27); // 35.27 sits in the hole
    const tiny = planConformToBeats([box("x", 10, 10.6), box("y", 10.6, 11.1), box("z", 11.1, 16)], measured, null, AT);
    for (const m of tiny.moved) expect(m.to.end - m.to.start).toBeGreaterThanOrEqual(0.5);
  });

  it("does nothing without beats", () => {
    expect(planConformToBeats(board, [], DURATION, AT).updates).toEqual([]);
  });
});
