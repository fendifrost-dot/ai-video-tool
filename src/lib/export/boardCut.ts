/**
 * The board's own cut, for Premiere: every shot with the clip it shows, WHERE IN THAT CLIP it starts (the source
 * in-point, after any hand slip) and where it sits on the song — so a hand alignment made in the tool lands in the
 * Premiere sequence as it was made (Grokbot, 17 Oct 2026: "save each shot's offset into the source clip, not just its
 * timeline position, so I can export that straight into the Premiere sequence").
 *
 * Two files, from the same rows:
 *   board_cut.edl  CMX3600, record timecode = song time (00:00:00:00 is the song's first sample), so the song laid
 *                  on A1 at 0 lines up with every shot. Premiere: File → Import the EDL, then relink each clip by
 *                  its "FROM CLIP NAME" (the file name of the clip, as downloaded from the board).
 *   board_cut.csv  the same, in seconds and timecode, with each shot's lyric window and its lyric-fit flag.
 *
 * Built from buildTimeline (what Review plays), not from the timeline_items manifest — that manifest never carries a
 * performance take's in-point. Pure: no React, no Supabase.
 */
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import type { MediaAsset, TimelineSegment } from "@/lib/storyboard/media";
import { footageOnSong, lyricFit, type LyricFitStatus } from "@/lib/storyboard/lyricSync";
import { framesToTimecode, secondsToFrames } from "./timecode";

export const BOARD_CUT_FPS = 24;

export type BoardCutRow = {
  index: number;
  key: string;
  shotStart: number;
  shotEnd: number;
  /** null when the shot shows no video (an image, or nothing). */
  clip: { assetId: string; file: string; path: string } | null;
  sourceIn: number | null;
  sourceOut: number | null;
  /** Song seconds the clip's picture starts and ends (start + lead-in, and as far as it plays). */
  recordIn: number | null;
  recordOut: number | null;
  slip: number;
  lyricWindow: { start: number; end: number } | null;
  fit: LyricFitStatus;
  note: string;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fileOf = (a: MediaAsset) => a.path.split("/").pop() || a.name || a.id;

export function boardCutRows(input: {
  timeline: readonly TimelineSegment[];
  assets: ReadonlyMap<string, MediaAsset>;
  lines: readonly LyricLine[];
}): BoardCutRow[] {
  return input.timeline.map((seg) => {
    const shot = { start: seg.start, end: seg.end, section: seg.section };
    const m = seg.media;
    const asset = m.kind === "video" ? (input.assets.get(m.assetId) ?? null) : null;
    if (m.kind !== "video" || !asset) {
      const fit = lyricFit({ shot, lines: input.lines, footage: null });
      return {
        index: seg.index,
        key: seg.key,
        shotStart: seg.start,
        shotEnd: seg.end,
        clip: null,
        sourceIn: null,
        sourceOut: null,
        recordIn: null,
        recordOut: null,
        slip: 0,
        lyricWindow: fit.lyricWindow,
        fit: fit.status,
        note: m.kind === "image" ? "a still, not in the EDL" : fit.message,
      };
    }
    const recordIn = r3(seg.start + m.leadIn);
    const played =
      m.sourceOut != null ? Math.max(0, m.sourceOut - m.sourceIn) : Math.max(0, seg.end - recordIn);
    const fit = lyricFit({
      shot,
      lines: input.lines,
      footage: footageOnSong({
        shotStart: seg.start,
        sourceIn: m.sourceIn,
        leadIn: m.leadIn,
        durationSeconds: asset.durationSeconds,
      }),
    });
    return {
      index: seg.index,
      key: seg.key,
      shotStart: seg.start,
      shotEnd: seg.end,
      clip: { assetId: asset.id, file: fileOf(asset), path: asset.path },
      sourceIn: r3(m.sourceIn),
      sourceOut: r3(m.sourceIn + played),
      recordIn,
      recordOut: r3(recordIn + played),
      slip: m.slip ?? 0,
      lyricWindow: fit.lyricWindow,
      fit: fit.status,
      note: fit.message,
    };
  });
}

/** CMX3600: one video event per shot that shows a clip; source and record lengths equal to the frame. */
export function boardCutEdl(
  rows: readonly BoardCutRow[],
  opts: { title: string; fps?: number },
): string {
  const fps = opts.fps ?? BOARD_CUT_FPS;
  const tc = (s: number) => framesToTimecode(secondsToFrames(s, fps), fps);
  const out = [
    `TITLE: ${opts.title.replace(/[\r\n]+/g, " ").slice(0, 60)}`,
    "FCM: NON-DROP FRAME",
    "",
  ];
  let n = 1;
  for (const r of rows) {
    if (!r.clip || r.sourceIn == null || r.recordIn == null || r.recordOut == null) continue;
    const recInF = secondsToFrames(r.recordIn, fps);
    const recOutF = secondsToFrames(r.recordOut, fps);
    if (recOutF <= recInF) continue;
    const srcInF = secondsToFrames(r.sourceIn, fps);
    const srcOutF = srcInF + (recOutF - recInF);
    out.push(
      `${String(n).padStart(3, "0")}  AX       V     C        ${framesToTimecode(srcInF, fps)} ${framesToTimecode(srcOutF, fps)} ${framesToTimecode(recInF, fps)} ${framesToTimecode(recOutF, fps)}`,
      `* FROM CLIP NAME: ${r.clip.file}`,
      `* SHOT ${r.key} (${r.index}) SONG ${tc(r.shotStart)}-${tc(r.shotEnd)}${r.slip ? ` SLIP ${r.slip > 0 ? "+" : ""}${r.slip.toFixed(3)}S` : ""} LYRIC ${r.fit.toUpperCase()}`,
      "",
    );
    n++;
  }
  return out.join("\n");
}

const csvCell = (v: unknown) => {
  const raw = v == null ? "" : String(v);
  // a text cell a spreadsheet would read as a formula is kept text (a negative number is left a number)
  const s = typeof v === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function boardCutCsv(rows: readonly BoardCutRow[], opts: { fps?: number } = {}): string {
  const fps = opts.fps ?? BOARD_CUT_FPS;
  const tc = (s: number | null) =>
    s == null ? "" : framesToTimecode(secondsToFrames(s, fps), fps);
  const head = [
    "shot",
    "number",
    "song_in",
    "song_out",
    "clip_file",
    "source_in_s",
    "source_out_s",
    "source_in_tc",
    "source_out_tc",
    "record_in_tc",
    "record_out_tc",
    "slip_s",
    "lyric_window",
    "lyric_fit",
    "note",
  ];
  const body = rows.map((r) =>
    [
      r.key,
      r.index,
      r.shotStart,
      r.shotEnd,
      r.clip?.file ?? "",
      r.sourceIn ?? "",
      r.sourceOut ?? "",
      tc(r.sourceIn),
      tc(r.sourceOut),
      tc(r.recordIn),
      tc(r.recordOut),
      r.slip,
      r.lyricWindow ? `${r.lyricWindow.start}-${r.lyricWindow.end}` : "",
      r.fit,
      r.note,
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...body].join("\n") + "\n";
}
