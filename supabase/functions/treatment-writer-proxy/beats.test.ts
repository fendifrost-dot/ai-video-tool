import { describe, expect, it } from "vitest";
import { acceptBeats, allocateBeats, BEATS_SCHEMA, beatsSystemPrompt, briefedShot, coverageOf, cueIndex, share, shotBriefs, withRequiredLinks, type Beat } from "./beats.ts";
import type { GridShot, WriterEntity } from "./contract.ts";

const people: WriterEntity[] = [
  { key: "ARTIST", kind: "character", name: "The artist" },
  { key: "RIDER", kind: "character", name: "The rider" },
  { key: "PLACE", kind: "location", name: "A place" },
];

// twelve shots; the hook's words are sung at shots 7 and 11
const grid: GridShot[] = Array.from({ length: 12 }, (_, i) => ({
  key: `c${String(i + 1).padStart(3, "0")}`,
  start: i * 4,
  end: (i + 1) * 4,
  section: i < 6 ? "verse" : "hook",
  lyrics: i === 6 || i === 10 ? "You don’t gotta cut the lights on, this ice on" : i === 3 ? "more cameras in the whip than a camera crew" : "",
}));

const beat = (over: Partial<Beat> & { id: string }): Beat => ({ title: over.id, scene: "", action: "x", people: [], unnamedPeople: false, artistPerforms: false, wardrobe: "", lyricCue: "", ties: [], weight: 3, ...over });

describe("the beats are read out of the treatment and checked", () => {
  it("keeps only people the project has, ties only to earlier beats, and makes ids unique", () => {
    const got = acceptBeats(
      { beats: [
        { id: "b01", title: "Forest", scene: "a forest at night", action: "models walk", people: ["RIDER", "NOBODY"], unnamed_people: true, artist_performs: false, wardrobe: "", lyric_cue: "", ties: [{ kind: "screen_shows", to: "b02", note: "" }], weight: 9 },
        { id: "b01", title: "Viewer", scene: "a room", action: "he watches", people: ["ARTIST"], unnamed_people: false, artist_performs: false, wardrobe: "his exact denim look", lyric_cue: "", ties: [{ kind: "screen_shows", to: "b01", note: "the CRT" }, { kind: "nope", to: "b01", note: "" }], weight: "2" },
        { id: "b03", title: "", scene: "", action: "", people: [], unnamed_people: false, artist_performs: true, wardrobe: "", lyric_cue: "", ties: [], weight: 3 },
      ] },
      people,
    );
    expect(got.map((b) => b.id)).toEqual(["b01", "b01_2"]);
    expect(got[0].people).toEqual(["RIDER"]);
    expect(got[0].unnamedPeople).toBe(true);
    expect(got[0].weight).toBe(5);
    // a tie forward (to a beat not yet listed) is dropped; a tie back is kept
    expect(got[0].ties).toEqual([]);
    expect(got[1].ties).toEqual([{ kind: "screen_shows", to: "b01", note: "the CRT" }]);
    expect(got[1].wardrobe).toBe("his exact denim look");
    expect(got[1].weight).toBe(2);
  });

  it("the schema asks for every field a beat has, and the prompt lists the people by key", () => {
    const req = BEATS_SCHEMA.schema.properties.beats.items.required;
    expect(req).toEqual(Object.keys(BEATS_SCHEMA.schema.properties.beats.items.properties));
    const prompt = beatsSystemPrompt(people, true);
    expect(prompt).toContain("- RIDER — The rider");
    expect(prompt).not.toContain("PLACE");
    expect(prompt).toContain("leave nothing out");
  });
});

describe("the shots are allotted to the beats, in the treatment's order", () => {
  it("finds the shot that sings a cue, whole or by its first words, from a point onward", () => {
    expect(cueIndex(grid, "you don't gotta cut the lights on")).toBe(6);
    expect(cueIndex(grid, "You don’t gotta cut the lights on, this ice on", 7)).toBe(10);
    expect(cueIndex(grid, "cameras in the whip")).toBe(3);
    expect(cueIndex(grid, "words never sung")).toBe(-1);
    expect(cueIndex(grid, "")).toBe(-1);
  });

  it("shares shots by weight, one each at least, the rest by largest remainder", () => {
    expect(share([1, 1, 1], 3)).toEqual([1, 1, 1]);
    expect(share([3, 1], 8)).toEqual([6, 2]);
    expect(share([1, 1, 1, 1], 2)).toEqual([1, 1, 0, 0]);
    expect(share([], 5)).toEqual([]);
  });

  it("pins beats with cues to the shots that sing them and fills the beats between by weight — later beats are never consumed", () => {
    const beats = [
      beat({ id: "forest", weight: 3, people: ["RIDER"], unnamedPeople: true }),
      beat({ id: "viewer", weight: 1, people: ["ARTIST"], ties: [{ kind: "screen_shows", to: "forest", note: "the CRT" }] }),
      beat({ id: "chicago", weight: 3, people: ["ARTIST"], artistPerforms: true, lyricCue: "You don’t gotta cut the lights on", wardrobe: "his exact leather coat" }),
      beat({ id: "crew", weight: 1, lyricCue: "more cameras in the whip" }), // sung BEFORE chicago: not an anchor
      beat({ id: "suv", weight: 1, ties: [{ kind: "reveals", to: "crew", note: "the door" }] }),
      beat({ id: "entrance", weight: 2, lyricCue: "this ice on" }),
    ];
    const a = allocateBeats(beats, grid);
    expect(a.anchors.map((x) => `${x.beat}@${x.shot}`)).toEqual(["chicago@c007", "entrance@c011"]);
    expect(a.unanchored).toEqual([{ beat: "crew", cue: "more cameras in the whip" }]);
    // before the first pin: six shots for forest (3) and viewer (1) → 1 + 3 and 1 + 1 of the four left
    expect(a.byBeat.forest).toEqual(["c001", "c002", "c003", "c004"]);
    expect(a.byBeat.viewer).toEqual(["c005", "c006"]);
    // from the pin to the next pin: four shots for chicago (3), crew (1), suv (1) → 2 + 1 + 1
    expect(a.byBeat.chicago).toEqual(["c007", "c008"]);
    expect(a.byBeat.crew).toEqual(["c009"]);
    expect(a.byBeat.suv).toEqual(["c010"]);
    expect(a.byBeat.entrance).toEqual(["c011", "c012"]);
    expect(a.uncovered).toEqual([]);
    expect(Object.keys(a.byShot)).toHaveLength(12);
  });

  it("with fewer shots than beats, the beats at the end are the uncovered ones — the board never silently drops them", () => {
    const a = allocateBeats([beat({ id: "a" }), beat({ id: "b" }), beat({ id: "c" })], grid.slice(0, 2));
    expect(a.byBeat).toEqual({ a: ["c001"], b: ["c002"], c: [] });
    expect(a.uncovered).toEqual(["c"]);
  });

  it("a cue the song sings only before the beat's turn is not an anchor, and a gap before a pin stays with the beat before it", () => {
    const beats = [beat({ id: "a", weight: 1 }), beat({ id: "b", weight: 1, lyricCue: "cameras in the whip" }), beat({ id: "c", weight: 1, lyricCue: "this ice on" })];
    const a = allocateBeats(beats, grid);
    expect(a.byBeat.a).toEqual(["c001", "c002", "c003"]);
    expect(a.byBeat.b).toEqual(["c004", "c005", "c006"]);
    expect(a.byBeat.c).toEqual(["c007", "c008", "c009", "c010", "c011", "c012"]);
  });
});

describe("each shot is briefed with its beat, and the board is checked against the beats", () => {
  const beats = [
    beat({ id: "forest", people: ["RIDER"], unnamedPeople: true, weight: 1 }),
    beat({ id: "viewer", people: ["ARTIST"], wardrobe: "his exact denim look", ties: [{ kind: "screen_shows", to: "forest", note: "the CRT" }], weight: 1 }),
  ];
  const small = grid.slice(0, 4);
  const a = allocateBeats(beats, small);
  const briefs = shotBriefs(beats, a);

  it("the first shot of a tied beat must link to the last shot of the beat it is tied to", () => {
    expect(a.byBeat).toEqual({ forest: ["c001", "c002"], viewer: ["c003", "c004"] });
    expect(briefs.c003.links).toEqual([{ kind: "screen_shows", shot: "c002", note: "the CRT" }]);
    expect(briefs.c004.links).toEqual([]);
    expect(briefs.c003.first).toBe(true);
    expect(briefs.c002.last).toBe(true);
    const handed = briefedShot(small[2], briefs.c003) as { beat: Record<string, unknown> };
    expect(handed.beat.people).toEqual(["ARTIST"]);
    expect(handed.beat.wardrobe).toBe("his exact denim look");
    expect(handed.beat.position).toBe("opens this beat");
    expect(handed.beat.must_link).toEqual([{ kind: "screen_shows", shot: "c002", note: "the CRT" }]);
    expect(briefedShot(small[0], undefined)).not.toHaveProperty("beat");
  });

  it("a required link the writer left out is put on the shot; one it wrote is kept once", () => {
    const clips = [
      { key: "c003", continuity: { links: [] } },
      { key: "c004", continuity: { links: [{ kind: "continues", shot: "c003", note: "" }] } },
    ];
    const out = withRequiredLinks(clips, briefs);
    expect((out[0].continuity as { links: unknown[] }).links).toEqual([{ kind: "screen_shows", shot: "c002", note: "the CRT" }]);
    expect((out[1].continuity as { links: unknown[] }).links).toEqual([{ kind: "continues", shot: "c003", note: "" }]);
    expect(withRequiredLinks(withRequiredLinks(clips, briefs), briefs)[0]).toEqual(out[0]);
  });

  it("coverage says which beat lost its people, which was emptied, and which tie is not a link — and is ok only when nothing is", () => {
    const clips = [
      { key: "c001", cast: { members: [{ key: "RIDER" }], none: false }, continuity: { links: [] } },
      { key: "c002", cast: { members: [], none: true }, continuity: { links: [] } },
      { key: "c003", cast: { members: [], none: true }, continuity: { links: [] } },
      { key: "c004", cast: { members: [{ key: "ARTIST" }], none: false }, continuity: { links: [] } },
    ];
    const c = coverageOf(beats, a, clips);
    expect(c.ok).toBe(false);
    expect(c.beats[0].people).toEqual([{ key: "RIDER", castIn: ["c001"] }]);
    expect(c.beats[0].emptied).toEqual(["c002"]);
    expect(c.missingPeople).toEqual([]);
    expect(c.beats[1].emptied).toEqual(["c003"]);
    expect(c.beats[1].ties).toEqual([{ kind: "screen_shows", to: "forest", fromShot: "c003", toShot: "c002", present: false }]);
    expect(c.missingLinks).toEqual([{ beat: "viewer", kind: "screen_shows", to: "forest" }]);

    const fixed = withRequiredLinks(
      clips.map((x) => (x.key === "c002" || x.key === "c003" ? { ...x, cast: { members: [{ key: x.key === "c002" ? "RIDER" : "ARTIST" }], none: false } } : x)),
      briefs,
    );
    expect(coverageOf(beats, a, fixed).ok).toBe(true);
  });

  it("a beat that got no shot is uncovered, and a person nobody cast is missing", () => {
    const b2 = [beat({ id: "one", people: ["ARTIST"] }), beat({ id: "two" })];
    const a2 = allocateBeats(b2, grid.slice(0, 1));
    const c = coverageOf(b2, a2, [{ key: "c001", cast: { members: [], none: false }, continuity: { links: [] } }]);
    expect(c.uncoveredBeats).toEqual(["two"]);
    expect(c.missingPeople).toEqual([{ beat: "one", key: "ARTIST" }]);
    expect(c.ok).toBe(false);
  });
});
