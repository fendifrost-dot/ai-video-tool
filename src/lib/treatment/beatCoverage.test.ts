import { describe, expect, it } from "vitest";
import { costLine, coverageGaps, coverageSections, parseBeatCoverage, parseWriterRun } from "./beatCoverage";

describe("a board's coverage of the treatment, read back and said in words", () => {
  it("reads a coverage and nothing that is not one", () => {
    expect(parseBeatCoverage(null)).toBeNull();
    expect(parseBeatCoverage({ ok: true })).toBeNull();
    const c = parseBeatCoverage({ ok: true, beats: [{ id: "b1", title: "A", shots: ["c001"], people: [{ key: "X", castIn: ["c001"] }], emptied: [], ties: [{ kind: "reveals", to: "b0", fromShot: "c001", toShot: null, present: true }] }], uncoveredBeats: [], missingPeople: [], missingLinks: [], anchors: [{ beat: "b1", shot: "c001", cue: "words" }], unanchored: [] });
    expect(c?.ok).toBe(true);
    expect(c?.beats[0].ties[0]).toEqual({ kind: "reveals", to: "b0", fromShot: "c001", toShot: null, present: true });
    expect(c?.anchors).toEqual([{ beat: "b1", shot: "c001", cue: "words" }]);
    expect(coverageGaps(c!)).toEqual([]);
  });

  it("names every gap, by beat title and shot label", () => {
    const c = parseBeatCoverage({
      ok: false,
      beats: [{ id: "b1", title: "Forest", shots: ["c001", "c002"], people: [{ key: "RIDER", castIn: [] }], emptied: ["c002"], ties: [] }, { id: "b2", title: "Room", shots: [], people: [], emptied: [], ties: [] }],
      uncoveredBeats: ["b2"],
      missingPeople: [{ beat: "b1", key: "RIDER" }],
      missingLinks: [{ beat: "b2", kind: "screen_shows", to: "b1" }],
      anchors: [],
      unanchored: [{ beat: "b2", cue: "never sung" }],
    })!;
    const gaps = coverageGaps(c, (k) => k.replace("c00", "#"));
    expect(gaps).toEqual([
      "“Room” got no shot — the song has fewer shots than the treatment has beats there.",
      "“Forest” puts RIDER in it, and no shot of it casts them.",
      "“Forest” has people, and shot #2 came back with nobody in it.",
      "“Room” is cut from “Forest” (screen shows) and no shot carries that link.",
      "“Room” is tied to the words “never sung”, which the song does not sing after the beat before it — it was placed in order instead.",
    ]);
  });

  it("the cost is the actual when it was counted, else unknown — the estimate is never said as the cost", () => {
    expect(costLine(null)).toBe("cost not recorded");
    expect(costLine(parseWriterRun({ id: "r", model: "m", actualCostUsd: 0.0312, estimatedCostUsd: 0.05 }))).toBe("cost $0.0312 at list price (estimate was $0.05)");
    expect(costLine(parseWriterRun({ id: "r", model: "m", actualCostUsd: null, estimatedCostUsd: 0.05 }))).toBe("actual cost unknown — the provider reported no usage (estimate was $0.05)");
    expect(parseWriterRun({ actualCostUsd: "0.1" })?.actualCostUsd).toBeNull();
  });
});

describe("the structural section tells a lumped reading and an early cue apart", () => {
  it("a beat holding most of the board, the readings, and a cue sung long before its turn are parsed and said", () => {
    const c = parseBeatCoverage({
      ok: false,
      verdict: "fail",
      structural: { verdict: "gaps", lumped: [{ beat: "b06", shots: 36, share: 84 }], readings: [6, 6] },
      lyrics: { verdict: "fail", inserts: [], unanchored: [] },
      beats: [{ id: "b06", title: "The clean entrance", shots: [], people: [], emptied: [], ties: [] }],
      uncoveredBeats: [], missingPeople: [], missingLinks: [], anchors: [],
      unanchored: [{ beat: "b06", cue: "so clean", sung: "early", shot: "c008" }],
    })!;
    expect(c.lumped).toEqual([{ beat: "b06", shots: 36, share: 84 }]);
    expect(c.readings).toEqual([6, 6]);
    expect(c.unanchored).toEqual([{ beat: "b06", cue: "so clean", sung: "early", shot: "c008" }]);
    const sections = coverageSections(c, (k) => k.replace("c0", "").replace(/^0/, ""));
    expect(sections[0].lines).toEqual(["“The clean entrance” holds 36 shots — 84% of the board: the reader folded several scenes of the treatment into one beat (read twice: 6, then 6 beats)."]);
    expect(sections[1].lines[0]).toMatch(/sung at shot 8 — long before the beat's turn; pinning it there would crush the beats before it — placed in order, NOT on its words/);
  });
});

