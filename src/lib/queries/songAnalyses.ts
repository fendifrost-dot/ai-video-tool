import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SongAnalysis, SongAnalysisInsert } from "@/lib/songAnalysis/types";

export const songAnalysesKeys = {
  all: ["song_analyses"] as const,
  forProject: (projectId: string) =>
    [...songAnalysesKeys.all, "project", projectId] as const,
};

export function useSongAnalysis(projectId: string | undefined) {
  return useQuery<SongAnalysis | null>({
    queryKey: projectId
      ? songAnalysesKeys.forProject(projectId)
      : [...songAnalysesKeys.all, "_none_"],
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await (supabase as any)
        .from("song_analyses")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SongAnalysis | null;
    },
    enabled: !!projectId,
  });
}

/**
 * Upsert by project_id. There's a unique constraint on song_analyses.project_id
 * so we use `onConflict: project_id` to overwrite existing rows when the user
 * re-runs analysis.
 */
export function useUpsertSongAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: SongAnalysisInsert,
    ): Promise<SongAnalysis> => {
      const { data, error } = await (supabase as any)
        .from("song_analyses")
        .upsert(payload, { onConflict: "project_id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as SongAnalysis;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({
        queryKey: songAnalysesKeys.forProject(row.project_id),
      });
    },
  });
}
