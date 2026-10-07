import { describe, expect, it } from "vitest";
import { costLine, coverageGaps, parseBeatCoverage, parseWriterRun } from "./beatCoverage";

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
