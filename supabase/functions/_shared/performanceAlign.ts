/**
 * Server-side measure of where a performance take sits on the song.
 *
 * song_time = take_time + offsetSeconds.
 * Positive: the song was already playing when the recording started.
 * Negative: the camera was already rolling when the song started.
 *
 * Both signals are mono PCM. The speech band (150–4000 Hz) is kept, then the same onset + GCC-PHAT matcher the
 * browser uses, including the second-window drift check. Silence and a missing track (decoded to zeros) are refused.
 * Nothing here writes a sync row and nothing here spends money.
 */
import { isConfidentMatch, matchTakeToSong, type MatchResult } from "./syncMatch.ts";

export const ALIGN_SAMPLE_RATE = 16000;

export type AlignRefusal = {
  ok: false;
  error: "no_audio" | "no_match" | "bad_pcm";
  message: string;
};
export type AlignOk = { ok: true; match: MatchResult; confident: boolean };
export type AlignResult = AlignOk | AlignRefusal;

function rms(x: ArrayLike<number>): number {
  if (x.length === 0) return 0;
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  return Math.sqrt(e / x.length);
}

/** Float32 little-endian PCM, base64. */
export function pcmFromBase64(b64: string): Float32Array | null {
  if (!b64 || typeof b64 !== "string") return null;
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return null;
  }
  if (bytes.byteLength < 8 || bytes.byteLength % 4 !== 0) return null;
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(copy);
}

export function alignPerformance(input: {
  song: ArrayLike<number>;
  take: ArrayLike<number>;
  sampleRate?: number;
}): AlignResult {
  const sampleRate = input.sampleRate ?? ALIGN_SAMPLE_RATE;
  if (!(sampleRate >= 8000 && sampleRate <= 48000)) {
    return { ok: false, error: "bad_pcm", message: "sample rate must be between 8 kHz and 48 kHz" };
  }
  if (input.song.length < sampleRate || input.take.length < sampleRate) {
    return {
      ok: false,
      error: "no_audio",
      message: "the song or the take has no audio long enough to align",
    };
  }
  if (rms(input.take) < 1e-4) {
    return {
      ok: false,
      error: "no_audio",
      message: "the take has no audio track (silence). Nothing was written.",
    };
  }
  if (rms(input.song) < 1e-4) {
    return {
      ok: false,
      error: "no_audio",
      message: "the song master has no audio. Nothing was written.",
    };
  }
  const song =
    input.song instanceof Float32Array || input.song instanceof Float64Array
      ? input.song
      : Float32Array.from(input.song);
  const take =
    input.take instanceof Float32Array || input.take instanceof Float64Array
      ? input.take
      : Float32Array.from(input.take);
  const match = matchTakeToSong(song, take, sampleRate, { bandpass: true });
  if (!match) {
    return {
      ok: false,
      error: "no_match",
      message: "the take's audio does not line up with the song. Nothing was written.",
    };
  }
  return { ok: true, match, confident: isConfidentMatch(match) };
}

/** The live YSL board. A sync write for this project is refused. */
export const LOCKED_PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";

export function syncWriteAllowed(input: {
  projectId: string;
  write: boolean;
  dryRun: boolean;
}): { ok: true } | { ok: false; message: string } {
  if (!input.write || input.dryRun)
    return { ok: false, message: "dry run: the offset was measured and not stored" };
  if (input.projectId === LOCKED_PROJECT_ID) {
    return { ok: false, message: "the live YSL board is read-only; the offset was not stored" };
  }
  return { ok: true };
}
