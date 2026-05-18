import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Shot,
  ShotPriority,
  ShotStatus,
  ShotType,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/aliases";

export const shotsKeys = {
  all: ["shots"] as const,
  forProject: (projectId: string) => [...shotsKeys.all, "project", projectId] as const,
  detail: (id: string) => [...shotsKeys.all, "detail", id] as const,
};

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

/**
 * Create a shot. shot_number defaults to (max existing for project) + 1.
 */
export function useCreateShot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<TablesInsert<"shots">, "user_id" | "shot_number"> & {
        shot_number?: number;
      },
    ): Promise<Shot> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      let shotNumber = input.shot_number;
      if (shotNumber == null) {
        const { data: priors, error: priorsErr } = await supabase
          .from("shots")
          .select("shot_number")
          .eq("project_id", input.project_id);
        if (priorsErr) throw priorsErr;
        const maxNum = (priors ?? []).reduce((m, r) => Math.max(m, r.shot_number ?? 0), 0);
        shotNumber = maxNum + 1;
      }

      const { data, error } = await supabase
        .from("shots")
        .insert({ ...input, shot_number: shotNumber, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (shot) => {
      qc.invalidateQueries({ queryKey: shotsKeys.forProject(shot.project_id) });
      qc.setQueryData(shotsKeys.detail(shot.id), shot);
    },
  });
}

export function useUpdateShot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: TablesUpdate<"shots">;
    }): Promise<Shot> => {
      const { data, error } = await supabase
        .from("shots")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (shot) => {
      qc.invalidateQueries({ queryKey: shotsKeys.forProject(shot.project_id) });
      qc.setQueryData(shotsKeys.detail(shot.id), shot);
    },
  });
}

export function useDeleteShot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string;
      projectId: string;
    }): Promise<void> => {
      const { error } = await supabase.from("shots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_void, { id, projectId }) => {
      qc.invalidateQueries({ queryKey: shotsKeys.forProject(projectId) });
      qc.removeQueries({ queryKey: shotsKeys.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------
export const SHOT_TYPE_OPTIONS: { value: ShotType; label: string }[] = [
  { value: "performance", label: "Performance" },
  { value: "b_roll", label: "B-roll" },
  { value: "narrative", label: "Narrative" },
  { value: "vfx", label: "VFX" },
  { value: "transition", label: "Transition" },
  { value: "lyric_visual", label: "Lyric visual" },
];

export const SHOT_PRIORITY_OPTIONS: { value: ShotPriority; label: string }[] = [
  { value: "hero", label: "Hero" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

export const SHOT_STATUS_OPTIONS: { value: ShotStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "generated", label: "Generated" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "needs_regen", label: "Needs regen" },
];

export const SHOT_STATUS_STYLES: Record<ShotStatus, string> = {
  planned: "bg-muted text-muted-foreground",
  generated: "bg-blue-500/15 text-blue-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  rejected: "bg-destructive/15 text-destructive",
  needs_regen: "bg-amber-500/15 text-amber-400",
};
