// Style Learn, phase 1. Pure: no network, no provider, no database.
// A reference video is measured locally (scripts/style/extract_style.py). This module
// checks that document, plans a cut against a song's beats, writes a .cube LUT, and
// builds the ffmpeg command that renders a draft. Cost is 0. It does not render here.

import { secondsToFrames } from "./editModel.ts";
import {
  parseResolution,
  parseStyleEffects,
  type StyleEffect,
  type StyleResolution,
} from "./styleLibrary.ts";

export const FORMAT_STYLE_PROFILE = "avt.style_profile";
export const STYLE_FORMAT_VERSION = 1;
export const STYLE_LUT_SIZE = 17;

/** What the local detectors actually hold. The page and the docs print these words. */
export const STYLE_MATCHED = [
  "shot boundaries",
  "shot-length distribution",
  "hard cuts",
  "flash and white frames",
  "letterbox and aspect",
  "average contrast and saturation",
  "cut timing against audio onsets",
  "starter-taxonomy effects whose signal fires",
] as const;

/** Heuristics. The draft follows them; it does not recover the original effect. */
export const STYLE_APPROXIMATED = [
  "crossfades and whip pans",
  "speed ramps and slow motion",
  "zoom and shake intensity",
  "color grade as lift, gamma, gain and a generated LUT",
  "grain and vignette amount",
  "text and caption overlays",
  "strobe, RGB split, and glitch",
  "vision-model labels",
  "unclassified visual events",
] as const;

export const STYLE_TRANSITIONS = ["hard_cut", "crossfade", "flash", "whip"] as const;
export type StyleTransition = (typeof STYLE_TRANSITIONS)[number];
export const STYLE_SUBJECTS = ["fendi_performance", "ai_broll", "no_fendi"] as const;
export type StyleSubject = (typeof STYLE_SUBJECTS)[number];

export type GradeKnobs = {
  contrast: number;
  saturation: number;
  grain: number;
  vignette: number;
  lift: number;
  gamma: number;
  gain: number;
};

export type StyleShot = {
  index: number;
  start: number;
  end: number;
  transition_out: StyleTransition;
  speed: number;
  motion: { zoom: number; shake: number; intensity: number };
  grade: GradeKnobs;
  fx: string[];
};

export type StyleProfile = {
  format: typeof FORMAT_STYLE_PROFILE;
  format_version: typeof STYLE_FORMAT_VERSION;
  cost_usd: 0;
  summary: string;
  source: { label: string; duration_seconds: number; width: number; height: number; fps: number };
  shots: StyleShot[];
  shot_length: { count: number; mean: number; median: number; p10: number; p90: number };
  cut_timing: { on_beat_ratio: number; median_offset_seconds: number; prefer: "beat" | "free" };
  transitions: Record<StyleTransition, number>;
  speed: { slow_motion_ratio: number; fast_ratio: number };
  camera: { zoom: number; shake: number; intensity: number };
  grade: GradeKnobs;
  frame: {
    aspect: string;
    letterbox: boolean;
    bar_top: number;
    bar_bottom: number;
    bar_left: number;
    bar_right: number;
  };
  overlays: { text_presence: number };
  fx: { strobe: boolean; rgb_split: boolean; glitch: boolean };
  vision: { enabled: boolean; labels: string[]; status: "off" | "refused" | "local" };
  fidelity: { matched: string[]; approximated: string[] };
  detectors: { scenes: string; audio: string; vision: string; sample_fps: number };
  effects: StyleEffect[];
  resolution: StyleResolution;
};

export type StyleResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function fail(error: string): StyleResult<never> {
  return { ok: false, error };
}

function num(v: unknown, name: string, min: number, max: number): number | string {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    return `${name} must be a number from ${min} to ${max}`;
  return v;
}

function gradeOf(raw: unknown, name: string): GradeKnobs | string {
  const row = rec(raw);
  if (!row) return `${name} grade must be an object`;
  const contrast = num(row.contrast, `${name} contrast`, 0.2, 3);
  const saturation = num(row.saturation, `${name} saturation`, 0, 3);
  const grain = num(row.grain, `${name} grain`, 0, 1);
  const vignette = num(row.vignette, `${name} vignette`, 0, 1);
  const lift = num(row.lift, `${name} lift`, -0.2, 0.3);
  const gamma = num(row.gamma, `${name} gamma`, 0.4, 2.5);
  const gain = num(row.gain, `${name} gain`, 0.4, 2);
  for (const part of [contrast, saturation, grain, vignette, lift, gamma, gain]) {
    if (typeof part === "string") return part;
  }
  return {
    contrast: contrast as number,
    saturation: saturation as number,
    grain: grain as number,
    vignette: vignette as number,
    lift: lift as number,
    gamma: gamma as number,
    gain: gain as number,
  };
}

function sameWords(got: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(got) || got.length !== expected.length) return false;
  return expected.every((word, index) => got[index] === word);
}

export function parseStyleProfile(raw: unknown): StyleResult<StyleProfile> {
  const doc = rec(raw);
  if (!doc) return fail("style profile must be an object");
  if (doc.format !== FORMAT_STYLE_PROFILE) return fail(`format must be ${FORMAT_STYLE_PROFILE}`);
  if (doc.format_version !== STYLE_FORMAT_VERSION)
    return fail(`format_version must be ${STYLE_FORMAT_VERSION}`);
  if (doc.cost_usd !== 0) return fail("cost_usd must be 0");
  if (
    typeof doc.summary !== "string" ||
    doc.summary.trim().length < 8 ||
    doc.summary.length > 4000
  ) {
    return fail("summary must be a short readable paragraph");
  }
  const source = rec(doc.source);
  if (!source) return fail("source is required");
  if (typeof source.label !== "string" || source.label.length === 0 || source.label.length > 200)
    return fail("source.label is required");
  const duration = num(source.duration_seconds, "source.duration_seconds", 0.05, 60 * 60);
  const width = num(source.width, "source.width", 2, 7680);
  const height = num(source.height, "source.height", 2, 7680);
  const fps = num(source.fps, "source.fps", 1, 120);
  for (const part of [duration, width, height, fps])
    if (typeof part === "string") return fail(part);
  if (!Array.isArray(doc.shots) || doc.shots.length === 0 || doc.shots.length > 5000)
    return fail("shots must be a non-empty array");
  const shots: StyleShot[] = [];
  let prevEnd = -1;
  for (const item of doc.shots) {
    const row = rec(item);
    if (!row) return fail("each shot must be an object");
    if (typeof row.index !== "number" || row.index !== shots.length)
      return fail("shot indexes must be 0..n-1");
    const start = num(row.start, "shot start", 0, 60 * 60);
    const end = num(row.end, "shot end", 0, 60 * 60);
    if (typeof start === "string") return fail(start);
    if (typeof end === "string") return fail(end);
    if (end <= start) return fail(`shot ${row.index} has a bad range`);
    if (start < prevEnd - 0.001) return fail("shots must be in order");
    prevEnd = end;
    if (
      typeof row.transition_out !== "string" ||
      !(STYLE_TRANSITIONS as readonly string[]).includes(row.transition_out)
    ) {
      return fail(`shot ${row.index} transition_out must be ${STYLE_TRANSITIONS.join(", ")}`);
    }
    const speed = num(row.speed, "shot speed", 0.25, 4);
    if (typeof speed === "string") return fail(speed);
    const motion = rec(row.motion);
    if (!motion) return fail(`shot ${row.index} motion is required`);
    const zoom = num(motion.zoom, "zoom", 0, 1);
    const shake = num(motion.shake, "shake", 0, 1);
    const intensity = num(motion.intensity, "intensity", 0, 1);
    for (const part of [zoom, shake, intensity]) if (typeof part === "string") return fail(part);
    const grade = gradeOf(row.grade, `shot ${row.index}`);
    if (typeof grade === "string") return fail(grade);
    if (!Array.isArray(row.fx) || row.fx.some((fx) => typeof fx !== "string" || fx.length > 40))
      return fail(`shot ${row.index} fx must be short strings`);
    shots.push({
      index: shots.length,
      start,
      end,
      transition_out: row.transition_out as StyleTransition,
      speed,
      motion: { zoom: zoom as number, shake: shake as number, intensity: intensity as number },
      grade,
      fx: row.fx as string[],
    });
  }
  const length = rec(doc.shot_length);
  if (!length) return fail("shot_length is required");
  if (length.count !== shots.length) return fail("shot_length.count must match shots");
  for (const key of ["mean", "median", "p10", "p90"] as const) {
    const value = num(length[key], `shot_length.${key}`, 0, 60 * 60);
    if (typeof value === "string") return fail(value);
  }
  const timing = rec(doc.cut_timing);
  if (!timing) return fail("cut_timing is required");
  const onBeat = num(timing.on_beat_ratio, "on_beat_ratio", 0, 1);
  const offset = num(timing.median_offset_seconds, "median_offset_seconds", -5, 5);
  if (typeof onBeat === "string") return fail(onBeat);
  if (typeof offset === "string") return fail(offset);
  if (timing.prefer !== "beat" && timing.prefer !== "free")
    return fail('cut_timing.prefer must be "beat" or "free"');
  const transitions = rec(doc.transitions);
  if (!transitions) return fail("transitions is required");
  const transitionRatios = {} as Record<StyleTransition, number>;
  for (const key of STYLE_TRANSITIONS) {
    const value = num(transitions[key], `transitions.${key}`, 0, 1);
    if (typeof value === "string") return fail(value);
    transitionRatios[key] = value;
  }
  const speed = rec(doc.speed);
  if (!speed) return fail("speed is required");
  const slow = num(speed.slow_motion_ratio, "slow_motion_ratio", 0, 1);
  const fast = num(speed.fast_ratio, "fast_ratio", 0, 1);
  if (typeof slow === "string") return fail(slow);
  if (typeof fast === "string") return fail(fast);
  const camera = rec(doc.camera);
  if (!camera) return fail("camera is required");
  const camZoom = num(camera.zoom, "camera.zoom", 0, 1);
  const camShake = num(camera.shake, "camera.shake", 0, 1);
  const camIntensity = num(camera.intensity, "camera.intensity", 0, 1);
  for (const part of [camZoom, camShake, camIntensity])
    if (typeof part === "string") return fail(part);
  const grade = gradeOf(doc.grade, "profile");
  if (typeof grade === "string") return fail(grade);
  const frame = rec(doc.frame);
  if (
    !frame ||
    typeof frame.aspect !== "string" ||
    frame.aspect.length === 0 ||
    frame.aspect.length > 32
  )
    return fail("frame.aspect is required");
  if (typeof frame.letterbox !== "boolean") return fail("frame.letterbox must be boolean");
  const bars = ["bar_top", "bar_bottom", "bar_left", "bar_right"].map((key) =>
    num(frame[key], key, 0, 0.45),
  );
  for (const part of bars) if (typeof part === "string") return fail(part);
  const overlays = rec(doc.overlays);
  const text = num(overlays?.text_presence, "text_presence", 0, 1);
  if (typeof text === "string") return fail(text);
  const fx = rec(doc.fx);
  if (
    !fx ||
    typeof fx.strobe !== "boolean" ||
    typeof fx.rgb_split !== "boolean" ||
    typeof fx.glitch !== "boolean"
  ) {
    return fail("fx strobe, rgb_split, and glitch must be boolean");
  }
  const vision = rec(doc.vision);
  if (!vision || typeof vision.enabled !== "boolean") return fail("vision.enabled must be boolean");
  if (vision.status !== "off" && vision.status !== "refused" && vision.status !== "local")
    return fail("vision.status must be off, refused, or local");
  if (vision.enabled && vision.status !== "local")
    return fail("vision.enabled requires a local label pass");
  if (
    !Array.isArray(vision.labels) ||
    vision.labels.some((label) => typeof label !== "string" || label.length > 80)
  ) {
    return fail("vision.labels must be short strings");
  }
  if (vision.labels.length > 24) return fail("vision.labels is capped at 24");
  const fidelity = rec(doc.fidelity);
  if (
    !fidelity ||
    !sameWords(fidelity.matched, STYLE_MATCHED) ||
    !sameWords(fidelity.approximated, STYLE_APPROXIMATED)
  ) {
    return fail("fidelity lists must be the phase-1 matched and approximated lists");
  }
  const detectors = rec(doc.detectors);
  if (!detectors) return fail("detectors is required");
  for (const key of ["scenes", "audio", "vision"] as const) {
    if (
      typeof detectors[key] !== "string" ||
      detectors[key].length === 0 ||
      detectors[key].length > 80
    )
      return fail(`detectors.${key} is required`);
  }
  const sampleFps = num(detectors.sample_fps, "detectors.sample_fps", 1, 60);
  if (typeof sampleFps === "string") return fail(sampleFps);
  const effects = parseStyleEffects(doc.effects);
  if (!effects.ok) return effects;
  const resolution = parseResolution(doc.resolution, effects.value);
  return {
    ok: true,
    value: {
      format: FORMAT_STYLE_PROFILE,
      format_version: STYLE_FORMAT_VERSION,
      cost_usd: 0,
      summary: doc.summary.trim(),
      source: {
        label: source.label,
        duration_seconds: duration as number,
        width: width as number,
        height: height as number,
        fps: fps as number,
      },
      shots,
      shot_length: {
        count: shots.length,
        mean: length.mean as number,
        median: length.median as number,
        p10: length.p10 as number,
        p90: length.p90 as number,
      },
      cut_timing: { on_beat_ratio: onBeat, median_offset_seconds: offset, prefer: timing.prefer },
      transitions: transitionRatios,
      speed: { slow_motion_ratio: slow, fast_ratio: fast },
      camera: {
        zoom: camZoom as number,
        shake: camShake as number,
        intensity: camIntensity as number,
      },
      grade,
      frame: {
        aspect: frame.aspect,
        letterbox: frame.letterbox,
        bar_top: bars[0] as number,
        bar_bottom: bars[1] as number,
        bar_left: bars[2] as number,
        bar_right: bars[3] as number,
      },
      overlays: { text_presence: text },
      fx: { strobe: fx.strobe, rgb_split: fx.rgb_split, glitch: fx.glitch },
      vision: { enabled: vision.enabled, labels: vision.labels as string[], status: vision.status },
      fidelity: { matched: [...STYLE_MATCHED], approximated: [...STYLE_APPROXIMATED] },
      detectors: {
        scenes: detectors.scenes as string,
        audio: detectors.audio as string,
        vision: detectors.vision as string,
        sample_fps: sampleFps,
      },
      effects: effects.value,
      resolution,
    },
  };
}

export type StyleClipInput = {
  id: string;
  duration: number;
  subject: StyleSubject;
  assetId?: string | null;
  path?: string | null;
  shotId?: string | null;
};

export type StyleSegment = {
  id: string;
  clipId: string;
  path: string | null;
  assetId: string | null;
  shotId: string | null;
  subject: StyleSubject;
  performance: boolean;
  sourceIn: number;
  sourceOut: number;
  timelineIn: number;
  timelineOut: number;
  speed: number;
  transition: "cut" | "crossfade" | "flash" | "whip";
  transitionSeconds: number;
  withheld: string[];
};

export type StyleEdl = {
  projectId: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  locked: false;
  songAssetId: string | null;
  songOffset: 0;
  notes: string;
  clips: {
    id: string;
    track: "V1";
    order: number;
    shotId: string | null;
    shotKey: string | null;
    assetId: string | null;
    name: string;
    fileName: string | null;
    sourceIn: number;
    sourceOut: number;
    timelineIn: number;
    timelineOut: number;
    timelineInFrame: number;
    timelineOutFrame: number;
    speed: number;
    transition: "cut" | "crossfade" | "flash" | "whip";
    transitionSeconds: number;
    grade: GradeKnobs & { lut: string };
    locked: false;
    timeRemapAllowed: boolean;
    enabled: true;
    placeholder: false;
    comment: string;
    mouth: "unknown" | null;
  }[];
  markers: { kind: "beat"; timeIn: number; name: string }[];
};

export type StylePlan = {
  cost_usd: 0;
  rendered: false;
  summary: string;
  edl: StyleEdl;
  segments: StyleSegment[];
  lut: string;
  lut_filename: "grade.cube";
  withheld: string[];
  ffmpeg_notes: string[];
  command: string;
};

export type StylePlanInput = {
  profile: StyleProfile;
  clips: StyleClipInput[];
  beats: number[];
  projectId: string;
  fps?: number;
  width?: number;
  height?: number;
  songAssetId?: string | null;
};

function even(n: number): number {
  const rounded = Math.max(2, Math.round(n));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function outputSize(
  profile: StyleProfile,
  width?: number,
  height?: number,
): { width: number; height: number } {
  if (width && height) return { width: even(width), height: even(height) };
  let w = profile.source.width;
  let h = profile.source.height;
  const maxW = 1280;
  if (w > maxW) {
    h = (h * maxW) / w;
    w = maxW;
  }
  return { width: even(w), height: even(h) };
}

function targetLength(profile: StyleProfile): number {
  const median = profile.shot_length.median;
  if (!(median > 0)) return 0.5;
  return Math.min(4, Math.max(0.25, median));
}

/** The beat at or nearest the ideal end, strictly after the cursor. */
export function snapEnd(
  cursor: number,
  target: number,
  beats: number[],
  preferBeat: boolean,
): number {
  const ideal = cursor + target;
  if (!preferBeat) return ideal;
  const later = beats.filter((time) => time > cursor + 0.08);
  if (!later.length) return ideal;
  let best = later[0];
  let bestDist = Math.abs(later[0] - ideal);
  for (const time of later) {
    const dist = Math.abs(time - ideal);
    if (dist < bestDist) {
      best = time;
      bestDist = dist;
    }
  }
  return best;
}

function transitionAt(profile: StyleProfile, index: number): StyleTransition {
  const weights = STYLE_TRANSITIONS.map((key) => Math.max(0, profile.transitions[key] ?? 0));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (sum <= 0) return "hard_cut";
  const slot = ((index % 8) + 0.5) / 8;
  let acc = 0;
  for (let i = 0; i < STYLE_TRANSITIONS.length; i++) {
    acc += weights[i] / sum;
    if (slot <= acc + 1e-9) return STYLE_TRANSITIONS[i];
  }
  return "hard_cut";
}

function editTransition(kind: StyleTransition): StyleSegment["transition"] {
  if (kind === "hard_cut") return "cut";
  return kind;
}

function transitionSeconds(kind: StyleSegment["transition"], length: number): number {
  if (kind === "cut") return 0;
  const wanted = kind === "flash" ? 0.08 : kind === "whip" ? 0.1 : 0.16;
  return Math.max(0.04, Math.min(wanted, length * 0.3));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Cut Fendi's clips to the reference rhythm.
 * A performance take stays at speed 1. Slow motion and distorting FX stay off his face.
 */
export function planStyleEdit(input: StylePlanInput): StyleResult<StylePlan> {
  if (!input.clips.length) return fail("at least one clip is required");
  if (input.clips.length > 200) return fail("clip list is capped at 200");
  for (const clip of input.clips) {
    if (!clip.id || clip.id.length > 80) return fail("each clip needs an id");
    if (!(clip.duration > 0) || clip.duration > 60 * 60)
      return fail(`${clip.id} duration must be positive`);
    if (!(STYLE_SUBJECTS as readonly string[]).includes(clip.subject))
      return fail(`${clip.id} subject is not a style subject`);
  }
  const fps = input.fps && input.fps > 0 && input.fps <= 120 ? input.fps : 24;
  const size = outputSize(input.profile, input.width, input.height);
  const beats = [...input.beats]
    .filter((time) => Number.isFinite(time) && time >= 0)
    .sort((a, b) => a - b);
  const uniqueBeats: number[] = [];
  for (const time of beats) {
    if (!uniqueBeats.length || time - uniqueBeats[uniqueBeats.length - 1] > 0.04)
      uniqueBeats.push(time);
  }
  const preferBeat = input.profile.cut_timing.prefer === "beat" && uniqueBeats.length >= 2;
  const target = targetLength(input.profile);
  const pool = input.clips.reduce((total, clip) => total + clip.duration, 0);
  const horizon = uniqueBeats.length ? Math.max(uniqueBeats[uniqueBeats.length - 1], target) : pool;
  const limit = Math.min(pool, horizon);
  const used = new Map<string, number>();
  for (const clip of input.clips) used.set(clip.id, 0);
  const segments: StyleSegment[] = [];
  let cursor = 0;
  let guard = 0;
  while (cursor < limit - 0.08 && segments.length < 180 && guard < 400) {
    guard += 1;
    const clip = input.clips.find((item) => (used.get(item.id) ?? 0) < item.duration - 0.04);
    if (!clip) break;
    const performance = clip.subject === "fendi_performance";
    let speed = 1;
    if (!performance && segments.length % 4 === 3) {
      if (input.profile.speed.slow_motion_ratio >= 0.25) speed = 0.5;
      else if (input.profile.speed.fast_ratio >= 0.25) speed = 1.5;
    }
    const end = snapEnd(cursor, target, uniqueBeats, preferBeat);
    let timeline = Math.max(0.2, end - cursor);
    const remaining = clip.duration - (used.get(clip.id) ?? 0);
    const sourceNeeded = timeline * speed;
    if (sourceNeeded > remaining) {
      timeline = remaining / speed;
    }
    if (timeline < 0.12) {
      used.set(clip.id, clip.duration);
      continue;
    }
    const sourceIn = used.get(clip.id) ?? 0;
    const sourceOut = sourceIn + timeline * speed;
    used.set(clip.id, sourceOut);
    const incoming =
      segments.length === 0 ? "cut" : editTransition(transitionAt(input.profile, segments.length));
    const seconds = segments.length === 0 ? 0 : transitionSeconds(incoming, timeline);
    const withheld: string[] = [];
    if (performance && input.profile.fx.rgb_split) withheld.push("rgb_split");
    if (performance && input.profile.fx.glitch) withheld.push("glitch");
    if (performance && input.profile.camera.shake > 0.35) withheld.push("shake");
    if (performance && speed !== 1) withheld.push("speed");
    segments.push({
      id: `style-${segments.length}`,
      clipId: clip.id,
      path: clip.path ?? null,
      assetId: clip.assetId ?? null,
      shotId: clip.shotId ?? null,
      subject: clip.subject,
      performance,
      sourceIn: round3(sourceIn),
      sourceOut: round3(sourceOut),
      timelineIn: round3(cursor),
      timelineOut: round3(cursor + timeline),
      speed: performance ? 1 : speed,
      transition: incoming,
      transitionSeconds: incoming === "cut" ? 0 : round3(seconds),
      withheld,
    });
    cursor += timeline;
  }
  if (!segments.length) return fail("the clips are too short for a cut");
  const withheld = [...new Set(segments.flatMap((segment) => segment.withheld))];
  const notes = [
    "Style Learn draft. Not a finished picture.",
    "Performance speed stays 1. RGB split, glitch, and heavy shake are withheld on a performance take.",
    "Check SHOT_RULES before posting him. Cost $0.",
    input.profile.summary,
  ].join(" ");
  const grade = { ...input.profile.grade, lut: "grade.cube" };
  const edl: StyleEdl = {
    projectId: input.projectId,
    name: "style-learn",
    fps,
    width: size.width,
    height: size.height,
    locked: false,
    songAssetId: input.songAssetId ?? null,
    songOffset: 0,
    notes,
    clips: segments.map((segment, order) => ({
      id: segment.id,
      track: "V1",
      order,
      shotId: segment.shotId,
      shotKey: segment.clipId,
      assetId: segment.assetId,
      name: segment.clipId,
      fileName: segment.path,
      sourceIn: segment.sourceIn,
      sourceOut: segment.sourceOut,
      timelineIn: segment.timelineIn,
      timelineOut: segment.timelineOut,
      timelineInFrame: secondsToFrames(segment.timelineIn, fps),
      timelineOutFrame: secondsToFrames(segment.timelineOut, fps),
      speed: segment.speed,
      transition: segment.transition,
      transitionSeconds: segment.transitionSeconds,
      grade,
      locked: false,
      timeRemapAllowed: !segment.performance,
      enabled: true,
      placeholder: false,
      comment: segment.withheld.length ? `withheld: ${segment.withheld.join(", ")}` : "",
      mouth: segment.performance ? "unknown" : null,
    })),
    markers: uniqueBeats
      .filter((time) => time <= cursor + 0.001)
      .map((time) => ({ kind: "beat" as const, timeIn: round3(time), name: "beat" })),
  };
  const ffmpegNotes = [
    "Grade, grain, vignette, letterbox, and a mild zoom are ffmpeg filters.",
    "A crossfade is xfade. A flash is fadewhite. A whip is smoothleft, which only suggests a whip.",
    "Strobe is a brightness pulse. RGB split and glitch are channel shifts, and only on clips that are not a performance take.",
  ];
  return {
    ok: true,
    value: {
      cost_usd: 0,
      rendered: false,
      summary: input.profile.summary,
      edl,
      segments,
      lut: cubeLut(input.profile.grade),
      lut_filename: "grade.cube",
      withheld,
      ffmpeg_notes: ffmpegNotes,
      command:
        "npx tsx scripts/style/apply_style.ts --profile style.json --clips clips.json --out style-draft",
    },
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** 3D LUT. Neutral knobs (contrast 1, saturation 1, lift 0, gamma 1, gain 1) stay on the identity line. */
export function cubeLut(grade: GradeKnobs, size = STYLE_LUT_SIZE): string {
  const lines = ["TITLE AVT_Style", `LUT_3D_SIZE ${size}`, "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1"];
  const steps = size - 1;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rgb = [r / steps, g / steps, b / steps].map((channel) => {
          const lifted = clamp01(channel + grade.lift);
          const gamma = clamp01(Math.pow(lifted, 1 / grade.gamma));
          const gained = clamp01(gamma * grade.gain);
          return clamp01((gained - 0.5) * grade.contrast + 0.5);
        });
        const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        const sat = rgb.map((channel) => clamp01(luma + (channel - luma) * grade.saturation));
        lines.push(sat.map((channel) => channel.toFixed(6)).join(" "));
      }
    }
  }
  return lines.join("\n") + "\n";
}

function filterEscape(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/** One clip's picture filters. Performance takes skip the filters that move or split the face. */
export function segmentFilter(
  profile: StyleProfile,
  segment: StyleSegment,
  width: number,
  height: number,
  lutFile: string,
): string {
  const top = profile.frame.letterbox ? Math.round(height * profile.frame.bar_top) : 0;
  const bottom = profile.frame.letterbox ? Math.round(height * profile.frame.bar_bottom) : 0;
  const left = profile.frame.letterbox ? Math.round(width * profile.frame.bar_left) : 0;
  const right = profile.frame.letterbox ? Math.round(width * profile.frame.bar_right) : 0;
  const innerW = Math.max(2, even(width - left - right));
  const innerH = Math.max(2, even(height - top - bottom));
  const zoom = 1 + Math.min(0.12, Math.max(0, profile.camera.zoom) * 0.12);
  const scaledW = even(innerW * zoom);
  const scaledH = even(innerH * zoom);
  const parts: string[] = [];
  if (segment.speed !== 1) parts.push(`setpts=${(1 / segment.speed).toFixed(4)}*PTS`);
  parts.push(`scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase`);
  parts.push(`crop=${innerW}:${innerH}`);
  if (!segment.performance && profile.camera.shake > 0.35) {
    const amp = Math.min(8, Math.max(2, Math.round(profile.camera.shake * 8)));
    const cropW = even(innerW - amp * 2);
    const cropH = even(innerH - amp * 2);
    parts.push(`crop=${cropW}:${cropH}:${amp}+${amp}*sin(2*PI*t*3):${amp}+${amp}*cos(2*PI*t*2.5)`);
    parts.push(`scale=${innerW}:${innerH}`);
  }
  parts.push(`lut3d=file='${filterEscape(lutFile)}'`);
  if (profile.grade.grain > 0.05) {
    const amount = Math.min(20, Math.max(1, Math.round(profile.grade.grain * 20)));
    parts.push(`noise=alls=${amount}:allf=t`);
  }
  if (profile.grade.vignette > 0.12) {
    parts.push(`vignette=angle=${((Math.PI / 4) * profile.grade.vignette).toFixed(3)}`);
  }
  if (profile.fx.strobe) parts.push(`eq=brightness='0.35*gt(sin(2*PI*t*4)\\,0.85)'`);
  if (!segment.performance && profile.fx.rgb_split) parts.push("rgbashift=rh=3:bh=-3");
  if (!segment.performance && profile.fx.glitch) parts.push("rgbashift=rv=2:bv=-2");
  const padX = Math.max(0, Math.round((width - innerW) / 2));
  const padY = Math.max(0, Math.round((height - innerH) / 2));
  if (padX > 0 || padY > 0 || innerW !== width || innerH !== height) {
    parts.push(`pad=${width}:${height}:${padX}:${padY}:black`);
  }
  parts.push("format=yuv420p");
  return parts.join(",");
}

function xfadeName(transition: StyleSegment["transition"]): string | null {
  if (transition === "crossfade") return "fade";
  if (transition === "flash") return "fadewhite";
  if (transition === "whip") return "smoothleft";
  return null;
}

export function filterComplex(
  profile: StyleProfile,
  segments: StyleSegment[],
  width: number,
  height: number,
  lutFile: string,
): string {
  const lines = segments.map(
    (segment, index) =>
      `[${index}:v]${segmentFilter(profile, segment, width, height, lutFile)}[v${index}]`,
  );
  if (segments.length === 1) {
    lines.push("[v0]null[vout]");
    return lines.join(";");
  }
  let acc = "v0";
  let accDur = segments[0].timelineOut - segments[0].timelineIn;
  for (let index = 1; index < segments.length; index++) {
    const segment = segments[index];
    const out = index === segments.length - 1 ? "vout" : `x${index}`;
    const name = xfadeName(segment.transition);
    const dur = name ? segment.transitionSeconds : 0;
    const length = segment.timelineOut - segment.timelineIn;
    if (!name || dur <= 0.001 || dur >= accDur || dur >= length) {
      lines.push(`[${acc}][v${index}]concat=n=2:v=1:a=0[${out}]`);
      accDur += length;
    } else {
      const offset = Math.max(0, accDur - dur);
      lines.push(
        `[${acc}][v${index}]xfade=transition=${name}:duration=${dur.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`,
      );
      accDur += length - dur;
    }
    acc = out;
  }
  return lines.join(";");
}

export function ffmpegArgs(
  profile: StyleProfile,
  plan: StylePlan,
  files: { song: string | null; lut: string; output: string },
): string[] {
  const args = ["-y", "-v", "error"];
  for (const segment of plan.segments) {
    if (!segment.path) throw new Error(`segment ${segment.id} has no file path`);
    args.push(
      "-ss",
      segment.sourceIn.toFixed(3),
      "-t",
      Math.max(0.04, segment.sourceOut - segment.sourceIn).toFixed(3),
      "-i",
      segment.path,
    );
  }
  if (files.song) args.push("-i", files.song);
  const graph = filterComplex(profile, plan.segments, plan.edl.width, plan.edl.height, files.lut);
  args.push("-filter_complex", graph, "-map", "[vout]");
  if (files.song) args.push("-map", `${plan.segments.length}:a:0?`, "-c:a", "aac", "-b:a", "128k");
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(plan.edl.fps),
    "-crf",
    "20",
    "-preset",
    "veryfast",
    "-movflags",
    "+faststart",
    files.output,
  );
  return args;
}

export function beatsFromGrid(doc: unknown): number[] | null {
  const row = rec(doc);
  if (!row || !Array.isArray(row.beats) || typeof row.fps !== "number" || !(row.fps > 0))
    return null;
  const times: number[] = [];
  for (const beat of row.beats) {
    const item = rec(beat);
    if (!item || typeof item.frame !== "number") return null;
    times.push(item.frame / (row.fps as number));
  }
  return times;
}

export function planStyleFromToolArgs(args: Record<string, unknown>): StyleResult<StylePlan> {
  if (typeof args.project_id !== "string" || !UUID.test(args.project_id))
    return fail("project_id must be a uuid");
  const parsed = parseStyleProfile(args.profile ?? args.document);
  if (!parsed.ok) return parsed;
  if (!Array.isArray(args.clips) || args.clips.length === 0)
    return fail("clips must be a non-empty array");
  const clips: StyleClipInput[] = [];
  for (const item of args.clips) {
    const row = rec(item);
    if (!row || typeof row.id !== "string") return fail("each clip needs an id");
    if (typeof row.duration !== "number") return fail(`${row.id} duration is required`);
    if (
      typeof row.subject !== "string" ||
      !(STYLE_SUBJECTS as readonly string[]).includes(row.subject)
    ) {
      return fail(`${row.id} subject must be ${STYLE_SUBJECTS.join(", ")}`);
    }
    if (
      row.asset_id !== undefined &&
      row.asset_id !== null &&
      (typeof row.asset_id !== "string" || !UUID.test(row.asset_id))
    ) {
      return fail(`${row.id} asset_id must be a uuid`);
    }
    clips.push({
      id: row.id,
      duration: row.duration,
      subject: row.subject as StyleSubject,
      assetId: typeof row.asset_id === "string" ? row.asset_id : null,
      path: typeof row.path === "string" ? row.path : null,
      shotId: typeof row.shot_id === "string" ? row.shot_id : null,
    });
  }
  let beats: number[] = [];
  if (Array.isArray(args.beats)) {
    if (args.beats.some((time) => typeof time !== "number")) return fail("beats must be seconds");
    beats = args.beats as number[];
  } else if (args.beat_grid !== undefined) {
    const fromGrid = beatsFromGrid(args.beat_grid);
    if (!fromGrid) return fail("beat_grid must be an avt.beat_grid document");
    beats = fromGrid;
  }
  const fps = args.fps === undefined ? undefined : args.fps;
  if (fps !== undefined && (typeof fps !== "number" || !(fps > 0) || fps > 120))
    return fail("fps must be between 0 and 120");
  const width = args.width === undefined ? undefined : args.width;
  const height = args.height === undefined ? undefined : args.height;
  if (width !== undefined && (typeof width !== "number" || width < 2))
    return fail("width must be a number");
  if (height !== undefined && (typeof height !== "number" || height < 2))
    return fail("height must be a number");
  const song = args.song_asset_id;
  if (song !== undefined && song !== null && (typeof song !== "string" || !UUID.test(song)))
    return fail("song_asset_id must be a uuid");
  return planStyleEdit({
    profile: parsed.value,
    clips,
    beats,
    projectId: args.project_id,
    fps: typeof fps === "number" ? fps : undefined,
    width: typeof width === "number" ? width : undefined,
    height: typeof height === "number" ? height : undefined,
    songAssetId: typeof song === "string" ? song : null,
  });
}
