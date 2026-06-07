/**
 * Deterministic beat-aligned clip grid.
 *
 * The Treatment Builder never lets the LLM do timing math: this module
 * computes the cut points (3-5s clips snapped to bar boundaries, shorter
 * cuts in high-energy passages, "drop" accents) and the model only fills
 * creative fields per clip key.
 */

import type { SongAnalysis } from "@/lib/songAnalysis/types";

export type ClipEnergy = "low" | "mid" | "high" | "drop";

export type GridClip = {
  key: string;
  start: number;
  end: number;
  section: string;
  energy: ClipEnergy;
};

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
};

export function buildClipGrid({ analysis, durationSeconds }: BuildGridOptions): GridClip[] {
  const duration = analysis?.duration_seconds ?? durationSeconds ?? 0;
  if (!duration || duration <= 0) return [];

  const bpm = analysis?.bpm ?? null;
  const barSec = bpm && bpm > 0 ? (4 * 60) / bpm : null; // assume 4/4
  const energyAt = makeEnergyLookup(analysis);
  const { lo, hi } = energyThresholds(analysis);
  const drops = analysis?.drops_json ?? [];

  const clips: GridClip[] = [];
  let t = 0;
  let i = 0;
  while (t < duration - 1 && clips.length < MAX_CLIPS) {
    const e = energyAt(t + 1);
    let label: ClipEnergy = e >= hi ? "high" : e >= lo ? "mid" : "low";
    const target = label === "high" ? 3 : label === "mid" ? 4 : 5;

    let end: number;
    if (barSec && barSec > 0.8) {
      const bars = Math.max(1, Math.round(target / barSec));
      end = t + bars * barSec;
      // keep within sane clip bounds by adding/removing a bar where possible
      if (end - t > MAX_CLIP && bars > 1) end = t + (bars - 1) * barSec;
      if (end - t < MIN_CLIP) end = t + Math.max(1, bars + 1) * barSec;
    } else {
      end = t + target;
    }
    end = Math.min(end, duration);
    if (duration - end < MIN_CLIP) end = duration; // absorb tiny tail

    if (drops.some((d) => d.t >= t && d.t < end)) label = "drop";

    clips.push({
      key: `c${String(i + 1).padStart(3, "0")}`,
      start: round2(t),
      end: round2(end),
      section: sectionAt(analysis, (t + end) / 2, duration, label),
      energy: label,
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
