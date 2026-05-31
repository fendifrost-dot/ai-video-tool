import type { TimelineItem } from "@/lib/timeline/types";

/**
 * Future: NL commands ("make the hook faster") → filtered timeline_items mutations.
 * Operates on song_section + beat index from song_analyses. Not implemented in v1.
 */
export interface NlTimelineCommandLayer {
  planCommand(
    utterance: string,
    items: TimelineItem[],
  ): Promise<{ itemIds: string[]; patch: Partial<TimelineItem> }>;
}
