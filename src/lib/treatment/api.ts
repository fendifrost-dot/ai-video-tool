/**
 * Treatment generator runtime.
 *
 * Calls AVT's proxy-provider-call edge function with endpoint
 * `ai-draft-treatment`. Saves the result into `video_projects.treatment_json`
 * as a structured `{ text, model, generated_at }` envelope so we can render
 * markdown + show provenance.
 */

import { eventsFromWritten } from "@/lib/storyboard/writtenBeats";
import type { ShotEvent } from "./shotSpec";
import { functionFailure } from "@/lib/functionsError";
import { supabase } from "@/lib/supabase";
import { ProviderCallError } from "@/lib/providerJobs/api";

export type TreatmentEnvelope = {
  text: string;
  model: string;
  generated_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
};

export type TreatmentDraftInput = {
  projectId: string;
  songTitle?: string | null;
  lyrics?: string | null;
  artistProfile?: string | null;
  visualStyle?: string | null;
  mood?: string | null;
  additionalNotes?: string | null;
};

export async function draftTreatment(input: TreatmentDraftInput): Promise<TreatmentEnvelope> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new ProviderCallError("UNAUTHORISED", "Not signed in.");

  const { data, error } = await supabase.functions.invoke<
    { ok: boolean } & Record<string, unknown>
  >("proxy-provider-call", {
    body: {
      endpoint: "ai-draft-treatment",
      method: "POST",
      body: {
        avt_project_id: input.projectId,
        song_title: input.songTitle ?? null,
        lyrics: input.lyrics ?? null,
        artist_profile: input.artistProfile ?? null,
        visual_style: input.visualStyle ?? null,
        mood: input.mood ?? null,
        additional_notes: input.additionalNotes ?? null,
      },
    },
  });

  if (error) throw new ProviderCallError("INTERNAL", error.message || "proxy failed");
  if (!data || data.ok === false) {
    throw new ProviderCallError(
      String(data?.errorCode ?? "PROVIDER_API_ERROR"),
      String(data?.errorMessage ?? "Treatment draft failed"),
    );
  }

  const treatmentText = String(data.treatmentText ?? "").trim();
  const model = String(data.model ?? "");
  if (!treatmentText)
    throw new ProviderCallError("PROVIDER_API_ERROR", "Empty treatment returned.");

  const envelope: TreatmentEnvelope = {
    text: treatmentText,
    model,
    generated_at: new Date().toISOString(),
    input_tokens: (data.inputTokens as number | null) ?? null,
    output_tokens: (data.outputTokens as number | null) ?? null,
  };

  // Persist to video_projects.treatment_json
  const { error: updateError } = await supabase
    .from("video_projects")
    .update({ treatment_json: envelope as unknown as never })
    .eq("id", input.projectId);
  if (updateError) {
    throw new ProviderCallError("INTERNAL", `Failed to save treatment: ${updateError.message}`);
  }

  return envelope;
}

/** Pull the saved treatment, returning null if the column is empty/not-our-shape. */
export function parseSavedTreatment(value: unknown): TreatmentEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.text !== "string" || v.text.length === 0) return null;
  return {
    text: v.text,
    model: String(v.model ?? ""),
    generated_at: String(v.generated_at ?? ""),
    input_tokens: (v.input_tokens as number | null) ?? null,
    output_tokens: (v.output_tokens as number | null) ?? null,
  };
}

// ============================================================================
// Structured Treatment Builder (v2)
// ============================================================================

import type { GridClip } from "@/lib/treatment/grid";

export type ProjectType = "music_video" | "commercial" | "social";

export type ConceptSuggestion = {
  title: string;
  logline: string;
  visual_world: string;
  why_it_fits: string;
};

export type TreatmentDependencyKind =
  | "look_composite"
  | "faceswap_still"
  | "reference_image"
  | "other";

export type TreatmentDependency = {
  kind: TreatmentDependencyKind;
  look: string | null;
  note: string;
};

export type TreatmentClip = {
  key: string;
  start: number;
  end: number;
  section: string;
  energy: string;
  shot_type: string;
  scene_description: string;
  camera_direction: string;
  lighting: string;
  wardrobe: string;
  /**
   * Where the wardrobe comes from, as the writer said: "treatment" = the treatment dresses him in it for this shot
   * (which the footage may not show), "footage" = what he was filmed in. Absent on a clip written before this was asked.
   */
  wardrobe_from?: "footage" | "treatment" | "";
  environment: string;
  recommended_tool: string;
  lyric_ref: string | null;
  priority: string;
  dependencies: TreatmentDependency[];
  /** Change inside the shot, as the writer wrote it and already read into the shot's own events. Absent = one state. */
  events?: ShotEvent[];
  /** The project's continuity entities the writer pointed this shot at, by key (only keys the project has). */
  continuity?: { location: string | null; props: string[]; lighting: string | null };
};

export type StructuredTreatment = {
  version: 2;
  project_type: ProjectType;
  concept: string;
  narrative: string;
  sections: { name: string; intent: string }[];
  clips: TreatmentClip[];
  model: string;
  generated_at: string;
  /** Readable summary so legacy prose renderers still show something. */
  text: string;
};

export type TreatmentContext = {
  projectId: string;
  projectType: ProjectType;
  songTitle?: string | null;
  lyrics?: string | null;
  artistProfile?: string | null;
  visualStyle?: string | null;
  mood?: string | null;
  additionalNotes?: string | null;
  analysisSummary?: Record<string, unknown> | null;
  looks?: { name: string; description?: string | null }[];
  /** The project has real performance footage in sync with the song: the artist is that footage, not a drawn one. */
  hasPerformanceFootage?: boolean;
  /** The project's continuity entities — what a shot may point at by key instead of describing again. */
  entities?: { key: string; kind: "location" | "prop" | "lighting" | "character"; name: string; description?: string | null }[];
};

function contextBody(input: TreatmentContext): Record<string, unknown> {
  return {
    avt_project_id: input.projectId,
    project_type: input.projectType,
    song_title: input.songTitle ?? null,
    lyrics: input.lyrics ?? null,
    artist_profile: input.artistProfile ?? null,
    visual_style: input.visualStyle ?? null,
    mood: input.mood ?? null,
    additional_notes: input.additionalNotes ?? null,
    analysis: input.analysisSummary ?? null,
    looks: (input.looks ?? []).map((l) => ({ name: l.name, description: l.description ?? null })),
    has_performance_footage: input.hasPerformanceFootage === true,
    continuity_entities: (input.entities ?? []).map((e) => ({ key: e.key, kind: e.kind, name: e.name, description: e.description ?? null })),
  };
}

/**
 * The treatment writer: AVT's own edge function (treatment-writer-proxy). It writes the treatment text when asked
 * to, and one scene for every shot of the grid it is handed.
 */
async function callTreatmentWriter(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new ProviderCallError("UNAUTHORISED", "Not signed in.");
  const { data, error } = await supabase.functions.invoke<{ ok: boolean } & Record<string, unknown>>("treatment-writer-proxy", { body });
  if (error) {
    // the reply says why (the writer is not deployed, the model refused, …): say that, not "non-2xx"
    const failure = await functionFailure(error, data);
    throw new ProviderCallError("INTERNAL", `The treatment writer failed${failure.status ? ` (${failure.status})` : ""}: ${failure.reason}`);
  }
  if (!data || data.ok === false) throw new ProviderCallError(String(data?.errorCode ?? "PROVIDER_API_ERROR"), String(data?.errorMessage ?? "The treatment writer returned nothing"));
  return data;
}

async function callTreatmentEndpoint(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new ProviderCallError("UNAUTHORISED", "Not signed in.");

  const { data, error } = await supabase.functions.invoke<
    { ok: boolean } & Record<string, unknown>
  >("proxy-provider-call", { body: { endpoint: "ai-draft-treatment", method: "POST", body } });
  if (error) {
    // the reply says why (the writer is not reachable, the provider refused, …): say that, not "non-2xx"
    const failure = await functionFailure(error, data);
    throw new ProviderCallError("INTERNAL", `The treatment writer could not be reached${failure.status ? ` (${failure.status})` : ""}: ${failure.reason}`);
  }
  if (!data || data.ok === false) {
    throw new ProviderCallError(
      String(data?.errorCode ?? "PROVIDER_API_ERROR"),
      String(data?.errorMessage ?? "Treatment call failed"),
    );
  }
  return data;
}

export async function suggestConcepts(input: TreatmentContext): Promise<ConceptSuggestion[]> {
  const data = await callTreatmentEndpoint({ mode: "suggest_concepts", ...contextBody(input) });
  const raw = (data.concepts ?? []) as Array<Record<string, unknown>>;
  const concepts = raw
    .map((c) => ({
      title: String(c.title ?? "").trim(),
      logline: String(c.logline ?? "").trim(),
      visual_world: String(c.visual_world ?? "").trim(),
      why_it_fits: String(c.why_it_fits ?? "").trim(),
    }))
    .filter((c) => c.title && c.logline);
  if (concepts.length === 0) {
    throw new ProviderCallError("PROVIDER_API_ERROR", "No concepts returned — try again.");
  }
  return concepts;
}

const SHOT_TYPES = new Set([
  "performance",
  "b_roll",
  "narrative",
  "vfx",
  "transition",
  "lyric_visual",
]);
const TOOLS = new Set(["runway", "veo", "gemini", "grok", "higgsfield", "pika", "fal", "manual"]);
const PRIORITIES = new Set(["low", "normal", "high", "hero"]);
const DEP_KINDS = new Set(["look_composite", "faceswap_still", "reference_image", "other"]);

/**
 * Ask the treatment model for a clip-by-clip plan over a given grid and return it WITHOUT saving anything. The grid
 * owns timing and keys: handed the storyboard's own boxes it writes for exactly those boxes, so the result maps onto
 * the permanent records one to one (src/lib/storyboard/build.ts decides which records it may rewrite).
 */
export async function draftTreatmentClips(
  input: TreatmentContext & {
    concept: string;
    grid: GridClip[];
    /** true = the writer writes the treatment text too; false = `concept` is the director's text, kept as written. */
    writeText?: boolean;
    /** The words sung inside each shot, by its key — so each scene answers its own words. */
    clipLyrics?: Readonly<Record<string, string>>;
  },
): Promise<StructuredTreatment> {
  const data = await callTreatmentWriter({
    mode: "full_treatment",
    ...contextBody(input),
    concept: input.concept,
    write_text: input.writeText === true,
    clip_grid: input.grid.map((g) => ({ ...g, lyrics: input.clipLyrics?.[g.key] ?? "" })),
  });

  const t = (data.treatment ?? {}) as Record<string, unknown>;
  const modelClips = new Map<string, Record<string, unknown>>();
  for (const c of (t.clips ?? []) as Array<Record<string, unknown>>) {
    const key = String(c.key ?? "");
    if (key) modelClips.set(key, c);
  }

  const known = knownKeys(input.entities);
  // Merge: grid owns timing; model owns creative fields. Missing clips get
  // a safe placeholder rather than dropping timeline coverage.
  const clips: TreatmentClip[] = input.grid.map((g) => {
    const m = modelClips.get(g.key) ?? {};
    const deps = Array.isArray(m.dependencies)
      ? (m.dependencies as Array<Record<string, unknown>>)
          .map((d) => ({
            kind: (DEP_KINDS.has(String(d.kind))
              ? String(d.kind)
              : "other") as TreatmentDependencyKind,
            look: d.look ? String(d.look) : null,
            note: String(d.note ?? "").trim(),
          }))
          .filter((d) => d.note || d.look)
      : [];
    const shotType = String(m.shot_type ?? "");
    const tool = String(m.recommended_tool ?? "");
    const priority = String(m.priority ?? "");
    return {
      key: g.key,
      start: g.start,
      end: g.end,
      section: g.section,
      energy: g.energy,
      shot_type: SHOT_TYPES.has(shotType) ? shotType : "b_roll",
      scene_description:
        String(m.scene_description ?? "").trim() || "(direction missing — regenerate this clip)",
      camera_direction: String(m.camera_direction ?? "").trim(),
      lighting: String(m.lighting ?? "").trim(),
      wardrobe: String(m.wardrobe ?? "").trim(),
      wardrobe_from: m.wardrobe_from === "treatment" || m.wardrobe_from === "footage" ? m.wardrobe_from : "",
      environment: String(m.environment ?? "").trim(),
      recommended_tool: TOOLS.has(tool) ? tool : "manual",
      lyric_ref: m.lyric_ref && String(m.lyric_ref).trim() ? String(m.lyric_ref).trim() : null,
      priority: PRIORITIES.has(priority) ? priority : "normal",
      dependencies: deps,
      events: eventsFromWritten(m.timed_beats, g.end - g.start, input.clipLyrics?.[g.key] ?? "", known.lighting),
      continuity: pointedAt(m.continuity, known),
    };
  });

  const concept = String(t.concept || input.concept).trim();
  const narrative = String(t.narrative ?? "").trim();
  const sections = Array.isArray(t.sections)
    ? (t.sections as Array<Record<string, unknown>>).map((s) => ({
        name: String(s.name ?? "").trim(),
        intent: String(s.intent ?? "").trim(),
      }))
    : [];

  const structured: StructuredTreatment = {
    version: 2,
    project_type: input.projectType,
    concept,
    narrative,
    sections,
    clips,
    model: String(data.model ?? ""),
    generated_at: new Date().toISOString(),
    text: [concept, narrative].filter(Boolean).join("\n\n"),
  };
  return structured;
}

/** The old builder's one-step generate-and-save. Kept for callers that still store a structured treatment whole. */
export async function draftFullTreatment(
  input: TreatmentContext & { concept: string; grid: GridClip[] },
): Promise<StructuredTreatment> {
  const structured = await draftTreatmentClips(input);

  const { error: updateError } = await supabase
    .from("video_projects")
    .update({ treatment_json: structured as unknown as never })
    .eq("id", input.projectId);
  if (updateError) {
    throw new ProviderCallError("INTERNAL", `Failed to save treatment: ${updateError.message}`);
  }

  return structured;
}

export function parseSavedStructuredTreatment(value: unknown): StructuredTreatment | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 2 || !Array.isArray(v.clips) || v.clips.length === 0) return null;
  return v as unknown as StructuredTreatment;
}

// ============================================================================
// Shot Specification bridge (Lane C)
//
// Additive: converts the existing StructuredTreatment clips into generalized
// Shot Specs (docs/ux/SHOT_SPECIFICATION.md) so the treatment builder output can
// be serialized as the machine-executable contract WITHOUT changing the grid
// timing or the StructuredTreatment shape.
// ============================================================================

import {
  parseShotSpec,
  RENDER_ENGINES,
  SHOT_PRIORITIES,
  SHOT_TYPES as SPEC_SHOT_TYPES,
  type RenderEngine,
  type ShotKind,
  type ShotPriorityLiteral,
  type ShotSpec,
  type ShotTypeLiteral,
} from "@/lib/treatment/shotSpec";

type KnownKeys = { location: Set<string>; prop: Set<string>; lighting: Set<string> };

function knownKeys(entities: TreatmentContext["entities"]): KnownKeys {
  const of = (kind: string) => new Set((entities ?? []).filter((e) => e.kind === kind).map((e) => e.key));
  return { location: of("location"), prop: of("prop"), lighting: of("lighting") };
}

/** The entities a written shot points at — only keys the project has, of the right kind. */
export function pointedAt(raw: unknown, known: KnownKeys): { location: string | null; props: string[]; lighting: string | null } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const one = (v: unknown, set: Set<string>) => (typeof v === "string" && set.has(v.trim()) ? v.trim() : null);
  return {
    location: one(r.location, known.location),
    props: Array.isArray(r.props) ? [...new Set(r.props.map((p) => one(p, known.prop)).filter((x): x is string => !!x))] : [],
    lighting: one(r.lighting, known.lighting),
  };
}

function specKindFromShotType(shotType: string): ShotKind {
  if (shotType === "performance") return "performance";
  if (shotType === "b_roll") return "broll";
  return "generated";
}

/**
 * Map a single treatment clip → ShotSpec. Grid owns timing (start/end) and the
 * model owns the creative fields, exactly as in `draftFullTreatment`. Fields the
 * treatment clip doesn't carry (framing, lens, previs, reconstruction, QA) are
 * left as schema defaults for downstream refinement.
 */
export function treatmentClipToShotSpec(
  clip: TreatmentClip,
  provenance?: { model?: string; generatedAt?: string; treatment?: string },
): ShotSpec {
  const shotType: ShotTypeLiteral = SPEC_SHOT_TYPES.includes(clip.shot_type as ShotTypeLiteral)
    ? (clip.shot_type as ShotTypeLiteral)
    : "b_roll";
  const priority: ShotPriorityLiteral = SHOT_PRIORITIES.includes(
    clip.priority as ShotPriorityLiteral,
  )
    ? (clip.priority as ShotPriorityLiteral)
    : "normal";
  const engine: RenderEngine | null = RENDER_ENGINES.includes(clip.recommended_tool as RenderEngine)
    ? (clip.recommended_tool as RenderEngine)
    : null;

  return parseShotSpec({
    id: clip.key,
    purpose: clip.scene_description,
    kind: specKindFromShotType(clip.shot_type),
    shotType,
    priority,
    timeline: { start: clip.start, end: clip.end },
    wardrobe: { description: clip.wardrobe, source: clip.wardrobe_from ?? "" },
    environment: { description: clip.environment },
    lighting: { description: clip.lighting },
    cameraMotion: { description: clip.camera_direction },
    fx: shotType === "vfx" ? [{ type: "vfx", description: clip.scene_description }] : [],
    references: clip.lyric_ref ? [{ kind: "note", note: `lyric: ${clip.lyric_ref}` }] : [],
    events: clip.events ?? [],
    continuity: clip.continuity ?? {},
    generation: {
      required: !!engine && engine !== "manual",
      engine,
    },
    status: "planned",
    provenance: {
      source: "ai",
      createdAt: provenance?.generatedAt ?? "",
      model: provenance?.model ?? null,
      treatment: provenance?.treatment ?? "",
    },
  });
}

/** Convert every clip of a StructuredTreatment into Shot Specs. */
export function structuredTreatmentToShotSpecs(treatment: StructuredTreatment, writtenFrom?: string): ShotSpec[] {
  return treatment.clips.map((c) =>
    treatmentClipToShotSpec(c, { model: treatment.model, generatedAt: treatment.generated_at, treatment: writtenFrom }),
  );
}
