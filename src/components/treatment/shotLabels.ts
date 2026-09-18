/**
 * Filmmaker-readable labels for Shot Spec enums (Lane B — Treatment UX).
 *
 * The treatment screen is a director's storyboard, not an engineering
 * dashboard: every enum literal from `@/lib/treatment/shotSpec` is rendered
 * here as language a filmmaker reads on a call sheet. Nothing engineering —
 * chest/sleeve/SAM/keyframe/mask/temporal/propagation vocabulary — surfaces
 * on a card. Those are intentionally absent from this module.
 *
 * Pure functions only (no React) so they are trivially unit-testable and
 * reusable by the card, the storyboard, and any future export.
 */

import type {
  CameraAngle,
  CameraMotion,
  Framing,
  RenderEngine,
  ShotKind,
  ShotTypeLiteral,
  TransitionType,
} from "@/lib/treatment/shotSpec";

const FRAMING_LABELS: Record<Framing, string> = {
  extreme_wide: "Extreme Wide",
  wide: "Wide",
  medium_wide: "Medium Wide",
  medium: "Medium",
  medium_close: "Medium Close-Up",
  close_up: "Close-Up",
  extreme_close_up: "Extreme Close-Up",
  insert: "Insert",
};

/** Short label used inside the previs frame corner (space-constrained). */
const FRAMING_ABBR: Record<Framing, string> = {
  extreme_wide: "EWS",
  wide: "WS",
  medium_wide: "MWS",
  medium: "MS",
  medium_close: "MCU",
  close_up: "CU",
  extreme_close_up: "ECU",
  insert: "INS",
};

const CAMERA_ANGLE_LABELS: Record<CameraAngle, string> = {
  eye_level: "Eye Level",
  high: "High Angle",
  low: "Low Angle",
  birds_eye: "Bird's Eye",
  worms_eye: "Worm's Eye",
  dutch: "Dutch Tilt",
  over_shoulder: "Over the Shoulder",
  pov: "POV",
};

const CAMERA_MOTION_LABELS: Record<CameraMotion, string> = {
  static: "Static",
  pan: "Pan",
  tilt: "Tilt",
  dolly: "Dolly",
  truck: "Truck",
  pedestal: "Pedestal",
  handheld: "Handheld",
  steadicam: "Steadicam",
  gimbal: "Gimbal",
  crane: "Crane",
  jib: "Jib",
  zoom: "Zoom",
  orbit: "Orbit",
  whip_pan: "Whip Pan",
  drone: "Drone",
};

const SHOT_TYPE_LABELS: Record<ShotTypeLiteral, string> = {
  performance: "Performance",
  b_roll: "B-Roll",
  narrative: "Narrative",
  vfx: "VFX",
  transition: "Transition",
  lyric_visual: "Lyric Visual",
};

const SHOT_KIND_LABELS: Record<ShotKind, string> = {
  performance: "Performance",
  broll: "B-Roll",
  generated: "Generated",
};

const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: "Cut",
  crossfade: "Crossfade",
  fade_black: "Fade to Black",
  fade_white: "Fade to White",
  whip_pan: "Whip Pan",
  glitch: "Glitch",
  flash: "Flash",
};

const RENDER_ENGINE_LABELS: Record<RenderEngine, string> = {
  runway: "Runway",
  veo: "Veo",
  gemini: "Gemini",
  grok: "Grok",
  higgsfield: "Higgsfield",
  pika: "Pika",
  fal: "Fal",
  openai: "OpenAI",
  firefly: "Firefly",
  frame_io: "Frame.io",
  manual: "Manual / Captured",
  other: "Other",
};

/** Generic titleiser for any unrecognised snake/kebab value. */
function titleize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function framingLabel(v: Framing | null | undefined): string {
  return v ? (FRAMING_LABELS[v] ?? titleize(v)) : "";
}

export function framingAbbr(v: Framing | null | undefined): string {
  return v ? (FRAMING_ABBR[v] ?? v.toUpperCase()) : "";
}

export function cameraAngleLabel(v: CameraAngle | null | undefined): string {
  return v ? (CAMERA_ANGLE_LABELS[v] ?? titleize(v)) : "";
}

export function cameraMotionLabel(v: CameraMotion | null | undefined): string {
  return v ? (CAMERA_MOTION_LABELS[v] ?? titleize(v)) : "";
}

export function shotTypeLabel(v: ShotTypeLiteral | null | undefined): string {
  return v ? (SHOT_TYPE_LABELS[v] ?? titleize(v)) : "";
}

export function shotKindLabel(v: ShotKind | null | undefined): string {
  return v ? (SHOT_KIND_LABELS[v] ?? titleize(v)) : "";
}

export function transitionLabel(v: TransitionType | null | undefined): string {
  return v ? (TRANSITION_LABELS[v] ?? titleize(v)) : "";
}

export function renderEngineLabel(v: RenderEngine | null | undefined): string {
  return v ? (RENDER_ENGINE_LABELS[v] ?? titleize(v)) : "";
}

/**
 * Format a seconds offset as a `M:SS` timecode. Frames are intentionally
 * omitted — the treatment is pre-production planning, not an edit decision
 * list, so whole-second readability wins.
 */
export function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Human clip length, e.g. `3.5s`. */
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  return `${(Math.round(safe * 10) / 10).toFixed(1)}s`;
}
