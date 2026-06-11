import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TimelineEventRow } from "@/lib/timeline/engine";

export const timelineEventsKeys = {
  all: ["timeline_events"] as const,
  forManifest: (manifestId: string) =>
    [...timelineEventsKeys.all, "manifest", manifestId] as const,
};

export function useTimelineEvents(manifestId: string | undefined, limit = 50) {
  return useQuery<TimelineEventRow[]>({
    queryKey: manifestId
      ? [...timelineEventsKeys.forManifest(manifestId), limit]
      : [...timelineEventsKeys.all, "_none_"],
    queryFn: async () => {
      if (!manifestId) return [];
      const { data, error } = await (supabase as any)
        .from("timeline_events")
        .select("*")
        .eq("manifest_id", manifestId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as TimelineEventRow[];
    },
    enabled: !!manifestId,
  });
}
