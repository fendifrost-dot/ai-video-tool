import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NothingMatchedError, alignLyrics, mergeWindows, norm, parseLyrics, pyRound, sequenceRatio, vocabularyPrompt, type AlignOptions, type AlignResult, type TranscriptWord, type WindowWord } from "./align";

/**
 * The app's aligner against the proven one. The fixtures are written by scripts/lyrics/make_parity_fixtures.py, which
 * runs scripts/lyrics/align_lyrics.py itself; every number here has to come out the same.
 */
type Fixtures = {
  cases: { name: string; text: string; words: TranscriptWord[]; options: AlignOptions; expected: AlignResult }[];
  merges: { name: string; words: WindowWord[]; expected: TranscriptWord[] }[];
  ratios: { a: string; b: string; ratio: number }[];
  norms: { in: string; out: string }[];
};
const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, "__fixtures__", "align_parity.json"), "utf8")) as Fixtures;

describe("the app's lyric aligner is the script's aligner", () => {
  it("has fixtures to answer to", () => {
    expect(fx.cases.length).toBeGreaterThanOrEqual(10);
    expect(fx.merges.length).toBeGreaterThanOrEqual(2);
  });

  for (const c of fx.cases) {
    it(`lines, words, confidence and flags match the script — ${c.name}`, () => {
      const got = alignLyrics(c.text, c.words, c.options);
      expect(got.coverage).toBe(c.expected.coverage);
      expect(got.lines_reordered).toBe(c.expected.lines_reordered);
      expect(got.lines.length).toBe(c.expected.lines.length);
      got.lines.forEach((line, i) => expect(line, `line ${i}: ${line.text}`).toEqual(c.expected.lines[i]));
    });
  }

  for (const m of fx.merges) {
    it(`overlapping windows merge to the same transcript — ${m.name}`, () => {
      expect(mergeWindows(m.words)).toEqual(m.expected);
    });
  }

  it("compares near words the way difflib does", () => {
    for (const r of fx.ratios) expect(sequenceRatio(r.a, r.b), `${r.a} ~ ${r.b}`).toBe(r.ratio);
  });

  it("normalises a word the way the script does", () => {
    for (const n of fx.norms) expect(norm(n.in), n.in).toBe(n.out);
  });
});

describe("the pieces Python does differently from JavaScript", () => {
  it("rounds an exact half to the even digit, and everything else to the nearest", () => {
    expect(pyRound(0.0625, 3)).toBe(0.062);
    expect(pyRound(0.1875, 3)).toBe(0.188);
    expect(pyRound(2.5, 0)).toBe(2);
    expect(pyRound(3.5, 0)).toBe(4);
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(1.005, 2)).toBe(1.0); // 1.005 is stored a hair under: not a half
    expect(pyRound(12.3456, 3)).toBe(12.346);
    expect(pyRound(-0.0625, 3)).toBe(-0.062);
  });

  it("splits lyrics into blocks at blank lines and skips empty ones", () => {
    expect(parseLyrics("a b\nc\n\n\n d \n\ne\n")).toEqual([
      [0, "a b"],
      [0, "c"],
      [1, "d"],
      [2, "e"],
    ]);
    expect(parseLyrics("")).toEqual([]);
  });

  it("gives the transcriber the distinct lines as its vocabulary, once each", () => {
    expect(vocabularyPrompt("Run it back\nRun it back\n\nLights down low")).toBe("Lyrics: Run it back / Lights down low");
    expect(vocabularyPrompt("   \n")).toBeNull();
  });

  it("says so when nothing in the song matches the lyrics", () => {
    expect(() => alignLyrics("completely different words here", [{ w: "zzz", start: 1, end: 1.2 }])).toThrow(NothingMatchedError);
  });
});
