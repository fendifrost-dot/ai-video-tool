/**
 * Lyric warnings for an edit sequence. The definition of "short" is lyricFit — the same one the storyboard uses.
 * A clip's shot on the song is songOffset + its timeline. Montage mouth is warned separately (mediaWarnings).
 */
import type { FitLine } from "@/lib/storyboard/lyricSync";
import { footageOnSong, lyricFit, type LyricFit } from "@/lib/storyboard/lyricSync";
import type { EditSequence } from "../../../supabase/functions/edit-render/model";
import { videoClips } from "../../../supabase/functions/edit-render/model";

export function sequenceLyricWarnings(
  seq: EditSequence,
  lines: readonly FitLine[],
): { clipId: string; shotKey: string | null; fit: LyricFit }[] {
  return videoClips(seq).map((c) => {
    const start = seq.songOffset + c.timelineIn;
    const end = seq.songOffset + c.timelineOut;
    const fit = lyricFit({
      shot: { start, end },
      lines,
      footage:
        c.mediaDuration != null
          ? footageOnSong({
              shotStart: start,
              sourceIn: c.sourceIn,
              leadIn: 0,
              durationSeconds: c.mediaDuration,
            })
          : { start, end },
    });
    return { clipId: c.id, shotKey: c.shotKey, fit };
  });
}
