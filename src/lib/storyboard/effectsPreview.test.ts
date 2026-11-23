import { describe, expect, it } from "vitest";
import {
  claimsEffectsPreview,
  clipSpans,
  currentPreviews,
  effectsAt,
  effectsCoverage,
  effectsLabel,
  effectsLayer,
  effectsMediaTime,
  effectsPreviewIssues,
  effectsPreviewsOf,
  parseEffectsPreview,
  type EffectsPreview,
} from "./effectsPreview";

const record = (over: Record<string, unknown> = {}) => ({
  effects_preview: { section: "storm_verse", version: 1, song_start: 127.917, song_end: 207.542, fps: 24, frames: 1911, ...over },
});

const copy = (over: Partial<EffectsPreview> = {}): EffectsPreview => ({
  assetId: "a1",
  bucket: "project-exports",
  path: "u/p/effects_preview/storm_verse_v1.mp4",
  createdAt: "2026-11-23T10:00:00Z",
  section: "storm_verse",
  version: 1,
  songStart: 100,
  songEnd: 200,
  fps: 24,
  frames: 2400,
  label: null,
  madeAt: null,
  builtFrom: null,
  ...over,
});

describe("parseEffectsPreview", () => {
  it("reads a filed record", () => {
    const p = parseEffectsPreview({ ...record({ label: " Storm verse ", made_at: "2026-11-23T18:00:00Z", built_from: { lock: "LOCK_v1e" } }) });
    expect(p).toEqual({ section: "storm_verse", version: 1, songStart: 127.917, songEnd: 207.542, fps: 24, frames: 1911, label: "Storm verse", madeAt: "2026-11-23T18:00:00Z", builtFrom: { lock: "LOCK_v1e" } });
  });

  it("is null without the key, and for every record a player could not place", () => {
    expect(parseEffectsPreview(null)).toBeNull();
    expect(parseEffectsPreview({})).toBeNull();
    expect(parseEffectsPreview(record({ section: "Storm Verse" }))).toBeNull();
    expect(parseEffectsPreview(record({ section: "" }))).toBeNull();
    expect(parseEffectsPreview(record({ version: 0 }))).toBeNull();
    expect(parseEffectsPreview(record({ version: 1.5 }))).toBeNull();
    expect(parseEffectsPreview(record({ song_end: 127.917 }))).toBeNull();
    expect(parseEffectsPreview(record({ song_start: -1 }))).toBeNull();
    expect(parseEffectsPreview(record({ song_start: "127.9" }))).toBeNull();
    expect(parseEffectsPreview(record({ fps: 0 }))).toBeNull();
  });

  it("keeps a record whose optional fields are wrong, without them", () => {
    const p = parseEffectsPreview(record({ frames: -3, label: 7, made_at: "yesterday", built_from: ["x"] }));
    expect(p).toMatchObject({ frames: null, label: null, madeAt: null, builtFrom: null });
  });

  it("tells a row that claims to be a copy from one that does not", () => {
    expect(claimsEffectsPreview(record({ section: "BAD" }))).toBe(true);
    expect(claimsEffectsPreview({ effects_preview: null })).toBe(false);
    expect(claimsEffectsPreview({})).toBe(false);
  });
});

describe("effectsPreviewsOf", () => {
  const base = { bucket: "project-exports", path: "x.mp4", isVideo: true, createdAt: "2026-11-23T10:00:00Z" };
  const rec = parseEffectsPreview(record())!;

  it("takes videos with a record and leaves out rejected ones", () => {
    const got = effectsPreviewsOf([
      { ...base, id: "ok", effectsPreview: rec },
      { ...base, id: "rejected", effectsPreview: rec, approvalStatus: "rejected" },
      { ...base, id: "still", effectsPreview: rec, isVideo: false },
      { ...base, id: "plain", effectsPreview: null },
    ]);
    expect(got.map((p) => p.assetId)).toEqual(["ok"]);
    expect(got[0]).toMatchObject({ bucket: "project-exports", path: "x.mp4", section: "storm_verse" });
  });
});

describe("which copy plays", () => {
  it("shows only the highest version of a section, even where it is shorter", () => {
    const v1 = copy({ assetId: "v1", version: 1, songStart: 100, songEnd: 200 });
    const v2 = copy({ assetId: "v2", version: 2, songStart: 120, songEnd: 180 });
    const spans = effectsLayer([v1, v2]);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ start: 120, end: 180 });
    expect(spans[0].preview.assetId).toBe("v2");
    expect(effectsAt(spans, 110)).toBeNull();
  });

  it("takes the later filing of the same version", () => {
    const first = copy({ assetId: "first", createdAt: "2026-11-23T10:00:00Z" });
    const again = copy({ assetId: "again", createdAt: "2026-11-23T12:00:00Z" });
    expect(currentPreviews([first, again])[0].assetId).toBe("again");
    expect(currentPreviews([again, first])[0].assetId).toBe("again");
  });

  it("puts the section made later on top where two overlap, and never overlaps spans", () => {
    const grade = copy({ assetId: "grade", section: "first_half_grade", songStart: 0, songEnd: 113, madeAt: "2026-11-20T00:00:00Z" });
    const spins = copy({ assetId: "spins", section: "spins", songStart: 40, songEnd: 52, madeAt: "2026-11-22T00:00:00Z" });
    const spans = effectsLayer([grade, spins]);
    expect(spans.map((s) => [s.start, s.end, s.preview.assetId])).toEqual([
      [0, 40, "grade"],
      [40, 52, "spins"],
      [52, 113, "grade"],
    ]);
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
    expect(effectsAt(spans, 39.99)?.preview.assetId).toBe("grade");
    expect(effectsAt(spans, 40)?.preview.assetId).toBe("spins");
    expect(effectsAt(spans, 52)?.preview.assetId).toBe("grade");
  });

  it("gives the same answer whatever order the rows arrive in", () => {
    const a = copy({ assetId: "a", section: "a", songStart: 0, songEnd: 10 });
    const b = copy({ assetId: "b", section: "b", songStart: 5, songEnd: 15 });
    expect(effectsLayer([a, b])).toEqual(effectsLayer([b, a]));
  });

  it("drops a sliver shorter than a frame", () => {
    const under = copy({ assetId: "under", section: "under", songStart: 10, songEnd: 20.01, madeAt: "2026-11-20T00:00:00Z" });
    const over = copy({ assetId: "over", section: "over", songStart: 10, songEnd: 20, madeAt: "2026-11-22T00:00:00Z" });
    expect(effectsLayer([under, over]).map((s) => s.preview.assetId)).toEqual(["over"]);
  });

  it("is on screen from its first frame up to, not including, its end", () => {
    const spans = effectsLayer([copy()]);
    expect(effectsAt(spans, 99.99)).toBeNull();
    expect(effectsAt(spans, 100)).not.toBeNull();
    expect(effectsAt(spans, 199.99)).not.toBeNull();
    expect(effectsAt(spans, 200)).toBeNull();
    expect(effectsAt([], 100)).toBeNull();
  });
});

describe("effectsMediaTime", () => {
  const p = { songStart: 100, songEnd: 200 };

  it("addresses the copy by song time", () => {
    expect(effectsMediaTime(p, 100)).toEqual({ at: 0, hold: null });
    expect(effectsMediaTime(p, 137.5)).toEqual({ at: 37.5, hold: null });
    expect(effectsMediaTime(p, 90)).toEqual({ at: 0, hold: null });
  });

  it("holds the last frame of a file that is shorter than its record", () => {
    const got = effectsMediaTime(p, 180, 60);
    expect(got.hold).toBe("ran_out");
    expect(got.at).toBeCloseTo(59.95, 5);
    expect(effectsMediaTime(p, 150, 60)).toEqual({ at: 50, hold: null });
  });

  it("does not trust a file length that is not a number", () => {
    expect(effectsMediaTime(p, 150, Number.NaN)).toEqual({ at: 50, hold: null });
  });
});

describe("the strip", () => {
  const spans = effectsLayer([copy({ assetId: "a", section: "a", songStart: 0, songEnd: 30 }), copy({ assetId: "b", section: "b", songStart: 60, songEnd: 120 })]);

  it("cuts spans to the section being looked at", () => {
    expect(clipSpans(spans, 20, 90).map((s) => [s.start, s.end])).toEqual([
      [20, 30],
      [60, 90],
    ]);
    expect(clipSpans(spans, 30, 60)).toEqual([]);
  });

  it("says how much of the song has effects", () => {
    expect(effectsCoverage(spans, 0, 180)).toEqual({ seconds: 90, share: 0.5 });
    expect(effectsCoverage(spans, 0, 0)).toEqual({ seconds: 0, share: 0 });
  });

  it("names a copy for people", () => {
    expect(effectsLabel({ section: "storm_verse", version: 3, label: null })).toBe("storm verse · v3");
    expect(effectsLabel({ section: "storm_verse", version: 3, label: "Storm verse" })).toBe("Storm verse · v3");
  });
});

describe("effectsPreviewIssues", () => {
  const rec = parseEffectsPreview(record())!;

  it("passes the storm verse: 1911 frames for song frames 3070 to 4980", () => {
    expect(effectsPreviewIssues(rec)).toEqual([]);
    expect(effectsPreviewIssues(rec, 79.625)).toEqual([]);
  });

  it("calls out a frame count or a file length that does not fit the stretch", () => {
    expect(effectsPreviewIssues({ ...rec, frames: 1900 })[0]).toMatch(/1900 frames/);
    expect(effectsPreviewIssues(rec, 75)[0]).toMatch(/75\.000 s long/);
    expect(effectsPreviewIssues({ ...rec, frames: 1912 })).toEqual([]);
  });
});
