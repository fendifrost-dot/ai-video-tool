// lyric-align-proxy — contract (pure: no Deno, no network; imported by the function and by the app's tests)
//
// One window of a song in, the words heard in it out, each with its time inside the window. That is all this function
// does: it is the hosted stand-in for faster-whisper in scripts/lyrics/align_lyrics.py `transcribe()`. Cutting the
// song into overlapping windows, merging what the windows heard and aligning the known lyrics to it is the app's
// job (src/lib/lyrics/align.ts, held equal to the script by a parity test), so the function holds no algorithm.

export const MAX_AUDIO_BYTES = 1_600_000; // a 30 s window of 16 kHz mono 16-bit PCM is 960 044 bytes
export const MAX_WINDOW_SECONDS = 45;
export const MAX_PROMPT_CHARS = 1000;
export const MAX_WINDOWS_PER_QUARTER_HOUR = 240; // a 6-minute song is ~18 windows; retries and a second song fit
/** OpenAI whisper-1 list price, USD per minute of audio (developers.openai.com, read 2026-10-03). */
export const WHISPER_USD_PER_MINUTE = 0.006;

export type SttProvider = "openai" | "xai";
export type HeardWord = { w: string; start: number; end: number; p?: number };

export type TranscribeRequest = { projectId: string; audioBase64: string; prompt: string | null; language: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate the body of a `transcribe` call. Returns the request, or the reason it is refused. */
export function parseTranscribeRequest(body: Record<string, unknown>): { ok: true; request: TranscribeRequest } | { ok: false; status: number; error: string } {
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!UUID.test(projectId)) return { ok: false, status: 400, error: "projectId required" };
  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
  if (!audioBase64) return { ok: false, status: 400, error: "audioBase64 required" };
  if (audioBase64.length > Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 8) return { ok: false, status: 413, error: "window too large" };
  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : null;
  const rawLanguage = typeof body.language === "string" ? body.language.trim().toLowerCase() : "";
  const language = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(rawLanguage) ? rawLanguage : null;
  return { ok: true, request: { projectId, audioBase64, prompt, language } };
}

/** Read a PCM WAV header: what the window is, and how long. Null when the bytes are not a WAV this function accepts. */
export function wavInfo(bytes: Uint8Array): { sampleRate: number; channels: number; bitsPerSample: number; seconds: number } | null {
  if (bytes.byteLength < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let off = 12;
  let fmt: { sampleRate: number; channels: number; bitsPerSample: number; byteRate: number } | null = null;
  while (off + 8 <= bytes.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    if (id === "fmt " && off + 24 <= bytes.byteLength) {
      if (v.getUint16(off + 8, true) !== 1) return null; // PCM only
      fmt = { channels: v.getUint16(off + 10, true), sampleRate: v.getUint32(off + 12, true), byteRate: v.getUint32(off + 16, true), bitsPerSample: v.getUint16(off + 22, true) };
    } else if (id === "data") {
      if (!fmt || fmt.byteRate <= 0) return null;
      const dataBytes = Math.min(size, bytes.byteLength - (off + 8));
      return { sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: fmt.bitsPerSample, seconds: dataBytes / fmt.byteRate };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * A "word" that is one sound held for a line — "Wooooooooooo…" — is the transcriber running away with itself, not
 * something sung at that moment: the same character eight times in a row, or longer than any word.
 */
export function isRunaway(word: string): boolean {
  return word.length > 32 || /(.)\1{7,}/u.test(word);
}

// Whisper's own measure of a segment it should not have written: text that compresses too well is a loop (the
// threshold its reference decoder uses). Its "no speech" measure is NOT used: it is taken at the first instant of the
// window, so a window that opens on a beat and has a verse later is marked "no speech" — on YSL that rule threw away
// two windows of correctly heard lyrics (2026-10-03).
export const COMPRESSION_RATIO_MAX = 2.4;

type Segment = { start: number; end: number; avgLogprob: number | null; compressionRatio: number | null };

function segmentsOf(json: unknown): Segment[] {
  const list = (json as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(list)) return [];
  const out: Segment[] = [];
  for (const item of list) {
    const r = item as { start?: unknown; end?: unknown; avg_logprob?: unknown; compression_ratio?: unknown };
    const start = num(r.start);
    const end = num(r.end);
    if (start === null || end === null) continue;
    out.push({ start, end, avgLogprob: num(r.avg_logprob), compressionRatio: num(r.compression_ratio) });
  }
  return out;
}

const badSegment = (s: Segment): boolean => s.compressionRatio !== null && s.compressionRatio > COMPRESSION_RATIO_MAX;

/**
 * OpenAI `verbose_json` with word (and, when asked for, segment) timestamps → the words worth keeping, and how many
 * were dropped. A word is dropped when it is a runaway, or when the segment it sits in is one the model itself marks
 * as a loop. A kept word carries its segment's confidence as `p`.
 */
export function heardFromOpenAi(json: unknown): { words: HeardWord[]; dropped: number } {
  const list = (json as { words?: unknown } | null)?.words;
  if (!Array.isArray(list)) return { words: [], dropped: 0 };
  const segments = segmentsOf(json);
  const out: HeardWord[] = [];
  let dropped = 0;
  for (const item of list) {
    const r = item as { word?: unknown; start?: unknown; end?: unknown };
    const w = typeof r.word === "string" ? r.word.trim() : "";
    const start = num(r.start);
    const end = num(r.end);
    if (!w || start === null || end === null || end < start) continue;
    if (isRunaway(w)) {
      dropped += 1;
      continue;
    }
    const mid = (start + end) / 2;
    const seg = segments.find((s) => mid >= s.start && mid <= s.end) ?? null;
    if (seg && badSegment(seg)) {
      dropped += 1;
      continue;
    }
    const p = seg && seg.avgLogprob !== null ? Math.round(Math.min(1, Math.exp(seg.avgLogprob)) * 1000) / 1000 : null;
    out.push(p === null ? { w, start, end } : { w, start, end, p });
  }
  return { words: out, dropped };
}

/** OpenAI `verbose_json` with word timestamps → words. */
export function wordsFromOpenAi(json: unknown): HeardWord[] {
  return heardFromOpenAi(json).words;
}

/** xAI `/v1/stt` → words. */
export function wordsFromXai(json: unknown): HeardWord[] {
  const list = (json as { words?: unknown } | null)?.words;
  if (!Array.isArray(list)) return [];
  const out: HeardWord[] = [];
  for (const item of list) {
    const r = item as { text?: unknown; word?: unknown; start?: unknown; end?: unknown; confidence?: unknown };
    const raw = typeof r.text === "string" ? r.text : typeof r.word === "string" ? r.word : "";
    const w = raw.trim();
    const start = num(r.start);
    const end = num(r.end);
    const p = num(r.confidence);
    if (w && !isRunaway(w) && start !== null && end !== null && end >= start) out.push(p === null ? { w, start, end } : { w, start, end, p });
  }
  return out;
}

/** What one window costs at list price, or null where the provider's price is not known to this function. */
export function estimateUsd(provider: SttProvider, seconds: number): number | null {
  if (provider !== "openai") return null;
  return Math.round((seconds / 60) * WHISPER_USD_PER_MINUTE * 10000) / 10000;
}

/** Which providers to try, in order: the configured one first, then the other. */
export function providerOrder(configured: string | undefined, has: { openai: boolean; xai: boolean }): SttProvider[] {
  const first: SttProvider = configured?.trim().toLowerCase() === "xai" ? "xai" : "openai";
  const order: SttProvider[] = first === "openai" ? ["openai", "xai"] : ["xai", "openai"];
  return order.filter((p) => has[p]);
}
