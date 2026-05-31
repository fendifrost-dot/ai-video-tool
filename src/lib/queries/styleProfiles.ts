import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { StyleProfile, StyleProfileKind } from "@/lib/timeline/types";

export const styleProfilesKeys = {
  all: ["style_profiles"] as const,
  forProject: (projectId: string) =>
    [...styleProfilesKeys.all, "project", projectId] as const,
};

export function useStyleProfiles(projectId: string | undefined) {
  return useQuery<StyleProfile[]>({
    queryKey: projectId
      ? styleProfilesKeys.forProject(projectId)
      : [...styleProfilesKeys.all, "_none_"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];

      const { data, error } = await (supabase as any)
        .from("style_profiles")
        .select("*")
        .or(projectId ? `project_id.eq.${projectId},project_id.is.null` : "project_id.is.null")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StyleProfile[];
    },
    enabled: !!projectId,
  });
}

export function useCreateStyleProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      project_id: string | null;
      kind: StyleProfileKind;
      name: string;
      params_json?: Record<string, unknown>;
    }): Promise<StyleProfile> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const { data, error } = await (supabase as any)
        .from("style_profiles")
        .insert({
          user_id: user.id,
          project_id: input.project_id,
          kind: input.kind,
          name: input.name,
          params_json: input.params_json ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as StyleProfile;
    },
    onSuccess: (row) => {
      if (row.project_id) {
        qc.invalidateQueries({
          queryKey: styleProfilesKeys.forProject(row.project_id),
        });
      }
    },
  });
}
