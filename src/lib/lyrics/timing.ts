/**
 * "Time the lyrics to the song" — the app's run of scripts/lyrics/align_lyrics.py.
 *
 * Same procedure as the script's `transcribe()`: the song is heard in fixed 30 s windows 20 s apart (a transcriber
 * given a whole song over a beat drops stretches of repeated lines and smears the times after them; fixed windows
 * with a known offset keep the clock honest), with the lyrics as the transcriber's vocabulary; a window that returns
 * nothing is re-cut 7 s earlier; what the windows heard is merged, and the known lyrics are aligned to it. The
 * transcriber is hosted (lyric-align-proxy); the rest is align.ts, held equal to the script by a parity test.
 *
 * Nothing here saves. The result is shown first — and, when the project already has timed lines, compared with
 * them — and stored only when the director says so.
 */
import { alignLyrics, mergeWindows, norm, pyRound, vocabularyPrompt, type AlignResult, type AlignedLine, type TranscriptWord, type WindowWord } from "./align";
import type { LyricLine } from "./lyricsForShot";

export const STT_SAMPLE_RATE = 16000;
export const WINDOW_SECONDS = 30;
export const HOP_SECONDS = 20;
/** A silent window is cut again this much earlier (the script's third attempt; its VAD attempt has no hosted form). */
export const RETRY_SHIFT_SECONDS = -7;
/** List price of the hosted transcriber, USD per minute of audio sent (lyric-align-proxy/contract.ts). */
export const STT_USD_PER_MINUTE = 0.006;
export const DEFAULT_LYRIC_LANGUAGE = "en";

/** Where each window starts: 0, 20, 40 … while it starts inside the song. */
export function planWindows(durationSeconds: number, hop = HOP_SECONDS): number[] {
  const out: number[] = [];
  for (let t0 = 0; t0 < durationSeconds; t0 += hop) out.push(t0);
  return out;
}

/** What timing a song of this length costs at list price (every window is sent whole; retries are not counted). */
export function estimateTimingUsd(durationSeconds: number): number {
  const seconds = planWindows(durationSeconds).reduce((sum, t0) => sum + Math.min(WINDOW_SECONDS, Math.max(0, durationSeconds - t0)), 0);
  return Math.round((seconds / 60) * STT_USD_PER_MINUTE * 100) / 100;
}

/** The samples of [startSeconds, startSeconds + seconds), clipped to the recording. */
export function windowSamples(mono: Float32Array, sampleRate: number, startSeconds: number, seconds: number): Float32Array {
  const from = Math.max(0, Math.round(startSeconds * sampleRate));
  const to = Math.min(mono.length, from + Math.round(seconds * sampleRate));
  return mono.subarray(from, Math.max(from, to));
}

/** Mono samples as a 16-bit PCM WAV file. */
export function encodeWav16(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const put = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  put(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  put(8, "WAVE");
  put(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  put(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return bytes;
}

/**
 * Words heard in one window → words on the song clock, each with its distance from the window's nearer edge.
 * `cutAt` is where the window was really cut (it differs from `t0` on a retry); on a retry only the words inside
 * the window's own span [t0, t0 + hop) are kept — the retry fills this window, it does not re-hear its neighbours.
 */
export function stampWindow(heard: readonly TranscriptWord[], cutAt: number, t0: number, retry: boolean, window = WINDOW_SECONDS, hop = HOP_SECONDS): WindowWord[] {
  const out: WindowWord[] = [];
  for (const h of heard) {
    const st = cutAt + h.start;
    const en = cutAt + h.end;
    if (retry && !(t0 <= st && st < t0 + hop)) continue;
    const edge = Math.min(st - cutAt, cutAt + window - en);
    const word: WindowWord = { w: h.w.trim(), start: pyRound(st, 3), end: pyRound(en, 3), edge: pyRound(edge, 3) };
    if (typeof h.p === "number") word.p = pyRound(h.p, 3);
    out.push(word);
  }
  return out;
}

/** One call to the transcriber: which stretch of the song it was handed and what came back. */
export type HeardPart = { t0: number; cutAt: number; seconds: number; retry: boolean; words: number; kept: number; text: string; pass: 1 | 2 };

export type HearWindow = (wav: Uint8Array, meta: { prompt: string | null; language: string; cutAt: number }) => Promise<TranscriptWord[]>;
export type TimingProgress = { done: number; total: number };

/** Hear the whole song, window by window. `hear` is the transcriber (the proxy in the app, a stub in tests). */
export async function hearSong(
  mono: Float32Array,
  sampleRate: number,
  lyrics: string,
  hear: HearWindow,
  opts: { language?: string; onProgress?: (p: TimingProgress) => void; signal?: AbortSignal } = {},
): Promise<{ words: TranscriptWord[]; windows: number; retried: number; silent: number; parts: HeardPart[] }> {
  const duration = mono.length / sampleRate;
  const prompt = vocabularyPrompt(lyrics);
  const language = opts.language ?? DEFAULT_LYRIC_LANGUAGE;
  const starts = planWindows(duration);
  const all: WindowWord[] = [];
  const parts: HeardPart[] = [];
  let retried = 0;
  let silent = 0;
  for (let n = 0; n < starts.length; n++) {
    if (opts.signal?.aborted) throw new DOMException("Stopped", "AbortError");
    const t0 = starts[n];
    let got = 0;
    for (const [attempt, shift] of [0, RETRY_SHIFT_SECONDS].entries()) {
      const cutAt = Math.max(0, t0 + shift);
      if (attempt > 0 && cutAt === t0) break; // the first window cannot be cut any earlier
      const samples = windowSamples(mono, sampleRate, cutAt, WINDOW_SECONDS);
      if (samples.length < sampleRate * 0.5) break; // under half a second left: nothing to hear
      const heard = await hear(encodeWav16(samples, sampleRate), { prompt, language, cutAt });
      const stamped = stampWindow(heard, cutAt, t0, attempt > 0);
      parts.push({ t0, cutAt, seconds: Math.round((samples.length / sampleRate) * 10) / 10, retry: attempt > 0, words: heard.length, kept: stamped.length, text: heard.map((h) => h.w.trim()).join(" "), pass: 1 });
      got = stamped.length;
      all.push(...stamped);
      if (attempt > 0) retried += 1;
      if (got) break;
    }
    if (!got) silent += 1;
    opts.onProgress?.({ done: n + 1, total: starts.length });
  }
  return { words: mergeWindows(all), windows: starts.length, retried, silent, parts };
}

// ---------------------------------------------------------------------------------------------------------------------
// The second listen
//
// A hosted transcriber handed thirty seconds that open on a beat can stop writing before the singing starts, and a
// whole verse comes back as nothing (measured on YSL, 2026-10-03: seventeen sung lines unheard in both windows that
// covered them). So where the first pass leaves a run of lines unfound WITH song time to spare between the found
// lines either side, that stretch is heard again in short windows a few seconds apart — one of them opens on the
// singing — with the missing lines themselves as the vocabulary. What the second listen heard replaces the first only
// where it heard more of those lines' words, and the new timing is kept only if the aligner's own coverage went up.

export const HOLE_WINDOW_SECONDS = 15;
export const HOLE_HOP_SECONDS = 5;

/** A run of consecutive lyric lines with no word found, and the stretch of the song they must be in. */
export type Hole = { lineFrom: number; lineTo: number; from: number; to: number; lines: string[] };

const found = (l: AlignedLine) => l.words.some((w) => w.matched);

export function findHoles(lines: readonly AlignedLine[], songSeconds: number, minLines = 2, minSeconds = 4): Hole[] {
  const holes: Hole[] = [];
  let i = 0;
  while (i < lines.length) {
    if (found(lines[i])) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < lines.length && !found(lines[j + 1])) j += 1;
    const before = lines[i - 1];
    const after = lines[j + 1];
    const from = before ? before.end : 0;
    const to = after ? after.start : songSeconds;
    if (j - i + 1 >= minLines && to - from >= minSeconds) holes.push({ lineFrom: lines[i].line_index, lineTo: lines[j].line_index, from, to, lines: lines.slice(i, j + 1).map((l) => l.text) });
    i = j + 1;
  }
  return holes;
}

/** Where a hole is re-cut: a second before it starts, then every hop while a cut starts inside it. */
export function planHoleWindows(hole: Hole, hop = HOLE_HOP_SECONDS): number[] {
  const out: number[] = [];
  for (let t = Math.max(0, Math.floor(hole.from - 1)); t < hole.to; t += hop) out.push(t);
  return out;
}

/** Hear the holes again. Returns, per hole, what was heard inside it (merged, on the song clock). */
export async function hearHoles(
  mono: Float32Array,
  sampleRate: number,
  holes: readonly Hole[],
  hear: HearWindow,
  opts: { language?: string; onProgress?: (p: TimingProgress) => void; signal?: AbortSignal; maxCalls?: number } = {},
): Promise<{ heard: TranscriptWord[][]; parts: HeardPart[]; calls: number }> {
  const language = opts.language ?? DEFAULT_LYRIC_LANGUAGE;
  const plan = holes.map((h) => planHoleWindows(h));
  const total = Math.min(opts.maxCalls ?? Infinity, plan.reduce((n, p) => n + p.length, 0));
  const heard: TranscriptWord[][] = [];
  const parts: HeardPart[] = [];
  let calls = 0;
  for (const [k, hole] of holes.entries()) {
    const prompt = ("Lyrics: " + hole.lines.join(" / ")).slice(0, 900);
    const words: WindowWord[] = [];
    for (const cutAt of plan[k]) {
      if (calls >= total) break;
      if (opts.signal?.aborted) throw new DOMException("Stopped", "AbortError");
      const samples = windowSamples(mono, sampleRate, cutAt, HOLE_WINDOW_SECONDS);
      if (samples.length < sampleRate * 0.5) break;
      const got = await hear(encodeWav16(samples, sampleRate), { prompt, language, cutAt });
      const stamped = stampWindow(got, cutAt, cutAt, false, HOLE_WINDOW_SECONDS, HOLE_HOP_SECONDS).filter((w) => w.start >= hole.from && w.start < hole.to);
      words.push(...stamped);
      calls += 1;
      parts.push({ t0: cutAt, cutAt, seconds: Math.round((samples.length / sampleRate) * 10) / 10, retry: false, words: got.length, kept: stamped.length, text: got.map((h) => h.w.trim()).join(" "), pass: 2 });
      opts.onProgress?.({ done: calls, total });
    }
    heard.push(mergeWindows(words));
  }
  return { heard, parts, calls };
}

/**
 * The first pass's transcript with each hole's stretch replaced by the second listen — where the second listen heard
 * more of the hole's own words than the first did.
 */
export function fillHoles(words: readonly TranscriptWord[], holes: readonly Hole[], heard: readonly TranscriptWord[][]): { words: TranscriptWord[]; replaced: number } {
  let out = [...words];
  let replaced = 0;
  for (const [k, hole] of holes.entries()) {
    const vocabulary = new Set(hole.lines.flatMap((l) => l.split(/\s+/).map(norm)).filter(Boolean));
    const hits = (list: readonly TranscriptWord[]) => list.filter((w) => vocabulary.has(norm(w.w))).length;
    const inside = (w: TranscriptWord) => w.start >= hole.from && w.start < hole.to;
    const first = out.filter(inside);
    const second = heard[k] ?? [];
    if (hits(second) > hits(first)) {
      out = [...out.filter((w) => !inside(w)), ...second];
      replaced += 1;
    }
  }
  out.sort((a, b) => a.start - b.start);
  return { words: out, replaced };
}

export type SecondListen = { holes: number; calls: number; replaced: number; coverageBefore: number; coverageAfter: number; used: boolean };

export type TimingResult = AlignResult & { transcriptWords: number; windows: number; lowConfidence: number; suspect: number };

/** Heard words + the lyrics → timed lines, with the counts the director is shown before saving. */
export function timeLyrics(lyrics: string, words: readonly TranscriptWord[], windows: number, bpm?: number | null): TimingResult {
  const aligned = alignLyrics(lyrics, words, { bpm: bpm ?? null });
  return {
    ...aligned,
    transcriptWords: words.length,
    windows,
    lowConfidence: aligned.lines.filter((l) => l.confidence < 0.5).length,
    suspect: aligned.lines.filter((l) => l.suspect).length,
  };
}

export type TimingComparison = { compared: number; medianSeconds: number; within1s: number; beyond1s: number; worst: { lineIndex: number; text: string; saved: number; now: number }[] };

/**
 * A new timing against the one already saved, line for line (same position, same words). Lines either side marks
 * as bridged (longer than a sung line can be, or confidence 0) are left out: neither is a measurement.
 */
export function compareWithSaved(lines: readonly AlignedLine[], saved: readonly LyricLine[], maxLineSeconds = 10): TimingComparison | null {
  const byIndex = new Map(saved.map((s) => [s.lineIndex, s]));
  const diffs: { lineIndex: number; text: string; saved: number; now: number; d: number }[] = [];
  for (const l of lines) {
    const s = byIndex.get(l.line_index);
    if (!s || s.text.trim() !== l.text.trim()) continue;
    if (l.suspect || l.confidence === 0 || s.confidence === 0 || s.end - s.start > maxLineSeconds) continue;
    diffs.push({ lineIndex: l.line_index, text: l.text, saved: s.start, now: l.start, d: Math.abs(l.start - s.start) });
  }
  if (!diffs.length) return null;
  const sorted = diffs.map((x) => x.d).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    compared: diffs.length,
    medianSeconds: Math.round(median * 1000) / 1000,
    within1s: diffs.filter((x) => x.d <= 1).length,
    beyond1s: diffs.filter((x) => x.d > 1).length,
    worst: [...diffs].sort((a, b) => b.d - a.d).slice(0, 5).filter((x) => x.d > 1).map(({ d: _d, ...rest }) => rest),
  };
}

/** The rows `lyric_lines` stores for a timing. */
export function lyricLineRows(lines: readonly AlignedLine[], projectId: string, userId: string, source: string) {
  return lines.map((l) => ({
    user_id: userId,
    project_id: projectId,
    line_index: l.line_index,
    section: l.section,
    block: l.block,
    text: l.text,
    start_seconds: l.start,
    end_seconds: Math.max(l.end, l.start),
    confidence: l.confidence,
    words_json: l.words.map((w) => ({ w: w.w, start: w.start, end: w.end, matched: w.matched })),
    source,
  }));
}
