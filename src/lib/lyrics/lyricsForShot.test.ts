import { describe, expect, it } from "vitest";
import { lyricsForShot, lyricStateForShot, lyricsAsText, type LyricLine } from "./lyricsForShot";

const line = (i: number, text: string, start: number, end: number): LyricLine => {
  const ws = text.split(" ");
  const step = (end - start) / ws.length;
  return {
    lineIndex: i,
    section: "verse",
    text,
    start,
    end,
    confidence: 1,
    words: ws.map((w, k) => ({ w, start: start + k * step, end: start + (k + 1) * step })),
  };
};

const lines = [
  line(0, "what im whippin cost a home", 10, 12),
  line(1, "Got everything but the kitchen", 12, 14),
  line(2, "You dont gotta", 20, 21),
];

describe("lyricsForShot", () => {
  it("returns whole lines that fit inside the window", () => {
    const r = lyricsForShot(lines, { start: 10, end: 14 });
    expect(r.map((l) => l.text)).toEqual(["what im whippin cost a home", "Got everything but the kitchen"]);
    expect(r.every((l) => !l.cutIn && !l.cutOut)).toBe(true);
  });
  it("shows only the words inside a window that starts mid-line", () => {
    const r = lyricsForShot(lines, { start: 11.2, end: 14 });
    expect(r[0].cutIn).toBe(true);
    expect(r[0].text).toBe("cost a home");
    expect(lyricsAsText(r)).toBe("…cost a home / Got everything but the kitchen");
  });
  it("marks instrumental windows", () => {
    expect(lyricStateForShot(lines, { start: 15, end: 19 })).toBe("instrumental");
    expect(lyricStateForShot([], { start: 15, end: 19 })).toBe("unknown");
  });
});
