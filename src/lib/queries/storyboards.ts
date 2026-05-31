import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Storyboard, StoryboardNode } from "@/integrations/supabase/aliases";

export const storyboardsKeys = {
  all: ["storyboards"] as const,
  forProject: (projectId: string) => [...storyboardsKeys.all, "project", projectId] as const,
};

export function useProjectStoryboard(projectId: string | undefined) {
  return useQuery<{ storyboard: Storyboard | null; nodes: StoryboardNode[] }>({
    queryKey: projectId
      ? storyboardsKeys.forProject(projectId)
      : [...storyboardsKeys.all, "_none_"],
    queryFn: async () => {
      if (!projectId) return { storyboard: null, nodes: [] };
      const { data: sb, error: sbErr } = await supabase
        .from("storyboards")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (sbErr) throw sbErr;
      if (!sb) return { storyboard: null, nodes: [] };

      const { data: nodes, error: nodesErr } = await supabase
        .from("storyboard_nodes")
        .select("*")
        .eq("storyboard_id", sb.id)
        .order("node_order", { ascending: true });
      if (nodesErr) throw nodesErr;
      return { storyboard: sb, nodes: nodes ?? [] };
    },
    enabled: !!projectId,
  });
}
