/**
 * Deterministic beat-aligned clip grid.
 *
 * The Treatment Builder never lets the LLM do timing math: this module
 * computes the cut points (3-5s clips snapped to bar boundaries, shorter
 * cuts in high-energy passages, "drop" accents) and the model only fills
 * creative fields per clip key.
 *
 * Bar lines (2026-10-14): when the analysis carries a measured beat map
 * (`beat_map_json`, analyzer v2: refined tempo + beat phase + downbeat), cuts
 * fall on its downbeats rather than on bars counted from 0:00 at the rounded
 * BPM. With the v1 map (beats from 0:00), or none, the bar lines are the v1 ones;
 * the energy lookup reads at the millisecond, so a time sitting exactly between
 * two energy samples can take the other sample than the v1 loop did (and change
 * that clip's length class).
 *
 * Lyric starts (2026-10-14): when timed lyric lines are given, a cut that
 * falls within one beat of a confidently timed line start moves to the beat
 * nearest that start, so a shot change lands with the line instead of just
 * before or after it. A moved cut can make a clip up to one beat shorter than
 * the 2.5 s minimum or longer than the 6 s maximum.
 *
 * Pace (2026-10-15): "fast" (the default) cuts music-video style: about 1.5 s
 * shots in high-energy passages and drops, about 2 s in mid and 3 s in low,
 * every cut on a measured beat and pulled onto a downbeat when one is within a
 * beat. Fendi, 14 Oct: "we want 1.5 or 3 second clips … more fast paced as
 * opposed to … a movie shot". "cinematic" is the bar-length cut above (3–5 s).
 */

import { MAX_LINE_SECONDS } from "@/lib/lyrics/lyricsForShot";
import type { SongAnalysis } from "@/lib/songAnalysis/types";

export type ClipEnergy = "low" | "mid" | "high" | "drop";

export type GridClip = {
  key: string;
  start: number;
  end: number;
  section: string;
  energy: ClipEnergy;
  /** Set when this clip's end was moved onto the beat nearest a lyric line start. */
  cutOnLyric?: boolean;
};

/** The few fields of a timed lyric line the grid reads (`lyric_lines` / `LyricLine`). */
export type GridLyricLine = { start: number; end: number; confidence: number };

/** A line start moves a cut only when its timing is trusted and the line is a sung line, not an aligner bridge. */
const LYRIC_MIN_CONFIDENCE = 0.5;
const LYRIC_MIN_SECONDS = 0.15;
const LYRIC_MAX_SECONDS = MAX_LINE_SECONDS;

const MIN_CLIP = 2.5;
const MAX_CLIP = 6;
const MAX_CLIPS = 160; // the treatment writer's ceiling (treatment-writer-proxy MAX_SHOTS)

export type GridPace = "fast" | "cinematic";
/** DECISION (Fendi, 14 Oct): most of his videos are fast-cut; cinematic is the exception, asked for by name. */
export const DEFAULT_PACE: GridPace = "fast";
/** Fast pace: target shot length by energy, and the bounds a shot stays within (seconds). */
const FAST_TARGET: Record<ClipEnergy, number> = { drop: 1.5, high: 1.5, mid: 2, low: 3 };
const FAST_MIN = 1;
const FAST_MAX = 3.5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build a normalized energy lookup (0-1) from the analysis curve. */
function makeEnergyLookup(analysis: SongAnalysis | null | undefined) {
  const curve = analysis?.energy_curve_json ?? [];
  if (curve.length === 0) return () => 0.5;
  return (t0: number): number => {
    // read at the millisecond, so a cut stored to the ms (a beat map) and the same cut computed exactly find the
    // same sample — a time exactly between two samples otherwise breaks its tie differently and flips the label
    const t = Math.round(t0 * 1000) / 1000;
    // Samples are ~0.25s apart and sorted; binary search not needed at this scale.
    let best = curve[0];
    let bestDist = Math.abs(curve[0].t - t);
    for (const s of curve) {
      const d = Math.abs(s.t - t);
      if (d < bestDist) {
        best = s;
        bestDist = d;
      }
    }
    return best.energy;
  };
}

/** Tertile thresholds across the whole curve so labels adapt per song. */
function energyThresholds(analysis: SongAnalysis | null | undefined): { lo: number; hi: number } {
  const values = (analysis?.energy_curve_json ?? []).map((s) => s.energy).sort((a, b) => a - b);
  if (values.length < 6) return { lo: 0.34, hi: 0.67 };
  return {
    lo: values[Math.floor(values.length / 3)],
    hi: values[Math.floor((values.length * 2) / 3)],
  };
}

function sectionAt(analysis: SongAnalysis | null | undefined, t: number, duration: number, label: ClipEnergy): string {
  const sections = analysis?.sections_json ?? [];
  const hit = sections.find((s) => t >= s.start && t < s.end);
  if (hit?.name) return hit.name;
  // Derived fallback when no section data exists (Phase A analyzer).
  if (duration > 0) {
    if (t < duration * 0.08) return "intro";
    if (t > duration * 0.92) return "outro";
  }
  if (label === "high" || label === "drop") return "hook";
  return "verse";
}

export type BuildGridOptions = {
  analysis?: SongAnalysis | null;
  /** Required when there is no analysis (commercial/social mode). */
  durationSeconds?: number | null;
  /** Timed lyric lines; a cut within one beat of a trusted line start moves onto that line's beat. */
  lyrics?: readonly GridLyricLine[] | null;
  /** How fast the cut is (default `DEFAULT_PACE`). */
  pace?: GridPace;
  /** Fast pace: the director's shot lengths by energy, in seconds (each 0.5–8; unset ones keep the defaults). */
  fastTargets?: Partial<Record<ClipEnergy, number>> | null;
};

/** The fast-pace shot lengths actually used: the defaults, with the director's valid values over them. */
export function fastTargetsOf(over?: Partial<Record<ClipEnergy, number>> | null): Record<ClipEnergy, number> {
  const out = { ...FAST_TARGET };
  for (const k of Object.keys(out) as ClipEnergy[]) {
    const v = over?.[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0.5 && v <= 8) out[k] = v;
  }
  return out;
}

/** A beat between 0.2 s and 2 s (30–300 BPM); anything else in the data is not a tempo the grid can cut on. */
const MIN_BEAT_SEC = 0.2;
const MAX_BEAT_SEC = 2;
/** No song needs more beats than this (300 BPM for 40 minutes); a map beyond it is not read. */
const MAX_BEATS = 12_000;

/** Beat times and the indices of the downbeats among them. */
type BeatLattice = { beats: number[]; downbeats: number[]; beatSec: number };

/**
 * The beats the grid cuts on: the measured beat map when there is one (bar lines where `beat === 1`), otherwise
 * beats projected from 0:00 at the BPM (the v1 behaviour).
 */
function beatLattice(analysis: SongAnalysis | null | undefined, bpm: number, duration: number): BeatLattice | null {
  const beatSec = 60 / bpm;
  if (!(beatSec >= MIN_BEAT_SEC && beatSec <= MAX_BEAT_SEC) || !Number.isFinite(duration)) return null;
  const raw = Array.isArray(analysis?.beat_map_json) ? analysis!.beat_map_json : [];
  if (raw.length >= 8 && raw.length <= MAX_BEATS) {
    const sorted = raw
      .filter((b) => b && Number.isFinite(b.t) && b.t >= 0 && b.t <= duration + beatSec)
      .sort((a, b) => a.t - b.t);
    const beats = sorted.map((b) => b.t);
    const downbeats = sorted.map((b, i) => (b.beat === 1 ? i : -1)).filter((i) => i >= 0);
    // measured spacing (the map may be at a refined tempo the rounded `bpm` column does not carry)
    const measured = beats.length >= 8 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0;
    if (downbeats.length >= 2 && measured >= MIN_BEAT_SEC && measured <= MAX_BEAT_SEC) {
      return { beats, downbeats, beatSec: measured };
    }
  }
  const count = Math.min(MAX_BEATS, Math.ceil((duration + beatSec) / beatSec));
  const beats: number[] = [];
  for (let k = 0; k < count; k++) beats.push(k * beatSec);
  const downbeats = beats.map((_, i) => i).filter((i) => i % 4 === 0);
  return { beats, downbeats, beatSec };
}

function nearestIndex(sorted: readonly number[], t: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(sorted[lo] - t) <= Math.abs(sorted[hi] - t) ? lo : hi;
}

function trustedLineStarts(lyrics: readonly GridLyricLine[] | null | undefined): number[] {
  if (!lyrics?.length) return [];
  const starts = lyrics
    .filter((l) => Number.isFinite(l.start) && Number.isFinite(l.end) && (l.confidence ?? 0) >= LYRIC_MIN_CONFIDENCE)
    .filter((l) => l.end - l.start >= LYRIC_MIN_SECONDS && l.end - l.start <= LYRIC_MAX_SECONDS)
    .map((l) => l.start)
    .sort((a, b) => a - b);
  return starts.filter((t, i) => i === 0 || t - starts[i - 1] > 0.05);
}

export function buildClipGrid(opts: BuildGridOptions): GridClip[] {
  if ((opts.pace ?? DEFAULT_PACE) === "cinematic") return buildCinematicGrid(opts);
  const fast = buildFastGrid(opts);
  // a song too long to cut fast inside the writer's shot ceiling (over ~5 min) is cut at the cinematic pace, which
  // covers up to ~10 min (past that, as before this pace existed, the cut stops at the ceiling)
  const duration = opts.analysis?.duration_seconds ?? opts.durationSeconds ?? 0;
  if (fast.length > 0 && fast[fast.length - 1].end < round2(duration)) return buildCinematicGrid(opts);
  return fast;
}

/**
 * Fast cut: each shot's length comes from the energy where it starts (1.5 / 2 / 3 s), its end lands on the beat
 * nearest that length, then on a downbeat when one is within a beat (and the shot stays 1–3.5 s), then on a trusted
 * lyric line start within one beat. Shots of a drop are high-energy. Without a usable beat it cuts in seconds.
 */
function buildFastGrid({ analysis, durationSeconds, lyrics, fastTargets }: BuildGridOptions): GridClip[] {
  const duration = analysis?.duration_seconds ?? durationSeconds ?? 0;
  if (!duration || duration <= 0) return [];
  const bpm = analysis?.bpm ?? null;
  const energyAt = makeEnergyLookup(analysis);
  const { lo, hi } = energyThresholds(analysis);
  const drops = Array.isArray(analysis?.drops_json) ? analysis!.drops_json : [];
  const lattice = bpm && bpm > 0 ? beatLattice(analysis, bpm, duration) : null;
  const downbeatTimes = lattice ? lattice.downbeats.map((i) => lattice.beats[i]) : [];
  const lineStarts = lattice ? trustedLineStarts(lyrics) : [];
  const targets = fastTargetsOf(fastTargets);
  // the bounds a shot stays within follow the director's lengths (the defaults give 1–3.5 s)
  const fastMin = Math.min(FAST_MIN, Math.min(...Object.values(targets)) * 0.67);
  const fastMax = Math.max(FAST_MAX, Math.max(...Object.values(targets)) * 1.2);
  const fits = (len: number) => len >= fastMin && len <= fastMax;

  const clips: GridClip[] = [];
  let t = 0;
  let i = 0;
  while (t < duration - 0.5 && clips.length < MAX_CLIPS) {
    const e = energyAt(t + 0.5);
    const dropHere = drops.some((d) => d.t >= t && d.t < t + targets.drop);
    let label: ClipEnergy = dropHere ? "drop" : e >= hi ? "high" : e >= lo ? "mid" : "low";
    const target = targets[label];
    let end = t + target;
    let cutOnLyric = false;
    if (lattice) {
      const b = lattice.beatSec;
      // the beat nearest the target length, at least one beat and FAST_MIN long
      let k = nearestIndex(lattice.beats, t + target);
      while (k < lattice.beats.length - 1 && lattice.beats[k] - t < Math.max(fastMin, b) - 1e-6) k++;
      end = lattice.beats[k] - t >= fastMin - 1e-6 ? lattice.beats[k] : t + target; // past the end of the map: seconds
      // a downbeat within a beat takes the cut (the shot changes on the "1")
      if (downbeatTimes.length > 0) {
        const d = downbeatTimes[nearestIndex(downbeatTimes, end)];
        if (Math.abs(d - end) <= b + 1e-6 && fits(d - t)) end = d;
      }
      // a trusted lyric line starting within one beat takes the cut, on its nearest beat
      if (lineStarts.length > 0) {
        const s0 = lineStarts[nearestIndex(lineStarts, end)];
        if (Math.abs(s0 - end) <= b) {
          const onBeat = lattice.beats[nearestIndex(lattice.beats, s0)];
          if (Math.abs(onBeat - end) > 1e-6 && fits(onBeat - t) && onBeat < duration) {
            end = onBeat;
            cutOnLyric = true;
          }
        }
      }
    }
    if (!(end > t)) end = t + target;
    end = Math.min(end, duration);
    if (duration - end < fastMin) end = duration; // absorb a tail too short to be a shot
    if (end === duration) cutOnLyric = false;
    if (drops.some((d) => d.t >= t && d.t < end)) label = "drop";
    clips.push({
      key: `c${String(i + 1).padStart(3, "0")}`,
      start: round2(t),
      end: round2(end),
      section: sectionAt(analysis, (t + end) / 2, duration, label),
      energy: label,
      ...(cutOnLyric ? { cutOnLyric: true } : {}),
    });
    t = end;
    i++;
  }
  return clips;
}

function buildCinematicGrid({ analysis, durationSeconds, lyrics }: BuildGridOptions): GridClip[] {
  const duration = analysis?.duration_seconds ?? durationSeconds ?? 0;
  if (!duration || duration <= 0) return [];

  const bpm = analysis?.bpm ?? null;
  const energyAt = makeEnergyLookup(analysis);
  const { lo, hi } = energyThresholds(analysis);
  const drops = Array.isArray(analysis?.drops_json) ? analysis!.drops_json : [];
  // a tempo outside 30–300 BPM gets no lattice and falls back to fixed-seconds clips (v1 did the same above 300)
  const lattice = bpm && bpm > 0 ? beatLattice(analysis, bpm, duration) : null;
  const barSec = lattice ? lattice.beatSec * 4 : null; // assume 4/4
  const downbeatTimes = lattice ? lattice.downbeats.map((i) => lattice.beats[i]) : [];
  const lineStarts = lattice ? trustedLineStarts(lyrics) : [];

  const clips: GridClip[] = [];
  let t = 0;
  let i = 0;
  while (t < duration - 1 && clips.length < MAX_CLIPS) {
    const e = energyAt(t + 1);
    let label: ClipEnergy = e >= hi ? "high" : e >= lo ? "mid" : "low";
    const target = label === "high" ? 3 : label === "mid" ? 4 : 5;

    let end: number;
    let cutOnLyric = false;
    if (lattice && barSec && barSec > 0.8) {
      const bars = Math.max(1, Math.round(target / barSec));
      end = t + bars * barSec;
      // keep within sane clip bounds by adding/removing a bar where possible
      if (end - t > MAX_CLIP && bars > 1) end = t + (bars - 1) * barSec;
      if (end - t < MIN_CLIP) end = t + Math.max(1, bars + 1) * barSec;
      // land on the nearest measured downbeat (the same time when the map is the v1 one counted from 0:00)
      if (downbeatTimes.length > 0) {
        const d = downbeatTimes[nearestIndex(downbeatTimes, end)];
        if (Math.abs(d - end) <= barSec / 2 && d - t >= Math.max(0.5, MIN_CLIP - lattice.beatSec)) end = d;
      }
      // a trusted lyric line starting within one beat of the cut takes the cut, on its nearest beat
      if (lineStarts.length > 0) {
        const s0 = lineStarts[nearestIndex(lineStarts, end)];
        if (Math.abs(s0 - end) <= lattice.beatSec) {
          const onBeat = lattice.beats[nearestIndex(lattice.beats, s0)];
          const len = onBeat - t;
          if (Math.abs(onBeat - end) > 1e-6 && len >= Math.max(0.5, MIN_CLIP - lattice.beatSec) && len <= MAX_CLIP + lattice.beatSec && onBeat < duration) {
            end = onBeat;
            cutOnLyric = true;
          }
        }
      }
    } else {
      end = t + target;
    }
    if (!(end > t)) end = t + target; // never a backwards or empty clip, whatever the data
    end = Math.min(end, duration);
    if (duration - end < MIN_CLIP) end = duration; // absorb tiny tail
    if (end === duration) cutOnLyric = false;

    if (drops.some((d) => d.t >= t && d.t < end)) label = "drop";

    clips.push({
      key: `c${String(i + 1).padStart(3, "0")}`,
      start: round2(t),
      end: round2(end),
      section: sectionAt(analysis, (t + end) / 2, duration, label),
      energy: label,
      ...(cutOnLyric ? { cutOnLyric: true } : {}),
    });
    t = end;
    i++;
  }
  return clips;
}

export function gridSummary(clips: GridClip[]): string {
  if (clips.length === 0) return "no clips";
  const total = clips[clips.length - 1].end;
  const avg = total / clips.length;
  return `${clips.length} clips · ${Math.round(total)}s · avg ${avg.toFixed(1)}s/clip`;
}
