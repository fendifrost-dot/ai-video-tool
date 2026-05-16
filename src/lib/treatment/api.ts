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
