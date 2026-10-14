import { describe, expect, it } from "vitest";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { projectBeats } from "@/lib/songAnalysis/analyzer";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "./boxes";
import { measuredBeats, planConformToBeats } from "./conform";

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
  const plan = planConformToBeats(board, measured, DURATION, AT);

  it("puts every inner edge on a measured beat, moving it at most half a beat", () => {
    const after = new Map(plan.moved.map((m) => [m.key, m.to]));
    const beat = 60 / 121.998;
    for (const b of board) {
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
    expect(plan.moved.length).toBeGreaterThan(board.length / 2);
  });

  it("keeps shots back to back and in order", () => {
    const after = new Map(plan.moved.map((m) => [m.key, m.to]));
    const windows = board.map((b) => after.get(b.key) ?? { start: b.start, end: b.end });
    for (let i = 1; i < windows.length; i++) expect(windows[i].start).toBe(windows[i - 1].end);
    for (const w of windows) expect(w.end).toBeGreaterThan(w.start);
  });

  it("writes only the new window and one restorable conform entry", () => {
    const u = plan.updates[1];
    const b = board.find((x) => x.id === u.id)!;
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

  it("leaves a locked shot's edges, and its neighbours' shared edges, where they are", () => {
    const p = planConformToBeats([box("a", 0, 3.92), box("b", 3.92, 7.84, "r-b", { locked: true }), box("c", 7.84, 11.76)], measured, null, AT);
    const moved = new Map(p.moved.map((m) => [m.key, m.to]));
    expect(moved.has("b")).toBe(false);
    expect(moved.get("a")?.end ?? 3.92).toBe(3.92);
    expect(moved.get("c")?.start ?? 7.84).toBe(7.84);
  });

  it("never collapses a shot that is already under the minimum", () => {
    const p = planConformToBeats([box("a", 0, 10.05), box("tiny", 10.05, 10.2), box("c", 10.2, 16)], measured, null, AT);
    for (const m of p.moved) expect(m.to.end).toBeGreaterThan(m.to.start);
    const t = p.moved.find((m) => m.key === "tiny");
    if (t) expect(t.to.end - t.to.start).toBeGreaterThanOrEqual(0.149);
  });

  it("is idempotent", () => {
    const after = new Map(plan.moved.map((m) => [m.key, m.to]));
    const conformed = board.map((b) => {
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
