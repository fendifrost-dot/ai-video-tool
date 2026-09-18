/**
 * Previs plan — the deterministic, render-agnostic description of a shot's
 * animated preview (Lane E).
 *
 * A plan is derived purely from a validated {@link ShotSpec}. It contains no
 * pixels: the SVG renderer ({@link ./renderSvg}) turns a plan into an animated
 * image, and a component can also read the plan to caption the preview. Keeping
 * derivation separate from rendering means both are trivially testable and the
 * same plan can drive multiple back-ends later (canvas, video) WITHOUT touching
 * the locked video-swap pipeline.
 *
 * Deterministic contract: identical spec → identical plan. No Date/Math.random.
 */

import type { CameraMotion, Framing, ShotKind, ShotSpec } from "@/lib/treatment/shotSpec";
import { buildPalette, hashString, type PrevisPalette } from "./palette";

export const PREVIS_PLAN_VERSION = 1 as const;

/** 16:9 previs canvas, in SVG user units. */
export const PREVIS_WIDTH = 320;
export const PREVIS_HEIGHT = 180;

/** Animation loop bounds (seconds) — clamped clip length so loops stay watchable. */
const MIN_LOOP = 2;
const MAX_LOOP = 8;

/** A rectangle in canvas user units. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * A camera-motion animation, expressed as a single SVG `animateTransform`.
 * `null` transform means the shot is locked-off (static).
 */
export type PrevisMotion = {
  key: CameraMotion;
  label: string;
  transform: {
    type: "translate" | "scale" | "rotate";
    values: string;
    dur: number;
    calcMode?: "spline";
  } | null;
};

export type PrevisPlan = {
  version: typeof PREVIS_PLAN_VERSION;
  shotId: string;
  title: string;
  /** Stable hash of the creative inputs — the previs "seed". */
  seed: number;
  width: number;
  height: number;
  /** Clamped clip duration; drives the animation loop length. */
  durationSeconds: number;
  palette: PrevisPalette;
  kind: ShotKind;
  framing: {
    key: Framing;
    label: string;
    /** Bounding box of the subject figure within the canvas. */
    subject: Rect;
  };
  motion: PrevisMotion;
  /** Short human captions for the preview surface. */
  captions: {
    framing: string;
    motion: string;
    duration: string;
    lens: string;
  };
};

// --- framing → subject size -------------------------------------------------

const FRAMING_LABELS: Record<Framing, string> = {
  extreme_wide: "Extreme wide",
  wide: "Wide",
  medium_wide: "Medium wide",
  medium: "Medium",
  medium_close: "Medium close",
  close_up: "Close-up",
  extreme_close_up: "Extreme close-up",
  insert: "Insert",
};

/** Figure height as a fraction of canvas height, per framing tightness. */
const FRAMING_SCALE: Record<Framing, number> = {
  extreme_wide: 0.2,
  wide: 0.34,
  medium_wide: 0.5,
  medium: 0.66,
  medium_close: 0.82,
  close_up: 1.05,
  extreme_close_up: 1.5,
  insert: 0.44,
};

const MOTION_LABELS: Record<CameraMotion, string> = {
  static: "Locked off",
  pan: "Pan",
  tilt: "Tilt",
  dolly: "Dolly in",
  truck: "Truck",
  pedestal: "Pedestal",
  handheld: "Handheld",
  steadicam: "Steadicam",
  gimbal: "Gimbal",
  crane: "Crane",
  jib: "Jib",
  zoom: "Zoom",
  orbit: "Orbit",
  whip_pan: "Whip pan",
  drone: "Drone",
};

/**
 * Place the subject on a rule-of-thirds vertical, side chosen deterministically
 * from the seed so a treatment's shots don't all frame identically.
 */
function subjectRect(framing: Framing, seed: number): Rect {
  const scale = FRAMING_SCALE[framing];
  const h = PREVIS_HEIGHT * scale;
  const w = Math.max(18, h * 0.42); // rough shoulder-width ratio
  // Left- vs right-third bias from the seed.
  const onLeft = (seed & 1) === 0;
  const cx = onLeft ? PREVIS_WIDTH / 3 : (PREVIS_WIDTH * 2) / 3;
  const x = cx - w / 2;
  // Feet sit near the lower third; tight framings ride higher and can overscan.
  const feetY = framing === "insert" ? PREVIS_HEIGHT * 0.62 : PREVIS_HEIGHT * 0.98;
  const y = feetY - h;
  return { x, y, w, h };
}

function center(): { cx: number; cy: number } {
  return { cx: PREVIS_WIDTH / 2, cy: PREVIS_HEIGHT / 2 };
}

/**
 * Map a camera motion to a looping SVG transform. Amplitudes are intentionally
 * modest — a previs suggests the move, it does not simulate it.
 */
function buildMotion(key: CameraMotion, duration: number): PrevisMotion {
  const label = MOTION_LABELS[key];
  const { cx, cy } = center();
  const dur = Math.max(MIN_LOOP, duration);

  switch (key) {
    case "static":
      return { key, label, transform: null };
    case "pan":
      return { key, label, transform: { type: "translate", values: "0 0; -20 0; 0 0", dur } };
    case "truck":
      return { key, label, transform: { type: "translate", values: "0 0; -34 0; 0 0", dur } };
    case "whip_pan":
      return {
        key,
        label,
        transform: {
          type: "translate",
          values: "0 0; 0 0; -60 0; 0 0",
          dur: Math.max(MIN_LOOP, dur * 0.5),
        },
      };
    case "tilt":
      return { key, label, transform: { type: "translate", values: "0 0; 0 -16; 0 0", dur } };
    case "pedestal":
      return { key, label, transform: { type: "translate", values: "0 0; 0 -24; 0 0", dur } };
    case "crane":
    case "jib":
      return { key, label, transform: { type: "translate", values: "0 0; 0 -30; 0 0", dur } };
    case "dolly":
      return { key, label, transform: { type: "scale", values: "1 1; 1.14 1.14; 1 1", dur } };
    case "zoom":
      return { key, label, transform: { type: "scale", values: "1 1; 1.28 1.28; 1 1", dur } };
    case "drone":
      return {
        key,
        label,
        transform: { type: "scale", values: "1 1; 1.18 1.18; 1.06 1.06; 1 1", dur },
      };
    case "orbit":
      return {
        key,
        label,
        transform: { type: "rotate", values: `0 ${cx} ${cy}; 7 ${cx} ${cy}; 0 ${cx} ${cy}`, dur },
      };
    case "handheld":
      return {
        key,
        label,
        transform: {
          type: "translate",
          values: "0 0; 1.5 -1; -1 1.5; 1 1; 0 0",
          dur: Math.max(1.2, dur * 0.4),
        },
      };
    case "steadicam":
    case "gimbal":
      return { key, label, transform: { type: "translate", values: "0 0; -8 2; 0 0", dur } };
    default:
      return { key, label, transform: null };
  }
}

function durationCaption(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

function lensCaption(spec: ShotSpec): string {
  const fl = spec.lens.focalLengthMm;
  if (fl) return `${Math.round(fl)}mm${spec.lens.aperture ? ` · ${spec.lens.aperture}` : ""}`;
  return spec.lens.description.trim() || "—";
}

/**
 * Derive a deterministic previs plan from a validated Shot Spec.
 *
 * Framing/motion default sensibly when the spec leaves them null so a rough
 * treatment beat still previews.
 */
export function buildPrevisPlan(spec: ShotSpec): PrevisPlan {
  const framing: Framing = spec.framing ?? "medium";
  const motionKey: CameraMotion = spec.cameraMotion.type ?? "static";

  const rawDuration = spec.timeline.end - spec.timeline.start;
  const durationSeconds = Math.min(
    MAX_LOOP,
    Math.max(MIN_LOOP, rawDuration > 0 ? rawDuration : MIN_LOOP),
  );

  const seed = hashString(
    [
      spec.id,
      spec.title,
      spec.wardrobe.name,
      spec.wardrobe.description,
      spec.environment.description,
      spec.environment.location,
      spec.environment.timeOfDay,
      spec.lighting.style,
      framing,
      motionKey,
    ].join("|"),
  );

  const palette = buildPalette({
    environment: `${spec.environment.description} ${spec.environment.location}`,
    timeOfDay: spec.environment.timeOfDay,
    lighting: `${spec.lighting.style} ${spec.lighting.description}`,
    wardrobe: `${spec.wardrobe.name} ${spec.wardrobe.description}`,
  });

  const motion = buildMotion(motionKey, durationSeconds);

  return {
    version: PREVIS_PLAN_VERSION,
    shotId: spec.id,
    title: spec.title.trim() || spec.purpose.trim() || spec.id,
    seed,
    width: PREVIS_WIDTH,
    height: PREVIS_HEIGHT,
    durationSeconds,
    palette,
    kind: spec.kind,
    framing: {
      key: framing,
      label: FRAMING_LABELS[framing],
      subject: subjectRect(framing, seed),
    },
    motion,
    captions: {
      framing: FRAMING_LABELS[framing],
      motion: motion.label,
      duration: durationCaption(durationSeconds),
      lens: lensCaption(spec),
    },
  };
}
