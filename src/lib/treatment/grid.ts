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
 * BPM. With the v1 map (beats from 0:00) the bar lines are the same as before.
 *
 * Lyric starts (2026-10-14): when timed lyric lines are given, a cut that
 * falls within one beat of a confidently timed line start moves to the beat
 * nearest that start, so a shot change lands with the line instead of just
 * before or after it. Clip length bounds still hold.
 */

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
const LYRIC_MAX_SECONDS = 10;

const MIN_CLIP = 2.5;
const MAX_CLIP = 6;
const MAX_CLIPS = 120;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build a normalized energy lookup (0-1) from the analysis curve. */
function makeEnergyLookup(analysis: SongAnalysis | null | undefined) {
  const curve = analysis?.energy_curve_json ?? [];
  if (curve.length === 0) return () => 0.5;
  return (t: number): number => {
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
};

/** Beat times and the indices of the downbeats among them. */
type BeatLattice = { beats: number[]; downbeats: number[]; beatSec: number };

/**
 * The beats the grid cuts on: the measured beat map when there is one (bar lines where `beat === 1`), otherwise
 * beats projected from 0:00 at the BPM (the v1 behaviour).
 */
function beatLattice(analysis: SongAnalysis | null | undefined, bpm: number, duration: number): BeatLattice {
  const beatSec = 60 / bpm;
  const map = (analysis?.beat_map_json ?? []).filter((b) => Number.isFinite(b?.t) && b.t >= 0 && b.t <= duration + beatSec);
  if (map.length >= 8) {
    const sorted = [...map].sort((a, b) => a.t - b.t);
    const beats = sorted.map((b) => b.t);
    const downbeats = sorted.map((b, i) => (b.beat === 1 ? i : -1)).filter((i) => i >= 0);
    if (downbeats.length >= 2) {
      // measured spacing (the map may be at a refined tempo the rounded `bpm` column does not carry)
      const span = beats[beats.length - 1] - beats[0];
      return { beats, downbeats, beatSec: span > 0 ? span / (beats.length - 1) : beatSec };
    }
  }
  const beats: number[] = [];
  for (let t = 0; t < duration + beatSec; t += beatSec) beats.push(t);
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

export function buildClipGrid({ analysis, durationSeconds, lyrics }: BuildGridOptions): GridClip[] {
  const duration = analysis?.duration_seconds ?? durationSeconds ?? 0;
  if (!duration || duration <= 0) return [];

  const bpm = analysis?.bpm ?? null;
  const energyAt = makeEnergyLookup(analysis);
  const { lo, hi } = energyThresholds(analysis);
  const drops = analysis?.drops_json ?? [];
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
        if (Math.abs(d - end) <= barSec / 2 && d - t >= MIN_CLIP - lattice.beatSec) end = d;
      }
      // a trusted lyric line starting within one beat of the cut takes the cut, on its nearest beat
      if (lineStarts.length > 0) {
        const s0 = lineStarts[nearestIndex(lineStarts, end)];
        if (Math.abs(s0 - end) <= lattice.beatSec) {
          const onBeat = lattice.beats[nearestIndex(lattice.beats, s0)];
          const len = onBeat - t;
          if (Math.abs(onBeat - end) > 1e-6 && len >= MIN_CLIP - lattice.beatSec && len <= MAX_CLIP + lattice.beatSec && onBeat < duration) {
            end = onBeat;
            cutOnLyric = true;
          }
        }
      }
    } else {
      end = t + target;
    }
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
