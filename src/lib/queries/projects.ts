import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  VideoProject,
  ProjectAsset,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/aliases";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const projectsKeys = {
  all: ["video_projects"] as const,
  list: () => [...projectsKeys.all, "list"] as const,
  detail: (id: string) => [...projectsKeys.all, "detail", id] as const,
  audio: (id: string) => [...projectsKeys.all, "audio", id] as const,
};

// ---------------------------------------------------------------------------
// Song structure helpers
// ---------------------------------------------------------------------------
export type SongSection = {
  name: string;
  start_seconds?: number | null;
  end_seconds?: number | null;
  bars?: number | null;
};

export function parseSongStructure(value: unknown): SongSection[] {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
      .map((v) => ({
        name: typeof v.name === "string" ? v.name : "",
        start_seconds:
          typeof v.start_seconds === "number" ? v.start_seconds : null,
        end_seconds: typeof v.end_seconds === "number" ? v.end_seconds : null,
        bars: typeof v.bars === "number" ? v.bars : null,
      }));
  }
  return [];
}

export const SONG_SECTION_PRESETS = [
  "intro",
  "verse_1",
  "pre_chorus",
  "hook",
  "verse_2",
  "bridge",
  "breakdown",
  "outro",
] as const;

// ---------------------------------------------------------------------------
// List / detail
// ---------------------------------------------------------------------------
export function useProjects() {
  return useQuery<VideoProject[]>({
    queryKey: projectsKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_projects")
        .select("*")
        .neq("status", "archived")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * The creative direction — treatment_json, mood, visual_style, notes — lives on the ACTIVE video variation
 * (video_variations; migration 20261007120000), not on the project row any more. The project row is read with
 * that variation laid over it, so everything that reads `project.treatment_json` reads the active video's, and
 * `project.active_variation_id` says which that is. Writes to those fields go to the variation
 * (queries/variations.ts updateVariation), never to the project row.
 */
export async function fetchProjectWithDirection(id: string): Promise<VideoProject | null> {
  const { data, error } = await supabase.from("video_projects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (!data.active_variation_id) return data;
  const { data: v, error: vErr } = await supabase
    .from("video_variations")
    .select("treatment_json, mood, visual_style, notes")
    .eq("id", data.active_variation_id)
    .maybeSingle();
  if (vErr) throw vErr;
  return v ? { ...data, treatment_json: v.treatment_json, mood: v.mood, visual_style: v.visual_style, notes: v.notes } : data;
}

export function useProject(id: string | undefined) {
  return useQuery<VideoProject | null>({
    queryKey: id ? projectsKeys.detail(id) : ["video_projects", "detail", "_none_"],
    queryFn: async () => (id ? fetchProjectWithDirection(id) : null),
    enabled: !!id,
  });
}

/**
 * The current audio asset for a project (asset_type='audio', most recent).
 */
export function useProjectAudio(projectId: string | undefined) {
  return useQuery<ProjectAsset | null>({
    queryKey: projectId
      ? projectsKeys.audio(projectId)
      : ["video_projects", "audio", "_none_"],
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await supabase
        .from("project_assets")
        .select("*")
        .eq("project_id", projectId)
        .eq("asset_type", "audio")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!projectId,
  });
}

// ---------------------------------------------------------------------------
// Create / update / delete
// ---------------------------------------------------------------------------
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<TablesInsert<"video_projects">, "user_id">,
    ): Promise<VideoProject> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      // the direction goes on the project's first variation, not on the project row
      const { treatment_json, mood, visual_style, notes, ...projectFields } = payload;
      const { data, error } = await supabase
        .from("video_projects")
        .insert({ ...projectFields, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      const { data: v, error: vErr } = await supabase
        .from("video_variations")
        .insert({ project_id: data.id, name: "Original", treatment_json: (treatment_json ?? {}) as never, mood: mood ?? null, visual_style: visual_style ?? null, notes: notes ?? null })
        .select("*")
        .single();
      if (vErr) throw vErr;
      const { error: aErr } = await supabase.from("video_projects").update({ active_variation_id: v.id }).eq("id", data.id);
      if (aErr) throw aErr;
      return { ...data, active_variation_id: v.id, treatment_json: v.treatment_json, mood: v.mood, visual_style: v.visual_style, notes: v.notes };
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectsKeys.list() });
      qc.setQueryData(projectsKeys.detail(project.id), project);
    },
  });
}

/** The fields of a patch that belong to the active variation, split from the ones that belong to the project. */
export function splitDirectionPatch(patch: TablesUpdate<"video_projects">): { direction: TablesUpdate<"video_variations">; project: TablesUpdate<"video_projects"> } {
  const { treatment_json, mood, visual_style, notes, ...project } = patch;
  const direction: TablesUpdate<"video_variations"> = {};
  if (treatment_json !== undefined) direction.treatment_json = treatment_json;
  if (mood !== undefined) direction.mood = mood;
  if (visual_style !== undefined) direction.visual_style = visual_style;
  if (notes !== undefined) direction.notes = notes;
  return { direction, project };
}

/**
 * Patch the project. A direction field in the patch (treatment_json, mood, visual_style, notes) is written to the
 * ACTIVE variation; a caller that means another variation uses queries/variations.ts updateVariation directly.
 */
export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: TablesUpdate<"video_projects">;
    }): Promise<VideoProject> => {
      const { direction, project } = splitDirectionPatch(patch);
      if (Object.keys(project).length) {
        const { error } = await supabase.from("video_projects").update(project).eq("id", id);
        if (error) throw error;
      }
      if (Object.keys(direction).length) {
        const { data: p, error: pErr } = await supabase.from("video_projects").select("active_variation_id").eq("id", id).maybeSingle();
        if (pErr) throw pErr;
        if (!p?.active_variation_id) throw new Error("this project has no active video variation to write the direction to");
        const { error } = await supabase.from("video_variations").update(direction as never).eq("id", p.active_variation_id);
        if (error) throw error;
      }
      const merged = await fetchProjectWithDirection(id);
      if (!merged) throw new Error("project not found");
      return merged;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectsKeys.list() });
      qc.setQueryData(projectsKeys.detail(project.id), project);
      qc.invalidateQueries({ queryKey: ["video_variations", "project", project.id] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("video_projects")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_void, id) => {
      qc.invalidateQueries({ queryKey: projectsKeys.list() });
      qc.removeQueries({ queryKey: projectsKeys.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Audio asset helpers
// ---------------------------------------------------------------------------
export function useSetProjectAudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      filePath,
      metadata,
    }: {
      projectId: string;
      filePath: string;
      metadata?: Record<string, unknown>;
    }): Promise<ProjectAsset> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("project_assets")
        .insert({
          user_id: user.id,
          project_id: projectId,
          asset_type: "audio",
          file_url: filePath,
          source_tool: "manual",
          approval_status: "approved",
          metadata_json: (metadata ?? {}) as never,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: projectsKeys.audio(asset.project_id) });
    },
  });
}
