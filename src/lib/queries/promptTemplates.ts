import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PromptTemplate } from "@/integrations/supabase/types";

export const promptTemplatesKeys = {
  all: ["prompt_templates"] as const,
  list: () => [...promptTemplatesKeys.all, "list"] as const,
};

/**
 * Returns all prompt templates available to the current user.
 * RLS unions: own templates (user_id = auth.uid()) + seeds (user_id IS NULL).
 * Sorted: seeds first, then by name.
 */
export function usePromptTemplates() {
  return useQuery<PromptTemplate[]>({
    queryKey: promptTemplatesKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prompt_templates")
        .select("*")
        .order("is_seed", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
