/**
 * The one clock a project's timed events are read against — its lyric timing, its beat map and its lighting states —
 * for every page that reads them (the storyboard, Review, Export). Built by `eventClock`, here and nowhere else.
 */
import { useMemo } from "react";
import { eventClock, type EventClock } from "@/lib/storyboard/events";
import { useContinuityEntities } from "./continuity";
import { useLyricLines } from "./lyricLines";
import { useSongAnalysis } from "./songAnalyses";

export function useEventClock(projectId: string): EventClock {
  const lyricLines = useLyricLines(projectId).data;
  const analysis = useSongAnalysis(projectId).data ?? null;
  const entities = useContinuityEntities(projectId).data;
  return useMemo(() => eventClock(lyricLines, analysis?.beat_map_json as { t: number }[] | null | undefined, entities), [lyricLines, analysis, entities]);
}
