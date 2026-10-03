import { describe, expect, it } from "vitest";
import { wavInfo } from "../../../supabase/functions/lyric-align-proxy/contract";
import { alignLyrics, type TranscriptWord } from "./align";
import type { LyricLine } from "./lyricsForShot";
import { HOP_SECONDS, STT_SAMPLE_RATE, WINDOW_SECONDS, compareWithSaved, corroborated, encodeWav16, estimateTimingUsd, fillHoles, findHoles, hearHoles, hearSong, hostedPrompt, isRunaway, lyricLineRows, planHoleWindows, planWindows, stampWindow, timeLyrics, windowSamples } from "./timing";

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

describe("what a hosted transcriber is not trusted with", () => {
  it("knows a runaway word from a sung one", () => {
    expect(isRunaway("W" + "o".repeat(200))).toBe(true);
    expect(isRunaway("Woooooooo")).toBe(true);
    expect(isRunaway("Woooooo")).toBe(false); // seven: a real ad-lib as written
    expect(isRunaway("Freezin")).toBe(false);
    expect(isRunaway("a".repeat(33))).toBe(true);
  });

  it("leaves held-sound lines out of its vocabulary", () => {
    expect(hostedPrompt("Lights down low\nWoooooo\nknow you see it\nYeahhhh ayyyy\n\nGlass on the table")).toBe("Lyrics: Lights down low / know you see it / Glass on the table");
    expect(hostedPrompt("Woooooo")).toBeNull();
  });

  it("drops a runaway word, tries a deaf window earlier and then later, and does not send a few seconds of tail", async () => {
    const mono = new Float32Array(STT_SAMPLE_RATE * 64);
    const calls: number[] = [];
    const heard = await hearSong(mono, STT_SAMPLE_RATE, LYRICS, async (wav, meta) => {
      calls.push(meta.cutAt);
      if (meta.cutAt === 0) return [{ w: "W" + "o".repeat(150), start: 0, end: 29 }];
      if (meta.cutAt === 7) return [{ w: "Lights", start: 5, end: 5.3 }]; // 12 s on the song clock
      return [];
    });
    // window 0: a runaway (dropped) → cannot be cut earlier → cut at 7. window 20: 13, then 27. window 40: 33, then 47.
    // window 60 is 4 s of tail: not sent; its retry at 53 is 11 s and is; 67 is past the end.
    expect(calls).toEqual([0, 7, 20, 13, 27, 40, 33, 47, 53]);
    expect(heard.words.map((w) => [w.w, w.start])).toEqual([["Lights", 12]]);
    expect(heard.parts[0]).toMatchObject({ cutAt: 0, words: 0, text: "" });
    expect(heard.silent).toBe(3);
  });
});

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
  /** A transcriber that loses the verse (25–45 s) from every cut the first pass makes, and hears it from cuts in between. */
  const FIRST_PASS_CUTS = new Set([0, 20, 13, 27, 40, 33, 47, 60, 53, 67]);
  const losesTheVerse = (truth: TranscriptWord[], calls: { cutAt: number; seconds: number; prompt: string | null }[]) =>
    async (wav: Uint8Array, meta: { prompt: string | null; language: string; cutAt: number }) => {
      const seconds = wavInfo(wav)!.seconds;
      calls.push({ cutAt: meta.cutAt, seconds, prompt: meta.prompt });
      return truth
        .filter((x) => x.start >= meta.cutAt && x.end <= meta.cutAt + seconds && !(FIRST_PASS_CUTS.has(meta.cutAt) && x.start >= 25 && x.start < 45))
        .map((w) => ({ w: w.w, start: w.start - meta.cutAt, end: w.end - meta.cutAt }));
    };
  const mono = new Float32Array(STT_SAMPLE_RATE * 75);

  it("finds the stretch where a run of lines went unfound, and leaves alone a run with no room to be sung in", async () => {
    const truth = spaced();
    const first = await hearSong(mono, STT_SAMPLE_RATE, LYRICS, losesTheVerse(truth, []));
    const timing = timeLyrics(LYRICS, first.words, first.windows);
    expect(timing.lines.map((l) => l.words.some((w) => w.matched))).toEqual([true, true, false, false, false, true, true]);
    const holes = findHoles(timing.lines, 75);
    expect(holes).toHaveLength(1);
    expect(holes[0]).toMatchObject({ lineFrom: 2, lineTo: 4 });
    expect(holes[0].from).toBeCloseTo(9.16, 1);
    expect(holes[0].to).toBeCloseTo(61, 1);
    expect(holes[0].lines[0]).toBe("Woke up late with the city in my ear");
    // from a lead before the hole, every 7 s, while a cut starts inside it
    expect(planHoleWindows(holes[0])).toEqual([0, 7, 14, 21, 28, 35, 42, 49, 56]);
    expect(planHoleWindows({ ...holes[0], from: 30.9, to: 62.7 })).toEqual([14, 21, 28, 35, 42, 49, 56]);
    // the same unfound run squeezed between two found lines: written, not sung — nothing to listen to again
    const squeezed = timing.lines.map((l) => (l.line_index >= 5 ? { ...l, start: l.start - 51, end: l.end - 51 } : l));
    expect(findHoles(squeezed, 75)).toEqual([]);
    // one unfound line is not a hole
    expect(findHoles(timing.lines.filter((l) => l.line_index !== 3 && l.line_index !== 4), 75)).toEqual([]);
    // a line the aligner had to bridge is not an anchor: the hole reaches past it to the last line really heard
    const bridged = timing.lines.map((l) => (l.line_index === 1 ? { ...l, suspect: true } : l));
    expect(findHoles(bridged, 75)[0]).toMatchObject({ lineFrom: 1, lineTo: 4 });
  });

  it("hears the stretch again from cuts the first pass did not make, and the verse is found", async () => {
    const truth = spaced();
    const first = await hearSong(mono, STT_SAMPLE_RATE, LYRICS, losesTheVerse(truth, []));
    const before = timeLyrics(LYRICS, first.words, first.windows);
    const holes = findHoles(before.lines, 75);
    const calls: { cutAt: number; seconds: number; prompt: string | null }[] = [];
    const progress: number[] = [];
    const again = await hearHoles(mono, STT_SAMPLE_RATE, LYRICS, holes, losesTheVerse(truth, calls), { maxCalls: first.windows * 2, onProgress: (p) => progress.push(p.done) });
    // never more than twice the first pass's calls
    expect(calls.map((c) => c.cutAt)).toEqual([0, 7, 14, 21, 28, 35, 42, 49]);
    expect(calls.map((c) => c.seconds)).toEqual([30, 30, 30, 30, 30, 30, 30, 26]);
    // the same vocabulary as the first pass: the missing lines are NOT fed back as the prompt
    expect(calls[0].prompt).toBe(hostedPrompt(LYRICS));
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(again.parts.every((p) => p.pass === 2)).toBe(true);
    // the cut at 14 holds the whole verse
    expect(again.parts.find((p) => p.cutAt === 14)!.words).toBe(26);
    expect(again.trusted).toBe(5); // the five cuts that reach the verse each agree with a neighbour on it
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

  it("leaves out lyrics only one cut wrote: a transcriber fills an instrumental with its prompt", async () => {
    const truth = spaced();
    const first = await hearSong(mono, STT_SAMPLE_RATE, LYRICS, losesTheVerse(truth, []));
    const holes = findHoles(timeLyrics(LYRICS, first.words, first.windows).lines, 75);
    // this one hears nothing real in the hole, and in every cut "hears" the verse's first line, starting 2 s in
    const inventing = async (wav: Uint8Array, meta: { prompt: string | null; language: string; cutAt: number }) => {
      const seconds = wavInfo(wav)!.seconds;
      const real = truth.filter((x) => x.start >= meta.cutAt && x.end <= meta.cutAt + seconds && !(x.start >= 25 && x.start < 45)).map((w) => ({ w: w.w, start: w.start - meta.cutAt, end: w.end - meta.cutAt }));
      const invented = "Woke up late with the city in my ear".split(" ").map((w, i) => ({ w, start: 2 + i * 0.4, end: 2.3 + i * 0.4 }));
      return [...real, ...invented].sort((a, b) => a.start - b.start);
    };
    const again = await hearHoles(mono, STT_SAMPLE_RATE, LYRICS, holes, inventing, { maxCalls: 13 });
    // the same words, but at a different moment of the song in every cut: no two cuts agree
    expect(again.heard[0]).toEqual([]);
    expect(fillHoles(first.words, holes, again.heard).replaced).toBe(0);
  });

  it("keeps a word only when another cut heard the same word at the same moment", () => {
    const w = (word: string, start: number) => ({ w: word, start, end: start + 0.3, edge: 1 });
    const a = { cutAt: 0, seconds: 15, words: [w("woke", 6), w("up", 6.4), w("late", 6.8), w("with", 7.2)] };
    const b = { cutAt: 5, seconds: 15, words: [w("Woke", 6.1), w("up", 6.5), w("early", 6.7), w("with", 7.4)] };
    const c = { cutAt: 10, seconds: 15, words: [w("woke", 12), w("up", 12.4), w("late", 12.8)] }; // same words, six seconds later
    expect(corroborated([a, b, c]).map((ws) => ws.map((x) => x.w))).toEqual([["woke", "up", "with"], ["Woke", "up", "with"], []]);
    expect(corroborated([a])).toEqual([[]]); // nobody else was listening
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
