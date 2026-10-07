/**
 * Video variations — the different videos of one song inside one project (migration 20261007120000).
 *
 * A project is the song: audio, lyrics, the footage filmed for it, every asset made for it. A variation is one video
 * of it: its treatment (with its own revision history), its creative direction (mood, visual direction, notes), its
 * storyboard, the footage put on its shots, its continuity entities, its timeline. One is active
 * (video_projects.active_variation_id); every read of the storyboard, the treatment and the entities goes through
 * it, and a generation job records the one it was submitted against.
 *
 * Revision history (treatment_versions) and variations are different things: a revision is a change within a
 * direction; a variation is a different video.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { projectsKeys, useProject } from "./projects";

export type VideoVariation = Tables<"video_variations">;

export const variationsKeys = {
  all: ["video_variations"] as const,
  forProject: (projectId: string) => [...variationsKeys.all, "project", projectId] as const,
};

/** The creative-direction fields a variation holds (they used to be columns of the project). */
export const DIRECTION_FIELDS = ["treatment_json", "mood", "visual_style", "notes"] as const;
export type DirectionField = (typeof DIRECTION_FIELDS)[number];

export async function fetchVariations(projectId: string): Promise<VideoVariation[]> {
  const { data, error } = await supabase
    .from("video_variations")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Every variation of the project, oldest first, the archived ones included (the caller decides what to show). */
export function useVariations(projectId: string | undefined) {
  return useQuery<VideoVariation[]>({
    queryKey: variationsKeys.forProject(projectId ?? "_none_"),
    queryFn: () => fetchVariations(projectId!),
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

/**
 * The active variation of a project, read with the project row. A project made before variations existed and
 * never opened since has none on record: the migration gave every project one, so this is only ever null while the
 * project itself is still loading or does not exist.
 */
export async function fetchActiveVariation(projectId: string): Promise<VideoVariation | null> {
  const { data: p, error } = await supabase.from("video_projects").select("active_variation_id").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!p?.active_variation_id) return null;
  const { data, error: vErr } = await supabase.from("video_variations").select("*").eq("id", p.active_variation_id).maybeSingle();
  if (vErr) throw vErr;
  return data ?? null;
}

/** The id of the project's active variation (null only while the project does not exist). */
export async function activeVariationIdOf(projectId: string): Promise<string | null> {
  const { data, error } = await supabase.from("video_projects").select("active_variation_id").eq("id", projectId).maybeSingle();
  if (error) throw error;
  return data?.active_variation_id ?? null;
}

/**
 * Write direction fields to ONE variation: the one named, else the project's active one. Every writer of the
 * treatment, the notes, the mood or the visual direction goes through here, so a write made for a variation lands
 * on that variation even if the user has switched since (a long storyboard write, a review that came back late).
 */
export async function writeDirection(projectId: string, patch: Pick<TablesUpdate<"video_variations">, DirectionField>, variationId?: string | null): Promise<void> {
  const id = variationId ?? (await activeVariationIdOf(projectId));
  if (!id) throw new Error("this project has no video variation to write to");
  const { error } = await supabase.from("video_variations").update(patch).eq("id", id);
  if (error) throw error;
}

/** The direction of one variation (treatment_json, mood, visual_style, notes), or the active one's. */
export async function readDirection(projectId: string, variationId?: string | null): Promise<Pick<VideoVariation, DirectionField> | null> {
  const id = variationId ?? (await activeVariationIdOf(projectId));
  if (!id) return null;
  const { data, error } = await supabase.from("video_variations").select("treatment_json, mood, visual_style, notes").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

function invalidateVariation(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  void qc.invalidateQueries({ queryKey: variationsKeys.forProject(projectId) });
  // the project row carries the active variation's direction (projects.ts useProject): it changes with it
  void qc.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
}

/** Change the direction (treatment, mood, visual direction, notes) or the name of one variation. */
export async function updateVariation(id: string, patch: TablesUpdate<"video_variations">): Promise<VideoVariation> {
  const { data, error } = await supabase.from("video_variations").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export function useUpdateVariation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"video_variations"> }) => updateVariation(id, patch),
    onSuccess: () => invalidateVariation(qc, projectId),
  });
}

/** Make one variation the one the app works in. Everything the project's pages show follows it. */
export async function setActiveVariation(projectId: string, variationId: string): Promise<void> {
  const { error } = await supabase.from("video_projects").update({ active_variation_id: variationId }).eq("id", projectId);
  if (error) throw error;
}

export function useSetActiveVariation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variationId: string) => setActiveVariation(projectId, variationId),
    onSuccess: () => {
      invalidateVariation(qc, projectId);
      // every per-variation read is keyed by the variation and refetches on its own; the project-wide ones that
      // hold rows of several variations (jobs, assets) are refreshed so their filters re-apply
      void qc.invalidateQueries({ queryKey: ["provider_jobs"] });
    },
  });
}

/**
 * A new variation: a new creative direction over the project's shared assets. It starts with an empty board and no
 * entities; the song, the footage, the syncs and every asset are the project's and are there from the first moment.
 * `treatmentText` may seed its treatment (the director's own words, mode "manual"); the Setup confirmation of the
 * footage is carried over from the active variation, because the footage did not change.
 */
export async function createVariation(input: {
  projectId: string;
  name: string;
  treatmentText?: string;
  mood?: string | null;
  visualStyle?: string | null;
  notes?: string | null;
  footageConfirmedAt?: string | null;
  makeActive?: boolean;
}): Promise<VideoVariation> {
  const at = new Date().toISOString();
  const text = (input.treatmentText ?? "").trim();
  const treatment_json = {
    ...(text ? { treatment: { text, mode: "manual", updated_at: at, model: null, notes: "", storyboard: null, change: "edit", change_at: at }, text, concept: text, narrative: "" } : {}),
    ...(input.footageConfirmedAt ? { setup: { footage_confirmed_at: input.footageConfirmedAt } } : {}),
  };
  const { data, error } = await supabase
    .from("video_variations")
    .insert({ project_id: input.projectId, name: input.name.trim() || "Untitled variation", treatment_json, mood: input.mood ?? null, visual_style: input.visualStyle ?? null, notes: input.notes ?? null })
    .select("*")
    .single();
  if (error) throw error;
  if (input.makeActive ?? true) await setActiveVariation(input.projectId, data.id);
  return data;
}

export function useCreateVariation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof createVariation>[0], "projectId">) => createVariation({ ...input, projectId }),
    onSuccess: () => {
      invalidateVariation(qc, projectId);
      void qc.invalidateQueries({ queryKey: ["provider_jobs"] });
    },
  });
}

/**
 * A duplicate: the direction and its current work — shots, edits, locks, entities, the footage on each shot — copied
 * as a new variation to be edited on its own. Files are not copied (assets are the project's). History is not copied:
 * the duplicate starts its own. The database does the copy in one transaction (duplicate_variation).
 */
export async function duplicateVariation(projectId: string, sourceId: string, name: string, makeActive = true): Promise<string> {
  const { data, error } = await supabase.rpc("duplicate_variation", { p_source: sourceId, p_name: name.trim() || "Copy" });
  if (error) throw error;
  const id = data as unknown as string;
  if (makeActive) await setActiveVariation(projectId, id);
  return id;
}

export function useDuplicateVariation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, name, makeActive }: { sourceId: string; name: string; makeActive?: boolean }) => duplicateVariation(projectId, sourceId, name, makeActive),
    onSuccess: () => {
      invalidateVariation(qc, projectId);
      void qc.invalidateQueries({ queryKey: ["provider_jobs"] });
    },
  });
}

/** The active variation's row, from the project's list (null while loading, or when the project has none). */
export function useActiveVariation(projectId: string | undefined): VideoVariation | null {
  const project = useProject(projectId);
  const list = useVariations(projectId);
  const id = project.data?.active_variation_id ?? null;
  return id ? (list.data ?? []).find((v) => v.id === id) ?? null : null;
}

/** A name the list shows: the variation's own, with its place in the project when it is the active one. */
export function variationLabel(v: Pick<VideoVariation, "name" | "archived">): string {
  return v.archived ? `${v.name} (archived)` : v.name;
}
