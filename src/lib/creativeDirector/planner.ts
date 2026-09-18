/**
 * Creative Director planner (Lane D).
 *
 * Defines the provider-agnostic {@link CreativeDirectorPlanner} adapter and ships
 * a deterministic {@link MockCreativeDirectorPlanner} as the default. The mock
 * planner performs NO network calls and NO paid generations — it derives a
 * complete, filmmaker-language ShotSpec sequence from the beat grid + brief using
 * documented, repeatable rules. A real LLM-backed planner can implement the same
 * interface later without any consumer change.
 *
 * Contract with the rest of the app:
 *   • Timing is never invented here — the grid owns every cut point.
 *   • Output is validated ShotSpec (via parseShotSpec), so it drops straight into
 *     the treatment → shot-list → production path.
 *   • Nothing brand-specific is baked in — looks come from the brief.
 */

import type { GridClip, ClipEnergy } from "@/lib/treatment/grid";
import {
  parseShotSpec,
  type CameraAngle,
  type CameraMotion,
  type Framing,
  type ShotKind,
  type ShotSpec,
  type ShotSpecInput,
  type ShotTypeLiteral,
} from "@/lib/treatment/shotSpec";
import {
  DEFAULT_CAPABILITIES,
  pickEngine,
  type ProviderCapabilities,
} from "@/lib/creativeDirector/capabilities";
import type {
  CreativeBrief,
  CreativeDirectorPlan,
  PlanInput,
  PlanSection,
  WardrobeLook,
} from "@/lib/creativeDirector/types";

// ============================================================================
// Adapter interface + registry
// ============================================================================

export interface CreativeDirectorPlanner {
  /** Stable id, recorded on the plan for provenance. */
  readonly id: string;
  /** Human label for UI. */
  readonly label: string;
  /** True when the planner performs no paid model calls. */
  readonly isFree: boolean;
  /** Produce a complete ShotSpec sequence for the given boundary input. */
  planSequence(input: PlanInput): Promise<CreativeDirectorPlan>;
}

const registry = new Map<string, CreativeDirectorPlanner>();

/** Register a planner adapter (last registration for an id wins). */
export function registerPlanner(planner: CreativeDirectorPlanner): void {
  registry.set(planner.id, planner);
}

/** Look up a planner by id, or `null` if none is registered. */
export function getPlanner(id: string): CreativeDirectorPlanner | null {
  return registry.get(id) ?? null;
}

/** All registered planners, in registration order. */
export function listPlanners(): CreativeDirectorPlanner[] {
  return [...registry.values()];
}

// ============================================================================
// Filmmaker-language mapping — deterministic creative decisions
// ============================================================================

/** Energy → framing. Higher energy pulls the camera in; drops punch to inserts. */
const FRAMING_BY_ENERGY: Record<ClipEnergy, Framing> = {
  low: "wide",
  mid: "medium",
  high: "medium_close",
  drop: "close_up",
};

/** Energy → camera motion. Calm passages glide; peaks get kinetic handheld. */
const MOTION_BY_ENERGY: Record<ClipEnergy, CameraMotion> = {
  low: "dolly",
  mid: "steadicam",
  high: "handheld",
  drop: "whip_pan",
};

const MOTION_PHRASE: Record<CameraMotion, string> = {
  static: "locked off",
  pan: "panning",
  tilt: "tilting",
  dolly: "slow dolly in",
  truck: "trucking with the subject",
  pedestal: "rising pedestal",
  handheld: "loose handheld energy",
  steadicam: "floating steadicam glide",
  gimbal: "smooth gimbal move",
  crane: "sweeping crane move",
  jib: "jib rise",
  zoom: "creeping zoom",
  orbit: "orbiting the subject",
  whip_pan: "whip-pan accent",
  drone: "aerial drone push",
};

/** Rotate angles for visual variety without repeating the grammar too soon. */
const ANGLE_CYCLE: CameraAngle[] = ["eye_level", "low", "eye_level", "high", "over_shoulder"];

const FRAMING_PHRASE: Record<Framing, string> = {
  extreme_wide: "extreme wide establishing",
  wide: "wide",
  medium_wide: "medium-wide",
  medium: "medium",
  medium_close: "medium close-up",
  close_up: "close-up",
  extreme_close_up: "extreme close-up",
  insert: "insert",
};

const ANGLE_PHRASE: Record<CameraAngle, string> = {
  eye_level: "eye level",
  high: "high angle",
  low: "low, heroic angle",
  birds_eye: "bird's-eye",
  worms_eye: "worm's-eye",
  dutch: "dutch tilt",
  over_shoulder: "over-the-shoulder",
  pov: "POV",
};

/**
 * Decide the shot's sourcing. Performance-driven sections favour captured/hero
 * performance; low-energy connective passages become b-roll or generated texture
 * so the cut breathes. Deterministic — driven only by section/energy/index.
 */
function decideKind(section: string, energy: ClipEnergy, index: number): ShotKind {
  const s = section.toLowerCase();
  const isPerformanceSection = s.includes("hook") || s.includes("chorus") || s.includes("drop");
  if (isPerformanceSection) return "performance";
  if (energy === "low") return index % 2 === 0 ? "broll" : "generated";
  // Verses: mostly performance with an occasional b-roll punctuation.
  return index % 3 === 2 ? "broll" : "performance";
}

const SHOT_TYPE_BY_KIND: Record<ShotKind, ShotTypeLiteral> = {
  performance: "performance",
  broll: "b_roll",
  generated: "vfx",
};

/** Pick the wardrobe look for a section by cycling supplied looks in order. */
function lookForIndex(looks: WardrobeLook[], sectionIndex: number): WardrobeLook | null {
  if (looks.length === 0) return null;
  return looks[sectionIndex % looks.length];
}

/** Build the human "purpose" line in a director's voice. */
function purposeLine(
  clip: GridClip,
  framing: Framing,
  kind: ShotKind,
  look: WardrobeLook | null,
  brief: CreativeBrief,
): string {
  const subject =
    kind === "performance"
      ? "artist performance"
      : kind === "broll"
        ? "b-roll texture"
        : "generated visual";
  const lookPhrase = look ? ` in ${look.name}` : "";
  const moodPhrase = brief.mood ? `, ${brief.mood.toLowerCase()}` : "";
  return `${FRAMING_PHRASE[framing]} ${subject}${lookPhrase} for the ${clip.section}${moodPhrase}`;
}

/** Build the performance-direction line: what the camera and subject do. */
function directionLine(
  framing: Framing,
  angle: CameraAngle,
  motion: CameraMotion,
  energy: ClipEnergy,
): string {
  const tempo =
    energy === "drop"
      ? "Hit the accent on the beat."
      : energy === "high"
        ? "Keep it driving and kinetic."
        : energy === "low"
          ? "Let it breathe — slow and deliberate."
          : "Steady, confident pacing.";
  return `${FRAMING_PHRASE[framing]}, ${ANGLE_PHRASE[angle]}, ${MOTION_PHRASE[motion]}. ${tempo}`;
}

// ============================================================================
// Sections
// ============================================================================

/** Collapse the grid into ordered, de-duplicated sections with an intent line. */
function deriveSections(grid: GridClip[]): PlanSection[] {
  const out: PlanSection[] = [];
  const seen = new Set<string>();
  for (const clip of grid) {
    if (seen.has(clip.section)) continue;
    seen.add(clip.section);
    const s = clip.section.toLowerCase();
    const intent = s.includes("intro")
      ? "Establish the world and the artist before the vocal lands."
      : s.includes("hook") || s.includes("chorus")
        ? "Hero performance energy — the most repeatable, iconic frames."
        : s.includes("outro")
          ? "Resolve and pull back; leave the lasting image."
          : s.includes("drop")
            ? "Peak intensity — fast cutting, bold camera."
            : "Advance the narrative and vary the coverage.";
    out.push({ name: clip.section, intent });
  }
  return out;
}

/** Map each unique section name to a stable ordinal for look rotation. */
function sectionIndexMap(grid: GridClip[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const clip of grid) {
    if (!map.has(clip.section)) map.set(clip.section, map.size);
  }
  return map;
}

// ============================================================================
// Mock planner
// ============================================================================

/**
 * Deterministic, offline Creative Director. Given the same brief + grid +
 * capabilities it always returns the same plan. Suitable as the product default
 * (no paid generations) and as a test fixture.
 */
export class MockCreativeDirectorPlanner implements CreativeDirectorPlanner {
  readonly id = "mock";
  readonly label = "Creative Director (offline)";
  readonly isFree = true;

  async planSequence(input: PlanInput): Promise<CreativeDirectorPlan> {
    return planWithMock(input);
  }
}

/** Pure, synchronous core — exported for direct/testing use. */
export function planWithMock(input: PlanInput): CreativeDirectorPlan {
  const { brief, grid } = input;
  const caps: ProviderCapabilities = input.capabilities ?? DEFAULT_CAPABILITIES;
  const looks = brief.wardrobe ?? [];
  const sectionIdx = sectionIndexMap(grid);
  const hasFootage = caps.hasSourceFootage && (brief.sourceFootage?.length ?? 0) > 0;

  const shots: ShotSpec[] = grid.map((clip, i) => {
    const framing = FRAMING_BY_ENERGY[clip.energy];
    const angle = ANGLE_CYCLE[i % ANGLE_CYCLE.length];
    const motion = MOTION_BY_ENERGY[clip.energy];
    const kind = decideKind(clip.section, clip.energy, i);
    const shotType = SHOT_TYPE_BY_KIND[kind];
    const secIndex = sectionIdx.get(clip.section) ?? 0;
    const look = lookForIndex(looks, secIndex);
    const clipSeconds = clip.end - clip.start;

    // Performance shots prefer captured footage when available; otherwise, and
    // for b-roll/generated, recommend an engine that fits within capabilities.
    const useCaptured = kind === "performance" && hasFootage;
    const engine = useCaptured ? null : pickEngine(caps, kind, clipSeconds);
    const generationRequired = !useCaptured && engine != null && engine !== "manual";

    const spec: ShotSpecInput = {
      id: clip.key,
      order: i,
      purpose: purposeLine(clip, framing, kind, look, brief),
      kind,
      shotType,
      priority:
        clip.energy === "drop" || clip.section.toLowerCase().includes("hook") ? "hero" : "normal",
      timeline: { start: clip.start, end: clip.end },
      source: {
        kind: useCaptured ? "captured" : kind === "performance" ? "captured" : "generated",
        note: useCaptured ? "cut from available performance footage" : "",
      },
      wardrobe: look
        ? {
            name: look.name,
            description: look.description ?? "",
            lookId: look.lookId ?? null,
            references: look.references ?? [],
          }
        : {},
      environment: brief.visualStyle ? { description: brief.visualStyle } : {},
      framing,
      cameraAngle: angle,
      cameraMotion: { type: motion, description: MOTION_PHRASE[motion] },
      lighting: brief.mood ? { style: brief.mood, description: "" } : {},
      performanceDirection: directionLine(framing, angle, motion, clip.energy),
      fx:
        clip.energy === "drop"
          ? [{ type: "speed_ramp", description: "punch-in on the drop", intensity: 0.6 }]
          : [],
      references: [],
      generation: {
        required: generationRequired,
        engine: generationRequired ? engine : null,
        notes: generationRequired ? `${clip.energy} energy · ${clip.section}` : "",
      },
      status: "draft",
      provenance: {
        source: "ai",
        createdAt: "",
        author: "creative-director:mock",
        model: null,
        notes: "deterministic plan",
      },
    };

    return parseShotSpec(spec);
  });

  const sections = deriveSections(grid);
  const total = grid.length ? grid[grid.length - 1].end : 0;
  const lookNames = looks.map((l) => l.name).filter(Boolean);
  const logline =
    brief.concept?.trim() ||
    `${sections.length} movements across ${Math.round(total)}s, ${shots.length} shots.`;

  const rationale = [
    brief.concept?.trim()
      ? `Concept: ${brief.concept.trim()}`
      : "Coverage-first plan derived from the beat grid.",
    `Energy drives the grammar — wide and deliberate in the quiet passages, tight and kinetic through the peaks; drops get a punch-in accent.`,
    lookNames.length
      ? `Wardrobe rotates ${lookNames.length} look${lookNames.length > 1 ? "s" : ""} by section: ${lookNames.join(", ")}.`
      : `No wardrobe looks supplied — wardrobe left open per shot.`,
    hasFootage
      ? "Performance beats cut from available footage; b-roll and texture are generated within pipeline capabilities."
      : "All shots planned for generation within pipeline capabilities.",
  ].join(" ");

  return {
    logline,
    rationale,
    sections,
    shots,
    planner: "mock",
    model: "",
    generatedAt: "",
  };
}

// Register the default planner on module load.
registerPlanner(new MockCreativeDirectorPlanner());

/** The default planner id used by the UI. */
export const DEFAULT_PLANNER_ID = "mock";
