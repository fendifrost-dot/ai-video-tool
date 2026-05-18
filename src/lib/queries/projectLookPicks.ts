import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { type Look, looksKeys } from "./looks";

// ---------------------------------------------------------------------------
// Project-level pinning of looks (mirror of project_location_picks).
// ---------------------------------------------------------------------------

export const projectLookPicksKeys = {
  all: ["projectLookPicks"] as const,
  forProject: (projectId: string) =>
    [...projectLookPicksKeys.all, "project", projectId] as const,
};

export function useProjectLookPicks(projectId: string | undefined) {
  return useQuery<Look[]>({
    queryKey: projectId
      ? projectLookPicksKeys.forProject(projectId)
      : [...projectLookPicksKeys.all, "_none_"],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from("project_look_picks")
        .select("look_id, picked_at, artist_looks ( * )")
        .eq("project_id", projectId)
        .order("picked_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<{ artist_looks: Look | null }>)
        .map((r) => r.artist_looks)
        .filter((l): l is Look => !!l);
    },
    enabled: !!projectId,
  });
}

export function usePinLook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      lookId,
    }: {
      projectId: string;
      lookId: string;
    }): Promise<void> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase as any)
        .from("project_look_picks")
        .insert({ project_id: projectId, look_id: lookId, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: projectLookPicksKeys.forProject(vars.projectId) });
    },
  });
}

export function useUnpinLook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      lookId,
    }: {
      projectId: string;
      lookId: string;
    }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("project_look_picks")
        .delete()
        .eq("project_id", projectId)
        .eq("look_id", lookId);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: projectLookPicksKeys.forProject(vars.projectId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Helper — invalidate looks cache when picks change (sometimes useful from
// the shot integration page)
// ---------------------------------------------------------------------------
export function useInvalidateLooksForProject() {
  const qc = useQueryClient();
  return (projectId: string, artistId?: string) => {
    qc.invalidateQueries({ queryKey: projectLookPicksKeys.forProject(projectId) });
    if (artistId) {
      qc.invalidateQueries({ queryKey: looksKeys.forArtist(artistId) });
    }
  };
}
