import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ProjectAsset, Shot, StoryboardNode } from "@/integrations/supabase/aliases";
import type { TimelineItem } from "@/lib/timeline/types";
import { buildSeedTimelineRows } from "@/lib/timeline/seedTimeline";
import { timelineManifestsKeys } from "./timelineManifests";

export const timelineItemsKeys = {
  all: ["timeline_items"] as const,
  forManifest: (manifestId: string) =>
    [...timelineItemsKeys.all, "manifest", manifestId] as const,
};

export function useTimelineItems(manifestId: string | undefined) {
  return useQuery<TimelineItem[]>({
    queryKey: manifestId
      ? timelineItemsKeys.forManifest(manifestId)
      : [...timelineItemsKeys.all, "_none_"],
    queryFn: async () => {
      if (!manifestId) return [];
      const { data, error } = await (supabase as any)
        .from("timeline_items")
        .select("*")
        .eq("manifest_id", manifestId)
        .order("track", { ascending: true })
        .order("item_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TimelineItem[];
    },
    enabled: !!manifestId,
  });
}

export function useSeedTimelineItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      manifestId: string;
      projectId: string;
      frameRate: number;
      nodes: StoryboardNode[];
      shots: Shot[];
      assets: ProjectAsset[];
    }): Promise<TimelineItem[]> => {
      const rows = buildSeedTimelineRows({
        manifestId: input.manifestId,
        frameRate: input.frameRate,
        nodes: input.nodes,
        shots: input.shots,
        assets: input.assets,
      });

      const { data: existing } = await (supabase as any)
        .from("timeline_items")
        .select("id")
        .eq("manifest_id", input.manifestId)
        .limit(1);

      if (existing?.length) {
        throw new Error("Timeline already has items — clear before re-seeding");
      }

      const { data, error } = await (supabase as any)
        .from("timeline_items")
        .insert(rows)
        .select("*");
      if (error) throw error;
      return (data ?? []) as TimelineItem[];
    },
    onSuccess: (_rows, vars) => {
      qc.invalidateQueries({
        queryKey: timelineItemsKeys.forManifest(vars.manifestId),
      });
      qc.invalidateQueries({
        queryKey: timelineManifestsKeys.forProject(vars.projectId),
      });
    },
  });
}

export function useUpdateTimelineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      manifestId: string;
      patch: Partial<
        Pick<
          TimelineItem,
          | "track"
          | "item_order"
          | "start_frame"
          | "end_frame"
          | "trim_in_frame"
          | "trim_out_frame"
          | "song_section"
          | "cut_type"
          | "transition_in_json"
          | "transition_out_json"
          | "speed"
          | "color_profile_id"
          | "vfx_profile_id"
          | "text_overlays_json"
          | "approved"
          | "notes"
          | "asset_id"
        >
      >;
    }): Promise<TimelineItem> => {
      const { data, error } = await (supabase as any)
        .from("timeline_items")
        .update(input.patch)
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as TimelineItem;
    },
    onSuccess: (row, vars) => {
      qc.invalidateQueries({
        queryKey: timelineItemsKeys.forManifest(vars.manifestId),
      });
    },
  });
}

export function useResetTimelineItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { manifestId: string }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("timeline_items")
        .delete()
        .eq("manifest_id", input.manifestId);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({
        queryKey: timelineItemsKeys.forManifest(vars.manifestId),
      });
    },
  });
}

export function useReorderTimelineItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      manifestId: string;
      orderedIds: string[];
    }): Promise<void> => {
      // Atomic batch — single request, all-or-nothing instead of N round-trips.
      const updates = input.orderedIds.map((id, i) => ({
        id,
        manifest_id: input.manifestId,
        item_order: i,
      }));
      if (updates.length === 0) return;
      const { error } = await (supabase as any)
        .from("timeline_items")
        .upsert(updates, { onConflict: "id", defaultToNull: false });
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({
        queryKey: timelineItemsKeys.forManifest(vars.manifestId),
      });
    },
  });
}
