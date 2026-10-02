import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { lyricLineFromRow, type LyricLine } from "@/lib/lyrics/lyricsForShot";

export const lyricLinesKeys = {
  all: ["lyric_lines"] as const,
  forProject: (projectId: string) => [...lyricLinesKeys.all, "project", projectId] as const,
};

type LyricLineRow = {
  line_index: number;
  section: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
  confidence: number;
  words_json: unknown;
};

/**
 * Timed lyric lines of a project (table `lyric_lines`, migration 20261002020000; filled by
 * scripts/lyrics/align_lyrics.py). Empty until the song has been aligned.
 */
export function useLyricLines(projectId: string | undefined) {
  return useQuery<LyricLine[]>({
    queryKey: projectId ? lyricLinesKeys.forProject(projectId) : [...lyricLinesKeys.all, "project", "_none_"],
    queryFn: async () => {
      if (!projectId) return [];
      // The generated Supabase types are refreshed by the migration; until then the table is addressed by name.
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from("lyric_lines")
        .select("line_index, section, text, start_seconds, end_seconds, confidence, words_json")
        .eq("project_id", projectId)
        .order("line_index", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as LyricLineRow[]).map(lyricLineFromRow);
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}
