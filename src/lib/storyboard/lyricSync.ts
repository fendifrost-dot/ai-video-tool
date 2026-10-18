/**
 * Lining a performance up to the lyrics by hand — the arithmetic behind the "Lyric sync" panel (Fendi, 17 Oct 2026:
 * "create a function to slice and move performance shots to line up to actual lyrics manually inside the tool").
 *
 * WHAT A HAND ALIGNMENT IS
 *   A SLIP on this variation's own row (footageEdit.ts): the take plays s seconds later on this shot than its sync
 *   puts it. The director finds the frame where he starts a line, says "this frame is that line", and the slip that
 *   puts that frame on the line's first word is `slipToLine`. The sync is never written; the in-point is derived.
 *
 * WHAT IT IS CHECKED AGAINST
 *   A shot is short only when it cuts through a WORD (the line carries word timings) or the source file runs out
 *   inside the shot. Cutting between words, or into a line that has no word timings, is a cut, not a short shot.
 *   A line longer than FIT_LINE_CAP with no words is a held note / aligner bridge and is not this shot's window.
 *   A line shorter than a frame is ignored. When the shot names a section, a line from another section is not its.
 *
 *   ok            the clip covers the shot, and no word is cut in half
 *   extend_shot   a word is cut, and the clip has the footage to hold that word
 *   needs_clip    the clip runs out inside the shot, or it cannot cover a word the shot cuts
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
/**
 * A sung line the shot is asked to hold whole. Longer than this, with no word timings, is a bridge across a held
 * note (the 10 s display cap still lets those through) and is not a window the shot must cover.
 */
export const FIT_LINE_CAP = 4;
/** Shorter than this is an aligner stub, not a line. */
export const MIN_LINE_SECONDS = 0.05;

export type FitLine = Pick<LyricLine, "lineIndex" | "text" | "start" | "end"> & {
  section?: string;
  words?: readonly { start: number; end: number; w?: string }[];
};

const normSection = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
const spanOverlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0);

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The lines a shot carries, in song order. A bridge, a stub, and another section's line are left out. */
export function linesOfShot(
  lines: readonly FitLine[],
  shot: { start: number; end: number; section?: string | null },
): FitLine[] {
  const section = shot.section?.trim() ? normSection(shot.section) : "";
  return lines
    .filter((l) => {
      const dur = l.end - l.start;
      if (!(dur >= MIN_LINE_SECONDS) || dur > MAX_LINE_SECONDS) return false;
      if (section && l.section && normSection(l.section) !== section) return false;
      if (dur > FIT_LINE_CAP) {
        return (l.words ?? []).some(
          (w) =>
            w.end - w.start >= MIN_LINE_SECONDS &&
            spanOverlap(w.start, w.end, shot.start, shot.end) > LINE_TOUCH,
        );
      }
      return spanOverlap(l.start, l.end, shot.start, shot.end) > LINE_TOUCH;
    })
    .sort((a, b) => a.start - b.start);
}

/** Words of those lines that the shot actually sings, when the line carries timings. */
export function wordsOfShot(
  lines: readonly FitLine[],
  shot: { start: number; end: number },
): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  for (const line of lines) {
    for (const w of line.words ?? []) {
      if (w.end - w.start < MIN_LINE_SECONDS) continue;
      if (spanOverlap(w.start, w.end, shot.start, shot.end) <= LINE_TOUCH) continue;
      out.push({ start: w.start, end: w.end, text: w.w ?? "" });
    }
  }
  return out.sort((a, b) => a.start - b.start);
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
  lines: FitLine[];
  /** Span of the words the shot sings, or of the short lines it carries when there are no word timings. */
  lyricWindow: { start: number; end: number } | null;
  /** Seconds of a cut word before the shot starts / after it ends. Zero when the cut is between words. */
  shotShortHead: number;
  shotShortTail: number;
  /** Seconds of the shot (and of a cut word) that the clip has no footage for. */
  clipShortHead: number;
  clipShortTail: number;
  /** One sentence for the director. */
  message: string;
};

function cutWord(
  words: readonly { start: number; end: number; text: string }[],
  edge: number,
): { start: number; end: number; text: string } | null {
  return words.find((w) => edge > w.start + FIT_SLACK && edge < w.end - FIT_SLACK) ?? null;
}

/**
 * Whether a shot holds its lines, and whether its clip can. `footage` is where the clip sits on the song
 * (footageOnSong); null when the shot shows no video.
 */
export function lyricFit(input: {
  shot: { start: number; end: number; section?: string | null };
  lines: readonly FitLine[];
  footage: { start: number; end: number } | null;
}): LyricFit {
  const { shot, footage } = input;
  const lines = linesOfShot(input.lines, shot);
  const words = wordsOfShot(lines, shot);
  const wordWindow = words.length
    ? { start: Math.min(...words.map((w) => w.start)), end: Math.max(...words.map((w) => w.end)) }
    : null;
  const lw = wordWindow ?? lyricWindowOf(lines.filter((l) => l.end - l.start <= FIT_LINE_CAP));
  const headWord = words.length ? cutWord(words, shot.start) : null;
  const tailWord = words.length ? cutWord(words, shot.end) : null;
  const shotShortHead = headWord ? r3(shot.start - headWord.start) : 0;
  const shotShortTail = tailWord ? r3(tailWord.end - shot.end) : 0;
  const need = {
    start: headWord ? headWord.start : shot.start,
    end: tailWord ? tailWord.end : shot.end,
  };
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
  if (!lines.length) return { ...base, status: "no_lyrics", message: "no lyric line in this shot" };
  if (shotShortHead <= FIT_SLACK && shotShortTail <= FIT_SLACK)
    return {
      ...base,
      status: "ok",
      message: `holds its ${lines.length === 1 ? "line" : `${lines.length} lines`}`,
    };
  const cut = [
    headWord && shotShortHead > FIT_SLACK
      ? `cuts ${shotShortHead.toFixed(2)} s into the word “${headWord.text || lines[0].text}”`
      : null,
    tailWord && shotShortTail > FIT_SLACK
      ? `cuts off ${shotShortTail.toFixed(2)} s of the word “${tailWord.text || lines[lines.length - 1].text}”`
      : null,
  ]
    .filter(Boolean)
    .join(" and ");
  if (clipShortHead <= FIT_SLACK && clipShortTail <= FIT_SLACK)
    return {
      ...base,
      status: "extend_shot",
      message: `cuts a word in half: it ${cut} — the clip has the footage to hold the word`,
    };
  return {
    ...base,
    status: "needs_clip",
    message: `cuts a word in half: it ${cut} — and the clip has no footage for ${[
      clipShortHead > FIT_SLACK ? `${clipShortHead.toFixed(2)} s at the head` : null,
      clipShortTail > FIT_SLACK ? `${clipShortTail.toFixed(2)} s at the tail` : null,
    ]
      .filter(Boolean)
      .join(" or ")}: a new clip`,
  };
}
