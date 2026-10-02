/**
 * Lyrics inside a shot box (plan B2, 2026-10-02).
 *
 * A storyboard box covering 11–15 s shows the lines sung in 11–15 s. This is a pure join of timed lyric lines
 * (`lyric_lines`, produced by scripts/lyrics/align_lyrics.py) with the shot's timeline: any line whose window
 * overlaps the shot's window is shown, with the words that fall inside the window when the line only partly
 * overlaps (so a box that starts mid-line shows "…cost a home" rather than the whole line).
 */

export type LyricWord = { w: string; start: number; end: number; matched?: boolean };

export type LyricLine = {
  lineIndex: number;
  section: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  words: LyricWord[];
};

export type ShotLyric = {
  lineIndex: number;
  section: string;
  /** The words sung inside the shot window (the whole line when it fits). */
  text: string;
  /** True when the line starts before the window (leading ellipsis). */
  cutIn: boolean;
  /** True when the line ends after the window (trailing ellipsis). */
  cutOut: boolean;
  start: number;
  end: number;
  confidence: number;
};

const EPS = 0.05;

/** Lines (and the words of them) sung inside [start, end). */
export function lyricsForShot(
  lines: readonly LyricLine[],
  window: { start: number; end: number },
): ShotLyric[] {
  const out: ShotLyric[] = [];
  for (const line of lines) {
    if (line.end <= window.start + EPS || line.start >= window.end - EPS) continue;
    const cutIn = line.start < window.start - EPS;
    const cutOut = line.end > window.end + EPS;
    let text = line.text;
    if ((cutIn || cutOut) && line.words.length > 0) {
      const inside = line.words.filter(
        (w) => w.end > window.start + EPS && w.start < window.end - EPS,
      );
      if (inside.length > 0) text = inside.map((w) => w.w).join(" ");
    }
    out.push({
      lineIndex: line.lineIndex,
      section: line.section,
      text,
      cutIn,
      cutOut,
      start: Math.max(line.start, window.start),
      end: Math.min(line.end, window.end),
      confidence: line.confidence,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** "instrumental" when a window inside the song's sung span carries no words; null outside any lyric span. */
export function lyricStateForShot(
  lines: readonly LyricLine[],
  window: { start: number; end: number },
): "lyrics" | "instrumental" | "unknown" {
  if (lines.length === 0) return "unknown";
  if (lyricsForShot(lines, window).length > 0) return "lyrics";
  return "instrumental";
}

/** A one-line string for prompts: the lines of a shot joined, ellipses where cut. */
export function lyricsAsText(shotLyrics: readonly ShotLyric[]): string {
  return shotLyrics
    .map((l) => `${l.cutIn ? "…" : ""}${l.text}${l.cutOut ? "…" : ""}`)
    .join(" / ");
}

/** Row of the lyric_lines table → LyricLine. */
export function lyricLineFromRow(row: {
  line_index: number;
  section: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
  confidence: number;
  words_json: unknown;
}): LyricLine {
  const words = Array.isArray(row.words_json)
    ? (row.words_json as LyricWord[]).filter((w) => w && typeof w.w === "string")
    : [];
  return {
    lineIndex: row.line_index,
    section: row.section,
    text: row.text,
    start: row.start_seconds,
    end: row.end_seconds,
    confidence: row.confidence,
    words,
  };
}
