import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Json,
  Prompt,
  TablesInsert,
} from "@/integrations/supabase/types";
import type { FormattedPrompt } from "@/lib/prompts/types";

export const promptsKeys = {
  all: ["prompts"] as const,
  forProject: (projectId: string) => [...promptsKeys.all, "project", projectId] as const,
  forShot: (shotId: string) => [...promptsKeys.all, "shot", shotId] as const,
  detail: (id: string) => [...promptsKeys.all, "detail", id] as const,
};

/**
 * All prompts saved for a project (most recent first).
 */
export function useProjectPrompts(projectId: string | undefined) {
  return useQuery<Prompt[]>({
    queryKey: projectId
      ? promptsKeys.forProject(projectId)
      : [...promptsKeys.all, "project", "_none_"],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("prompts")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

/**
 * Save a compiled+formatted prompt to the prompts table. The version_number is
 * computed as `max + 1` over prior prompts that share the same shot/template
 * combo, so iterations stack predictably.
 */
export function useSavePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      formatted: FormattedPrompt;
      templateId: string;
      parentPromptId?: string | null;
      notes?: string | null;
    }): Promise<Prompt> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const { formatted, templateId, parentPromptId, notes } = input;

      // Compute version_number: lookup prior prompts with same template+shot.
      let nextVersion = 1;
      {
        const { data: priors, error: priorsErr } = await supabase
          .from("prompts")
          .select("version_number")
          .eq("project_id", formatted.context.projectId)
          .eq("template_id", templateId)
          .eq("provider", formatted.provider);
        if (priorsErr) throw priorsErr;
        if (priors && priors.length > 0) {
          nextVersion = priors.reduce(
            (max, row) => Math.max(max, row.version_number ?? 0),
            0,
          ) + 1;
        }
      }

      const payload: Omit<TablesInsert<"prompts">, "user_id"> = {
        project_id: formatted.context.projectId,
        shot_id: formatted.context.shotId ?? undefined,
        template_id: templateId,
        provider: formatted.provider,
        prompt_text: formatted.promptText,
        negative_prompt: formatted.negativePrompt || null,
        settings_json: formatted.settings as Json,
        version_number: nextVersion,
        parent_prompt_id: parentPromptId ?? null,
        notes: notes ?? null,
      };

      const { data, error } = await supabase
        .from("prompts")
        .insert({ ...payload, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (prompt) => {
      qc.invalidateQueries({ queryKey: promptsKeys.forProject(prompt.project_id) });
      if (prompt.shot_id) {
        qc.invalidateQueries({ queryKey: promptsKeys.forShot(prompt.shot_id) });
      }
    },
  });
}

export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }): Promise<void> => {
      const { error } = await supabase.from("prompts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_void, { projectId }) => {
      qc.invalidateQueries({ queryKey: promptsKeys.forProject(projectId) });
    },
  });
}
