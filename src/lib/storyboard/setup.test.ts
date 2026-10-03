import { describe, expect, it } from "vitest";
import { footageSummary, parseLrc, setupStatus } from "./setup";
import { clearTreatment, fingerprint, hasTreatment, parseTreatmentDoc, storyboardIsStale, withTreatmentDoc } from "@/lib/treatment/treatmentDoc";

const media = (id: string, footageRole: "performance" | "b_roll" | "reference" | null, over = {}) => ({
  id,
  footageRole,
  isVideo: true,
  isImage: false,
  assetType: "reference_video",
  sourceTool: "manual",
  durationSeconds: 190,
  ...over,
});

const base = {
  hasSong: true,
  songSeconds: 201.87,
  analysed: true,
  bpm: 122,
  lyricsText: "a line",
  lyricLines: 95,
  media: [media("t1", "performance")],
  syncs: [{ performanceAssetId: "t1", status: "confirmed" as const }],
  footageConfirmedAt: "2026-10-03T00:00:00Z",
};

describe("setup gate", () => {
  it("opens when the source truth is established", () => {
    const s = setupStatus(base);
    expect(s.ready).toBe(true);
    expect(s.blockedBy).toBeNull();
    expect(s.counts).toMatchObject({ takes: 1, takesSynced: 1, lyricLines: 95 });
  });

  it("stays closed, and says why, for each missing piece", () => {
    expect(setupStatus({ ...base, hasSong: false }).blockedBy).toMatch(/^Song/);
    expect(setupStatus({ ...base, analysed: false }).blockedBy).toMatch(/Beat and length/);
    expect(setupStatus({ ...base, lyricLines: 0 }).blockedBy).toMatch(/Lyric timing/);
    expect(setupStatus({ ...base, syncs: [] }).blockedBy).toMatch(/Takes matched/);
    expect(setupStatus({ ...base, syncs: [{ performanceAssetId: "t1", status: "auto" }] }).blockedBy).toMatch(/Takes matched/);
    expect(setupStatus({ ...base, footageConfirmedAt: null }).blockedBy).toMatch(/All real footage/);
  });

  it("asks only for what applies: no lyrics and no takes is a valid project", () => {
    const s = setupStatus({ ...base, lyricsText: "", lyricLines: 0, media: [], syncs: [] });
    expect(s.ready).toBe(true);
    expect(s.items.find((i) => i.id === "lyric_timing")?.state).toBe("optional");
    expect(s.items.find((i) => i.id === "take_sync")?.state).toBe("optional");
  });

  it("counts generated stills out of the references", () => {
    const s = setupStatus({
      ...base,
      media: [media("r1", null, { assetType: "reference_image", isVideo: false, isImage: true, sourceTool: "grok" }), media("r2", null, { assetType: "reference_image", isVideo: false, isImage: true })],
    });
    expect(s.counts.references).toBe(1);
  });

  it("the footage note states facts", () => {
    const note = footageSummary({ takes: [{ name: "Take 1", songStart: 0.85, songEnd: 191.2 }], broll: [{ name: "street.mov", seconds: 12.4 }] });
    expect(note).toContain("Take 1 covers song 0:00–3:11");
    expect(note).toContain("street.mov (12 s)");
    expect(footageSummary({ takes: [], broll: [] })).toBe("");
  });
});

describe("timed lyrics pasted by hand", () => {
  it("reads LRC onto the song clock; a line ends where the next begins", () => {
    const { lines, skipped } = parseLrc("[ar:someone]\n[00:10.50] first line\n[00:13.00]second line\n\nnot a line\n[01:02.250] third", 70);
    expect(skipped).toEqual(["not a line"]);
    expect(lines.map((l) => [l.lineIndex, l.text, l.start, l.end])).toEqual([
      [0, "first line", 10.5, 13],
      [1, "second line", 13, 21],
      [2, "third", 62.25, 70],
    ]);
  });

  it("a repeated line is a hook, and a row with two stamps is two lines", () => {
    const { lines } = parseLrc("[00:05.00][00:20.00] ice on\n[00:09.00] other", null);
    expect(lines.map((l) => [l.text, l.start, l.section])).toEqual([
      ["ice on", 5, "hook"],
      ["other", 9, "verse"],
      ["ice on", 20, "hook"],
    ]);
  });
});

describe("the one treatment", () => {
  it("reads the old builder's concept + narrative as the treatment, and knows the board came from it", () => {
    const doc = parseTreatmentDoc({ version: 2, concept: "Ice.", narrative: "He walks.", clips: [{ key: "c001" }], model: "m", generated_at: "2026-09-30T00:00:00Z" });
    expect(doc.text).toBe("Ice.\n\nHe walks.");
    expect(doc.mode).toBe("ai");
    expect(storyboardIsStale(doc)).toBe(false);
  });

  it("stores what the director typed, verbatim, and keeps the other keys", () => {
    const existing = { version: 2, concept: "old", narrative: "old n", clips: [{ key: "c001" }], sections: [{ name: "hook" }] };
    const next = withTreatmentDoc(existing, { ...parseTreatmentDoc(existing), text: "  My treatment,\nexactly.  ", mode: "manual", updatedAt: "t" });
    expect((next.treatment as { text: string }).text).toBe("  My treatment,\nexactly.  ");
    expect(next.text).toBe("  My treatment,\nexactly.  ");
    expect(next.clips).toEqual([{ key: "c001" }]);
    const back = parseTreatmentDoc(next);
    expect(back.mode).toBe("manual");
    expect(back.text).toBe("  My treatment,\nexactly.  ");
    // the boxes were written from the OLD text: the board is now behind the treatment
    expect(storyboardIsStale(back)).toBe(true);
  });

  it("fingerprints ignore whitespace only", () => {
    expect(fingerprint("a  b\n")).toBe(fingerprint("a b"));
    expect(fingerprint("a b")).not.toBe(fingerprint("a c"));
  });

  it("deleting clears the text and nothing else of the director's", () => {
    const existing = withTreatmentDoc({ clips: [{ key: "c001" }] }, { text: "x", mode: "ai", updatedAt: "t", model: "m", notes: "no night", storyboard: null, footageConfirmedAt: "t0" });
    const cleared = clearTreatment(existing, "t1");
    const doc = parseTreatmentDoc(cleared);
    expect(hasTreatment(doc)).toBe(false);
    expect(doc.footageConfirmedAt).toBe("t0");
    expect(doc.notes).toBe("no night");
    expect(cleared.clips).toEqual([{ key: "c001" }]);
  });

  it("an empty project still has somewhere to confirm the footage", () => {
    const doc = parseTreatmentDoc(null);
    expect(doc.text).toBe("");
    const saved = parseTreatmentDoc(withTreatmentDoc(null, { ...doc, footageConfirmedAt: "t" }));
    expect(saved.footageConfirmedAt).toBe("t");
  });
});
