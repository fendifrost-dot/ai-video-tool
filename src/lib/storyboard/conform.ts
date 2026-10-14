/**
 * Conform a board to its song's measured beat (2026-10-14).
 *
 * Fendi, 14 Oct: "the board should be cut to the real beat of EACH song … for each new song the tool should
 * conform." Boards cut before the song had a measured beat map (analyzer v2) sit on bar lines counted from 0:00 at a
 * rounded tempo, which slide off the music (on "YSL Ice On" up to 0.25 s at a cut). This moves every shot edge on a
 * board to the nearest measured beat:
 *
 *   • a shared edge moves once, so neighbouring shots stay back to back;
 *   • 0:00 and the song's end stay where they are;
 *   • an edge is left alone when the nearest beat is more than 0.6 of a beat away (a hole in the map) or when moving
 *     it would leave a shot shorter than MIN_BOX_SECONDS;
 *   • a move is at most half a beat, so every shot keeps its place in the story and its selected clip;
 *   • where an old grid had drifted past half a beat, one shot gains or loses a beat (the drift has to be absorbed
 *     somewhere; nearest-beat puts it in one place with the smallest moves).
 *   • each moved shot gets a "conform" history entry saying where its edges were.
 *
 * Running it twice changes nothing the second time.
 */
import type { SongAnalysis } from "@/lib/songAnalysis/types";
import { MIN_BOX_SECONDS, withHistory, writeOf, type BoxWrite, type StoryboardBox } from "./boxes";

const EDGE_EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The measured beats of an analysis, or null when it has none (a v1 map counted from 0:00 is not a measurement). */
export function measuredBeats(analysis: Pick<SongAnalysis, "analysis_provider" | "beat_map_json"> | null | undefined): number[] | null {
  if (!analysis || !String(analysis.analysis_provider ?? "").startsWith("web-audio-builtin-v2")) return null;
  const raw = Array.isArray(analysis.beat_map_json) ? analysis.beat_map_json : [];
  if (raw.length < 8 || raw.length > 12_000) return null;
  const beats = raw
    .map((b) => b?.t)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t >= 0)
    .sort((a, b) => a - b);
  if (beats.length < 8) return null;
  const spacing = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  return spacing >= 0.2 && spacing <= 2 ? beats : null;
}

function nearest(sorted: readonly number[], t: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(sorted[lo] - t) <= Math.abs(sorted[hi] - t) ? sorted[lo] : sorted[hi];
}

export type ConformMove = { key: string; from: { start: number; end: number }; to: { start: number; end: number } };

export type ConformPlan = {
  updates: { id: string; write: BoxWrite }[];
  moved: ConformMove[];
  /** Largest edge move, seconds. */
  maxShift: number;
  /** Edges left where they were (a hole in the beat map, or a shot that would get too short). */
  edgesKept: number;
};

/** Plan the moves for one board. `duration` is the song's length (its end is never moved). */
export function planConformToBeats(boxes: readonly StoryboardBox[], beats: readonly number[], duration: number | null, at: string): ConformPlan {
  const empty: ConformPlan = { updates: [], moved: [], maxShift: 0, edgesKept: 0 };
  if (boxes.length === 0 || beats.length < 8) return empty;
  const beatSec = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  const end = duration && duration > 0 ? duration : null;

  const edges = new Set<number>();
  for (const b of boxes) {
    edges.add(round2(b.start));
    edges.add(round2(b.end));
  }
  const fixed = (t: number) => t <= EDGE_EPS || (end !== null && Math.abs(t - end) <= 0.05);
  const target = new Map<number, number>();
  let edgesKept = 0;
  for (const t of [...edges].sort((a, b) => a - b)) {
    if (fixed(t)) {
      target.set(t, t);
      continue;
    }
    const b = nearest(beats, t);
    if (Math.abs(b - t) > 0.6 * beatSec) {
      target.set(t, t);
      edgesKept++;
      continue;
    }
    target.set(t, round2(b));
  }
  // a shot that would get too short keeps both its edges (and so do its neighbours on those edges); repeat until stable
  for (let pass = 0; pass < boxes.length + 1; pass++) {
    let changed = false;
    for (const b of boxes) {
      const s = round2(b.start);
      const e = round2(b.end);
      const ns = target.get(s)!;
      const ne = target.get(e)!;
      if (ne - ns < MIN_BOX_SECONDS && e - s >= MIN_BOX_SECONDS) {
        if (ns !== s) {
          target.set(s, s);
          edgesKept++;
          changed = true;
        }
        if (ne !== e) {
          target.set(e, e);
          edgesKept++;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const plan: ConformPlan = { ...empty, edgesKept };
  for (const b of boxes) {
    const s = round2(b.start);
    const e = round2(b.end);
    const ns = target.get(s)!;
    const ne = target.get(e)!;
    if (Math.abs(ns - s) <= EDGE_EPS && Math.abs(ne - e) <= EDGE_EPS) continue;
    plan.maxShift = Math.max(plan.maxShift, Math.abs(ns - s), Math.abs(ne - e));
    const note = `edges moved onto the measured beat: ${s.toFixed(2)}–${e.toFixed(2)} s → ${ns.toFixed(2)}–${ne.toFixed(2)} s`;
    plan.updates.push({ id: b.id, write: writeOf(b, { start: ns, end: ne, history: withHistory(b.history, { at, event: "conform", note }) }) });
    plan.moved.push({ key: b.key, from: { start: s, end: e }, to: { start: ns, end: ne } });
  }
  plan.maxShift = round2(plan.maxShift);
  return plan;
}
