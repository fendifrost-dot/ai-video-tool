/**
 * The browser half of take matching: read the audio of the song and of a take, and hand both to the matcher.
 * (The matcher itself — syncMatch.ts — is pure and tested without a browser.)
 */
import { matchTakeToSong, type MatchResult } from "./syncMatch";

/** The matcher works on speech-band mono: 8 kHz is plenty to line a room recording up with the master. */
export const MATCH_SAMPLE_RATE = 8000;
/** A file larger than this is not pulled into the tab to be decoded (a multi-GB 4K master would not fit). */
export const MAX_DECODE_BYTES = 450 * 1024 * 1024;

export class NoAudioError extends Error {
  constructor(what: string) {
    super(`${what} has no audio track the browser can read`);
    this.name = "NoAudioError";
  }
}
export class TooLargeError extends Error {
  constructor(what: string, bytes: number) {
    super(`${what} is ${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB — too large to read in the browser`);
    this.name = "TooLargeError";
  }
}

/** A file's audio as mono samples at `sampleRate`. Decoding resamples; only the audio track is expanded in memory. */
export async function decodeMono(url: string, what: string, sampleRate = MATCH_SAMPLE_RATE): Promise<Float32Array> {
  const abort = new AbortController();
  const res = await fetch(url, { signal: abort.signal });
  if (!res.ok) throw new Error(`${what} could not be read (${res.status})`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_DECODE_BYTES) {
    abort.abort(); // do not pull gigabytes over the wire just to refuse them
    throw new TooLargeError(what, declared);
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_DECODE_BYTES) throw new TooLargeError(what, bytes.byteLength);
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Offline(1, 1, sampleRate);
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(bytes);
  } catch {
    throw new NoAudioError(what);
  }
  if (audio.numberOfChannels === 0 || audio.length === 0) throw new NoAudioError(what);
  const mono = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / audio.numberOfChannels;
  }
  return mono;
}

/**
 * Match one take to the song in the browser. Resolves with the measurement, or null when the take's audio does not
 * line up with the song anywhere. Throws NoAudioError / TooLargeError when the take cannot be read here — the
 * director then enters the offset by hand.
 */
export async function matchTakeInBrowser(songUrl: string, takeUrl: string): Promise<MatchResult | null> {
  const [song, take] = await Promise.all([decodeMono(songUrl, "The song"), decodeMono(takeUrl, "This take")]);
  // let the page paint its "matching…" state before the arithmetic starts
  await new Promise((r) => setTimeout(r, 30));
  return matchTakeToSong(song, take, MATCH_SAMPLE_RATE);
}
