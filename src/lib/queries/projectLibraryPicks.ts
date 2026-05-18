import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LocationItem } from "./locations";
import type { PropItem } from "./props";

// ---------------------------------------------------------------------------
// Project pinning — pins a subset of the global location / prop libraries to
// a specific project. Backed by thin join tables.
// ---------------------------------------------------------------------------

export const projectLibraryPicksKeys = {
  locations: (projectId: string) => ["project_location_picks", projectId] as const,
  props: (projectId: string) => ["project_prop_picks", projectId] as const,
};

// ----- Locations -----
export function useProjectLocationPicks(projectId: string | undefined) {
  return useQuery<LocationItem[]>({
    queryKey: projectId
      ? projectLibraryPicksKeys.locations(projectId)
      : ["project_location_picks", "_none_"],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from("project_location_picks")
        .select("location_id, pinned_at, location_library(*)")
        .eq("project_id", projectId)
        .order("pinned_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((row) => row.location_library)
        .filter(Boolean) as LocationItem[];
    },
    enabled: !!projectId,
  });
}

export function usePinLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      locationId,
    }: {
      projectId: string;
      locationId: string;
    }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("project_location_picks")
        .upsert({ project_id: projectId, location_id: locationId });
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({
        queryKey: projectLibraryPicksKeys.locations(vars.projectId),
      });
    },
  });
}

export function useUnpinLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      locationId,
    }: {
      projectId: string;
      locationId: string;
    }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("project_location_picks")
        .delete()
        .eq("project_id", projectId)
        .eq("location_id", locationId);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({
        queryKey: projectLibraryPicksKeys.locations(vars.projectId),
      });
    },
  });
}

// ----- Props -----
export function useProjectPropPicks(projectId: string | undefined) {
  return useQuery<PropItem[]>({
    queryKey: projectId
      ? projectLibraryPicksKeys.props(projectId)
      : ["project_prop_picks", "_none_"],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from("project_prop_picks")
        .select("prop_id, pinned_at, prop_library(*)")
        .eq("project_id", projectId)
        .order("pinned_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((row) => row.prop_library)
        .filter(Boolean) as PropItem[];
    },
    enabled: !!projectId,
  });
}

export function usePinProp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      propId,
    }: {
      projectId: string;
      propId: string;
    }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("project_prop_picks")
        .upsert({ project_id: projectId, prop_id: propId });
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({
        queryKey: projectLibraryPicksKeys.props(vars.projectId),
      });
    },
  });
}

export function useUnpinProp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      propId,
    }: {
      projectId: string;
      propId: string;
    }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("project_prop_picks")
        .delete()
        .eq("project_id", projectId)
        .eq("prop_id", propId);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({
        queryKey: projectLibraryPicksKeys.props(vars.projectId),
      });
    },
  });
}
