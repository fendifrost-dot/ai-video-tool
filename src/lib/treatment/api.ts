/**
 * Treatment generator runtime.
 *
 * Calls AVT's proxy-provider-call edge function with endpoint
 * `ai-draft-treatment`. Saves the result into `video_projects.treatment_json`
 * as a structured `{ text, model, generated_at }` envelope so we can render
 * markdown + show provenance.
 */

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
  if (!treatmentText) throw new ProviderCallError("PROVIDER_API_ERROR", "Empty treatment returned.");

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
  environment: string;
  recommended_tool: string;
  lyric_ref: string | null;
  priority: string;
  dependencies: TreatmentDependency[];
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
  };
}

async function callTreatmentEndpoint(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new ProviderCallError("UNAUTHORISED", "Not signed in.");

  const { data, error } = await supabase.functions.invoke<{ ok: boolean } & Record<string, unknown>>(
    "proxy-provider-call",
    { body: { endpoint: "ai-draft-treatment", method: "POST", body } },
  );
  if (error) throw new ProviderCallError("INTERNAL", error.message || "proxy failed");
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

const SHOT_TYPES = new Set(["performance", "b_roll", "narrative", "vfx", "transition", "lyric_visual"]);
const TOOLS = new Set(["runway", "veo", "gemini", "grok", "higgsfield", "pika", "fal", "manual"]);
const PRIORITIES = new Set(["low", "normal", "high", "hero"]);
const DEP_KINDS = new Set(["look_composite", "faceswap_still", "reference_image", "other"]);

export async function draftFullTreatment(
  input: TreatmentContext & { concept: string; grid: GridClip[] },
): Promise<StructuredTreatment> {
  const data = await callTreatmentEndpoint({
    mode: "full_treatment",
    ...contextBody(input),
    concept: input.concept,
    clip_grid: input.grid,
  });

  const t = (data.treatment ?? {}) as Record<string, unknown>;
  const modelClips = new Map<string, Record<string, unknown>>();
  for (const c of (t.clips ?? []) as Array<Record<string, unknown>>) {
    const key = String(c.key ?? "");
    if (key) modelClips.set(key, c);
  }

  // Merge: grid owns timing; model owns creative fields. Missing clips get
  // a safe placeholder rather than dropping timeline coverage.
  const clips: TreatmentClip[] = input.grid.map((g) => {
    const m = modelClips.get(g.key) ?? {};
    const deps = Array.isArray(m.dependencies)
      ? (m.dependencies as Array<Record<string, unknown>>)
          .map((d) => ({
            kind: (DEP_KINDS.has(String(d.kind)) ? String(d.kind) : "other") as TreatmentDependencyKind,
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
      scene_description: String(m.scene_description ?? "").trim() || "(direction missing — regenerate this clip)",
      camera_direction: String(m.camera_direction ?? "").trim(),
      lighting: String(m.lighting ?? "").trim(),
      wardrobe: String(m.wardrobe ?? "").trim(),
      environment: String(m.environment ?? "").trim(),
      recommended_tool: TOOLS.has(tool) ? tool : "manual",
      lyric_ref: m.lyric_ref ? String(m.lyric_ref) : null,
      priority: PRIORITIES.has(priority) ? priority : "normal",
      dependencies: deps,
    };
  });

  const concept = String(t.concept ?? input.concept).trim();
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
