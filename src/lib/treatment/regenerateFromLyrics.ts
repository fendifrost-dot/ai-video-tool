/**
 * Regenerate ONE storyboard box from the lyrics sung inside it (Fendi, 2026-10-02:
 * "a per-box generate-a-new-storyboard-prompt specifically matching details from the
 * lyrics"; "we have the ability to bring every lyric to life so we should do so").
 *
 * The call goes to `lyric-visualizer-proxy` in `mode: "literal"` — every noun the line
 * says becomes a physical thing in frame — with the box's window so the beats fit the
 * clock, and with a prompt template (motion_story_v1) so the motion contract drives the
 * generator rather than merely describing what it should do.
 *
 * The result does NOT write anything. It is mapped into the SAME override fields the
 * manual override block edits, and lands there unsaved: the director reads it, keeps or
 * edits it, and hits Save. One write path for both features, so "regenerated" and
 * "hand-written" are the same kind of thing to everything downstream.
 */

import { supabase } from "@/lib/supabase";
import { ENGINE_TO_CARD } from "./coverage";
import { DEFAULT_TRANSITION_PRESETS, transitionInFromPreset } from "./transitions";
import {
  CAMERA_ANGLES,
  FRAMINGS,
  type CameraAngle,
  type CameraMotion,
  type Framing,
  type ShotSpec,
  type TransitionType,
} from "./shotSpec";
import { lyricsForShot, type LyricLine } from "@/lib/lyrics/lyricsForShot";

/** The default template: the Opus 5.5 motion-design guide, seeded as a prompt template. */
export const DEFAULT_MOTION_TEMPLATE = "motion_story_v1";

/** The scene the proxy returns in a single-scene mode (SCENE_SCHEMA in the function). */
export type MotionScene = {
  title?: string;
  purpose?: string;
  visual?: string;
  motion?: { entrance?: string; primary?: string; secondary?: string; exit?: string };
  camera?: { move?: string; framing?: string; angle?: string; lens?: string };
  sound?: string;
  transition?: { object?: string; preset?: string };
  required_elements?: string[];
  realism_risk?: string;
  risk_reason?: string;
  render_prompt?: string;
};

/** What the card drops into its (unsaved) override fields. */
export type RegeneratedShot = {
  direction: string;
  cameraMotion: { type: CameraMotion | null; description: string };
  framing: Framing | null;
  cameraAngle: CameraAngle | null;
  transitionIn: { type: TransitionType | null; preset: string | null };
  requiredElements: string[];
  renderPrompt: string;
  realismRisk: string | null;
  scene: MotionScene;
};

// ---------------------------------------------------------------------------
// Vocabulary bridges. The generator speaks the engine's words (the same ones
// config/coverage_presets.json uses); the card speaks the ShotSpec enums.
// ---------------------------------------------------------------------------

/** The template's framing words → the card's FRAMINGS. */
const FRAMING_ALIASES: Record<string, Framing> = {
  close: "close_up",
  extreme_close: "extreme_close_up",
};

export function framingToCard(v: string | null | undefined): Framing | null {
  if (!v) return null;
  const k = v.trim().toLowerCase();
  if (FRAMING_ALIASES[k]) return FRAMING_ALIASES[k];
  return (FRAMINGS as readonly string[]).includes(k) ? (k as Framing) : null;
}

const ANGLE_ALIASES: Record<string, CameraAngle> = { eye: "eye_level", profile: "eye_level" };

export function angleToCard(v: string | null | undefined): CameraAngle | null {
  if (!v) return null;
  const k = v.trim().toLowerCase();
  if (ANGLE_ALIASES[k]) return ANGLE_ALIASES[k];
  return (CAMERA_ANGLES as readonly string[]).includes(k) ? (k as CameraAngle) : null;
}

/** Engine move → card motion. Reuses the coverage planner's table so one vocabulary governs. */
export function moveToCard(v: string | null | undefined): CameraMotion | null {
  if (!v) return null;
  return ENGINE_TO_CARD[v.trim().toLowerCase()] ?? null;
}

/**
 * A transition PRESET (config/transition_presets.json) → the card's coarse enum. The
 * mapping is NOT duplicated here: `transitions.ts` mirrors the JSON and is held equal to
 * it by its own test, so one vocabulary governs the card, the override and the assembler.
 */
export function presetToTransitionType(v: string | null | undefined): TransitionType | null {
  if (!v) return null;
  const name = v.trim().toLowerCase();
  return DEFAULT_TRANSITION_PRESETS[name] ? transitionInFromPreset(name).type : null;
}

/** The motion contract read as one sentence a director would say on the day. */
export function motionSentence(motion: MotionScene["motion"]): string {
  const parts = [motion?.entrance, motion?.primary, motion?.secondary, motion?.exit]
    .map((p) => (p ?? "").trim().replace(/[.;]+$/, ""))
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts.join("; ") + ".";
}

/** Scene → the override fields. Pure, so the mapping is tested without a network. */
export function sceneToOverride(scene: MotionScene): RegeneratedShot {
  const move = moveToCard(scene.camera?.move);
  const descParts = [
    scene.camera?.move?.trim(),
    scene.camera?.lens?.trim(),
    scene.transition?.object?.trim() ? `into: ${scene.transition.object.trim()}` : "",
  ].filter(Boolean);
  return {
    direction: motionSentence(scene.motion) || (scene.purpose ?? "").trim(),
    cameraMotion: { type: move, description: descParts.join(" · ") },
    framing: framingToCard(scene.camera?.framing),
    cameraAngle: angleToCard(scene.camera?.angle),
    transitionIn: {
      type: presetToTransitionType(scene.transition?.preset),
      preset: scene.transition?.preset?.trim() || null,
    },
    requiredElements: (scene.required_elements ?? []).map((e) => e.trim()).filter(Boolean),
    renderPrompt: (scene.render_prompt ?? "").trim(),
    realismRisk: scene.realism_risk ?? null,
    scene,
  };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export type RegenerateInput = {
  projectId: string;
  spec: ShotSpec;
  lyricLines: LyricLine[] | undefined;
  /** Seed template name or template_json basename. Defaults to the motion-design guide. */
  template?: string | null;
  /** Context for the template's {{slots}}; anything missing is stripped, never sent braced. */
  templateContext?: {
    project?: { title?: string | null; audience?: string | null } | null;
    look?: { name?: string | null; preamble?: string | null } | null;
    artist?: { name?: string | null; description?: string | null } | null;
  };
  /** The locked hero/garment description and the plate environment the proxy requires. */
  heroDescription: string;
  environment: string;
  style?: string | null;
  lockedRules?: string[];
  rendererLimits?: string[];
  exemplars?: string[];
  section?: string | null;
  dryRun?: boolean;
};

export class NoLyricsInWindowError extends Error {
  constructor() {
    super("Instrumental — nothing to regenerate from");
    this.name = "NoLyricsInWindowError";
  }
}

/** The lines this box is built from. Exported so the card can grey the button out. */
export function linesForSpec(spec: ShotSpec, lyricLines: LyricLine[] | undefined) {
  if (!lyricLines || lyricLines.length === 0) return [];
  return lyricsForShot(lyricLines, spec.timeline);
}

export async function regenerateShotFromLyrics(input: RegenerateInput): Promise<RegeneratedShot> {
  const lines = linesForSpec(input.spec, input.lyricLines);
  if (lines.length === 0) throw new NoLyricsInWindowError();

  const { data, error } = await supabase.functions.invoke<Record<string, unknown>>(
    "lyric-visualizer-proxy",
    {
      body: {
        projectId: input.projectId,
        mode: "literal",
        template: input.template === null ? undefined : (input.template ?? DEFAULT_MOTION_TEMPLATE),
        templateContext: input.templateContext,
        // One box, one call: the whole window's words as a single line, so the scene is
        // written for what is actually sung here rather than for one line of it.
        lines: [
          {
            ref: input.spec.id,
            text: lines.map((l) => l.text).join(" "),
            section: input.section ?? lines[0]?.section,
            seconds: Math.max(0, input.spec.timeline.end - input.spec.timeline.start),
          },
        ],
        shot: {
          start: input.spec.timeline.start,
          end: input.spec.timeline.end,
          section: input.section ?? lines[0]?.section ?? null,
          framing: input.spec.framing,
          cameraMotion: input.spec.cameraMotion.description || input.spec.cameraMotion.type,
        },
        heroDescription: input.heroDescription,
        environment: input.environment,
        style: input.style ?? undefined,
        lockedRules: input.lockedRules,
        rendererLimits: input.rendererLimits,
        exemplars: input.exemplars,
        clipSeconds: Math.max(
          4,
          Math.min(15, Math.round(input.spec.timeline.end - input.spec.timeline.start)),
        ),
        dryRun: input.dryRun,
      },
    },
  );

  if (error) throw new Error(error.message || "lyric-visualizer-proxy failed");
  if (!data || data.ok === false) {
    throw new Error(String(data?.error ?? "Regeneration failed"));
  }
  const scene = extractScene(data);
  if (!scene) throw new Error("The visualiser returned no scene");
  return sceneToOverride(scene);
}

/** Pull the one scene out of the proxy envelope. Exported for the mapping tests. */
export function extractScene(payload: unknown): MotionScene | null {
  const result = (payload as { result?: { lines?: Array<{ scene?: MotionScene }> } })?.result;
  const first = result?.lines?.[0];
  return first?.scene ?? null;
}
