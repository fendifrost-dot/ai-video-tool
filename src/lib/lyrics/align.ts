/**
 * Lyrics → the song clock. The app's half of `scripts/lyrics/align_lyrics.py`.
 *
 * The proven aligner is that Python script: transcribe the song in overlapping windows with word times, then put the
 * KNOWN lyrics onto those words by a global monotonic alignment. The app has nowhere to run Python, so the
 * transcription comes from a hosted speech model (lyric-align-proxy) and everything after it — merge_windows →
 * align → place → build_lines — is that script's algorithm, stated again here line for line. It is not a second
 * design: `scripts/lyrics/make_parity_fixtures.py` runs the Python on a set of cases and `align.parity.test.ts`
 * demands the same numbers from this file. Change the Python first, regenerate, then make this agree.
 *
 * Where the two languages differ in arithmetic, this file follows Python: the alignment table is single precision
 * (numpy float32), rounding is Python's round (half to even on the exact value), whitespace is Python's.
 */

export type TranscriptWord = { w: string; start: number; end: number; p?: number };
/** A word as one window heard it: `edge` is its distance from the nearer edge of that window, seconds. */
export type WindowWord = TranscriptWord & { edge: number };

export type AlignedWord = { w: string; start: number; end: number; matched: boolean };
export type AlignedLine = {
  line_index: number;
  section: "hook" | "verse" | "adlib";
  block: number;
  text: string;
  start: number;
  end: number;
  confidence: number;
  words: AlignedWord[];
  beat_start?: number;
  beat_end?: number;
  /** The aligner bridged a gap here (a written repeat that is not sung, an instrumental): not to be treated as sung. */
  suspect: boolean;
};
export type AlignResult = { lines: AlignedLine[]; coverage: number; lines_reordered: number };
export type AlignOptions = { lrc?: Record<string, number> | null; bpm?: number | null; max_line_seconds?: number };

export class NothingMatchedError extends Error {
  constructor() {
    super("None of the lyrics could be found in the song — is this the right song for these lyrics?");
    this.name = "NothingMatchedError";
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Python's text primitives
// ---------------------------------------------------------------------------------------------------------------

/** str.isspace(): what Python's split() and strip() treat as whitespace. */
const PY_SPACE = "\\t\\n\\x0b\\x0c\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_SPLIT = new RegExp(`[${PY_SPACE}]+`);
const PY_STRIP = new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, "g");
/** str.splitlines() */
// eslint-disable-next-line no-control-regex -- these control characters are exactly the ones Python splits lines on
const PY_LINES = new RegExp("\\r\\n|[\\n\\r\\x0b\\x0c\\x1c\\x1d\\x1e\\x85\\u2028\\u2029]");

const pySplit = (s: string): string[] => s.split(PY_SPLIT).filter((x) => x.length > 0);
const pyStrip = (s: string): string => s.replace(PY_STRIP, "");
function pySplitLines(s: string): string[] {
  const out = s.split(PY_LINES);
  if (out.length && out[out.length - 1] === "") out.pop(); // a trailing line break does not open an empty last line
  return out;
}

/**
 * Python's round(x, n): the exact value rounded to n places, an exact half going to the even digit. (toFixed rounds
 * the exact value too, but sends an exact half up.)
 */
export function pyRound(x: number, n: number): number {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const exact = Math.abs(x).toFixed(60); // a double under 1e15 has at most 52 fractional digits: this is the exact value
  const dot = exact.indexOf(".");
  const rest = exact.slice(dot + 1 + n);
  if (rest[0] === "5" && /^50*$/.test(rest)) {
    const kept = exact.slice(0, dot + 1 + n).replace(".", "");
    const lastDigit = Number(kept[kept.length - 1]);
    const down = Number(exact.slice(0, dot + 1 + n));
    const out = lastDigit % 2 === 0 ? down : Number((down + 10 ** -n).toFixed(n));
    return neg ? -out : out;
  }
  return Number(x.toFixed(n));
}

const NORM_RE = /[^a-z0-9']+/g;
const SPELL: Record<string, string> = { em: "them", im: "i'm", bout: "about", cause: "because", whippin: "whipping", dancin: "dancing", evenin: "evening", freezin: "freezing", gotta: "gotta", ya: "you" };

/** A word as the aligner compares it: lower case, letters digits and apostrophes only, a few sung spellings folded. */
export function norm(word: string): string {
  let w = word.toLowerCase().replace(/’/g, "'").replace(/‘/g, "'");
  w = w.replace(NORM_RE, "").replace(/^'+|'+$/g, "");
  return Object.prototype.hasOwnProperty.call(SPELL, w) ? SPELL[w] : w;
}

const normLine = (t: string): string => pySplit(t).map(norm).join(" ");

/** Blocks separated by blank lines → [block index, line text], empty lines skipped. */
export function parseLyrics(text: string): [number, string][] {
  const lines: [number, string][] = [];
  let block = 0;
  for (const raw of pySplitLines(text)) {
    const t = pyStrip(raw);
    if (!t) {
      if (lines.length && lines[lines.length - 1][0] === block) block += 1;
      continue;
    }
    lines.push([block, t]);
  }
  return lines;
}

/** A block whose text repeats elsewhere is a hook; a very short one is an ad-lib; the rest are verses. */
export function labelSections(lines: [number, string][]): Map<number, "hook" | "verse" | "adlib"> {
  const blocks = new Map<number, string[]>();
  for (const [b, t] of lines) blocks.set(b, [...(blocks.get(b) ?? []), normLine(t)]);
  const keys = new Map<number, string>();
  for (const [b, v] of blocks) keys.set(b, v.join("\n"));
  const counts = new Map<string, number>();
  for (const k of keys.values()) counts.set(k, (counts.get(k) ?? 0) + 1);
  const labels = new Map<number, "hook" | "verse" | "adlib">();
  for (const [b, k] of keys) {
    if ((counts.get(k) ?? 0) > 1) labels.set(b, "hook");
    else if (blocks.get(b)!.length <= 2 && k.length < 24) labels.set(b, "adlib");
    else labels.set(b, "verse");
  }
  return labels;
}

// ---------------------------------------------------------------------------------------------------------------
// difflib.SequenceMatcher(None, a, b).ratio() — for the short strings the aligner compares (no junk heuristics apply)
// ---------------------------------------------------------------------------------------------------------------

export function sequenceRatio(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la + lb === 0) return 1;
  const b2j = new Map<string, number[]>();
  for (let j = 0; j < lb; j++) {
    const list = b2j.get(b[j]);
    if (list) list.push(j);
    else b2j.set(b[j], [j]);
  }
  const longest = (alo: number, ahi: number, blo: number, bhi: number): [number, number, number] => {
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = next;
    }
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) bestsize += 1;
    return [besti, bestj, bestsize];
  };
  let matches = 0;
  const queue: [number, number, number, number][] = [[0, la, 0, lb]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (k) {
      matches += k;
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  return (2.0 * matches) / (la + lb);
}

// ---------------------------------------------------------------------------------------------------------------
// merge_windows
// ---------------------------------------------------------------------------------------------------------------

/** Words from overlapping windows → one transcript: where two windows heard the same slot, the word deeper inside its window wins. */
export function mergeWindows(words: readonly WindowWord[]): TranscriptWord[] {
  const sorted = [...words].sort((x, y) => x.start - y.start); // stable, like Python's sort
  const out: WindowWord[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(w.start - last.start) < 0.25 && norm(w.w) === norm(last.w)) {
      if (w.edge > last.edge) out[out.length - 1] = w;
      continue;
    }
    if (last && Math.abs(w.start - last.start) < 0.12) {
      if (w.edge > last.edge) out[out.length - 1] = w;
      continue;
    }
    out.push(w);
  }
  return out.map(({ edge: _edge, ...rest }) => rest);
}

// ---------------------------------------------------------------------------------------------------------------
// align — global monotonic alignment (Needleman–Wunsch) of lyric tokens to transcript tokens
// ---------------------------------------------------------------------------------------------------------------

const f32 = Math.fround;

/**
 * For every lyric word, the index of the transcript word it was sung as, or null. Scores: exact token +3, near
 * token (ratio ≥ 0.75) +1.5, mismatch −1, skipped transcript word −0.25, skipped lyric word −0.6.
 */
export function align(lyricWords: readonly string[], transWords: readonly TranscriptWord[]): (number | null)[] {
  const a = lyricWords.map(norm);
  const b = transWords.map((w) => norm(w.w));
  const L = a.length;
  const T = b.length;
  const sim = new Float32Array(L * T).fill(-1);
  const bi = new Map<string, number[]>();
  b.forEach((w, j) => {
    const list = bi.get(w);
    if (list) list.push(j);
    else bi.set(w, [j]);
  });
  a.forEach((w, i) => {
    for (const j of bi.get(w) ?? []) sim[i * T + j] = 3;
  });
  const distinct = [...new Set(b)].sort();
  a.forEach((w, i) => {
    if (bi.has(w) || w.length < 3) return;
    for (const v of distinct) {
      if (Math.abs(v.length - w.length) <= 2 && v.slice(0, 1) === w.slice(0, 1) && sequenceRatio(w, v) >= 0.75) {
        for (const j of bi.get(v)!) sim[i * T + j] = Math.max(sim[i * T + j], 1.5);
      }
    }
  });
  const GT = f32(-0.25);
  const GL = f32(-0.6);
  const W = T + 1;
  const H = new Float32Array((L + 1) * W);
  for (let j = 0; j <= T; j++) H[j] = j * -0.25;
  for (let i = 0; i <= L; i++) H[i * W] = i * -0.6; // a double product stored single, as numpy stores it
  const P = new Int8Array((L + 1) * W); // 0 diag, 1 up (skip lyric), 2 left (skip transcript)
  for (let i = 1; i <= L; i++) {
    const prev = (i - 1) * W;
    const cur = i * W;
    for (let j = 1; j <= T; j++) {
      const d = f32(H[prev + j - 1] + sim[(i - 1) * T + (j - 1)]);
      const u = f32(H[prev + j] + GL);
      const best = d >= u ? d : u;
      const choice = d >= u ? 0 : 1;
      const left = f32(H[cur + j - 1] + GT);
      if (left > best) {
        H[cur + j] = left;
        P[cur + j] = 2;
      } else {
        H[cur + j] = best;
        P[cur + j] = choice;
      }
    }
  }
  const match: (number | null)[] = new Array(L).fill(null);
  let i = L;
  let j = T;
  while (i > 0 && j > 0) {
    const m = P[i * W + j];
    if (m === 0) {
      if (sim[(i - 1) * T + (j - 1)] > 0) match[i - 1] = j - 1;
      i -= 1;
      j -= 1;
    } else if (m === 1) i -= 1;
    else j -= 1;
  }
  return match;
}

// ---------------------------------------------------------------------------------------------------------------
// place — a time for every lyric word
// ---------------------------------------------------------------------------------------------------------------

type Placed = [start: number, end: number, matched: boolean];

/** Matched words take their transcript time; unmatched ones are spread between their nearest matched neighbours. */
export function place(lyricWords: readonly string[], transWords: readonly TranscriptWord[], match: readonly (number | null)[]): Placed[] {
  const n = lyricWords.length;
  const times: (Placed | null)[] = new Array(n).fill(null);
  match.forEach((m, i) => {
    if (m !== null) times[i] = [transWords[m].start, transWords[m].end, true];
  });
  const idx: number[] = [];
  times.forEach((t, i) => {
    if (t) idx.push(i);
  });
  if (!idx.length) throw new NothingMatchedError();
  for (let i = 0; i < n; i++) {
    if (times[i]) continue;
    let prev: number | null = null;
    let nxt: number | null = null;
    for (const k of idx) {
      if (k < i) prev = k;
      else if (k > i) {
        nxt = k;
        break;
      }
    }
    if (prev === null) {
      const t1 = times[nxt!]![0];
      const st = Math.max(0.0, t1 - 0.35 * (nxt! - i));
      times[i] = [pyRound(st, 3), pyRound(Math.min(t1, st + 0.35), 3), false];
      continue;
    }
    if (nxt === null) {
      const t0 = times[prev]![1];
      times[i] = [pyRound(t0 + 0.35 * (i - prev - 1), 3), pyRound(t0 + 0.35 * (i - prev), 3), false];
      continue;
    }
    const t0 = times[prev]![1];
    const t1 = times[nxt]![0];
    const span = Math.max(0.0, t1 - t0);
    const k = nxt - prev - 1;
    const pos = i - prev - 1;
    const s = t0 + (span * pos) / k;
    const e = t0 + (span * (pos + 1)) / k;
    times[i] = [pyRound(s, 3), pyRound(Math.max(e, s + 0.05), 3), false];
  }
  return times as Placed[];
}

// ---------------------------------------------------------------------------------------------------------------
// build_lines — lyrics text + transcript words → timed lines
// ---------------------------------------------------------------------------------------------------------------

/** The key an LRC override is looked up by: the line as the aligner compares it. */
export const lrcKey = normLine;

export function alignLyrics(text: string, transWords: readonly TranscriptWord[], options: AlignOptions = {}): AlignResult {
  const maxLine = options.max_line_seconds ?? 10.0;
  const lines = parseLyrics(text);
  const labels = labelSections(lines);
  const tw = transWords.filter((w) => norm(w.w));
  const lyricWords: string[] = [];
  const owner: number[] = [];
  lines.forEach(([, t], li) => {
    for (const w of pySplit(t)) {
      if (norm(w)) {
        lyricWords.push(w);
        owner.push(li);
      }
    }
  });
  const match = align(lyricWords, tw);
  const times = place(lyricWords, tw, match);
  const coverage = match.filter((m) => m !== null).length / Math.max(1, match.length);
  const lrc = options.lrc ?? {};
  const out: AlignedLine[] = [];
  lines.forEach(([b, t], li) => {
    const ws: AlignedWord[] = [];
    for (let i = 0; i < lyricWords.length; i++) if (owner[i] === li) ws.push({ w: lyricWords[i], start: times[i][0], end: times[i][1], matched: times[i][2] });
    if (!ws.length) return;
    let start = ws[0].start;
    let end = ws[ws.length - 1].end;
    const key = normLine(t);
    if (Object.prototype.hasOwnProperty.call(lrc, key)) {
      const shift = lrc[key] - start;
      start += shift;
      end += shift;
      for (const w of ws) {
        w.start = pyRound(w.start + shift, 3);
        w.end = pyRound(w.end + shift, 3);
      }
    }
    const conf = ws.filter((w) => w.matched).length / ws.length;
    const rec: AlignedLine = { line_index: li, section: labels.get(b)!, block: b, text: t, start: pyRound(start, 3), end: pyRound(end, 3), confidence: pyRound(conf, 2), words: ws, suspect: false };
    if (options.bpm) {
      rec.beat_start = pyRound((start * options.bpm) / 60.0, 2);
      rec.beat_end = pyRound((end * options.bpm) / 60.0, 2);
    }
    out.push(rec);
  });
  // monotonic sanity: a line may not start before the previous one does
  let fixed = 0;
  for (let k = 1; k < out.length; k++) {
    const p = out[k - 1];
    const q = out[k];
    if (q.start < p.start) {
      const qEnd = q.end;
      q.start = p.end;
      q.end = Math.max(p.end + 0.5, qEnd);
      q.confidence = 0.0;
      fixed += 1;
    }
  }
  for (const l of out) {
    l.suspect = l.end - l.start > maxLine || (l.confidence === 0 && l.words.length >= 3);
    if (l.suspect) l.confidence = 0.0;
  }
  return { lines: out, coverage: pyRound(coverage, 3), lines_reordered: fixed };
}

/** The lyrics as the transcriber's vocabulary: the distinct lines, in order, as one short prompt (as the script builds it). */
export function vocabularyPrompt(text: string, maxChars = 900): string | null {
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const [, line] of parseLyrics(text)) {
    const k = normLine(line);
    if (k && !seen.has(k)) {
      seen.add(k);
      uniq.push(line);
    }
  }
  if (!uniq.length) return null;
  return "Lyrics: " + uniq.join(" / ").slice(0, maxChars);
}
