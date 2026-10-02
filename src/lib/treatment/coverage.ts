/**
 * Coverage defaults for the storyboard (Fendi, 2026-10-02): a performance card gets a camera move and a framing by
 * default; "static" is an explicit choice, never the absence of one. The scripts lane (scripts/edit/camera_coverage.py) cuts
 * every performance slot into moving sub-shots from config/coverage_presets.json; this module gives the cards the same
 * defaults at treatment time so what the storyboard shows is what the cut will do. The presets below mirror the JSON
 * (the test asserts they agree); the JSON is the source of truth.
 */
import type { ShotSpec, CameraMotion, Framing } from "./shotSpec";
import { SECTION_TRANSITION_DEFAULTS, transitionInFromPreset } from "./transitions";

export type CoverageMove = { type: string; amount: number; ease: string; handheld: number; lens: string; weight: number };
export type CoverageSection = { angles_per_line: number; cut_every_bars: number; generated_angle_share: number; moves: CoverageMove[]; transition_on_the_1: string; transition_elsewhere: string };
export type CoveragePresets = { rules: { static_share_max: number; max_static_run_s: number; no_repeat_move_consecutive: boolean; no_repeat_angle_consecutive: boolean; min_cut_bars: number; framing_rotation: Framing[]; zoom_alternate: boolean }; sections: Record<string, CoverageSection> };

/** Engine move → the card's CameraMotion enum (the exact engine spec travels in the description). */
export const ENGINE_TO_CARD: Record<string, CameraMotion> = {
  push: "dolly", pull: "dolly", truck: "truck", pedestal: "pedestal", crane: "crane", orbit: "orbit", whip_pan: "whip_pan",
  snap_zoom: "zoom", dolly_zoom: "zoom", static: "static",
};

/**
 * The treatment generators write the camera as prose ("50mm macro, slight push-in", "24mm wide shot, locked frame")
 * and leave `cameraMotion.type` at its default "static" — so the typed field said "static" for every card, moving or
 * not, and nothing downstream could tell a locked frame from a push. These patterns read the prose into the engine's
 * move vocabulary; the first match wins, the order puts explicit statics before incidental words. Data, not a model.
 */
export const MOTION_WORDS: ReadonlyArray<{ move: string; pattern: RegExp }> = [
  { move: "static", pattern: /\b(locked[- ]?(off|frame)?|static|tripod|no (camera )?move(ment)?|still camera|fixed (frame|camera))\b/i },
  { move: "dolly_zoom", pattern: /\b(dolly[- ]?zoom|vertigo|zolly)\b/i },
  { move: "snap_zoom", pattern: /\b(snap[- ]?zoom|crash[- ]?zoom|zoom (in|out)|zoom)\b/i },
  { move: "whip_pan", pattern: /\b(whip[- ]?pan|whip)\b/i },
  { move: "orbit", pattern: /\b(orbit|arc(ing)?|circl(e|ing)|360)\b/i },
  { move: "crane", pattern: /\b(crane|jib|boom|rise[s]? (up|over)|descend(s|ing)?|lift(s|ing)? (up|over))\b/i },
  { move: "pedestal", pattern: /\b(pedestal|tilt(s|ing)? (up|down))\b/i },
  { move: "push", pattern: /\b(push(es|ing)?[- ]?in|push|dolly[- ]?in|track(s|ing)? in|move(s|ing)? (in|closer)|creep(s|ing)? in)\b/i },
  { move: "pull", pattern: /\b(pull(s|ing)?[- ]?(out|back)|dolly[- ]?(out|back)|track(s|ing)? (out|back)|move(s|ing)? (out|back|away)|widen(s|ing)?)\b/i },
  { move: "truck", pattern: /\b(truck(s|ing)?|lateral|slide(s|ing)?|track(s|ing)? (left|right|along|with)|crab)\b/i },
  { move: "pan", pattern: /\b(pan(s|ning)?)\b/i },
  { move: "handheld", pattern: /\b(hand[- ]?held|drift(s|ing)?|breath(es|ing)?|sway)\b/i },
];

/** Engine move named by a card's typed field + prose; "" when the prose names no camera at all. */
export function classifyMotion(cameraMotion: { type?: string; description?: string } | undefined): string {
  const desc = cameraMotion?.description ?? "";
  for (const w of MOTION_WORDS) if (w.pattern.test(desc)) return w.move;
  const type = cameraMotion?.type ?? "static";
  if (type !== "static") return CARD_TO_ENGINE[type] ?? type;
  return desc.trim() ? "" : "static";
}

/** Card enum → engine move (inverse of ENGINE_TO_CARD where it is one-to-one). */
export const CARD_TO_ENGINE: Record<string, string> = {
  dolly: "push", truck: "truck", pedestal: "pedestal", crane: "crane", orbit: "orbit", whip_pan: "whip_pan", zoom: "snap_zoom",
  pan: "pan", tilt: "pedestal", handheld: "handheld", steadicam: "handheld", gimbal: "handheld", jib: "crane", static: "static",
};

export const DEFAULT_COVERAGE_PRESETS: CoveragePresets = {
  rules: { static_share_max: 0.12, max_static_run_s: 4.0, no_repeat_move_consecutive: true, no_repeat_angle_consecutive: true, min_cut_bars: 1, framing_rotation: ["medium", "close_up", "wide", "medium_close"], zoom_alternate: true },
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

function draw(moves: CoverageMove[], u: number, exclude: ReadonlyArray<string | undefined> = []): CoverageMove {
  const banned = new Set(exclude.filter((x): x is string => !!x));
  const filtered = moves.filter((m) => !banned.has(m.type));
  const pool = filtered.length ? filtered : moves;
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
  let prevMove: string | undefined; let prevZoom: string | undefined; let framingIndex = 0; let prevSection: string | undefined;
  // Running static budget per section, so a draw never puts the section over the rules it will be measured by.
  const budget = new Map<string, { total: number; statics: number; run: number }>();
  const out = new Map<string, ShotSpec>();
  for (const spec of ordered) {
    if (spec.shotType !== "performance") { out.set(spec.id, spec); continue; }
    const section = presets.sections[sectionOf(spec, lyricLines)] ? sectionOf(spec, lyricLines) : "default";
    const P = presets.sections[section];
    const named = classifyMotion(spec.cameraMotion);
    const secs = Math.max(0, spec.timeline.end - spec.timeline.start);
    const b = budget.get(section) ?? { total: 0, statics: 0, run: 0 }; budget.set(section, b);
    let next: ShotSpec = spec;
    let landed: string;
    if (named === "" || (named === "static" && !spec.cameraMotion?.description)) {
      // No camera written for this card: draw one from the section's vocabulary, within the static budget.
      const staticWouldBreak = (b.statics + secs) / (b.total + secs) > presets.rules.static_share_max || b.run + secs > presets.rules.max_static_run_s;
      let move = draw(P.moves, unit(`${seed}:${spec.id}`), [presets.rules.no_repeat_move_consecutive ? prevMove : undefined, staticWouldBreak ? "static" : undefined]);
      if (presets.rules.zoom_alternate && (move.type === "push" || move.type === "pull") && prevZoom === move.type) move = { ...move, type: move.type === "push" ? "pull" : "push" };
      const written = spec.cameraMotion?.description?.trim();
      next = { ...next, cameraMotion: { type: ENGINE_TO_CARD[move.type] ?? "static", description: `${move.type} ${move.amount.toFixed(2)} · ${move.lens} · handheld ${move.handheld}${written ? ` · ${written}` : ""}` } };
      prevMove = move.type; if (move.type === "push" || move.type === "pull") prevZoom = move.type; landed = move.type;
    } else {
      // The prose names a camera: make the typed field agree with it (an explicit "locked frame" stays static).
      const cardType = ENGINE_TO_CARD[named] ?? (named as CameraMotion);
      if (spec.cameraMotion.type !== cardType) next = { ...next, cameraMotion: { ...spec.cameraMotion, type: cardType } };
      prevMove = named; if (named === "push" || named === "pull") prevZoom = named; landed = named;
    }
    b.total += secs; if (landed === "static") { b.statics += secs; b.run += secs; } else b.run = 0;
    if (!next.framing) { next = { ...next, framing: presets.rules.framing_rotation[framingIndex % presets.rules.framing_rotation.length] }; }
    framingIndex++;
    // Transition on the 1 of a section (its first card) from the presets; elsewhere the section's default. Only when
    // the card carries no transition of its own.
    const t = next.transitionIn;
    if ((t?.type ?? "cut") === "cut" && !t?.preset && t?.durationSeconds == null) {
      const name = section !== prevSection ? (P.transition_on_the_1 || SECTION_TRANSITION_DEFAULTS[section]?.on_the_1?.[0] || "cut") : (P.transition_elsewhere || "cut");
      if (name !== "cut") next = { ...next, transitionIn: transitionInFromPreset(name) };
    }
    prevSection = section;
    out.set(spec.id, next);
  }
  return specs.map((s) => out.get(s.id) ?? s);
}

export type CoverageFinding = { section: string; rule: string; detail: string; shotIds: string[] };
export type CoverageSectionReport = { section: string; performanceSeconds: number; staticSeconds: number; staticShare: number; longestStaticRunSeconds: number; shots: number; staticShotIds: string[] };
export type CoverageReport = { sections: CoverageSectionReport[]; findings: CoverageFinding[]; flaggedShotIds: Record<string, string>; pass: boolean };

/**
 * Measure the storyboard against the coverage rules the cut will be held to (config/coverage_presets.json rules):
 * static share per section, the longest run of static cards, consecutive repeats of a move or a framing. The same
 * numbers scripts/qa/coverage_qa.py reports on the rendered section, computed on the cards so the director sees the
 * problem where it is written, not after the render. Only PERFORMANCE cards count; worlds and inserts are cutaways.
 */
export function measureCoverage(
  specs: ShotSpec[],
  presets: CoveragePresets = DEFAULT_COVERAGE_PRESETS,
  lyricLines?: ReadonlyArray<{ section: string; start: number; end: number }>,
): CoverageReport {
  const perf = [...specs].filter((s) => s.shotType === "performance").sort((a, b) => a.timeline.start - b.timeline.start);
  const bySection = new Map<string, ShotSpec[]>();
  for (const s of perf) { const k = sectionOf(s, lyricLines); (bySection.get(k) ?? bySection.set(k, []).get(k)!).push(s); }
  const findings: CoverageFinding[] = []; const flagged: Record<string, string> = {}; const sections: CoverageSectionReport[] = [];
  const dur = (s: ShotSpec) => Math.max(0, s.timeline.end - s.timeline.start);
  const isStatic = (s: ShotSpec) => classifyMotion(s.cameraMotion) === "static";
  for (const [section, shots] of bySection) {
    const total = shots.reduce((a, s) => a + dur(s), 0);
    const statics = shots.filter(isStatic);
    const staticSeconds = statics.reduce((a, s) => a + dur(s), 0);
    let run = 0, longest = 0, runIds: string[] = [], longestIds: string[] = [];
    for (const s of shots) {
      if (isStatic(s)) { run += dur(s); runIds.push(s.id); if (run > longest) { longest = run; longestIds = [...runIds]; } }
      else { run = 0; runIds = []; }
    }
    const share = total > 0 ? staticSeconds / total : 0;
    sections.push({ section, performanceSeconds: total, staticSeconds, staticShare: share, longestStaticRunSeconds: longest, shots: shots.length, staticShotIds: statics.map((s) => s.id) });
    if (total > 0 && share > presets.rules.static_share_max) {
      findings.push({ section, rule: "static_share_max", detail: `${Math.round(share * 100)} % of the ${section} performance time is a static camera (limit ${Math.round(presets.rules.static_share_max * 100)} %)`, shotIds: statics.map((s) => s.id) });
      for (const s of statics) flagged[s.id] = `Static — the ${section} is ${Math.round(share * 100)} % static, limit ${Math.round(presets.rules.static_share_max * 100)} %`;
    }
    if (longest > presets.rules.max_static_run_s) {
      findings.push({ section, rule: "max_static_run_s", detail: `${longest.toFixed(1)} s without a camera move in the ${section} (limit ${presets.rules.max_static_run_s} s)`, shotIds: longestIds });
      for (const id of longestIds) flagged[id] = flagged[id] ?? `Static — ${longest.toFixed(1)} s run without a move, limit ${presets.rules.max_static_run_s} s`;
    }
  }
  for (let i = 1; i < perf.length; i++) {
    const a = perf[i - 1], b = perf[i];
    const ma = classifyMotion(a.cameraMotion), mb = classifyMotion(b.cameraMotion);
    if (presets.rules.no_repeat_move_consecutive && ma && mb && ma !== "static" && ma === mb) {
      findings.push({ section: sectionOf(b, lyricLines), rule: "no_repeat_move_consecutive", detail: `${mb} twice in a row (${a.id} → ${b.id})`, shotIds: [a.id, b.id] });
      flagged[b.id] = flagged[b.id] ?? `Repeats the previous card's ${mb}`;
    }
    if (presets.rules.no_repeat_angle_consecutive && a.framing && b.framing && a.framing === b.framing && a.cameraAngle === b.cameraAngle) {
      findings.push({ section: sectionOf(b, lyricLines), rule: "no_repeat_angle_consecutive", detail: `same framing and angle twice in a row (${a.id} → ${b.id})`, shotIds: [a.id, b.id] });
      flagged[b.id] = flagged[b.id] ?? `Same framing and angle as the previous card`;
    }
  }
  return { sections, findings, flaggedShotIds: flagged, pass: findings.length === 0 };
}
