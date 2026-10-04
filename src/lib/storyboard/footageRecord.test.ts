import { describe, expect, it } from "vitest";
import {
  covers,
  CURRENT,
  evidenceFor,
  fingerprintsMatch,
  pickAnalysis,
  stalenessOf,
  withAnalysis,
  type FootageFingerprint,
  type StoredFootageAnalysis,
} from "./footageRecord";
import type { FootageAnalysis } from "./footage";
import type { Compatibility } from "./compatibility";

const fp = (over: Partial<FootageFingerprint> = {}): FootageFingerprint => ({
  bucket: "project-clips",
  path: "u/p/S06.mp4",
  bytes: 6031742,
  seconds: 6.97,
  width: 1080,
  height: 1920,
  ...over,
});

const stored = (
  over: {
    range?: [number, number];
    version?: number;
    specVersion?: number;
    fingerprint?: FootageFingerprint;
  } = {},
): StoredFootageAnalysis => ({
  id: "x",
  fingerprint: over.fingerprint ?? fp(),
  settings: { detailTiles: 8, lightGrid: 12, sampledBy: "browser", scaler: "canvas drawImage" },
  analysis: {
    version: (over.version ?? CURRENT.analyzer) as FootageAnalysis["version"],
    range: over.range ?? [0, 6.97],
  } as FootageAnalysis,
  compatibility: {
    version: (over.specVersion ?? CURRENT.compatibility) as Compatibility["version"],
  } as Compatibility,
  evidence: [],
});

describe("a kept reading may only be believed of the same file", () => {
  it("is fresh for the same file and stretch", () => {
    expect(stalenessOf(stored(), { fingerprint: fp(), range: [0, 6.97] })).toEqual({
      state: "fresh",
    });
  });

  it("is VOID — not stale — when the file at the path is a different one", () => {
    // a re-encode at the same path is a different take; offering its old reading would be worse than offering none
    const s = stalenessOf(stored(), { fingerprint: fp({ bytes: 123 }), range: [0, 6.97] });
    expect(s.state).toBe("void");
  });

  it("notices a different picture size at the same path", () => {
    expect(stalenessOf(stored(), { fingerprint: fp({ width: 720 }), range: [0, 6.97] }).state).toBe(
      "void",
    );
  });
});

describe("a kept reading may only be believed of the same stretch", () => {
  it("is stale when the shot uses a stretch the reading did not cover", () => {
    const s = stalenessOf(stored({ range: [0, 2] }), { fingerprint: fp(), range: [2, 6] });
    expect(s.state).toBe("stale");
    expect(s.state === "stale" && s.why).toContain("0–2 s");
  });

  it("is fresh when the reading covers more than the shot uses", () => {
    expect(
      stalenessOf(stored({ range: [0, 6.97] }), { fingerprint: fp(), range: [2, 4] }).state,
    ).toBe("fresh");
  });

  it("covers() allows a frame of slack either side", () => {
    expect(covers([0, 4], [0.01, 3.99])).toBe(true);
    expect(covers([0, 4], [0, 4.5])).toBe(false);
  });
});

describe("a reading by an older analyzer is stale, never dropped", () => {
  it("says which version read it", () => {
    const s = stalenessOf(stored({ version: 0 }), { fingerprint: fp(), range: [0, 6.97] });
    expect(s.state).toBe("stale");
    expect(s.state === "stale" && s.why).toContain("v0");
  });

  it("catches an older background spec too", () => {
    expect(
      stalenessOf(stored({ specVersion: 0 }), { fingerprint: fp(), range: [0, 6.97] }).state,
    ).toBe("stale");
  });
});

describe("picking which reading to show", () => {
  it("prefers a fresh one over a stale one", () => {
    const picked = pickAnalysis([stored({ version: 0 }), stored()], {
      fingerprint: fp(),
      range: [0, 6.97],
    });
    expect(picked!.staleness.state).toBe("fresh");
  });

  it("shows a stale one rather than nothing", () => {
    const picked = pickAnalysis([stored({ version: 0 })], { fingerprint: fp(), range: [0, 6.97] });
    expect(picked!.staleness.state).toBe("stale");
  });

  it("never shows a void one", () => {
    expect(
      pickAnalysis([stored({ fingerprint: fp({ bytes: 9 }) })], {
        fingerprint: fp(),
        range: [0, 6.97],
      }),
    ).toBeNull();
  });
});

describe("two shots on one take keep two readings", () => {
  it("keeps a second stretch beside the first", () => {
    const all = withAnalysis([stored({ range: [0, 2] })], stored({ range: [2, 4] }));
    expect(all).toHaveLength(2);
  });

  it("replaces a reading of the same stretch rather than piling up", () => {
    const all = withAnalysis([stored({ range: [0, 2] })], stored({ range: [0, 2] }));
    expect(all).toHaveLength(1);
  });

  it("bounds how many are kept", () => {
    let all: StoredFootageAnalysis[] = [];
    for (let i = 0; i < 12; i++) all = withAnalysis(all, stored({ range: [i, i + 1] }));
    expect(all.length).toBeLessThanOrEqual(8);
  });
});

describe("evidence is chosen, not sampled at a stride", () => {
  const faces = [
    { t: 0.1, face: { cx: 0.5, reach: 11 } },
    { t: 1.0, face: { cx: 0.29, reach: 11 } },
    { t: 2.0, face: { cx: 0.72, reach: 11 } },
    { t: 3.0, face: null },
  ];
  const a = { range: [0, 4], focus: { blurredFrames: { value: 0 } } } as unknown as FootageAnalysis;

  it("picks the frames that bound where he goes", () => {
    const e = evidenceFor(a, faces);
    expect(e.map((x) => x.t)).toContain(1);
    expect(e.map((x) => x.t)).toContain(2);
    expect(e.find((x) => x.t === 1)!.why).toContain("frame left");
  });

  it("falls back to the opening frame when his face was never found", () => {
    expect(evidenceFor(a, [{ t: 0, face: null }])).toEqual([{ t: 0, why: "the opening frame" }]);
  });
});

describe("fingerprintsMatch", () => {
  it("is exact about every field", () => {
    expect(fingerprintsMatch(fp(), fp())).toBe(true);
    for (const k of ["bucket", "path", "bytes", "seconds", "width", "height"] as const) {
      expect(
        fingerprintsMatch(fp(), fp({ [k]: k === "bucket" || k === "path" ? "other" : 1 } as never)),
      ).toBe(false);
    }
  });
});
