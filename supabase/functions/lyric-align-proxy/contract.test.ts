import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES, estimateUsd, heardFromOpenAi, isRunaway, parseTranscribeRequest, providerOrder, wavInfo, wordsFromOpenAi, wordsFromXai } from "./contract";

const P = "11111111-1111-4111-8111-111111111111";

/** A PCM WAV of `seconds` at 16 kHz mono 16-bit. */
function wav(seconds: number, extraChunk = false): Uint8Array {
  const data = Math.round(seconds * 16000) * 2;
  const extra = extraChunk ? 12 : 0;
  const bytes = new Uint8Array(44 + extra + data);
  const v = new DataView(bytes.buffer);
  const put = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  put(0, "RIFF");
  v.setUint32(4, 36 + extra + data, true);
  put(8, "WAVE");
  put(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  let o = 36;
  if (extraChunk) {
    put(o, "LIST");
    v.setUint32(o + 4, 4, true);
    o += 12;
  }
  put(o, "data");
  v.setUint32(o + 4, data, true);
  return bytes;
}

describe("lyric-align-proxy contract", () => {
  it("accepts a window and trims what it is given", () => {
    const r = parseTranscribeRequest({ projectId: P, audioBase64: "AAAA", prompt: "  Lyrics: a / b  ", language: "EN" });
    expect(r).toEqual({ ok: true, request: { projectId: P, audioBase64: "AAAA", prompt: "Lyrics: a / b", language: "en" } });
  });

  it("refuses a request without a project or without audio, and one that is too large", () => {
    expect(parseTranscribeRequest({ audioBase64: "AAAA" })).toMatchObject({ ok: false, status: 400 });
    expect(parseTranscribeRequest({ projectId: "not-a-uuid", audioBase64: "AAAA" })).toMatchObject({ ok: false, status: 400 });
    expect(parseTranscribeRequest({ projectId: P })).toMatchObject({ ok: false, status: 400 });
    expect(parseTranscribeRequest({ projectId: P, audioBase64: "A".repeat(Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 100) })).toMatchObject({ ok: false, status: 413 });
  });

  it("a language that is not a language code is dropped, not sent on", () => {
    const r = parseTranscribeRequest({ projectId: P, audioBase64: "AAAA", language: "english; drop table" });
    expect(r.ok && r.request.language).toBeNull();
    const none = parseTranscribeRequest({ projectId: P, audioBase64: "AAAA", prompt: "   " });
    expect(none.ok && none.request.prompt).toBeNull();
  });

  it("reads a PCM WAV's length, with or without other chunks before the data", () => {
    expect(wavInfo(wav(30))).toEqual({ sampleRate: 16000, channels: 1, bitsPerSample: 16, seconds: 30 });
    expect(wavInfo(wav(12.5, true))!.seconds).toBeCloseTo(12.5, 6);
    expect(wav(30).byteLength).toBe(960044);
    expect(wav(30).byteLength).toBeLessThan(MAX_AUDIO_BYTES);
  });

  it("is not fooled by bytes that are not a WAV", () => {
    expect(wavInfo(new Uint8Array(10))).toBeNull();
    expect(wavInfo(new TextEncoder().encode("ID3" + "x".repeat(60)))).toBeNull();
    const compressed = wav(1);
    new DataView(compressed.buffer).setUint16(20, 85, true); // an MP3 inside a WAV container
    expect(wavInfo(compressed)).toBeNull();
  });

  it("reads OpenAI's word list", () => {
    expect(wordsFromOpenAi({ text: "x", words: [{ word: " Lights", start: 1.2, end: 1.5 }, { word: "down", start: 1.5, end: 1.8 }, { word: "", start: 2, end: 2.1 }, { word: "bad", start: 3, end: 2 }, { word: "nan", start: "1", end: 2 }] })).toEqual([
      { w: "Lights", start: 1.2, end: 1.5 },
      { w: "down", start: 1.5, end: 1.8 },
    ]);
    expect(wordsFromOpenAi({ text: "no words" })).toEqual([]);
    expect(wordsFromOpenAi(null)).toEqual([]);
  });

  it("reads xAI's word list, keeping its confidence", () => {
    expect(wordsFromXai({ words: [{ text: "Lights", start: 1.2, end: 1.5, confidence: 0.9 }, { text: "down", start: 1.5, end: 1.8 }] })).toEqual([
      { w: "Lights", start: 1.2, end: 1.5, p: 0.9 },
      { w: "down", start: 1.5, end: 1.8 },
    ]);
  });

  it("prices a window at the list rate, and says nothing where the rate is not known", () => {
    expect(estimateUsd("openai", 30)).toBe(0.003);
    expect(estimateUsd("xai", 30)).toBeNull();
  });

  it("tries the configured provider first and only those with a key", () => {
    expect(providerOrder(undefined, { openai: true, xai: true })).toEqual(["openai", "xai"]);
    expect(providerOrder("XAI", { openai: true, xai: true })).toEqual(["xai", "openai"]);
    expect(providerOrder(undefined, { openai: false, xai: true })).toEqual(["xai"]);
    expect(providerOrder(undefined, { openai: false, xai: false })).toEqual([]);
  });
  it("drops what the model itself marks as a loop or as not speech, and a runaway word", () => {
    const body = {
      words: [
        { word: "W" + "o".repeat(180), start: 0.2, end: 9.8 }, // a runaway: one sound for ten seconds
        { word: "know", start: 10.2, end: 10.5 },
        { word: "you", start: 10.5, end: 10.7 },
        { word: "la", start: 14.1, end: 14.3 }, // inside a segment that compresses like a loop
        { word: "la", start: 14.3, end: 14.5 },
        { word: "thanks", start: 21, end: 21.4 }, // inside a segment the model thinks is not speech
        { word: "designers", start: 26, end: 26.6 },
      ],
      segments: [
        { start: 0, end: 10, avg_logprob: -0.4, compression_ratio: 1.1, no_speech_prob: 0.1 },
        { start: 10, end: 12, avg_logprob: -0.22, compression_ratio: 1.3, no_speech_prob: 0.05 },
        { start: 14, end: 16, avg_logprob: -0.3, compression_ratio: 3.4, no_speech_prob: 0.1 },
        { start: 20, end: 22, avg_logprob: -1.3, compression_ratio: 0.9, no_speech_prob: 0.82 },
        { start: 25, end: 28, avg_logprob: -1.2, compression_ratio: 1.0, no_speech_prob: 0.2 }, // unsure, but speech: kept
      ],
    };
    const heard = heardFromOpenAi(body);
    expect(heard.dropped).toBe(4);
    expect(heard.words).toEqual([
      { w: "know", start: 10.2, end: 10.5, p: 0.803 },
      { w: "you", start: 10.5, end: 10.7, p: 0.803 },
      { w: "designers", start: 26, end: 26.6, p: 0.301 },
    ]);
    // without segments there is nothing to judge by but the word itself
    expect(heardFromOpenAi({ words: body.words }).words.map((w) => w.w)).toEqual(["know", "you", "la", "la", "thanks", "designers"]);
    expect(isRunaway("Woooooo")).toBe(false);
    expect(wordsFromXai({ words: [{ text: "o".repeat(40), start: 0, end: 1 }, { text: "ice", start: 1, end: 1.3, confidence: 0.9 }] })).toEqual([{ w: "ice", start: 1, end: 1.3, p: 0.9 }]);
  });
});
