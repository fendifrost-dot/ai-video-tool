/**
 * Lining a performance up to the lyrics by hand — the arithmetic behind the "Lyric sync" panel (Fendi, 17 Oct 2026:
 * "create a function to slice and move performance shots to line up to actual lyrics manually inside the tool").
 *
 * WHAT A HAND ALIGNMENT IS
 *   A SLIP on this variation's own row (footageEdit.ts): the take plays s seconds later on this shot than its sync
 *   puts it. The director finds the frame where he starts a line, says "this frame is that line", and the slip that
 *   puts that frame on the line's first word is `slipToLine`. The sync is never written; the in-point is derived.
 *
 * WHAT IT IS CHECKED AGAINST (Grokbot's ask, 17 Oct 2026)
 *   "Flag any shot that ends up shorter than its lyric window, so we know right away when a shot needs extending
 *   or a new clip." A shot's LYRIC WINDOW is the full span of the lines it carries — a line it cuts into still
 *   counts whole, since a mouth cut mid-line is the thing to catch. `lyricFit` says which of three it is:
 *     ok            the shot holds its lines, and the clip covers the shot
 *     extend_shot   the shot cuts a line, and the clip has the footage to extend it (handles)
 *     needs_clip    the clip runs out — inside the shot, or before the lines end: a longer clip or a new one
 *
 * Pure: no React, no Supabase. Song seconds throughout; one second of take is one second of song (drift is parts per
 * million and is carried by the sync, never here).
 */
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import { MAX_LINE_SECONDS } from "@/lib/lyrics/lyricsForShot";
import { MAX_SLIP_SECONDS } from "./footageEdit";

/** Less than a frame at 24 fps: nothing a viewer sees. */
export const FIT_SLACK = 0.04;
/** A line that touches a shot for less than this is the neighbour's line, not this shot's. */
export const LINE_TOUCH = 0.1;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The lines a shot carries, whole, in song order: every line that overlaps the shot window by more than a touch. */
export function linesOfShot(
  lines: readonly Pick<LyricLine, "lineIndex" | "text" | "start" | "end">[],
  shot: { start: number; end: number },
): Pick<LyricLine, "lineIndex" | "text" | "start" | "end">[] {
  return lines
    .filter((l) => l.end - l.start <= MAX_LINE_SECONDS)
    .filter((l) => Math.min(l.end, shot.end) - Math.max(l.start, shot.start) > LINE_TOUCH)
    .sort((a, b) => a.start - b.start);
}

/** The span of those lines (null when the shot carries none). */
export function lyricWindowOf(
  lines: readonly { start: number; end: number }[],
): { start: number; end: number } | null {
  if (lines.length === 0) return null;
  return {
    start: Math.min(...lines.map((l) => l.start)),
    end: Math.max(...lines.map((l) => l.end)),
  };
}

/**
 * The slip that puts the frame at `takeSeconds` of the take on `songSeconds` of the song, given the project's sync
 * (song = take·(1+ppm/1e6) + offset + slip). Null when that is further than a slip may go.
 */
export function slipToLine(input: {
  sync: { offsetSeconds: number; driftPpm?: number | null };
  takeSeconds: number;
  songSeconds: number;
}): number | null {
  const k = 1 + (input.sync.driftPpm ?? 0) / 1e6;
  const slip = input.songSeconds - input.takeSeconds * k - input.sync.offsetSeconds;
  if (!Number.isFinite(slip) || Math.abs(slip) > MAX_SLIP_SECONDS) return null;
  return Math.round(slip * 1e4) / 1e4;
}

/** Where a clip's footage sits on the song, from what the board plays (BoxMediaItem / TimelineSegment media). */
export function footageOnSong(input: {
  shotStart: number;
  /** In-point inside the file, seconds. */
  sourceIn: number;
  /** Seconds of the shot before the picture starts. */
  leadIn: number;
  /** Length of the file, when known. */
  durationSeconds: number | null;
}): { start: number; end: number } {
  const zero = input.shotStart + input.leadIn - input.sourceIn;
  return {
    start: r3(zero),
    end:
      input.durationSeconds != null && input.durationSeconds > 0
        ? r3(zero + input.durationSeconds)
        : Infinity,
  };
}

export type LyricFitStatus = "ok" | "extend_shot" | "needs_clip" | "no_lyrics" | "no_clip";

export type LyricFit = {
  status: LyricFitStatus;
  lines: Pick<LyricLine, "lineIndex" | "text" | "start" | "end">[];
  /** The span of the lines the shot carries. */
  lyricWindow: { start: number; end: number } | null;
  /** Seconds of the lyric window before the shot starts / after it ends: what the shot cuts off. */
  shotShortHead: number;
  shotShortTail: number;
  /** Seconds of what is needed (the shot and its lyric window) that the clip has no footage for, at each end. */
  clipShortHead: number;
  clipShortTail: number;
  /** One sentence for the director. */
  message: string;
};

/**
 * Whether a shot holds its lines, and whether its clip can. `footage` is where the clip sits on the song
 * (footageOnSong); null when the shot shows no video.
 */
export function lyricFit(input: {
  shot: { start: number; end: number };
  lines: readonly Pick<LyricLine, "lineIndex" | "text" | "start" | "end">[];
  footage: { start: number; end: number } | null;
}): LyricFit {
  const { shot, footage } = input;
  const lines = linesOfShot(input.lines, shot);
  const lw = lyricWindowOf(lines);
  const shotShortHead = lw ? r3(Math.max(0, shot.start - lw.start)) : 0;
  const shotShortTail = lw ? r3(Math.max(0, lw.end - shot.end)) : 0;
  const need = lw
    ? { start: Math.min(shot.start, lw.start), end: Math.max(shot.end, lw.end) }
    : shot;
  const inShot = (f: { start: number; end: number }) => ({
    head: r3(Math.max(0, f.start - shot.start)),
    tail: Number.isFinite(f.end) ? r3(Math.max(0, shot.end - f.end)) : 0,
  });
  const clipShortHead = footage ? r3(Math.max(0, footage.start - need.start)) : 0;
  const clipShortTail =
    footage && Number.isFinite(footage.end) ? r3(Math.max(0, need.end - footage.end)) : 0;
  const base = {
    lines,
    lyricWindow: lw,
    shotShortHead,
    shotShortTail,
    clipShortHead,
    clipShortTail,
  };

  if (!footage) return { ...base, status: "no_clip", message: "no clip on this shot" };
  const gap = inShot(footage);
  if (gap.head > FIT_SLACK || gap.tail > FIT_SLACK)
    return {
      ...base,
      status: "needs_clip",
      message: `the clip runs out inside the shot${gap.head > FIT_SLACK ? ` — starts ${gap.head.toFixed(2)} s late` : ""}${gap.tail > FIT_SLACK ? ` — ends ${gap.tail.toFixed(2)} s early` : ""}: a longer clip, or a new one`,
    };
  if (!lw) return { ...base, status: "no_lyrics", message: "no lyric line in this shot" };
  if (shotShortHead <= FIT_SLACK && shotShortTail <= FIT_SLACK)
    return {
      ...base,
      status: "ok",
      message: `holds its ${lines.length === 1 ? "line" : `${lines.length} lines`}`,
    };
  const cut = [
    shotShortHead > FIT_SLACK
      ? `starts ${shotShortHead.toFixed(2)} s into “${lines[0].text}”`
      : null,
    shotShortTail > FIT_SLACK
      ? `ends ${shotShortTail.toFixed(2)} s before “${lines[lines.length - 1].text}” does`
      : null,
  ]
    .filter(Boolean)
    .join(" and ");
  if (clipShortHead <= FIT_SLACK && clipShortTail <= FIT_SLACK)
    return {
      ...base,
      status: "extend_shot",
      message: `shorter than its lyric window: it ${cut} — the clip has the footage to extend it`,
    };
  return {
    ...base,
    status: "needs_clip",
    message: `shorter than its lyric window: it ${cut} — and the clip has no footage for ${[
      clipShortHead > FIT_SLACK ? `${clipShortHead.toFixed(2)} s at the head` : null,
      clipShortTail > FIT_SLACK ? `${clipShortTail.toFixed(2)} s at the tail` : null,
    ]
      .filter(Boolean)
      .join(" or ")}: a new clip`,
  };
}
