import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { type Look, looksKeys } from "./looks";
import { shotsKeys } from "./shots";

// ---------------------------------------------------------------------------
// Phase 2 shot ↔ look integration
// ---------------------------------------------------------------------------
// The `shots.locked_look_id` column was added in the Phase 2 migration but
// isn't on the generated Database type yet. These hooks live in their own
// file with `as any` casts at the seam so we don't pollute the rest of the
// shots query layer until Lovable regenerates the types.

export const shotLockedLookKeys = {
  all: ["shotLockedLook"] as const,
  forShot: (shotId: string) => [...shotLockedLookKeys.all, "shot", shotId] as const,
};

/**
 * Read the locked_look_id column off a shot row. Returned separately from the
 * Shot itself because the type isn't extended yet.
 */
export function useShotLockedLookId(shotId: string | undefined) {
  return useQuery<string | null>({
    queryKey: shotId
      ? shotLockedLookKeys.forShot(shotId)
      : [...shotLockedLookKeys.all, "_none_"],
    queryFn: async () => {
      if (!shotId) return null;
      const { data, error } = await (supabase as any)
        .from("shots")
        .select("locked_look_id")
        .eq("id", shotId)
        .maybeSingle();
      if (error) throw error;
      return (data?.locked_look_id ?? null) as string | null;
    },
    enabled: !!shotId,
  });
}

/**
 * Look row resolved for a shot — null when no look is locked.
 */
export function useShotLockedLook(shotId: string | undefined): {
  data: Look | null | undefined;
  isLoading: boolean;
} {
  const idQuery = useShotLockedLookId(shotId);
  const lookQuery = useQuery<Look | null>({
    queryKey: idQuery.data
      ? [...shotLockedLookKeys.forShot(shotId ?? ""), "look", idQuery.data]
      : [...shotLockedLookKeys.all, "_no_look_"],
    queryFn: async () => {
      if (!idQuery.data) return null;
      const { data, error } = await (supabase as any)
        .from("artist_looks")
        .select("*")
        .eq("id", idQuery.data)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Look | null;
    },
    enabled: !!idQuery.data,
  });
  return {
    data: idQuery.data ? lookQuery.data : null,
    isLoading: idQuery.isLoading || lookQuery.isLoading,
  };
}

export function useSetShotLockedLook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shotId,
      lookId,
    }: {
      shotId: string;
      lookId: string | null;
      projectId?: string;
    }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("shots")
        .update({ locked_look_id: lookId })
        .eq("id", shotId);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: shotLockedLookKeys.forShot(vars.shotId) });
      qc.invalidateQueries({ queryKey: shotsKeys.detail(vars.shotId) });
      if (vars.projectId) {
        qc.invalidateQueries({ queryKey: shotsKeys.forProject(vars.projectId) });
      }
      if (vars.lookId) {
        qc.invalidateQueries({ queryKey: looksKeys.detail(vars.lookId) });
      }
    },
  });
}
