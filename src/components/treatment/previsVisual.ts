/**
 * Deterministic previs derivation (Lane B — Treatment UX).
 *
 * The treatment card needs a "large animated previs area" without any paid
 * generation. Until Lane E's previs render API exists, we derive a fully
 * deterministic CSS storyboard frame from the Shot Spec's *creative* fields:
 * a colour palette from environment/lighting/wardrobe, a subject silhouette
 * sized by framing, an angle skew, and a camera-motion animation.
 *
 * Deterministic == same spec always yields the same frame (no Math.random /
 * Date). Pure functions here; the animation keyframes live in PrevisFrame.
 */

import type { ShotSpec } from "@/lib/treatment/shotSpec";
import type { CameraMotion, Framing } from "@/lib/treatment/shotSpec";

/** Named CSS animations defined once in PrevisFrame. `null` == no motion. */
export type PrevisMotion =
  | "pan"
  | "tilt"
  | "push"
  | "drift"
  | "orbit"
  | "shake"
  | "rise"
  | "whip"
  | null;

export type PrevisVisual = {
  /** Full CSS `background` value for the frame backdrop. */
  background: string;
  /** Subject silhouette height as a fraction of the frame (0..~1.2). */
  subjectScale: number;
  /** Where the subject sits vertically. */
  subjectAlign: "top" | "center" | "bottom";
  /** Dutch-tilt rotation for the whole frame, in degrees (0 when level). */
  dutchDeg: number;
  /** The camera-motion animation to apply to the scene layer. */
  motion: PrevisMotion;
};

/** Stable 32-bit hash of a string (FNV-1a). Deterministic across runs. */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const FRAMING_SCALE: Record<Framing, number> = {
  extreme_wide: 0.26,
  wide: 0.4,
  medium_wide: 0.54,
  medium: 0.66,
  medium_close: 0.78,
  close_up: 0.92,
  extreme_close_up: 1.15,
  insert: 0.48,
};

const MOTION_MAP: Record<CameraMotion, PrevisMotion> = {
  static: null,
  pan: "pan",
  tilt: "tilt",
  dolly: "push",
  truck: "drift",
  pedestal: "rise",
  handheld: "shake",
  steadicam: "shake",
  gimbal: "shake",
  crane: "rise",
  jib: "rise",
  zoom: "push",
  orbit: "orbit",
  whip_pan: "whip",
  drone: "push",
};

/**
 * Derive the deterministic previs frame for a shot. The palette hue is seeded
 * from the shot's creative text so two different environments read as two
 * different worlds, while the same shot always renders identically.
 */
export function derivePrevisVisual(spec: ShotSpec): PrevisVisual {
  const paletteSeed = [
    spec.environment.description,
    spec.environment.location,
    spec.environment.timeOfDay,
    spec.lighting.style,
    spec.lighting.description,
    spec.wardrobe.name,
    spec.wardrobe.description,
    // Fall back to identity so an empty shot still gets a stable, unique hue.
    spec.id,
  ]
    .filter(Boolean)
    .join("|");

  const hash = hashString(paletteSeed || spec.id);
  const hue = hash % 360;
  const accentHue = (hue + 40) % 360;
  // Time-of-day nudges brightness: darker for night-ish words, brighter for day.
  const tod = spec.environment.timeOfDay.toLowerCase();
  const dark = /night|dusk|midnight|dark|noir|shadow/.test(tod);
  const bright = /day|noon|morning|sun|bright|golden/.test(tod);
  const l1 = dark ? 18 : bright ? 34 : 26;
  const l2 = dark ? 8 : bright ? 20 : 13;

  const background = `radial-gradient(120% 90% at 30% 20%, hsl(${hue} 45% ${l1}%) 0%, hsl(${accentHue} 40% ${l2}%) 70%, hsl(${hue} 30% ${Math.max(4, l2 - 5)}%) 100%)`;

  const subjectScale = spec.framing ? FRAMING_SCALE[spec.framing] : 0.6;

  let subjectAlign: PrevisVisual["subjectAlign"] = "bottom";
  let dutchDeg = 0;
  switch (spec.cameraAngle) {
    case "high":
    case "birds_eye":
      subjectAlign = "center";
      break;
    case "low":
    case "worms_eye":
      subjectAlign = "bottom";
      break;
    case "dutch":
      dutchDeg = 6;
      break;
    default:
      subjectAlign = "bottom";
  }

  const motion = spec.cameraMotion.type ? MOTION_MAP[spec.cameraMotion.type] : null;

  return { background, subjectScale, subjectAlign, dutchDeg, motion };
}
