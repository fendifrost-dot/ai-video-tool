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
} from "@/integrations/supabase/types";

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
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery<VideoProject | null>({
    queryKey: id ? projectsKeys.detail(id) : ["video_projects", "detail", "_none_"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("video_projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
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

      const { data, error } = await supabase
        .from("video_projects")
        .insert({ ...payload, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectsKeys.list() });
      qc.setQueryData(projectsKeys.detail(project.id), project);
    },
  });
}

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
      const { data, error } = await supabase
        .from("video_projects")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectsKeys.list() });
      qc.setQueryData(projectsKeys.detail(project.id), project);
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
