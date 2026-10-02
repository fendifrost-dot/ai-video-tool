/**
 * Coverage defaults for the storyboard (Fendi, 2026-10-02): a performance card gets a camera move and a framing by
 * default; "static" is an explicit choice, never the absence of one. The scripts lane (scripts/edit/coverage.py) cuts
 * every performance slot into moving sub-shots from config/coverage_presets.json; this module gives the cards the same
 * defaults at treatment time so what the storyboard shows is what the cut will do. The presets below mirror the JSON
 * (the test asserts they agree); the JSON is the source of truth.
 */
import type { ShotSpec, CameraMotion, Framing } from "./shotSpec";

export type CoverageMove = { type: string; amount: number; ease: string; handheld: number; lens: string; weight: number };
export type CoverageSection = { angles_per_line: number; cut_every_bars: number; generated_angle_share: number; moves: CoverageMove[]; transition_on_the_1: string; transition_elsewhere: string };
export type CoveragePresets = { rules: { static_share_max: number; max_static_run_s: number; no_repeat_move_consecutive: boolean; framing_rotation: Framing[]; zoom_alternate: boolean }; sections: Record<string, CoverageSection> };

/** Engine move → the card's CameraMotion enum (the exact engine spec travels in the description). */
export const ENGINE_TO_CARD: Record<string, CameraMotion> = {
  push: "dolly", pull: "dolly", truck: "truck", pedestal: "pedestal", crane: "crane", orbit: "orbit", whip_pan: "whip_pan",
  snap_zoom: "zoom", dolly_zoom: "zoom", static: "static",
};

export const DEFAULT_COVERAGE_PRESETS: CoveragePresets = {
  rules: { static_share_max: 0.12, max_static_run_s: 4.0, no_repeat_move_consecutive: true, framing_rotation: ["medium", "close_up", "wide", "medium_close"], zoom_alternate: true },
  sections: {
    verse: { angles_per_line: 2, cut_every_bars: 2, generated_angle_share: 0.25, transition_on_the_1: "cut", transition_elsewhere: "cut", moves: [
      { type: "push", amount: 0.16, ease: "in_out", handheld: 0.25, lens: "anamorphic_35", weight: 4 },
      { type: "pull", amount: 0.14, ease: "in_out", handheld: 0.25, lens: "anamorphic_35", weight: 2 },
      { type: "truck", amount: 0.07, ease: "in_out", handheld: 0.35, lens: "handheld_24", weight: 2 },
      { type: "static", amount: 0.0, ease: "linear", handheld: 0.5, lens: "handheld_24", weight: 2 },
      { type: "pedestal", amount: 0.05, ease: "in_out", handheld: 0.2, lens: "portrait_85", weight: 1 },
    ] },
    hook: { angles_per_line: 3, cut_every_bars: 1, generated_angle_share: 0.34, transition_on_the_1: "whip_left", transition_elsewhere: "cut", moves: [
      { type: "snap_zoom", amount: 0.22, ease: "snap", handheld: 0.4, lens: "anamorphic_35", weight: 3 },
      { type: "push", amount: 0.24, ease: "in", handheld: 0.4, lens: "anamorphic_35", weight: 3 },
      { type: "truck", amount: 0.1, ease: "snap", handheld: 0.5, lens: "handheld_24", weight: 2 },
      { type: "orbit", amount: 0.08, ease: "in_out", handheld: 0.3, lens: "anamorphic_35", weight: 2 },
      { type: "dolly_zoom", amount: 0.15, ease: "in_out", handheld: 0.2, lens: "anamorphic_35", weight: 1 },
      { type: "static", amount: 0.0, ease: "linear", handheld: 0.6, lens: "handheld_24", weight: 1 },
    ] },
    bridge: { angles_per_line: 1, cut_every_bars: 2, generated_angle_share: 0.0, transition_on_the_1: "dip_black", transition_elsewhere: "cut", moves: [
      { type: "pull", amount: 0.2, ease: "out", handheld: 0.15, lens: "portrait_85", weight: 3 },
      { type: "static", amount: 0.0, ease: "linear", handheld: 0.3, lens: "portrait_85", weight: 2 },
      { type: "crane", amount: 0.06, ease: "in_out", handheld: 0.1, lens: "anamorphic_35", weight: 1 },
    ] },
    default: { angles_per_line: 2, cut_every_bars: 2, generated_angle_share: 0.25, transition_on_the_1: "cut", transition_elsewhere: "cut", moves: [
      { type: "push", amount: 0.16, ease: "in_out", handheld: 0.25, lens: "anamorphic_35", weight: 4 },
      { type: "truck", amount: 0.07, ease: "in_out", handheld: 0.35, lens: "handheld_24", weight: 2 },
      { type: "pull", amount: 0.14, ease: "in_out", handheld: 0.25, lens: "anamorphic_35", weight: 2 },
      { type: "static", amount: 0.0, ease: "linear", handheld: 0.5, lens: "handheld_24", weight: 1 },
    ] },
  },
};

/** Deterministic 32-bit hash → [0, 1). Same id, same seed, same draw — the storyboard never reshuffles on refresh. */
function unit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

function draw(moves: CoverageMove[], u: number, exclude?: string): CoverageMove {
  const pool = moves.filter((m) => !(exclude && m.type === exclude && moves.length > 1));
  const total = pool.reduce((s, m) => s + m.weight, 0);
  let acc = 0;
  for (const m of pool) { acc += m.weight / total; if (u < acc) return m; }
  return pool[pool.length - 1];
}

/** Section of a shot from its own field, or the lyric lines under it, else "default". */
export function sectionOf(spec: ShotSpec, lyricLines?: ReadonlyArray<{ section: string; start: number; end: number }>): string {
  const own = (spec as unknown as { section?: string }).section;
  if (own) return own;
  if (lyricLines && lyricLines.length) {
    const tally: Record<string, number> = {};
    for (const l of lyricLines) {
      const ov = Math.min(l.end, spec.timeline.end) - Math.max(l.start, spec.timeline.start);
      if (ov > 0) tally[l.section] = (tally[l.section] ?? 0) + ov;
    }
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    if (best) return best[0];
  }
  return "default";
}

/**
 * Fill the camera defaults on every PERFORMANCE card whose motion is unset: a move (with the engine spec in the
 * description), a rotating framing, and the section's transition on the 1. Cards that already carry a motion or a
 * framing keep them — the director's choice wins; an explicit "static" with a description is a choice too.
 */
export function applyCoverageDefaults(
  specs: ShotSpec[],
  presets: CoveragePresets = DEFAULT_COVERAGE_PRESETS,
  lyricLines?: ReadonlyArray<{ section: string; start: number; end: number }>,
  seed = "coverage",
): ShotSpec[] {
  const ordered = [...specs].sort((a, b) => a.timeline.start - b.timeline.start);
  let prevMove: string | undefined; let prevZoom: string | undefined; let framingIndex = 0;
  const out = new Map<string, ShotSpec>();
  for (const spec of ordered) {
    if (spec.shotType !== "performance") { out.set(spec.id, spec); continue; }
    const section = presets.sections[sectionOf(spec, lyricLines)] ? sectionOf(spec, lyricLines) : "default";
    const P = presets.sections[section];
    const unsetMotion = !spec.cameraMotion?.description && (spec.cameraMotion?.type ?? "static") === "static";
    let next: ShotSpec = spec;
    if (unsetMotion) {
      let move = draw(P.moves, unit(`${seed}:${spec.id}`), presets.rules.no_repeat_move_consecutive ? prevMove : undefined);
      if (presets.rules.zoom_alternate && (move.type === "push" || move.type === "pull") && prevZoom === move.type) move = { ...move, type: move.type === "push" ? "pull" : "push" };
      next = { ...next, cameraMotion: { type: ENGINE_TO_CARD[move.type] ?? "static", description: `${move.type} ${move.amount.toFixed(2)} · ${move.lens} · handheld ${move.handheld}` } };
      prevMove = move.type; if (move.type === "push" || move.type === "pull") prevZoom = move.type;
    } else {
      prevMove = spec.cameraMotion.description.split(" ")[0] || spec.cameraMotion.type;
    }
    if (!next.framing) { next = { ...next, framing: presets.rules.framing_rotation[framingIndex % presets.rules.framing_rotation.length] }; }
    framingIndex++;
    out.set(spec.id, next);
  }
  return specs.map((s) => out.get(s.id) ?? s);
}
