import { describe, expect, it } from "vitest";
import { acceptBeats, allocateBeats, auditBeatsAgainstTreatment, BEATS_SCHEMA, beatsSystemPrompt, briefedShot, coverageOf, cueIndex, cueMatches, fewestBeats, normalizeTieKinds, paragraphsOf, share, shotBriefs, tieKindFromWords, withFeasibleProduction, withRequiredLinks, type Beat } from "./beats.ts";
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
    expect(got[1].ties).toEqual([{ kind: "screen_shows", to: "b01", note: "the CRT", words: "" }]);
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

  it("finds a cue sung across a cut — a shot's lyrics are cut at its boundary word by word — and pins the shot singing most of it", () => {
    // the words of one line fall across three shots: "You don’t gotta" | "cut the lights on / This ice on / YSL" | "I wear em"
    const cut: GridShot[] = [
      { key: "c001", start: 0, end: 4, lyrics: "" },
      { key: "c002", start: 4, end: 8, lyrics: "You don’t gotta" },
      { key: "c003", start: 8, end: 12, lyrics: "cut the lights on / This ice on / YSL" },
      { key: "c004", start: 12, end: 16, lyrics: "I wear em / No minors / More" },
      { key: "c005", start: 16, end: 20, lyrics: "cameras in the whip / Than a camera crew" },
      { key: "c006", start: 20, end: 24, lyrics: "You don’t gotta cut the lights on, this ice on" },
    ];
    // the whole cue is in no single shot; the shot that sings most of it is pinned
    expect(cueIndex(cut, "you don't gotta cut the lights on, this ice on")).toBe(2);
    expect(cueIndex(cut, "More cameras in the whip than a camera crew")).toBe(4);
    // a cue spanning two lyric lines is found across the " / " between them
    expect(cueIndex(cut, "than a camera crew you don't gotta")).toBe(4);
    // from a later point, only the later singing counts
    expect(cueIndex(cut, "you don't gotta cut the lights on, this ice on", 3)).toBe(5);
    // a near-quote still finds its first words
    expect(cueIndex(cut, "more cameras in the whip than the camera crews")).toBe(4);
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
      beat({ id: "viewer", weight: 1, people: ["ARTIST"], ties: [{ kind: "screen_shows", to: "forest", note: "the CRT", words: "" }] }),
      beat({ id: "chicago", weight: 3, people: ["ARTIST"], artistPerforms: true, lyricCue: "You don’t gotta cut the lights on", wardrobe: "his exact leather coat" }),
      beat({ id: "crew", weight: 1, lyricCue: "more cameras in the whip" }), // sung BEFORE chicago: not an anchor
      beat({ id: "suv", weight: 1, ties: [{ kind: "reveals", to: "crew", note: "the door", words: "" }] }),
      beat({ id: "entrance", weight: 2, lyricCue: "this ice on" }),
    ];
    const a = allocateBeats(beats, grid, { lyricInserts: false });
    expect(a.anchors.map((x) => `${x.beat}@${x.shot}`)).toEqual(["chicago@c007", "entrance@c011"]);
    // sung only before the beat's turn: not an anchor — and, with inserts on, a flash of the beat there (see below)
    expect(a.unanchored).toEqual([{ beat: "crew", cue: "more cameras in the whip", sung: "earlier" }]);
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
    const a = allocateBeats(beats, grid, { lyricInserts: false });
    expect(a.byBeat.a).toEqual(["c001", "c002", "c003"]);
    expect(a.byBeat.b).toEqual(["c004", "c005", "c006"]);
    expect(a.byBeat.c).toEqual(["c007", "c008", "c009", "c010", "c011", "c012"]);
  });
});

describe("each shot is briefed with its beat, and the board is checked against the beats", () => {
  const beats = [
    beat({ id: "forest", people: ["RIDER"], unnamedPeople: true, weight: 1 }),
    beat({ id: "viewer", people: ["ARTIST"], wardrobe: "his exact denim look", ties: [{ kind: "screen_shows", to: "forest", note: "the CRT", words: "" }], weight: 1 }),
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
    expect(c.beats[0].people).toEqual([{ key: "RIDER", castIn: ["c001"], onScreenIn: [] }]);
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

  it("a person seen on a screen — a shot of the beat whose screen shows a shot that casts them — is not missing", () => {
    const b2 = [beat({ id: "ride", people: ["RIDER"] }), beat({ id: "viewer", people: ["ARTIST", "RIDER"], ties: [{ kind: "screen_shows", to: "ride", note: "the CRT", words: "" }] })];
    const a2 = allocateBeats(b2, grid.slice(0, 2));
    const clips = [
      { key: "c001", cast: { members: [{ key: "RIDER" }], none: false }, continuity: { links: [] } },
      { key: "c002", cast: { members: [{ key: "ARTIST" }], none: false }, continuity: { links: [{ kind: "screen_shows", shot: "c001" }] } },
    ];
    const c = coverageOf(b2, a2, clips);
    expect(c.missingPeople).toEqual([]);
    expect(c.structural.beats[1].people).toEqual([{ key: "ARTIST", castIn: ["c002"], onScreenIn: [] }, { key: "RIDER", castIn: [], onScreenIn: ["c002"] }]);
    // a link of another kind does not carry them
    const c2 = coverageOf(b2, a2, [clips[0], { ...clips[1], continuity: { links: [{ kind: "match_position", shot: "c001" }] } }]);
    expect(c2.missingPeople).toEqual([{ beat: "viewer", key: "RIDER" }]);
  });
});

describe("lyric synchronisation is never silently traded for narrative order", () => {
  it("a beat whose words are sung only before its turn gets a flash shot there, taken from the beat that held it, and is reported as an insert", () => {
    const beats = [
      beat({ id: "forest", weight: 3, people: ["RIDER"] }),
      beat({ id: "viewer", weight: 1, people: ["ARTIST"] }),
      beat({ id: "chicago", weight: 3, lyricCue: "You don’t gotta cut the lights on" }),
      beat({ id: "crew", weight: 1, lyricCue: "more cameras in the whip than a camera crew" }),
    ];
    const a = allocateBeats(beats, grid);
    // "cameras in the whip" is sung at c004, inside the forest's run: the crew gets c004 as a flash and keeps its own run after chicago
    expect(a.inserts).toEqual([{ beat: "crew", shot: "c004", cue: "more cameras in the whip than a camera crew", takenFrom: "forest" }]);
    expect(a.byBeat.forest).toEqual(["c001", "c002", "c003"]);
    expect(a.byBeat.crew[0]).toBe("c004");
    expect(a.byBeat.crew.length).toBeGreaterThan(1);
    expect(a.byShot.c004).toBe("crew");
    const briefs = shotBriefs(beats, a);
    expect(briefs.c004.insert).toBe(true);
    expect(briefs.c004.first).toBe(false);
    expect((briefedShot(grid[3], briefs.c004) as { beat: { position: string } }).beat.position).toContain("a flash of this beat on its words");
    // the beat's own run still opens where the treatment puts it, so its ties land there, not on the flash
    const own = a.byBeat.crew[1];
    expect(briefs[own].first).toBe(true);
    // with inserts off, the same cue is only reported
    const off = allocateBeats(beats, grid, { lyricInserts: false });
    expect(off.inserts).toEqual([]);
    expect(off.unanchored).toEqual([{ beat: "crew", cue: "more cameras in the whip than a camera crew", sung: "earlier" }]);
    expect(coverageOf(beats, off, []).lyrics.verdict).toBe("fail");
    expect(coverageOf(beats, a, []).lyrics.verdict).toBe("gaps");
  });

  it("a cue the song never sings is reported as never, and an insert is never taken from a beat with one shot", () => {
    const beats = [beat({ id: "a", weight: 1 }), beat({ id: "b", weight: 1 }), beat({ id: "c", lyricCue: "words never sung" })];
    const a = allocateBeats(beats, grid.slice(0, 3));
    expect(a.unanchored).toEqual([{ beat: "c", cue: "words never sung", sung: "never" }]);
    const b2 = [beat({ id: "a", weight: 1 }), beat({ id: "b", weight: 1, lyricCue: "cameras in the whip" })];
    const small = allocateBeats(b2, [grid[3], grid[4]]); // c004 sings the cue; a holds only c004
    expect(small.inserts).toEqual([]);
    expect(small.byBeat).toEqual({ a: ["c004"], b: ["c005"] });
  });
});

describe("a cue sung long before its beat's turn is a flash, not a pin — seen on Interrupted Broadcast · candidate 4", () => {
  // forty shots; the hook is sung at shot 4 and again at 20 and 36; the crew's and janitor's words once each, at 6 and 7
  const song: GridShot[] = Array.from({ length: 40 }, (_, i) => ({
    key: `c${String(i + 1).padStart(3, "0")}`,
    start: i * 4,
    end: (i + 1) * 4,
    lyrics: i === 3 || i === 19 || i === 35 ? "you don’t gotta cut the lights on" : i === 5 ? "more cameras in the whip than a camera crew" : i === 6 ? "so clean but I don’t do what the janitor do" : "",
  }));
  const beats = [
    beat({ id: "show", weight: 3 }),
    beat({ id: "chaos", weight: 3 }),
    beat({ id: "ride", weight: 3 }),
    beat({ id: "viewer", weight: 2 }),
    beat({ id: "switch", weight: 3, lyricCue: "you don’t gotta cut the lights on" }),
    beat({ id: "cold", weight: 2 }),
    beat({ id: "crew", weight: 2, lyricCue: "more cameras in the whip than a camera crew" }),
    beat({ id: "entrance", weight: 3, lyricCue: "so clean but I don’t do what the janitor do" }),
  ];

  it("lists every singing of a cue, and pins the one nearest the beat's turn by weight — a repeated hook is not pinned to its first singing", () => {
    expect(cueMatches(song, "you don’t gotta cut the lights on")).toEqual([3, 19, 35]);
    const a = allocateBeats(beats, song);
    // the switch's turn by weight is shot 21 (11 of 21 weight before it): the singing at 20 is pinned, not the one at 4
    expect(a.anchors).toEqual([{ beat: "switch", shot: "c020", cue: "you don’t gotta cut the lights on" }]);
    // the opening keeps the board before the pin (19 shots, two of them lent to flashes below)
    expect(a.byBeat.show.length + a.byBeat.chaos.length + a.byBeat.ride.length + a.byBeat.viewer.length).toBe(17);
    expect(a.byBeat.show.length).toBeGreaterThanOrEqual(4);
  });

  it("a cue sung only before the pin before it is a flash on its words, and the beat keeps its turn in order", () => {
    const a = allocateBeats(beats, song);
    expect(a.unanchored).toEqual([
      { beat: "crew", cue: "more cameras in the whip than a camera crew", sung: "earlier" },
      { beat: "entrance", cue: "so clean but I don’t do what the janitor do", sung: "earlier" },
    ]);
    expect(a.inserts.map((i) => `${i.beat}@${i.shot}<${i.takenFrom}`)).toEqual(["crew@c006<chaos", "entrance@c007<chaos"]);
    expect(a.byBeat.crew.slice(1).every((k) => k > "c020")).toBe(true);
    expect(a.byBeat.entrance.slice(1).every((k) => k > "c020")).toBe(true);
  });

  it("a cue sung after the pin before it but long before the beat's own turn (before half-way to it) is a flash too, not a pin that crushes the beats before it", () => {
    // no hook cue on the switch, and the crew's words sung at shot 10 (after its rank, 7): its turn by weight is shot 30
    const noSwitchCue = beats.map((b) => (b.id === "switch" ? { ...b, lyricCue: "" } : b));
    const sungAt10 = song.map((g, i) => (i === 9 ? { ...g, lyrics: "more cameras in the whip than a camera crew" } : i === 5 ? { ...g, lyrics: "" } : g));
    const a = allocateBeats(noSwitchCue, sungAt10);
    expect(a.anchors).toEqual([]);
    expect(a.unanchored).toEqual([
      { beat: "crew", cue: "more cameras in the whip than a camera crew", sung: "early", shot: "c010" },
      // the eighth beat can never be pinned to the seventh shot: sung before its rank, so "earlier"
      { beat: "entrance", cue: "so clean but I don’t do what the janitor do", sung: "earlier" },
    ]);
    expect(a.inserts.map((i) => `${i.beat}@${i.shot}`)).toEqual(["crew@c010", "entrance@c007"]);
    // the opening is not crushed into seven shots (what pinning did on candidate 4)
    expect(a.byBeat.show.length + a.byBeat.chaos.length + a.byBeat.ride.length + a.byBeat.viewer.length).toBeGreaterThan(14);
    // with inserts off the early cues stay reported, and the lyric section fails rather than passes quietly
    const off = allocateBeats(noSwitchCue, sungAt10, { lyricInserts: false });
    expect(off.inserts).toEqual([]);
    const c = coverageOf(noSwitchCue, off, song.map((g) => ({ key: g.key, cast: { members: [], none: false }, continuity: { links: [] } })));
    expect(c.lyrics.verdict).toBe("fail");
    // a cue sung at least half-way to the beat's turn is still a pin
    const late = song.map((g, i) => (i === 16 ? { ...g, lyrics: "more cameras in the whip than a camera crew" } : i === 5 ? { ...g, lyrics: "" } : g));
    expect(allocateBeats(noSwitchCue, late).anchors).toEqual([{ beat: "crew", shot: "c017", cue: "more cameras in the whip than a camera crew" }]);
  });

  it("two cues sung in one shot: the first beat's flash keeps the shot, the second is not placed on its words — a flash is never taken from a flash (candidate 5)", () => {
    // the crew's and the geese's words are both sung at shot 6
    const twoCues = song.map((g, i) => (i === 5 ? { ...g, lyrics: "more cameras in the whip than a camera crew / all this ice around me need a canada goose" } : g));
    const withGeese = [...beats.slice(0, 7), beat({ id: "geese", weight: 1, lyricCue: "all this ice around me need a canada goose" }), beats[7]];
    const a = allocateBeats(withGeese, twoCues);
    expect(a.inserts.map((i) => `${i.beat}@${i.shot}`)).toEqual(["crew@c006", "entrance@c007"]);
    expect(a.unanchored.find((u) => u.beat === "geese")).toEqual({ beat: "geese", cue: "all this ice around me need a canada goose", sung: "earlier" });
    expect(a.byShot.c006).toBe("crew");
  });

  it("a beat holding more than half the board is reported as lumped, and a reading with too few beats is told apart", () => {
    const few = [beat({ id: "show", weight: 1 }), beat({ id: "viewer", weight: 1 }), beat({ id: "rest", weight: 5 })];
    const a = allocateBeats(few, song);
    const clips = song.map((g) => ({ key: g.key, cast: { members: [], none: false }, continuity: { links: [] } }));
    const c = coverageOf(few, a, clips, { beatReadings: [3, 3] });
    expect(c.structural.lumped).toEqual([{ beat: "rest", shots: a.byBeat.rest.length, share: Math.round((100 * a.byBeat.rest.length) / 40) }]);
    expect(c.structural.verdict).toBe("gaps");
    expect(c.structural.readings).toEqual([3, 3]);
    expect(c.ok).toBe(false);
    // the fewest beats a reading may return: a quarter of the paragraphs, three at least, twelve at most
    const paragraph = "one two three four five six seven eight nine.";
    expect(paragraphsOf(Array(32).fill(paragraph).join("\n\n")).length).toBe(32);
    expect(fewestBeats(Array(32).fill(paragraph).join("\n\n"))).toBe(8);
    expect(fewestBeats(Array(2).fill(paragraph).join("\n\n"))).toBe(3);
    expect(fewestBeats(Array(100).fill(paragraph).join("\n\n"))).toBe(12);
  });
});

describe("a tie is checked for type, direction and target — the CRT case", () => {
  it("reads the kind a cut's own words state", () => {
    expect(tieKindFromWords("We pull back from that same image playing on a small black-and-white CRT television.")).toBe("screen_shows");
    expect(tieKindFromWords("Inside, a security monitor shows the woman on horseback.")).toBe("screen_shows");
    expect(tieKindFromWords("Fendi occupies the same position in the frame, now standing at 79th and Lafayette")).toBe("match_position");
    expect(tieKindFromWords("We follow toward the opening door — and cut outside to reveal a Maybach SUV.")).toBe("reveals");
    expect(tieKindFromWords("The click lands with the vocal entrance.")).toBe("continues");
    expect(tieKindFromWords("she rides along the cleared route")).toBeNull();
  });

  it("a tie typed against its own words is retyped from them, reported, and a duplicate device collapses to one", () => {
    const beats = [
      beat({ id: "rider" }),
      beat({ id: "viewer", ties: [
        { kind: "match_position", to: "rider", note: "same image on CRT", words: "We pull back from that same image playing on a small black-and-white CRT television." },
        { kind: "reveals", to: "rider", note: "pull back from the image", words: "We pull back from that same image playing on a small black-and-white CRT television." },
      ] }),
    ];
    const n = normalizeTieKinds(beats);
    expect(n.beats[1].ties).toEqual([{ kind: "screen_shows", to: "rider", note: "same image on CRT", words: "We pull back from that same image playing on a small black-and-white CRT television." }]);
    expect(n.corrections.map((c) => `${c.from}→${c.kind}`)).toEqual(["match_position→screen_shows", "reveals→screen_shows"]);
    // a tie whose words state no kind keeps what the model said
    const kept = normalizeTieKinds([beat({ id: "a" }), beat({ id: "b", ties: [{ kind: "continues", to: "a", note: "", words: "and then" }] })]);
    expect(kept.corrections).toEqual([]);
    expect(kept.beats[1].ties[0].kind).toBe("continues");
  });

  it("coverage fails a relationship whose link is of another kind, and says so by type, direction and target", () => {
    const beats = [beat({ id: "rider" }), beat({ id: "viewer", ties: [{ kind: "screen_shows", to: "rider", note: "the CRT", words: "playing on a CRT television" }] })];
    const a = allocateBeats(beats, grid.slice(0, 4));
    expect(a.byBeat).toEqual({ rider: ["c001", "c002"], viewer: ["c003", "c004"] });
    const wrongKind = [{ key: "c003", cast: { members: [], none: true }, continuity: { links: [{ kind: "match_position", shot: "c002", note: "" }] } }];
    const c = coverageOf(beats, a, wrongKind);
    expect(c.relationships.ties[0]).toMatchObject({ beat: "viewer", to: "rider", kind: "screen_shows", statedKind: "screen_shows", fromShot: "c003", toShot: "c002", typeOk: true, directionOk: true, targetOk: true, present: false });
    expect(c.relationships.verdict).toBe("fail");
    expect(c.verdict).toBe("fail");
    expect(c.ok).toBe(false);
    // a tie whose own kind contradicts its words is flagged even when a matching link exists
    const mistyped = [beat({ id: "rider" }), beat({ id: "viewer", ties: [{ kind: "reveals", to: "rider", note: "", words: "playing on a CRT television" }] })];
    const c2 = coverageOf(mistyped, allocateBeats(mistyped, grid.slice(0, 4)), [{ key: "c003", cast: { members: [], none: true }, continuity: { links: [{ kind: "reveals", shot: "c002", note: "" }] } }]);
    expect(c2.relationships.mistyped).toEqual([{ beat: "viewer", kind: "reveals", statedKind: "screen_shows", to: "rider" }]);
    expect(c2.relationships.verdict).toBe("fail");
    // the right kind on the right shot passes
    const right = [{ key: "c003", cast: { members: [], none: true }, continuity: { links: [{ kind: "screen_shows", shot: "c002", note: "" }] } }];
    expect(coverageOf(beats, a, right).relationships.verdict).toBe("pass");
  });
});

describe("production feasibility — a rapping take is not a seated man", () => {
  it("re-routes a take-based method on a shot of a beat where the artist does not perform, and says why", () => {
    const beats = [beat({ id: "viewer", people: ["ARTIST"], artistPerforms: false, action: "Fendi sits in his exact denim look, watching the CRT" }), beat({ id: "perf", people: ["ARTIST"], artistPerforms: true, action: "Fendi performs directly to camera" })];
    const a = allocateBeats(beats, grid.slice(0, 2));
    const briefs = shotBriefs(beats, a);
    const clips = [
      { key: "c001", production: { method: "restage", note: "" } },
      { key: "c002", production: { method: "restage", note: "" } },
    ];
    const r = withFeasibleProduction(clips, briefs);
    expect(r.corrections).toEqual([{ shot: "c001", from: "restage", to: "generate", why: expect.stringContaining("the take shows him performing; in this beat he Fendi sits") }]);
    expect((r.clips[0].production as { method: string }).method).toBe("generate");
    expect((r.clips[1].production as { method: string }).method).toBe("restage");
    // generate on a non-performing beat is fine as it is
    expect(withFeasibleProduction([{ key: "c001", production: { method: "generate", note: "" } }], briefs).corrections).toEqual([]);
    const c = coverageOf(beats, a, r.clips, { productionCorrections: r.corrections });
    expect(c.production).toEqual({ verdict: "gaps", corrected: r.corrections });
    expect(c.verdict).not.toBe("pass");
  });
});

describe("the beats are held against the treatment itself", () => {
  const treatment = [
    "Opening — The burning show",
    "We begin high above a forest at night. At first, it reads as aerial footage of a wildfire: smoke obscures sections of the ground.",
    "The camera crew",
    "On “more cameras in the whip than a camera crew,” we cut inside a cramped mobile broadcast control room. Monitors show Fendi performing.",
    "A camera operator shoulders a camera and reaches for the exit. We follow toward the opening door — and cut outside to reveal a Maybach SUV.",
  ].join("\n\n");

  it("a paragraph no beat shares a phrase with is reported, and a complete list passes", () => {
    const partial = [beat({ id: "forest", title: "The burning show", scene: "high above a forest at night", action: "aerial footage of a wildfire, smoke obscures sections of the ground" })];
    const audit = auditBeatsAgainstTreatment(treatment, partial);
    expect(audit.paragraphs).toBe(3);
    expect(audit.uncovered.map((u) => u.index)).toEqual([1, 2]);
    expect(audit.ok).toBe(false);
    const full = [...partial, beat({ id: "crew", title: "The camera crew", scene: "a cramped mobile broadcast control room", action: "monitors show Fendi performing; a camera operator shoulders a camera and reaches for the exit; cut outside to reveal a Maybach SUV" })];
    expect(auditBeatsAgainstTreatment(treatment, full).ok).toBe(true);
    // complete coverage of an incomplete beat list is not treatment coverage
    const a = allocateBeats(partial, grid.slice(0, 2));
    const c = coverageOf(partial, a, [{ key: "c001", cast: { members: [], none: true }, continuity: { links: [] } }, { key: "c002", cast: { members: [], none: true }, continuity: { links: [] } }], { treatment });
    expect(c.structural.verdict).toBe("pass");
    expect(c.treatment.verdict).toBe("fail");
    expect(c.verdict).toBe("fail");
    expect(c.ok).toBe(false);
  });
});

// ── the montage style (Fendi, 19 Nov 2026) ─────────────────────────────────────────────────────────────────────────
import { beatsFromScenes, BETWEEN_SCENES, MONTAGE_BEAT_CAP, MONTAGE_READING } from "./beats.ts";

// twenty shots of 2 s; four lines of a verse, each sung in one shot, and a hook line sung twice
const song: GridShot[] = Array.from({ length: 20 }, (_, i) => ({
  key: `s${String(i + 1).padStart(2, "0")}`,
  start: i * 2,
  end: (i + 1) * 2,
  section: i < 12 ? "verse" : "hook",
  lyrics:
    i === 2 ? "Flip through green like a salad" :
    i === 5 ? "ten radios on me" :
    i === 9 ? "books on the floor they float" :
    i === 13 || i === 17 ? "cease and desist" :
    "",
}));

describe("a montage: every scene sits on its own words, and no twist fills the board", () => {
  it("the writer's own scenes become the beats, in the song's order, each with its words as the cue", () => {
    const { beats, dropped } = beatsFromScenes(
      [
        { words: "Flip through green like a salad", event: "A dealer deals lettuce leaves across a casino table. The players stack them.", place: "a casino floor", people: ["RIDER", "NOBODY"] },
        { words: "ten radios on me", event: "Ten radios hang off one man like a coat; a bus driver waits.", place: "a bus stop" },
        { words: "a line the song does not have", event: "Something else.", place: "somewhere" },
        { words: "books on the floor they float", event: "Library books lift off the floor. The librarian stamps one in mid-air.", place: "a library" },
      ],
      song,
      people,
    );
    expect(beats.map((b) => b.lyricCue)).toEqual(["Flip through green like a salad", "ten radios on me", "books on the floor they float"]);
    expect(beats.map((b) => b.id)).toEqual(["b01", "b02", "b03"]);
    // only people on record are cast; the scene is never a performance beat; every scene weighs the same
    expect(beats[0].people).toEqual(["RIDER"]);
    expect(beats.every((b) => !b.artistPerforms && b.weight === 1 && b.ties.length === 0)).toBe(true);
    expect(beats[0].scene).toBe("a casino floor");
    expect(dropped).toEqual([{ words: "a line the song does not have", why: "the song does not sing these words" }]);
  });

  it("a scene whose words are sung only before the scene before it is dropped and said, never placed elsewhere", () => {
    const { beats, dropped } = beatsFromScenes(
      [
        { words: "ten radios on me", event: "Radios.", place: "p" },
        { words: "Flip through green like a salad", event: "Salad.", place: "p" },
      ],
      song,
      people,
    );
    expect(beats).toHaveLength(1);
    expect(dropped[0].why).toBe("its words are sung only before the scene before it");
  });

  it("each scene is pinned to the shot that sings its words — the salad on the salad line, not a minute later", () => {
    const { beats } = beatsFromScenes(
      [
        { words: "Flip through green like a salad", event: "Lettuce is dealt.", place: "casino" },
        { words: "ten radios on me", event: "Radios hang.", place: "bus stop" },
        { words: "books on the floor they float", event: "Books float.", place: "library" },
        { words: "cease and desist", event: "A letter is served to a goat.", place: "a porch" },
      ],
      song,
      people,
    );
    const a = allocateBeats(beats, song, { cueOrder: true, beatCap: MONTAGE_BEAT_CAP });
    expect(a.anchors.map((x) => x.shot)).toEqual(["s03", "s06", "s10", "s14"]);
    expect(a.unanchored).toEqual([]);
    expect(a.byBeat.b01[0]).toBe("s03");
    // the classic rule would have called the early singing "too early to pin": the fourth scene's turn by weight is
    // shot 15, the salad's is shot 0 — here the words decide
    expect(a.uncovered).toEqual([]);
  });

  it("no scene holds more than the cap: a few shots, a few seconds; the rest is his performance", () => {
    const { beats } = beatsFromScenes(
      [
        { words: "Flip through green like a salad", event: "Lettuce is dealt.", place: "casino" },
        { words: "books on the floor they float", event: "Books float.", place: "library" },
      ],
      song,
      people,
    );
    const a = allocateBeats(beats, song, { cueOrder: true, beatCap: MONTAGE_BEAT_CAP });
    // without the cap the salad would run from s03 to s09 (seven shots, 14 s) and the books from s10 to the end
    expect(a.byBeat.b01).toEqual(["s03", "s04"]);
    expect(a.byBeat.b02).toEqual(["s10", "s11"]);
    for (const id of ["b01", "b02"]) {
      expect(a.byBeat[id].length).toBeLessThanOrEqual(MONTAGE_BEAT_CAP.shots);
      const seconds = a.byBeat[id].reduce((n, k) => n + (song.find((g) => g.key === k)!.end - song.find((g) => g.key === k)!.start), 0);
      expect(seconds).toBeLessThanOrEqual(MONTAGE_BEAT_CAP.seconds);
    }
    // every other shot carries no beat: the two before the first words, and everything between and after the scenes
    expect(a.fill).toEqual(song.map((g) => g.key).filter((k) => !["s03", "s04", "s10", "s11"].includes(k)));
    expect(a.fill!.every((k) => a.byShot[k] === undefined)).toBe(true);
  });

  it("a beat without a cue never spans more than the cap either, and a long shot counts by its seconds", () => {
    const longShots: GridShot[] = Array.from({ length: 10 }, (_, i) => ({ key: `l${i + 1}`, start: i * 4, end: (i + 1) * 4, section: "verse", lyrics: "" }));
    const a = allocateBeats([beat({ id: "b01" }), beat({ id: "b02" })], longShots, { cueOrder: true, beatCap: MONTAGE_BEAT_CAP });
    // 4 s shots: one fits in 4.5 s, a second would not
    expect(a.byBeat.b01).toEqual(["l1"]);
    expect(a.byBeat.b02).toEqual(["l6"]);
    expect(a.fill).toHaveLength(8);
    const short = allocateBeats([beat({ id: "b01" })], song, { cueOrder: true, beatCap: { shots: 3, seconds: 60 } });
    expect(short.byBeat.b01).toHaveLength(3);
  });

  it("a beat he performs in is never capped: his performance may hold as long as the treatment gives it", () => {
    const a = allocateBeats([beat({ id: "b01", artistPerforms: true }), beat({ id: "b02" })], song, { cueOrder: true, beatCap: MONTAGE_BEAT_CAP });
    expect(a.byBeat.b01).toHaveLength(10);
    expect(a.byBeat.b02).toHaveLength(2);
  });

  it("a shot with no scene is briefed as his performance between two scenes, never as a beat", () => {
    const { beats } = beatsFromScenes([{ words: "ten radios on me", event: "Radios hang.", place: "bus stop" }], song, people);
    const a = allocateBeats(beats, song, { cueOrder: true, beatCap: MONTAGE_BEAT_CAP });
    const briefs = shotBriefs(beats, a);
    expect(briefs.s06.beat).toBe("b01");
    expect(briefs.s01).toMatchObject({ fill: true, artistPerforms: true, beat: "", links: [] });
    const handed = briefedShot(song[0], briefs.s01) as Record<string, unknown>;
    expect(handed.between_scenes).toBe(BETWEEN_SCENES);
    expect(handed.beat).toBeUndefined();
    expect(BETWEEN_SCENES).toContain("never a repeat");
    expect((briefedShot(song[5], briefs.s06) as Record<string, unknown>).beat).toMatchObject({ id: "b01" });
    // a take-based method on a performance fill is left alone (he performs there)
    const kept = withFeasibleProduction([{ key: "s01", production: { method: "footage", note: "" } }], briefs);
    expect(kept.corrections).toEqual([]);
  });

  it("the board passes coverage with performance shots between the scenes: a shot with no beat is not a gap", () => {
    const { beats } = beatsFromScenes(
      [
        { words: "Flip through green like a salad", event: "A dealer deals lettuce leaves across a casino table.", place: "casino" },
        { words: "ten radios on me", event: "Ten radios hang off one man like a coat.", place: "bus stop" },
      ],
      song,
      people,
    );
    const a = allocateBeats(beats, song, { cueOrder: true, beatCap: MONTAGE_BEAT_CAP });
    const clips = song.map((g) => ({ key: g.key, cast: { members: [], none: false, open: true }, continuity: { links: [] } }));
    const text = beats.map((b) => `When he raps "${b.lyricCue}" — ${b.scene}: ${b.action}`).join("\n\n");
    const c = coverageOf(beats, a, clips, { treatment: text });
    expect(c.verdict).toBe("pass");
    expect(c.structural.lumped).toEqual([]);
  });

  it("the classic cut is untouched: with no options there is no fill, no cap, and the early rule still holds", () => {
    const beats = [beat({ id: "b01" }), beat({ id: "b02", lyricCue: "ten radios on me" })];
    const a = allocateBeats(beats, song);
    expect(a.fill).toBeUndefined();
    expect(Object.keys(a.byShot)).toHaveLength(song.length);
    expect(a.byBeat.b02.length).toBeGreaterThan(MONTAGE_BEAT_CAP.shots);
  });

  it("a director's own montage text is read scene by scene: the reader is told a quoted line is its own beat", () => {
    expect(beatsSystemPrompt(people, true, true)).toContain(MONTAGE_READING);
    expect(MONTAGE_READING).toContain("never fold two quoted lines into one beat");
    expect(beatsSystemPrompt(people, true)).not.toContain("This treatment is a montage");
  });
});
