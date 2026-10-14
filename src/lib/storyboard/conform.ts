/**
 * Conform a board to its song's measured beat (2026-10-14).
 *
 * Fendi, 14 Oct: "the board should be cut to the real beat of EACH song … for each new song the tool should
 * conform." DECISION (his): every board of every song is conformed, automatically when the song is analysed, and on
 * demand from the song card.
 *
 * Boards cut before the song had a measured beat map sit on bar lines counted from 0:00 at a rounded tempo, which
 * slide off the music ("YSL Ice On": 122.4 BPM counted from 0:00 against a measured 121.998 BPM, first beat 0.029 s;
 * 0.62 s late by 3:00). How each edge moves:
 *
 *   • REBASE (the board was cut on a regular grid): the grid is inferred from the board's own edges. An edge that
 *     sits on that grid's beat n moves to measured beat n counted from the first measured downbeat, so every shot
 *     keeps its exact length in beats and bars and every bar-line cut lands on a measured downbeat — the same cuts a
 *     new board of the song gets. Moves grow with the old drift (YSL: up to 0.62 s at 3:00); a move over 1.5 beats
 *     falls back to the nearest beat.
 *   • NEAREST (no regular grid, e.g. hand-cut edges): the nearest measured beat, at most 0.6 of a beat away.
 *
 * Always: a shared edge moves once (neighbours stay back to back); 0:00 and the song end stay; a shot is never made
 * shorter than MIN_BOX_SECONDS (or than it already is); a shot with a beat-triggered event keeps its start ("beat N"
 * counts from the start, so moving it would move the event by a beat); "locked" is a content lock, not a timing lock,
 * so locked shots conform too. Each moved shot gets one "conform" history entry holding its window from before the
 * first conform (`from`, restorable); a later conform replaces that entry. Running it twice changes nothing.
 */
import type { SongAnalysis } from "@/lib/songAnalysis/types";
import { MIN_BOX_SECONDS, withHistory, type BoxHistoryEntry, type StoryboardBox } from "./boxes";

const EDGE_EPS = 0.005;
const ON_GRID = 0.015;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A song's measured beats (sorted) and the index of its first downbeat (bar 1, beat 1). */
export type MeasuredBeats = { beats: number[]; firstDownbeat: number };

/** The measured beats of an analysis, or null when it has none (a v1 map counted from 0:00 is not a measurement). */
export function measuredBeatMap(analysis: Pick<SongAnalysis, "analysis_provider" | "beat_map_json"> | null | undefined): MeasuredBeats | null {
  if (!analysis || !String(analysis.analysis_provider ?? "").startsWith("web-audio-builtin-v2")) return null;
  const raw = Array.isArray(analysis.beat_map_json) ? analysis.beat_map_json : [];
  if (raw.length < 8 || raw.length > 12_000) return null;
  const marks = raw
    .filter((b) => b && typeof b.t === "number" && Number.isFinite(b.t) && b.t >= 0)
    .sort((a, b) => a.t - b.t);
  if (marks.length < 8) return null;
  const beats = marks.map((b) => b.t);
  const spacing = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  if (!(spacing >= 0.2 && spacing <= 2)) return null;
  const fd = marks.findIndex((b) => b.beat === 1 && (b.bar ?? 1) >= 1);
  return { beats, firstDownbeat: fd >= 0 ? fd : 0 };
}

/** Back-compat helper: the measured beat times, or null. */
export function measuredBeats(analysis: Pick<SongAnalysis, "analysis_provider" | "beat_map_json"> | null | undefined): number[] | null {
  return measuredBeatMap(analysis)?.beats ?? null;
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

/**
 * The regular beat grid (counted from 0:00) a board was cut on, inferred from its inner edges: the tempo within ±3%
 * of the measured one whose beats hold the most edges (within 15 ms; edges are stored to 0.01 s), when that is at least
 * 80% of them (and at least 4). Null for a hand-cut board, or one already on the measured beat.
 */
export function inferBoardGrid(innerEdges: readonly number[], measuredBeatSec: number): { beatSec: number } | null {
  if (innerEdges.length < 4) return null;
  const bpm0 = 60 / measuredBeatSec;
  let best: { beatSec: number; count: number; err: number } | null = null;
  for (let bpm = bpm0 * 0.97; bpm <= bpm0 * 1.03; bpm += 0.01) {
    const b = 60 / bpm;
    let count = 0;
    let err = 0;
    for (const t of innerEdges) {
      const d = Math.abs(t - Math.round(t / b) * b);
      if (d <= ON_GRID) {
        count++;
        err += d;
      }
    }
    if (!best || count > best.count || (count === best.count && err < best.err)) best = { beatSec: b, count, err };
  }
  if (!best || best.count < Math.max(4, Math.ceil(innerEdges.length * 0.8))) return null;
  return { beatSec: best.beatSec };
}

export type ConformMove = { key: string; from: { start: number; end: number }; to: { start: number; end: number } };

/** A narrow write: the window and the history, nothing else about the shot (the row's other columns are not read
 *  back and rewritten, so an edit made elsewhere in the meantime is not overwritten). */
export type ConformUpdate = { id: string; start: number; end: number; history: BoxHistoryEntry[] };

export type ConformPlan = {
  updates: ConformUpdate[];
  moved: ConformMove[];
  /** Largest edge move, seconds. */
  maxShift: number;
  /** Inner edges left where they were (hole in the map, a shot that would get too short, a beat-triggered start). */
  edgesKept: number;
  /** How the edges were moved: "rebase" (the board's own grid, beat for beat) or "nearest". */
  method: "rebase" | "nearest";
};

const hasBeatTrigger = (b: StoryboardBox) => (b.spec?.events ?? []).some((e) => e?.trigger?.kind === "beat");

/** Plan the moves for one board. `duration` is the song's length (its end is never moved). */
export function planConformToBeats(boxes: readonly StoryboardBox[], measured: MeasuredBeats | readonly number[], duration: number | null, at: string): ConformPlan {
  const m: MeasuredBeats = Array.isArray(measured) ? { beats: [...(measured as number[])], firstDownbeat: 0 } : (measured as MeasuredBeats);
  const beats = m.beats;
  const empty: ConformPlan = { updates: [], moved: [], maxShift: 0, edgesKept: 0, method: "nearest" };
  if (boxes.length === 0 || beats.length < 8) return empty;
  const beatSec = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  const end = duration && duration > 0 ? duration : null;

  const edges = new Set<number>();
  for (const b of boxes) {
    edges.add(round2(b.start));
    edges.add(round2(b.end));
  }
  const fixed = (t: number) => t <= EDGE_EPS || (end !== null && Math.abs(t - end) <= 0.05);
  const inner = [...edges].filter((t) => !fixed(t)).sort((a, b) => a - b);
  const grid = inferBoardGrid(inner, beatSec);
  // already on the measured beat? then there is nothing to rebase
  const onMeasured = inner.filter((t) => Math.abs(nearest(beats, t) - t) <= ON_GRID).length;
  const rebase = grid && onMeasured < inner.length ? grid : null;

  const pinned = new Set<number>();
  for (const b of boxes) if (hasBeatTrigger(b)) pinned.add(round2(b.start));

  const target = new Map<number, number>();
  let edgesKept = 0;
  for (const t of [...edges].sort((a, b) => a - b)) {
    if (fixed(t)) {
      target.set(t, t);
      continue;
    }
    if (pinned.has(t)) {
      target.set(t, t);
      edgesKept++;
      continue;
    }
    let to: number | null = null;
    if (rebase) {
      const n = Math.round(t / rebase.beatSec);
      const idx = m.firstDownbeat + n;
      if (Math.abs(t - n * rebase.beatSec) <= ON_GRID && idx >= 0 && idx < beats.length && Math.abs(beats[idx] - t) <= 1.5 * beatSec) to = beats[idx];
    }
    if (to === null) {
      const b = nearest(beats, t);
      if (Math.abs(b - t) <= 0.6 * beatSec) to = b;
    }
    if (to === null) {
      target.set(t, t);
      edgesKept++;
      continue;
    }
    target.set(t, round2(to));
  }
  // never squash a shot under the minimum (or shorten one already under it), never invert one: keep its edges
  for (let pass = 0; pass < boxes.length + 1; pass++) {
    let changed = false;
    for (const b of boxes) {
      const s = round2(b.start);
      const e = round2(b.end);
      const ns = target.get(s)!;
      const ne = target.get(e)!;
      if (ne - ns < Math.min(MIN_BOX_SECONDS, e - s) || ne <= ns) {
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

  const plan: ConformPlan = { ...empty, edgesKept, method: rebase ? "rebase" : "nearest" };
  for (const b of boxes) {
    const s = round2(b.start);
    const e = round2(b.end);
    const ns = target.get(s)!;
    const ne = target.get(e)!;
    if (Math.abs(ns - s) <= EDGE_EPS && Math.abs(ne - e) <= EDGE_EPS) continue;
    plan.maxShift = Math.max(plan.maxShift, Math.abs(ns - s), Math.abs(ne - e));
    // one conform entry per shot: a later conform replaces it and keeps the window from before the first one
    const last = b.history[b.history.length - 1];
    const prior = last?.event === "conform" ? last : null;
    const from = prior?.from ?? { start: s, end: e };
    const note = `edges moved onto the measured beat (${plan.method}): ${from.start.toFixed(2)}–${from.end.toFixed(2)} s → ${ns.toFixed(2)}–${ne.toFixed(2)} s`;
    const base = prior ? b.history.slice(0, -1) : b.history;
    plan.updates.push({ id: b.id, start: ns, end: ne, history: withHistory(base, { at, event: "conform", note, from }) });
    plan.moved.push({ key: b.key, from: { start: s, end: e }, to: { start: ns, end: ne } });
  }
  plan.maxShift = round2(plan.maxShift);
  return plan;
}
