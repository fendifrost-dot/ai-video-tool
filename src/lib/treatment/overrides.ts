/**
 * Per-box manual override of the generated treatment (Fendi, 2026-10-02:
 * "a manual override of the generated treatment inside each storyboard box").
 *
 * The one rule that shapes everything here: AN OVERRIDE STATES ONLY WHAT THE
 * DIRECTOR CHANGED. A field left null is not "set this to nothing" — it is
 * "I did not touch this", and the generated value, or the coverage planner's
 * default, keeps it. That is why `applyShotOverrides` runs BEFORE
 * `applyCoverageDefaults` in the storyboard: an explicit override wins outright,
 * and a field the director cleared falls back to the planner rather than to a
 * blank card.
 *
 * Keyed by ShotSpec id, not by a `shots` row, because the storyboard renders from
 * `video_projects.treatment_json` → `structuredTreatmentToShotSpecs`. A box may
 * have no shots row at all until the treatment is committed.
 *
 * Pure module: no react, no supabase, no project knowledge.
 */

import {
  CAMERA_MOTIONS,
  FRAMINGS,
  TRANSITION_TYPES,
  type CameraMotion,
  type Framing,
  type ShotSpec,
  type TransitionType,
} from "./shotSpec";
import { DEFAULT_TRANSITION_PRESETS, transitionInFromPreset } from "./transitions";

/** One row of `shot_overrides`, in app shape. Null = not overridden. */
export type ShotOverride = {
  specId: string;
  direction: string | null;
  cameraMotion: { type?: string | null; description?: string | null } | null;
  framing: string | null;
  transitionIn: {
    type?: string | null;
    /** A config/transition_presets.json name — the truth when present (see transitions.ts). */
    preset?: string | null;
    durationSeconds?: number | null;
  } | null;
  requiredElements: string[] | null;
  notes: string | null;
  updatedAt?: string;
};

/** The fields a director can override, in the order the card shows them. */
export const OVERRIDABLE_FIELDS = [
  "direction",
  "cameraMotion",
  "framing",
  "transitionIn",
  "requiredElements",
  "notes",
] as const;
export type OverridableField = (typeof OVERRIDABLE_FIELDS)[number];

/**
 * An override column is free-form (text / jsonb), so it can hold a value this
 * build does not know — a vocabulary that moved on, or a hand-edited row. An
 * unknown value is DROPPED rather than written onto the spec: a storyboard that
 * blanks a card because someone typed `framing: "cowboy"` is worse than one that
 * shows the generated framing.
 */
function asFraming(v: unknown): Framing | null {
  return typeof v === "string" && (FRAMINGS as readonly string[]).includes(v)
    ? (v as Framing)
    : null;
}
function asCameraMotion(v: unknown): CameraMotion | null {
  return typeof v === "string" && (CAMERA_MOTIONS as readonly string[]).includes(v)
    ? (v as CameraMotion)
    : null;
}
function asTransitionType(v: unknown): TransitionType | null {
  return typeof v === "string" && (TRANSITION_TYPES as readonly string[]).includes(v)
    ? (v as TransitionType)
    : null;
}

/** True when the override actually states something. An all-null row changes nothing. */
export function isEmptyOverride(o: ShotOverride | null | undefined): boolean {
  if (!o) return true;
  const motion = o.cameraMotion;
  const transition = o.transitionIn;
  return (
    !o.direction?.trim() &&
    !motion?.type &&
    !motion?.description?.trim() &&
    !o.framing &&
    !transition?.type &&
    !transition?.preset &&
    transition?.durationSeconds == null &&
    !(o.requiredElements && o.requiredElements.length > 0) &&
    !o.notes?.trim()
  );
}

/** Apply one override to one spec, replacing only the fields it states. */
export function applyShotOverride(
  spec: ShotSpec,
  override: ShotOverride | null | undefined,
): ShotSpec {
  if (isEmptyOverride(override) || !override) return spec;
  let next: ShotSpec = spec;
  // Tag the card only once something was actually APPLIED. A row whose every value
  // this build cannot interpret (see the guards above) leaves the card reading
  // "generated", because that is what the director is looking at.
  let touched = false;

  if (override.direction?.trim()) {
    next = { ...next, performanceDirection: override.direction.trim() };
    touched = true;
  }

  const motionType = asCameraMotion(override.cameraMotion?.type);
  const motionDesc = override.cameraMotion?.description?.trim();
  if (motionType || motionDesc) {
    next = {
      ...next,
      cameraMotion: {
        // A stated type replaces the generated one; a stated description alone keeps
        // the type but says how, which is how a director usually talks.
        type: motionType ?? next.cameraMotion.type,
        description: motionDesc ?? next.cameraMotion.description,
      },
    };
    touched = true;
  }

  const framing = asFraming(override.framing);
  if (framing) {
    next = { ...next, framing };
    touched = true;
  }

  // A preset is the precise thing the assembler renders; `type` is the DB family nearest
  // to it. Taking the preset therefore also takes its family, so the card and the cut
  // cannot disagree.
  const presetName = override.transitionIn?.preset?.trim();
  const fromPreset =
    presetName && DEFAULT_TRANSITION_PRESETS[presetName]
      ? transitionInFromPreset(presetName)
      : null;
  const transitionType = fromPreset?.type ?? asTransitionType(override.transitionIn?.type);
  const transitionDuration = override.transitionIn?.durationSeconds;
  if (transitionType || transitionDuration != null) {
    next = {
      ...next,
      transitionIn: {
        type: transitionType ?? next.transitionIn.type,
        preset: fromPreset ? presetName! : next.transitionIn.preset,
        durationSeconds:
          transitionDuration != null ? transitionDuration : next.transitionIn.durationSeconds,
      },
    };
    touched = true;
  }

  if (override.requiredElements && override.requiredElements.length > 0) {
    next = { ...next, requiredElements: [...override.requiredElements] };
    touched = true;
  }

  if (override.notes?.trim()) {
    // The director's own note about the box. It belongs with the authorship record,
    // not glued onto the direction the generators read.
    next = {
      ...next,
      provenance: { ...next.provenance, source: "human", notes: override.notes.trim() },
    };
    touched = true;
  }

  return touched ? { ...next, origin: "override" } : spec;
}

/** Apply a whole map of overrides (keyed by spec id) to a list of specs. */
export function applyShotOverrides(
  specs: ShotSpec[],
  overrides: Record<string, ShotOverride> | null | undefined,
): ShotSpec[] {
  if (!overrides || Object.keys(overrides).length === 0) return specs;
  return specs.map((spec) => applyShotOverride(spec, overrides[spec.id]));
}

/**
 * The direction a downstream consumer must read — the compiler, the render-prompt
 * builder, B4's regeneration. Always this, never `spec.performanceDirection` from
 * the raw generated treatment, so an override is honoured everywhere by default
 * rather than everywhere someone remembered.
 */
export function effectiveTreatment(spec: ShotSpec): string {
  return spec.performanceDirection;
}

/** True when the card should wear the "overridden" tag. */
export function isOverridden(spec: ShotSpec): boolean {
  return spec.origin === "override";
}
