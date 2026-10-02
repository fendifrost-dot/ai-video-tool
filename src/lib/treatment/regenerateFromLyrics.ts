/**
 * Regenerate ONE storyboard box from the lyrics sung inside it (Fendi, 2026-10-02:
 * "a per-box generate-a-new-storyboard-prompt specifically matching details from the
 * lyrics"; "we have the ability to bring every lyric to life so we should do so").
 *
 * The call goes to `lyric-visualizer-proxy` in the mode the card's role asks for (`modeForSpec`): `performance` for a
 * performance card (the line staged behind the real take), otherwise `mode: "literal"` — every noun the line
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
  /** The scene as ONE picture (the generator's `visual`): what the still shows when the shot opens. */
  frame: string;
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
  // A generated "static" is not a decision: the generator falls back to it, and written into the override it would pin
  // the card still against the coverage plan (measured live 2026-10-02: a performance card came back "static · 24mm"
  // with the standing rule "the camera moves" in the request). Leave the move unset so the coverage plan keeps the
  // card moving; a director who wants a locked frame sets it by hand.
  const rawMove = scene.camera?.move?.trim();
  const isStatic = (rawMove ?? "").toLowerCase() === "static";
  const move = isStatic ? null : moveToCard(rawMove);
  const descParts = [
    isStatic ? "" : rawMove,
    scene.camera?.lens?.trim(),
    scene.transition?.object?.trim() ? `into: ${scene.transition.object.trim()}` : "",
  ].filter(Boolean);
  return {
    direction: motionSentence(scene.motion) || (scene.purpose ?? "").trim(),
    frame: (scene.visual ?? "").trim(),
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
  /** Which reading of the line to ask for. Defaults by the card's role — see `modeForSpec`. */
  mode?: RegenerateMode;
  section?: string | null;
  dryRun?: boolean;
};

export type RegenerateMode = "literal" | "surreal" | "performance";

/**
 * The reading a card asks for by default. A PERFORMANCE card is the artist's real take: the line has to be staged in
 * the world around and behind him (the proxy's `performance` mode), not written as a new scene he would have to be
 * re-shot or re-dressed for. Every other card is cut between his takes: the line made physically real (`literal`).
 */
export function modeForSpec(spec: Pick<ShotSpec, "shotType">): RegenerateMode {
  return spec.shotType === "performance" ? "performance" : "literal";
}

/**
 * The production rules every regenerate carries, by the card's role. They are facts about how this tool makes a video
 * (performance is real footage; inserts are cut between takes; the camera moves), not about any one project.
 */
export function standingRules(spec: Pick<ShotSpec, "shotType">): string[] {
  const camera =
    "The camera moves — push, pull, truck, orbit, crane or handheld — unless the line itself asks for stillness.";
  return spec.shotType === "performance"
    ? [
        "The artist is real footage that already exists: keep his wardrobe, hair and props exactly as filmed, and never seat or place him somewhere he was not shot.",
        "Stage the line in the world around and behind him — people, vehicles, set dressing, weather — with real depth; leave the centre foreground clear for him.",
        camera,
      ]
    : [
        "The artist does not appear in this shot: it is cut between his performance takes. Build the line with other people, objects and places.",
        camera,
      ];
}

/**
 * What the request says about the box it is writing for. The window and the section always go. The framing and the
 * camera go ONLY when the director set them (an overridden card): the proxy states them as "already chosen", and a
 * GENERATED close-up handed back as a constraint keeps every regenerate inside the scene it is meant to replace
 * (measured live 2026-10-02: "rims 21 don't ride no minors" came back as a macro of a rim in both readings, because
 * the card it was replacing was a "50mm macro, slight push-in" close-up).
 */
export function shotContext(
  spec: Pick<ShotSpec, "timeline" | "framing" | "cameraMotion" | "origin">,
  section: string | null,
) {
  const base = { start: spec.timeline.start, end: spec.timeline.end, section };
  if (spec.origin !== "override") return base;
  return {
    ...base,
    framing: spec.framing,
    cameraMotion: spec.cameraMotion.description || spec.cameraMotion.type,
  };
}

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
        mode: input.mode ?? modeForSpec(input.spec),
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
        shot: shotContext(input.spec, input.section ?? lines[0]?.section ?? null),
        heroDescription: input.heroDescription,
        environment: input.environment,
        style: input.style ?? undefined,
        lockedRules: [...standingRules(input.spec), ...(input.lockedRules ?? [])],
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
