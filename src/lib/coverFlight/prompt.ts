import { validateFlightGuides } from "./geometry";
import type {
  CoverFlightCompileInput,
  CoverFlightCompileResult,
  FlightGuides,
} from "./types";

/**
 * Universal Omni Flash / Google Flow prompt from the Music-Cover Flight Guide
 * (@by.jadla). Only the [INSERT PATH] block is filled per cover.
 *
 * HARD RULES baked into the template:
 *  - Guides vanish (red line + white arrows are production marks, not scene).
 *  - Artwork stays a flat unchanged picture — no morph / re-animation.
 *  - Never describe a visible vehicle. "Drone" appears only as waypoint
 *    language and in the "no drone is ever visible" prohibition.
 */
export const COVER_FLIGHT_PROMPT_TEMPLATE = `Use the attached image as the starting frame — a single flat, static 2D artwork. The red line represents the drone flight waypoints and trajectory. The white arrows represent the camera viewing direction. These are production guides, not scene elements — remove all guides before the animation begins and reveal the clean artwork underneath.
HARD RULE — the artwork stays unchanged: the cover remains the SAME flat picture in every frame. Nothing inside it moves, separates, morphs or gets re-animated. No added objects.
Camera POV: create one continuous aerial flight along the exact path defined by the red line: [INSERT PATH: Start → Curve → Key elements → Endpoint], matching its route, curves, direction and endpoint as closely as possible. Throughout the flight, orient the camera according to the white arrows, keeping the artwork's main subject framed at all times.
Motion: smooth, cinematic, realistic inertia, gentle banking, natural acceleration and deceleration — no cuts, teleports or sudden swings. No vehicle, no drone, no camera body is ever visible; only the flying point of view.
Preserve the artwork exactly: colors, subjects, typography, lighting unchanged.
Produce clean, realistic footage with no visible guides, lines, arrows, overlays, graphics, text or watermarks in any frame.`;

export const COVER_FLIGHT_PATH_PLACEHOLDER =
  "[INSERT PATH: Start → Curve → Key elements → Endpoint]";

export const GOOGLE_FLOW_URL = "https://labs.google/flow";

export const COVER_FLIGHT_FLOW_SETTINGS = {
  model: "Omni Flash",
  durationMode: "Single Continuous",
} as const;

const PATH_PLACEHOLDER_RE =
  /\[INSERT PATH:[^\]]*\]/g;

export function normalizePathDescription(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Compile the universal prompt. Empty path descriptions leave the placeholder
 * in place and set `unfilled` so the UI can block copy-as-ready.
 */
export function compileCoverFlightPrompt(
  input: CoverFlightCompileInput,
): CoverFlightCompileResult {
  const pathDescription = normalizePathDescription(input.pathDescription);
  const key = input.keyElements?.trim();
  const filled =
    pathDescription.length > 0
      ? key && !pathDescription.toLowerCase().includes(key.toLowerCase())
        ? `${pathDescription} Key elements: ${key}.`
        : pathDescription
      : "";

  const issues: string[] = [];
  if (!filled) {
    issues.push("Fill in the flight path (Start → Curve → Key elements → Endpoint).");
  }

  const promptText = COVER_FLIGHT_PROMPT_TEMPLATE.replace(
    PATH_PLACEHOLDER_RE,
    filled || COVER_FLIGHT_PATH_PLACEHOLDER,
  );

  return {
    promptText,
    pathDescription: filled,
    unfilled: !filled,
    issues,
  };
}

export function compileCoverFlightFromGuides(
  guides: FlightGuides,
  pathDescription: string,
  keyElements?: string,
): CoverFlightCompileResult {
  const compiled = compileCoverFlightPrompt({ pathDescription, keyElements });
  const guideCheck = validateFlightGuides(guides);
  return {
    ...compiled,
    issues: [...guideCheck.issues, ...compiled.issues],
    unfilled: compiled.unfilled || !guideCheck.ok,
  };
}

/** Guard against a prompt that asks the model to render a physical aircraft. */
export function promptForbidsVisibleVehicle(promptText: string): boolean {
  return /no vehicle, no drone, no camera body is ever visible/i.test(promptText);
}
