import { describe, expect, it } from "vitest";
import { wavInfo } from "../../../supabase/functions/lyric-align-proxy/contract";
import { alignLyrics, type TranscriptWord } from "./align";
import type { LyricLine } from "./lyricsForShot";
import { HOP_SECONDS, STT_SAMPLE_RATE, WINDOW_SECONDS, compareWithSaved, encodeWav16, estimateTimingUsd, fillHoles, findHoles, hearHoles, hearSong, lyricLineRows, planHoleWindows, planWindows, stampWindow, timeLyrics, windowSamples } from "./timing";

const LYRICS = `Lights down low, we don't need the sun
Glass on the table, night just begun

Woke up late with the city in my ear
Counting every reason that I'm still right here
Momma said patience, baby, give it one more year

Lights down low, we don't need the sun
Glass on the table, night just begun`;

/** The lyrics "sung" from `start`: one word after another, a pause between lines, a longer one between blocks. */
function sung(start = 12): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  let t = start;
  for (const block of LYRICS.split("\n\n")) {
    for (const line of block.split("\n")) {
      for (const w of line.split(" ")) {
        out.push({ w, start: Math.round(t * 1000) / 1000, end: Math.round((t + 0.3) * 1000) / 1000 });
        t += 0.38;
      }
      t += 0.5;
    }
    t += 6;
  }
  return out;
}

/** A transcriber that hears, in each window it is given, the words of `truth` that fall wholly inside it. */
const hearing = (truth: TranscriptWord[], calls: { cutAt: number; seconds: number; prompt: string | null }[], deafBefore = -1) =>
  async (wav: Uint8Array, meta: { prompt: string | null; language: string; cutAt: number }) => {
    const seconds = wavInfo(wav)!.seconds;
    calls.push({ cutAt: meta.cutAt, seconds, prompt: meta.prompt });
    if (meta.cutAt === deafBefore) return [];
    return truth.filter((w) => w.start >= meta.cutAt && w.end <= meta.cutAt + seconds).map((w) => ({ w: w.w, start: w.start - meta.cutAt, end: w.end - meta.cutAt }));
  };

describe("hearing a song in windows", () => {
  it("cuts a window every 20 s while one starts inside the song", () => {
    expect(planWindows(201.87)).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
    expect(planWindows(20)).toEqual([0]);
    expect(planWindows(0)).toEqual([]);
    expect(WINDOW_SECONDS - HOP_SECONDS).toBe(10); // every word but the first and last ten seconds is heard twice
  });

  it("prices the song by the audio actually sent", () => {
    expect(estimateTimingUsd(201.87)).toBe(0.03);
    expect(estimateTimingUsd(30)).toBe(0);
    expect(estimateTimingUsd(600)).toBe(0.09);
  });

  it("writes a window as a WAV the transcriber's proxy accepts", () => {
    const mono = new Float32Array(STT_SAMPLE_RATE * 31).map((_, i) => Math.sin(i / 20));
    const wav = encodeWav16(windowSamples(mono, STT_SAMPLE_RATE, 0, WINDOW_SECONDS), STT_SAMPLE_RATE);
    expect(wav.byteLength).toBe(960044);
    expect(wavInfo(wav)).toEqual({ sampleRate: 16000, channels: 1, bitsPerSample: 16, seconds: 30 });
    // the last window of a song is whatever is left
    expect(wavInfo(encodeWav16(windowSamples(mono, STT_SAMPLE_RATE, 20, WINDOW_SECONDS), STT_SAMPLE_RATE))!.seconds).toBe(11);
    // loud samples clip, they do not wrap
    const v = new DataView(encodeWav16(new Float32Array([2, -2, 0]), 16000).buffer);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([32767, -32768, 0]);
  });

  it("puts a window's words on the song clock and measures how deep in the window each was heard", () => {
    const got = stampWindow([{ w: " low ", start: 1.5, end: 1.9 }, { w: "sun", start: 28.5, end: 29.4, p: 0.87654 }], 40, 40, false);
    expect(got).toEqual([
      { w: "low", start: 41.5, end: 41.9, edge: 1.5 },
      { w: "sun", start: 68.5, end: 69.4, edge: 0.6, p: 0.877 },
    ]);
  });

  it("a retry fills only its own window's span", () => {
    // window t0 = 40 re-cut at 33: words before 40 and from 60 on belong to the neighbours
    const got = stampWindow([{ w: "early", start: 2, end: 2.3 }, { w: "mine", start: 9, end: 9.3 }, { w: "late", start: 27.5, end: 27.9 }], 33, 40, true);
    expect(got.map((w) => w.w)).toEqual(["mine"]);
  });

  it("hears every window with the lyrics as vocabulary, and re-cuts a silent one 7 s earlier", async () => {
    const truth = sung();
    const mono = new Float32Array(STT_SAMPLE_RATE * 70);
    const calls: { cutAt: number; seconds: number; prompt: string | null }[] = [];
    const progress: number[] = [];
    const heard = await hearSong(mono, STT_SAMPLE_RATE, LYRICS, hearing(truth, calls, 20), { onProgress: (p) => progress.push(p.done) });
    // window 20 is deaf and is re-cut at 13; the last window is past the singing, so it is re-cut too and stays silent
    expect(calls.map((c) => c.cutAt)).toEqual([0, 20, 13, 40, 60, 53]);
    expect(calls[0].prompt).toBe("Lyrics: Lights down low, we don't need the sun / Glass on the table, night just begun / Woke up late with the city in my ear / Counting every reason that I'm still right here / Momma said patience, baby, give it one more year");
    expect(heard.windows).toBe(4);
    expect(heard.retried).toBe(2);
    expect(heard.silent).toBe(1);
    expect(progress).toEqual([1, 2, 3, 4]);
    // every sung word that some window heard whole is in the transcript exactly once, in order
    expect(heard.words.map((w) => w.w)).toEqual(truth.filter((w) => w.end <= 70).map((w) => w.w));
    expect(heard.words.every((w, i, all) => i === 0 || w.start >= all[i - 1].start)).toBe(true);
  });

  it("heard in windows, the song times the same as heard whole", async () => {
    const truth = sung();
    const mono = new Float32Array(STT_SAMPLE_RATE * 75);
    const heard = await hearSong(mono, STT_SAMPLE_RATE, LYRICS, hearing(truth, []));
    const viaWindows = timeLyrics(LYRICS, heard.words, heard.windows);
    const whole = alignLyrics(LYRICS, truth);
    expect(viaWindows.lines.map((l) => [l.text, l.start, l.end])).toEqual(whole.lines.map((l) => [l.text, l.start, l.end]));
    expect(viaWindows.coverage).toBe(1);
    expect(viaWindows.lines.map((l) => l.section)).toEqual(["hook", "hook", "verse", "verse", "verse", "hook", "hook"]);
    expect(viaWindows.suspect).toBe(0);
    expect(viaWindows.windows).toBe(4);
  });

  it("stops between windows when asked to", async () => {
    const ctl = new AbortController();
    const calls: { cutAt: number; seconds: number; prompt: string | null }[] = [];
    const hear = hearing(sung(), calls);
    const run = hearSong(new Float32Array(STT_SAMPLE_RATE * 70), STT_SAMPLE_RATE, LYRICS, async (wav, meta) => {
      const out = await hear(wav, meta);
      ctl.abort();
      return out;
    }, { signal: ctl.signal });
    await expect(run).rejects.toThrow(/Stopped/);
    expect(calls.length).toBe(1);
  });
});

describe("the second listen", () => {
  /** The lyrics sung with each block at a given time: the hook at 3 s, the verse at 26 s, the hook again at 61 s. */
  const spaced = (): TranscriptWord[] => {
    const out: TranscriptWord[] = [];
    const starts = [3, 26, 61];
    LYRICS.split("\n\n").forEach((block, b) => {
      let t = starts[b];
      for (const line of block.split("\n")) {
        for (const w of line.split(" ")) {
          out.push({ w, start: Math.round(t * 1000) / 1000, end: Math.round((t + 0.3) * 1000) / 1000 });
          t += 0.38;
        }
        t += 0.5;
      }
    });
    return out;
  };
  /** A transcriber that gives up on a window when it waits more than 5 s for a word: at its start, or after one. */
  const impatient = (truth: TranscriptWord[], calls: { cutAt: number; seconds: number; prompt: string | null }[]) =>
    async (wav: Uint8Array, meta: { prompt: string | null; language: string; cutAt: number }) => {
      const seconds = wavInfo(wav)!.seconds;
      calls.push({ cutAt: meta.cutAt, seconds, prompt: meta.prompt });
      const out: TranscriptWord[] = [];
      let last = meta.cutAt;
      for (const w of truth.filter((x) => x.start >= meta.cutAt && x.end <= meta.cutAt + seconds)) {
        if (w.start - last > 5) break;
        out.push({ w: w.w, start: w.start - meta.cutAt, end: w.end - meta.cutAt });
        last = w.end;
      }
      return out;
    };
  const mono = new Float32Array(STT_SAMPLE_RATE * 75);

  it("finds the stretch where a run of lines went unfound, and leaves alone a run with no room to be sung in", async () => {
    const truth = spaced();
    const first = await hearSong(mono, STT_SAMPLE_RATE, LYRICS, impatient(truth, []));
    const timing = timeLyrics(LYRICS, first.words, first.windows);
    // the verse opens 6 s into the only window that could hear it: nothing of it comes back
    expect(timing.lines.map((l) => l.words.some((w) => w.matched))).toEqual([true, true, false, false, false, true, true]);
    const holes = findHoles(timing.lines, 75);
    expect(holes).toHaveLength(1);
    expect(holes[0]).toMatchObject({ lineFrom: 2, lineTo: 4 });
    expect(holes[0].from).toBeCloseTo(9.16, 1);
    expect(holes[0].to).toBeCloseTo(61, 1);
    expect(holes[0].lines[0]).toBe("Woke up late with the city in my ear");
    expect(planHoleWindows(holes[0])).toEqual([8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 58]);
    // the same unfound run squeezed between two found lines: written, not sung — nothing to listen to again
    const squeezed = timing.lines.map((l) => (l.line_index >= 5 ? { ...l, start: l.start - 51, end: l.end - 51 } : l));
    expect(findHoles(squeezed, 75)).toEqual([]);
    // one unfound line is not a hole
    expect(findHoles(timing.lines.filter((l) => l.line_index !== 3 && l.line_index !== 4), 75)).toEqual([]);
  });

  it("hears the stretch again in short windows with the missing lines as vocabulary, and the verse is found", async () => {
    const truth = spaced();
    const first = await hearSong(mono, STT_SAMPLE_RATE, LYRICS, impatient(truth, []));
    const before = timeLyrics(LYRICS, first.words, first.windows);
    const holes = findHoles(before.lines, 75);
    const calls: { cutAt: number; seconds: number; prompt: string | null }[] = [];
    const progress: number[] = [];
    const again = await hearHoles(mono, STT_SAMPLE_RATE, holes, impatient(truth, calls), { maxCalls: first.windows * 2, onProgress: (p) => progress.push(p.done) });
    // never more than twice the first pass's calls
    expect(calls.map((c) => c.cutAt)).toEqual([8, 13, 18, 23, 28, 33, 38, 43]);
    expect(calls.every((c) => c.seconds === 15)).toBe(true);
    expect(calls[0].prompt).toBe("Lyrics: Woke up late with the city in my ear / Counting every reason that I'm still right here / Momma said patience, baby, give it one more year");
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(again.parts.every((p) => p.pass === 2)).toBe(true);
    // the window cut at 23 opens 3 s before the verse: it hears all of it
    expect(again.parts.find((p) => p.cutAt === 23)!.words).toBe(26);
    expect(again.heard[0].map((w) => w.w)).toEqual(truth.filter((w) => w.start >= 26 && w.start < 40).map((w) => w.w));

    const filled = fillHoles(first.words, holes, again.heard);
    expect(filled.replaced).toBe(1);
    const after = timeLyrics(LYRICS, filled.words, first.windows);
    expect(before.coverage).toBeLessThan(0.6);
    expect(after.coverage).toBe(1);
    expect(after.suspect).toBe(0);
    expect(after.lines[2].start).toBe(26);
    // what the first pass had right is untouched
    expect(after.lines.filter((l) => l.line_index < 2 || l.line_index > 4).map((l) => l.start)).toEqual(before.lines.filter((l) => l.line_index < 2 || l.line_index > 4).map((l) => l.start));
  });

  it("keeps the first pass where the second listen heard no more of the missing lines", () => {
    const words: TranscriptWord[] = [{ w: "Lights", start: 3, end: 3.3 }, { w: "woke", start: 30, end: 30.3 }, { w: "Glass", start: 61, end: 61.3 }];
    const hole = { lineFrom: 2, lineTo: 4, from: 9, to: 61, lines: ["Woke up late with the city in my ear", "Counting every reason"] };
    expect(fillHoles(words, [hole], [[{ w: "nonsense", start: 31, end: 31.3 }, { w: "up", start: 32, end: 32.3 }]])).toEqual({ words, replaced: 0 });
    expect(fillHoles(words, [hole], [[]]).replaced).toBe(0);
    const better = fillHoles(words, [hole], [[{ w: "Woke", start: 26, end: 26.3 }, { w: "up", start: 26.4, end: 26.7 }]]);
    expect(better.replaced).toBe(1);
    expect(better.words.map((w) => w.w)).toEqual(["Lights", "Woke", "up", "Glass"]);
  });
});

describe("a new timing against the saved one", () => {
  const whole = alignLyrics(LYRICS, sung());
  const saved: LyricLine[] = whole.lines.map((l) => ({ lineIndex: l.line_index, section: l.section, text: l.text, start: l.start, end: l.end, confidence: l.confidence, words: [] }));

  it("agrees with itself", () => {
    expect(compareWithSaved(whole.lines, saved)).toEqual({ compared: 7, medianSeconds: 0, within1s: 7, beyond1s: 0, worst: [] });
  });

  it("measures how far apart the two are and names the lines that moved", () => {
    const moved = saved.map((s, i) => (i === 3 ? { ...s, start: s.start + 2.5 } : { ...s, start: s.start + 0.2 }));
    const c = compareWithSaved(whole.lines, moved)!;
    expect(c.compared).toBe(7);
    expect(c.medianSeconds).toBeCloseTo(0.2, 3);
    expect(c.beyond1s).toBe(1);
    expect(c.worst.map((w) => w.lineIndex)).toEqual([3]);
  });

  it("does not compare lines whose words differ, or lines either side marks as bridged", () => {
    const other = saved.map((s, i) => (i === 0 ? { ...s, text: "different words" } : i === 1 ? { ...s, confidence: 0 } : i === 2 ? { ...s, end: s.start + 40 } : s));
    expect(compareWithSaved(whole.lines, other)!.compared).toBe(4);
    expect(compareWithSaved(whole.lines, [])).toBeNull();
  });

  it("stores a timing as lyric_lines rows", () => {
    const rows = lyricLineRows(whole.lines, "p1", "u1", "align_openai_whisper-1");
    expect(rows.length).toBe(7);
    expect(rows[0]).toMatchObject({ user_id: "u1", project_id: "p1", line_index: 0, section: "hook", block: 0, text: "Lights down low, we don't need the sun", source: "align_openai_whisper-1", confidence: 1 });
    expect(rows[0].words_json[0]).toEqual({ w: "Lights", start: 12, end: 12.3, matched: true });
    expect(rows.every((r) => r.end_seconds >= r.start_seconds)).toBe(true);
  });
});
