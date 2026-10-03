/**
 * Setup — the project's source truth, established before anything is generated (Fendi, 2026-10-03).
 *
 * "Before Treatment generation, Setup should establish the project's source truth … song, lyrics, performance
 * footage, uploaded non-AI B-roll, reference/Look assets", and the system confirms the song's length, the lyric
 * timing and each take's sync. This module is the checklist: what is in, what is still missing, and whether the
 * Treatment step may generate. The director is told the state in his own terms; none of the mechanics.
 *
 * Pure module.
 */
import { isOriginalTake, isUsableSync, type MediaAsset, type TakeSync } from "./media";

export type SetupItemState = "done" | "todo" | "working" | "optional";

export type SetupItem = {
  id: "song" | "analysis" | "lyrics" | "lyric_timing" | "performance" | "take_sync" | "broll" | "references" | "confirmed";
  label: string;
  state: SetupItemState;
  detail: string;
  /** A "todo" on a blocking item keeps Treatment generation closed. */
  blocking: boolean;
};

export type SetupStatus = {
  items: SetupItem[];
  /** True when every blocking item is done: Treatment may generate. */
  ready: boolean;
  /** The first thing still in the way, in words. Null when ready. */
  blockedBy: string | null;
  counts: { takes: number; takesSynced: number; broll: number; references: number; lyricLines: number };
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function setupStatus(input: {
  hasSong: boolean;
  songSeconds: number | null;
  analysed: boolean;
  bpm: number | null;
  lyricsText: string | null | undefined;
  lyricLines: number;
  media: readonly Pick<MediaAsset, "id" | "footageRole" | "isVideo" | "isImage" | "assetType" | "sourceTool" | "durationSeconds">[];
  syncs: readonly Pick<TakeSync, "performanceAssetId" | "status">[];
  footageConfirmedAt: string | null;
}): SetupStatus {
  const takes = input.media.filter(isOriginalTake);
  const broll = input.media.filter((m) => m.footageRole === "b_roll");
  const references = input.media.filter((m) => m.footageRole === "reference" || (m.assetType === "reference_image" && (!m.sourceTool || m.sourceTool === "manual")));
  const usable = new Set(input.syncs.filter(isUsableSync).map((s) => s.performanceAssetId));
  const takesSynced = takes.filter((t) => usable.has(t.id)).length;
  const hasLyrics = !!input.lyricsText?.trim();

  const items: SetupItem[] = [
    {
      id: "song",
      label: "Song",
      state: input.hasSong ? "done" : "todo",
      detail: input.hasSong ? (input.songSeconds ? `${mmss(input.songSeconds)} master` : "uploaded") : "Upload the song — every box is timed against it",
      blocking: true,
    },
    {
      id: "analysis",
      label: "Beat and length",
      state: !input.hasSong ? "todo" : input.analysed ? "done" : "todo",
      detail: input.analysed ? (input.bpm ? `${Math.round(input.bpm)} BPM` : "read") : "Run the song analysis — boxes are cut on the beat",
      blocking: true,
    },
    {
      id: "lyrics",
      label: "Lyrics",
      state: hasLyrics ? "done" : "optional",
      detail: hasLyrics ? "added" : "None added — fine for an instrumental",
      blocking: false,
    },
    {
      id: "lyric_timing",
      label: "Lyric timing",
      state: !hasLyrics ? "optional" : input.lyricLines > 0 ? "done" : "todo",
      detail: !hasLyrics ? "Nothing to time" : input.lyricLines > 0 ? `${input.lyricLines} lines on the song clock` : "Not timed yet — press “Time the lyrics to the song” below",
      blocking: hasLyrics,
    },
    {
      id: "performance",
      label: "Performance footage",
      state: takes.length > 0 ? "done" : "optional",
      detail: takes.length > 0 ? `${takes.length} take${takes.length > 1 ? "s" : ""}` : "None — every box will be an insert",
      blocking: false,
    },
    {
      id: "take_sync",
      label: "Takes matched to the song",
      state: takes.length === 0 ? "optional" : takesSynced === takes.length ? "done" : "todo",
      detail:
        takes.length === 0
          ? "Nothing to match"
          : takesSynced === takes.length
            ? `${takesSynced} of ${takes.length} matched`
            : `${takes.length - takesSynced} take${takes.length - takesSynced > 1 ? "s" : ""} not matched yet`,
      blocking: takes.length > 0,
    },
    {
      id: "broll",
      label: "Your B-roll",
      state: broll.length > 0 ? "done" : "optional",
      detail: broll.length > 0 ? `${broll.length} clip${broll.length > 1 ? "s" : ""}` : "None",
      blocking: false,
    },
    {
      id: "references",
      label: "Looks and references",
      state: references.length > 0 ? "done" : "optional",
      detail: references.length > 0 ? `${references.length} file${references.length > 1 ? "s" : ""}` : "None",
      blocking: false,
    },
    {
      id: "confirmed",
      label: "All real footage is in",
      state: input.footageConfirmedAt ? "done" : "todo",
      detail: input.footageConfirmedAt ? "confirmed" : "Confirm once everything you shot is uploaded",
      blocking: true,
    },
  ];
  const firstBlock = items.find((i) => i.blocking && i.state !== "done") ?? null;
  return {
    items,
    ready: !firstBlock,
    blockedBy: firstBlock ? `${firstBlock.label}: ${firstBlock.detail}` : null,
    counts: { takes: takes.length, takesSynced, broll: broll.length, references: references.length, lyricLines: input.lyricLines },
  };
}

/** What the treatment writer is told about the real footage: facts, as a short structured note. */
export function footageSummary(input: {
  takes: { name: string; songStart: number; songEnd: number; shows?: string | null; filmedIn?: string | null }[];
  broll: { name: string; seconds: number | null; shows?: string | null }[];
}): string {
  const lines: string[] = [];
  if (input.takes.length) {
    lines.push(
      "REAL PERFORMANCE FOOTAGE (already shot, in sync with the song): " +
        input.takes
          .map((t) => `${t.name} covers song ${mmss(t.songStart)}–${mmss(t.songEnd)}${t.shows?.trim() ? ` — in it he wears: ${t.shows.trim()}` : ""}${t.filmedIn?.trim() ? ` — it was filmed in: ${t.filmedIn.trim()}` : ""}`)
          .join("; ") +
        ". Performance boxes use this footage: as filmed, or restaged — the same performance re-shot inside the place the box describes. He keeps what he wears in the take; the place it was filmed in is replaced. Write a performance box's scene as the PLACE he performs in, and never dress him in anything else.",
    );
  }
  if (input.broll.length) {
    lines.push(
      "REAL B-ROLL (the director's own footage, available for inserts): " +
        input.broll.map((b) => `${b.name}${b.seconds ? ` (${b.seconds.toFixed(0)} s)` : ""}${b.shows?.trim() ? ` — ${b.shows.trim()}` : ""}`).join("; ") +
        ".",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Timed lyrics pasted by hand (LRC)
// ---------------------------------------------------------------------------

export type TimedLine = { lineIndex: number; text: string; start: number; end: number; section: string };

const LRC_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parse LRC ("[00:12.50] first line") into lines on the song clock. A line ends where the next begins (capped), and
 * the last line ends at the song's end. Lines with several tags (a repeated hook) become one line per tag. Returns
 * the lines in time order and the rows that could not be read.
 */
export function parseLrc(text: string, songSeconds: number | null, maxLineSeconds = 8): { lines: TimedLine[]; skipped: string[] } {
  const found: { start: number; text: string }[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const row = raw.trim();
    if (!row) continue;
    const tags = [...row.matchAll(LRC_TAG)];
    const words = row.replace(LRC_TAG, "").trim();
    if (tags.length === 0) {
      if (!/^\[[a-z]+:.*\]$/i.test(row)) skipped.push(row); // [ar:…] style headers are not lines and not errors
      continue;
    }
    if (!words) continue; // a bare timestamp marks a gap
    for (const m of tags) {
      const frac = m[3] ? Number(`0.${m[3]}`) : 0;
      found.push({ start: Number(m[1]) * 60 + Number(m[2]) + frac, text: words });
    }
  }
  found.sort((a, b) => a.start - b.start);
  const lines = found.map((f, i) => {
    const next = found[i + 1]?.start ?? songSeconds ?? f.start + maxLineSeconds;
    return {
      lineIndex: i,
      text: f.text,
      start: Math.round(f.start * 1000) / 1000,
      end: Math.round(Math.max(f.start + 0.2, Math.min(next, f.start + maxLineSeconds)) * 1000) / 1000,
      section: "verse",
    };
  });
  // a line sung more than once is a hook — the same rule the aligner uses
  const seen = new Map<string, number>();
  for (const l of lines) seen.set(l.text.toLowerCase(), (seen.get(l.text.toLowerCase()) ?? 0) + 1);
  for (const l of lines) if ((seen.get(l.text.toLowerCase()) ?? 0) > 1) l.section = "hook";
  return { lines, skipped };
}
