import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Shot } from "@/integrations/supabase/types";

export const shotsKeys = {
  all: ["shots"] as const,
  forProject: (projectId: string) => [...shotsKeys.all, "project", projectId] as const,
  detail: (id: string) => [...shotsKeys.all, "detail", id] as const,
};

/**
 * All shots for a project, ordered by shot_number ascending.
 * Full shot CRUD lands in task #9 — this minimal hook unblocks the Prompt
 * Builder (which needs a shot dropdown).
 */
export function useProjectShots(projectId: string | undefined) {
  return useQuery<Shot[]>({
    queryKey: projectId ? shotsKeys.forProject(projectId) : [...shotsKeys.all, "project", "_none_"],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("shots")
        .select("*")
        .eq("project_id", projectId)
        .order("shot_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useShot(id: string | undefined) {
  return useQuery<Shot | null>({
    queryKey: id ? shotsKeys.detail(id) : [...shotsKeys.all, "detail", "_none_"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("shots")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!id,
  });
}
