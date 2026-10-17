// The lip-sync lane — the pure half (lipsync-shot is the server half).
//
// Why it exists (Fendi, 17 Oct 2026: "the lip sync doesn't line up with music … it's right on the lipsync test but not
// in the implementation of the video"). His real take is in sync with the song; the montage clips are not, because the
// montage model draws a new mouth on every clip and its timing does not follow the take (measured 17 Oct: per-clip lags
// from −0.8 s to +0.8 s against the original performance, no single offset fits). So the mouth is put back on the song:
//   1. the song's vocals are separated once (Demucs), stored as an audio asset beside the song;
//   2. for a clip, the slice of the vocals under the clip's own place on the song (its performance sync) is cut out —
//      byte ranges of the WAV, no decode — and the clip is re-synced to it (Sync Lipsync 2.0). The result keeps the
//      clip's place on the song, so the board and the render place it exactly where the clip was.
//
// Pure: no Deno, no network. Tested under vitest.

export const STEM_MODEL = "fal-ai/demucs";
export const LIPSYNC_MODEL = "fal-ai/sync-lipsync/v2";
/** List price, Sync Lipsync 2.0 on Fal: $3 a minute of video. */
export const LIPSYNC_USD_PER_SECOND = 3 / 60;
/** Demucs on Fal is billed by compute; a 3–4 minute song has cost well under this. A ceiling, not a quote. */
export const STEM_ESTIMATE_USD = 0.3;
/** The vocals run this far past the clip, so the model never runs out of audio before the picture ends (it cuts off). */
export const AUDIO_TAIL_SECONDS = 0.5;
/** The longest clip the lane takes: a performance shot is seconds, not minutes. */
export const LIPSYNC_MAX_SECONDS = 20;

export function lipsyncEstimateUsd(seconds: number): number {
  return Math.round(Math.max(0, seconds) * LIPSYNC_USD_PER_SECOND * 1000) / 1000;
}

export function buildStemInput(audioUrl: string): Record<string, unknown> {
  return { audio_url: audioUrl, model: "htdemucs", stems: ["vocals"], output_format: "wav" };
}

export function buildLipsyncInput(videoUrl: string, audioUrl: string): Record<string, unknown> {
  return { video_url: videoUrl, audio_url: audioUrl, model: "lipsync-2", sync_mode: "cut_off" };
}

/** The vocals' file in a finished Demucs answer, or null. */
export function vocalsUrlOf(result: unknown): string | null {
  const v = (result as { vocals?: { url?: unknown } } | null)?.vocals?.url;
  return typeof v === "string" && /^https:\/\//.test(v) ? v : null;
}

/** Fal serves its outputs from these hosts; a result link anywhere else is not fetched. */
export const FAL_OUTPUT_HOSTS = [".fal.media", ".fal.run", ".fal.ai"];
export function isFalOutputUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return u.protocol === "https:" && FAL_OUTPUT_HOSTS.some((s) => h.endsWith(s) || h === s.slice(1));
  } catch {
    return false;
  }
}

export type WavLayout = {
  /** The fmt chunk, header included, copied as is into a slice (PCM, float or extensible alike). */
  fmtChunk: Uint8Array;
  sampleRate: number;
  channels: number;
  blockAlign: number;
  /** Byte offset of the first sample, and how many sample bytes the file holds. */
  dataOffset: number;
  dataBytes: number;
};

const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/**
 * Where a WAV's samples are, from its first bytes (the head of the file is enough: fmt and data come before any
 * sample). `fileBytes` is the whole file's length, for a data chunk whose size was left open by a streaming writer.
 */
export function parseWavHead(head: Uint8Array, fileBytes: number): WavLayout {
  if (head.length < 12 || tag(head, 0) !== "RIFF" || tag(head, 8) !== "WAVE") throw new Error("not a WAV file");
  let o = 12;
  let fmt: Uint8Array | null = null;
  while (o + 8 <= head.length) {
    const id = tag(head, o);
    const size = u32(head, o + 4);
    if (id === "fmt ") {
      if (o + 8 + size > head.length) throw new Error("the WAV's format chunk runs past the bytes read");
      fmt = head.slice(o, o + 8 + size);
    } else if (id === "data") {
      if (!fmt) throw new Error("the WAV has its samples before its format");
      const dataOffset = o + 8;
      const open = size === 0 || size === 0xffffffff || dataOffset + size > fileBytes;
      const channels = u16(fmt, 10);
      const blockAlign = u16(fmt, 20);
      if (!(channels > 0) || !(blockAlign > 0)) throw new Error("the WAV's format chunk is not readable");
      return { fmtChunk: fmt, sampleRate: u32(fmt, 12), channels, blockAlign, dataOffset, dataBytes: open ? fileBytes - dataOffset : size };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("no samples found in the head of the WAV");
}

/** Seconds of sound a WAV holds. */
export function wavSeconds(w: WavLayout): number {
  return w.dataBytes / (w.sampleRate * w.blockAlign);
}

/**
 * The bytes of `seconds` of sound starting at `start` (seconds into the file), on whole sample frames, clamped to what
 * the file holds. `padHead` is the silence owed before them when `start` is before the file begins.
 */
export function wavSliceRange(w: WavLayout, start: number, seconds: number): { from: number; to: number; padHeadBytes: number } {
  const frame = w.blockAlign;
  const total = Math.floor(w.dataBytes / frame);
  const first = Math.round(start * w.sampleRate);
  const count = Math.max(0, Math.round(seconds * w.sampleRate));
  const a = Math.min(total, Math.max(0, first));
  const b = Math.min(total, Math.max(0, first + count));
  return { from: w.dataOffset + a * frame, to: w.dataOffset + b * frame, padHeadBytes: Math.max(0, -first) * frame };
}

/** A WAV of the given samples with the source's own format. */
export function buildWav(fmtChunk: Uint8Array, samples: Uint8Array, padHeadBytes = 0): Uint8Array {
  const dataBytes = padHeadBytes + samples.length;
  const out = new Uint8Array(12 + fmtChunk.length + 8 + dataBytes);
  const dv = new DataView(out.buffer);
  const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  put(0, "RIFF");
  dv.setUint32(4, out.length - 8, true);
  put(8, "WAVE");
  out.set(fmtChunk, 12);
  const d = 12 + fmtChunk.length;
  put(d, "data");
  dv.setUint32(d + 4, dataBytes, true);
  out.set(samples, d + 8 + padHeadBytes);
  return out;
}

/** The slice of the song a clip needs: from its first frame on the song, its length and a tail. */
export function songWindowOf(songStart: number, clipSeconds: number): [number, number] {
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return [r3(songStart), r3(songStart + clipSeconds + AUDIO_TAIL_SECONDS)];
}
