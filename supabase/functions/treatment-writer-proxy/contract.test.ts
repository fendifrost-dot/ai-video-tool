import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { acceptTimedBeats, WRITTEN_BEATS_MAX, WRITTEN_EFFECTS } from "../_shared/timedBeats.ts";
import { acceptCast, CAST_RULES, costOf, estimateCostUsd, fingerprint, acceptLinks, acceptProduction, linkedShots, linkUserMessage, PRODUCTION_RULES, acceptShots, writerEntities, chunkGrid, contextBlocks, outlineLine, repeatedScenes, rewriteUserMessage, shotsSystemPrompt, shotsUserMessage, SHOTS_SCHEMA, treatmentSystemPrompt, TREATMENT_DECIDES, TREATMENT_SCHEMA, withRewrites, type GridShot } from "./contract.ts";

const grid: GridShot[] = [
  { key: "c001", start: 0, end: 3.92, section: "intro", energy: "low", lyrics: "" },
  { key: "c002", start: 3.92, end: 7.84, section: "verse", energy: "mid", lyrics: "Never take a cheat day / Feel free today" },
  { key: "c003", start: 7.84, end: 11.76, section: "hook", energy: "high", lyrics: "You don't gotta cut the lights on" },
];
const ctx = { songTitle: "Song", lyrics: "line one\nline two", artistProfile: "A rapper.", visualStyle: "A runway at night.", mood: "Cold.", notes: "REAL PERFORMANCE FOOTAGE: take.mp4 — in it he wears: a camouflage shirt.\n\nNo logos.", looks: [{ name: "Black suit", description: "double-breasted" }] };

describe("what the treatment writer is told", () => {
  it("is the project's own words and nothing blank", () => {
    const blocks = contextBlocks(ctx);
    expect(blocks).toContain("the treatment decides and this is only the look:\nA runway at night.");
    // the notes are two things: facts about the footage, and wishes the treatment may have moved on from
    expect(blocks).toContain("is fact.");
    expect(blocks).toContain("where a note and the treatment disagree, the treatment is the later decision and the treatment wins:\nREAL PERFORMANCE FOOTAGE");
    expect(blocks).not.toContain("nothing you write may break them");
    expect(blocks).toContain("Lyrics:\nline one");
    expect(contextBlocks({ songTitle: "Song", mood: " " })).toBe("Song:\nSong");
  });

  it("with real footage, he is that footage: the looks on file are not offered and the scene is the place", () => {
    const withTake = treatmentSystemPrompt({ ...ctx, hasPerformanceFootage: true });
    expect(withTake).toContain("REAL performance footage");
    expect(withTake).toContain("write the PLACE he performs in");
    expect(withTake).toContain("He appears in performance shots.");
    // the cut: he carries the song, the picture leaves him and comes back, and no two frames of him are the same
    expect(withTake).toContain("about two are performance and one is a cutaway");
    expect(withTake).toContain("Never four performance shots in a row");
    expect(withTake).toContain("each is a different frame of him");
    expect(withTake).toContain("He keeps the body position and framing he was filmed in");
    expect(withTake).not.toContain("Wardrobe looks on file");
    const without = treatmentSystemPrompt({ ...ctx, hasPerformanceFootage: false });
    expect(without).toContain("There is no real footage of the artist yet");
    expect(without).toContain("Wardrobe looks on file:\n- Black suit: double-breasted");
  });

  it("the shots are written inside the treatment, with the whole board as context and the words of each shot", () => {
    const p = shotsSystemPrompt({ ...ctx, hasPerformanceFootage: true }, "ONE IDEA.\n\nHow it moves.", grid);
    expect(p).toContain("The treatment:\nONE IDEA.");
    expect(p.indexOf("The treatment:")).toBeLessThan(p.indexOf("How to write a shot"));
    expect(p).toContain('c002 0:03.9–0:07.8 [verse, mid] "Never take a cheat day / Feel free today"');
    expect(p).toContain("c001 0:00.0–0:03.9 [intro, low] (no words)");
    // the full lyric sheet is not sent a second time with every run of shots: each shot carries its own words
    expect(p).not.toContain("Lyrics:\nline one");
    expect(outlineLine({ key: "k", start: 61, end: 65, section: null })).toBe("k 1:01.0–1:05.0 [—] (no words)");
    expect(JSON.parse(shotsUserMessage(grid.slice(1, 2)))).toEqual({ shots: [{ key: "c002", seconds: 3.9, section: "verse", energy: "mid", lyrics: "Never take a cheat day / Feel free today" }] });
  });

  it("the schemas ask for exactly what the storyboard stores", () => {
    expect(TREATMENT_SCHEMA.schema.required).toEqual(["concept", "narrative", "sections"]);
    expect(SHOTS_SCHEMA.schema.properties.clips.items.required).toEqual(["key", "shot_type", "scene_description", "environment", "camera_direction", "lighting", "wardrobe", "wardrobe_from", "lyric_ref", "priority", "timed_beats", "continuity", "cast", "production"]);
    expect(SHOTS_SCHEMA.schema.properties.clips.items.properties.wardrobe_from.enum).toEqual(["footage", "treatment", "none"]);
    expect(SHOTS_SCHEMA.schema.properties.clips.items.properties.shot_type.enum).toContain("performance");
    // strict mode: a property that is not required is one the model never has to write — links were lost that way
    const cont = SHOTS_SCHEMA.schema.properties.clips.items.properties.continuity;
    expect(cont.required).toEqual(Object.keys(cont.properties));
    expect(cont.required).toContain("links");
  });

  it("a run's evidence: the treatment's fingerprint is the app's, and the estimate is at list price from what is sent", () => {
    expect(fingerprint("a b")).toMatch(/^3:[0-9a-z]+$/);
    expect(fingerprint("a b")).toBe(fingerprint(" a   b "));
    expect(fingerprint("a b")).not.toBe(fingerprint("a c"));
    const small = estimateCostUsd("grok-4-fast", 10, 1000, 2000);
    const big = estimateCostUsd("grok-4-fast", 43, 5600, 9000);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(0.1);
    // an unknown model is priced at the dearest known rate, never cheaper
    expect(estimateCostUsd("some-new-model", 43, 5600, 9000)).toBeGreaterThan(big);
    expect(costOf("grok-4-fast", { prompt_tokens: 1_000_000, completion_tokens: 0 })).toBe(0.2);
  });

  it("when the board is allotted to the treatment's beats, each shot is handed its beat and the rules say to stay inside it", () => {
    const briefs = { c002: { beat: "b02", title: "The viewer", scene: "a spare room", action: "he watches the CRT", people: ["ARTIST"], unnamedPeople: false, artistPerforms: false, wardrobe: "his exact denim look", first: true, last: true, insert: false, links: [{ kind: "screen_shows" as const, shot: "c001", note: "the CRT" }] } };
    const handed = JSON.parse(shotsUserMessage([grid[1]], briefs)) as { shots: { key: string; beat?: { people: string[]; must_link: unknown[] } }[] };
    expect(handed.shots[0].beat?.people).toEqual(["ARTIST"]);
    expect(handed.shots[0].beat?.must_link).toEqual([{ kind: "screen_shows", shot: "c001", note: "the CRT" }]);
    expect(JSON.parse(shotsUserMessage([grid[0]], briefs)).shots[0]).not.toHaveProperty("beat");
    const sys = shotsSystemPrompt({ ...ctx, hasPerformanceFootage: true }, "The treatment.", grid, true);
    expect(sys).toContain("Write the shot INSIDE that beat and nowhere else");
    expect(sys).toContain("A shot of a beat with people is never `none: true`");
    expect(shotsSystemPrompt({ ...ctx, hasPerformanceFootage: true }, "The treatment.", grid)).not.toContain("INSIDE that beat");
  });
});

describe("the grid owns the shots", () => {
  it("is written in runs, in order, none lost", () => {
    const many = Array.from({ length: 43 }, (_, i) => i);
    const runs = chunkGrid(many, 9);
    expect(runs.map((r) => r.length)).toEqual([9, 9, 9, 9, 7]);
    expect(runs.flat()).toEqual(many);
    expect(chunkGrid([], 9)).toEqual([]);
    expect(chunkGrid([1, 2], 0)).toEqual([[1], [2]]);
  });

  it("keeps only shots that were asked for, once each, with a scene — and says which are still missing", () => {
    const r = acceptShots(grid, { clips: [
      { key: "c002", scene_description: "He raps backstage." },
      { key: "c002", scene_description: "A duplicate." },
      { key: "c999", scene_description: "A shot nobody asked for." },
      { key: "c003", scene_description: "  " },
    ] });
    expect(r.clips.map((c) => c.key)).toEqual(["c002"]);
    expect(r.missing).toEqual(["c001", "c003"]);
    expect(acceptShots(grid, null)).toEqual({ clips: [], missing: ["c001", "c002", "c003"] });
  });
});

describe("the board is one board: no shot repeats another, and no shot contradicts the treatment", () => {
  it("is told a performance shot answers its words through the world around him, and that the treatment binds the shots", () => {
    const p = shotsSystemPrompt({ ...ctx, hasPerformanceFootage: true }, "On every hook the lights go out.", grid);
    expect(p).toContain("A performance shot is its own picture too.");
    expect(p).toContain("the world around him can answer the words");
    expect(p).toContain("is binding on the shots");
    expect(p).toContain("as a timed beat on those words when it happens inside the shot, as the state the shot opens in when it has already happened");
  });

  it("is told the treatment decides — over the footage rules, the notes and the no-logo rule — and to say when the footage cannot deliver it", () => {
    const p = shotsSystemPrompt({ ...ctx, hasPerformanceFootage: true }, "He stands at 79th and Lafayette in the leather coat. A monogram burns in the forest floor.", grid);
    expect(p).toContain(TREATMENT_DECIDES);
    // wardrobe: the treatment's garment is written, flagged, and never swapped for the footage's
    expect(p).toContain("unless the treatment itself dresses him in something else");
    expect(p).toContain("`wardrobe_from` is `treatment`");
    expect(p).toContain("the footage's clothes are never written in their place");
    expect(p).not.toContain("He wears exactly what the notes say he wears in the footage, in every shot he is in.");
    // he may be in a scene of his own when the treatment stages one
    expect(p).toContain("unless the treatment stages him in a scene of its own");
    // the treatment's own run of scenes is the cut
    expect(p).toContain("there the treatment's order is the cut");
    // a mark the treatment calls for is not forbidden; an impossible event is not softened
    expect(p).toContain("except a mark the treatment itself calls for");
    expect(p).toContain("never softened into something ordinary");
    expect(p).not.toContain("nothing that needs readable text or logos");
    // what returns on purpose returns as the same thing; what is linked across shots is written into both
    expect(p).toContain("is not a repeat: it returns as the SAME one");
    expect(p).toContain("is written into BOTH shots");
    // places: the treatment's first
    expect(p).toContain("Keep to the places the treatment names — and, where it leaves the place open, the ones the notes name.");
  });

  it("finds the shots that came back with another shot's sentence — the first keeps it", () => {
    const clips = [
      { key: "c001", scene_description: "He stands on the runway facing forward, delivering the line." },
      { key: "c002", scene_description: "A white sneaker on the black floor." },
      { key: "c003", scene_description: "he stands on the runway, facing forward — delivering the line" },
      { key: "c004", scene_description: "He stands on the runway facing forward, delivering the line." },
      { key: "c005", scene_description: "" },
    ];
    expect(repeatedScenes(clips)).toEqual(["c003", "c004"]);
    expect(repeatedScenes(clips.slice(0, 2))).toEqual([]);
  });

  it("asks for them again with every sentence already used, and with each shot's own words", () => {
    const m = JSON.parse(rewriteUserMessage([grid[1], grid[2]], ["He stands on the runway.", "He stands on the runway.", " "]));
    expect(m.note).toContain("Write each again as its own picture");
    expect(m.sentences_already_used).toEqual(["He stands on the runway."]);
    expect(m.shots.map((s: { key: string; lyrics: string }) => [s.key, s.lyrics])).toEqual([
      ["c002", "Never take a cheat day / Feel free today"],
      ["c003", "You don't gotta cut the lights on"],
    ]);
  });

  it("a rewrite replaces a repeat only when it is a sentence no shot has", () => {
    const clips = [
      { key: "c001", scene_description: "He stands on the runway." },
      { key: "c002", scene_description: "He stands on the runway." },
      { key: "c003", scene_description: "He stands on the runway." },
    ];
    const out = withRewrites(clips, [
      { key: "c002", scene_description: "Points of light cross his chest as the room goes dark behind him." },
      { key: "c003", scene_description: "He stands on the runway." }, // handed back the same: left as it was
    ]);
    expect(out.replaced).toEqual(["c002"]);
    expect(out.clips.map((c) => c.scene_description)).toEqual(["He stands on the runway.", "Points of light cross his chest as the room goes dark behind him.", "He stands on the runway."]);
    // two rewrites that are the same new sentence: only the first is taken
    const twice = withRewrites(clips, [
      { key: "c002", scene_description: "Frost climbs the back wall." },
      { key: "c003", scene_description: "Frost climbs the back wall." },
    ]);
    expect(twice.replaced).toEqual(["c002"]);
  });
});

describe("a writer can make a shot change while it plays", () => {
  it("is told what timed beats are for, and that most shots have none", () => {
    const p = shotsSystemPrompt(ctx, "ONE IDEA.", grid);
    expect(p).toContain("Change inside a shot (`timed_beats`):");
    expect(p).toContain("Most shots are ONE state from the first frame to the last: return an empty list for those.");
    expect(p).toContain("`scene_description` is then how the shot OPENS.");
    expect(p).toContain("At most 4 beats in a shot");
    // a different light is the footage's — never an exposure effect; and a beat is a change, not the opening state
    expect(p).toContain("Never give a `lighting_state` and an exposure effect on the same beat.");
    expect(p).toContain("A beat is a CHANGE");
    // and the treatment itself stays prose: it is told a change can be said, not handed a format
    const t = treatmentSystemPrompt(ctx);
    expect(t).toContain("A shot may change while it plays.");
    expect(t).not.toContain("timed_beats");
  });

  it("the schema carries the beats in one fixed shape", () => {
    const beats = SHOTS_SCHEMA.schema.properties.clips.items.properties.timed_beats;
    expect(beats.type).toBe("array");
    expect(beats.items.required).toEqual(["at_seconds", "on_words", "lighting", "camera", "action", "picture", "effect", "lighting_state"]);
    expect(beats.items.properties.effect.enum).toEqual(WRITTEN_EFFECTS);
  });

  it("a beat that switches to a lighting state keeps no exposure effect (a flash may stay)", () => {
    const keys = new Set(["DISCO"]);
    const got = acceptTimedBeats(
      [
        { at_seconds: 1.2, on_words: "", lighting: "room goes dark", camera: "", action: "", picture: "", effect: "blackout", lighting_state: "DISCO" },
        { at_seconds: 2, on_words: "", lighting: "", camera: "", action: "", picture: "", effect: "flash", lighting_state: "DISCO" },
        { at_seconds: 3, on_words: "", lighting: "house lights die", camera: "", action: "", picture: "", effect: "blackout", lighting_state: "" },
      ],
      4,
      keys,
    );
    expect(got.map((b) => [b.at_seconds, b.effect, b.lighting_state])).toEqual([
      [1.2, "none", "DISCO"],
      [2, "flash", "DISCO"],
      [3, "blackout", ""],
    ]);
  });

  it("keeps a returned beat only when it is a beat inside its own shot", () => {
    const r = acceptShots(grid, { clips: [
      { key: "c003", scene_description: "The runway, lights up.", timed_beats: [
        { at_seconds: 2.4, on_words: "", lighting: "what he wears is the only light", camera: "a slow push begins", action: "", picture: "", effect: "none" },
        { at_seconds: 1.2, on_words: "cut the lights on", lighting: "the house lights die", camera: "", action: "", picture: "", effect: "blackout" },
        { at_seconds: 9, on_words: "", lighting: "too late", camera: "", action: "", picture: "", effect: "none" },      // after the shot ends
        { at_seconds: 3, on_words: "", lighting: "", camera: "", action: "", picture: "", effect: "none" },              // says nothing
        { at_seconds: 1.2, on_words: "", lighting: "", camera: "", action: "he stops", picture: "", effect: "none" },    // same second
        { at_seconds: "soon", lighting: "x" },
      ] },
      { key: "c002", scene_description: "He raps backstage." },
    ] });
    const c3 = r.clips.find((c) => c.key === "c003")!;
    expect((c3.timed_beats as { at_seconds: number }[]).map((b) => b.at_seconds)).toEqual([1.2, 2.4]);
    expect((c3.timed_beats as { effect: string }[])[0].effect).toBe("blackout");
    // a shot with none has none — nothing is invented
    expect(r.clips.find((c) => c.key === "c002")!.timed_beats).toEqual([]);
    expect(acceptTimedBeats(null, 4)).toEqual([]);
    expect(acceptTimedBeats(Array.from({ length: 9 }, (_, i) => ({ at_seconds: i * 0.3, action: "a" })), 4)).toHaveLength(WRITTEN_BEATS_MAX);
  });
});

describe("a writer points shots at the project's continuity entities", () => {
  const entities = writerEntities([
    { key: "BLACK_RUNWAY", kind: "location", name: "Black Runway", description: "A long black runway, black walls, a white centre line." },
    { key: "BLACK_SEDAN", kind: "prop", name: "Black Sedan", description: "A black four-door sedan, tinted glass." },
    { key: "ICE_KEY", kind: "lighting", name: "Blackout, ice key", description: "House lights off; the only light is the sparkle off his stones." },
    { key: "BLACK_RUNWAY", kind: "location", name: "a duplicate" },
    { key: "", kind: "prop", name: "no key" },
    { key: "X", kind: "weather", name: "not a kind" },
  ]);

  it("is told each entity once, by key, and to point rather than describe again", () => {
    expect(entities.map((e) => e.key)).toEqual(["BLACK_RUNWAY", "BLACK_SEDAN", "ICE_KEY"]);
    const p = shotsSystemPrompt({ ...ctx, entities }, "ONE IDEA.", grid);
    expect(p).toContain("points at it by its KEY (`continuity`) and does not describe it again differently");
    expect(p).toContain("Places:\n- BLACK_RUNWAY — Black Runway: A long black runway, black walls, a white centre line.");
    expect(p).toContain("Lighting states:\n- ICE_KEY — Blackout, ice key");
    // a project with none is told nothing about entities
    expect(shotsSystemPrompt(ctx, "ONE IDEA.", grid)).not.toContain("continuity entities");
    // the treatment is told they exist, by name — never handed keys
    const t = treatmentSystemPrompt({ ...ctx, entities });
    expect(t).toContain("- Black Runway: A long black runway");
    expect(t).not.toContain("BLACK_RUNWAY");
  });

  it("keeps a reference only when it is to an entity the project has, of the right kind", () => {
    const r = acceptShots(grid, { clips: [
      { key: "c003", scene_description: "The runway.", continuity: { location: "BLACK_RUNWAY", props: ["BLACK_SEDAN", "A_MADE_UP_PROP", "BLACK_SEDAN"], lighting: "BLACK_RUNWAY" },
        timed_beats: [{ at_seconds: 1.2, on_words: "", lighting: "", camera: "", action: "", picture: "", effect: "blackout", lighting_state: "ICE_KEY" }, { at_seconds: 2, on_words: "", lighting: "", camera: "", action: "", picture: "", effect: "none", lighting_state: "NOT_ON_FILE" }] },
      { key: "c002", scene_description: "He raps backstage.", continuity: { location: "SOMEWHERE_ELSE", props: [], lighting: "" } },
    ] }, entities);
    const c3 = r.clips.find((c) => c.key === "c003")!;
    expect(c3.continuity).toEqual({ location: "BLACK_RUNWAY", props: ["BLACK_SEDAN"], lighting: "", links: [] });
    // the beat switches to a lighting state on file; a state that is not on file is not a beat
    expect((c3.timed_beats as { lighting_state: string }[]).map((b) => b.lighting_state)).toEqual(["ICE_KEY"]);
    expect(r.clips.find((c) => c.key === "c002")!.continuity).toEqual({ location: "", props: [], lighting: "", links: [] });
  });
});

describe("the function", () => {
  const src = readFileSync(resolve(__dirname, "index.ts"), "utf8");
  it("checks the caller owns the project before any model call, and fails with a reason", () => {
    expect(src.indexOf("project.user_id !== userData.user.id")).toBeGreaterThan(0);
    expect(src.indexOf("project.user_id !== userData.user.id")).toBeLessThan(src.indexOf("treatmentSystemPrompt(ctx)"));
    expect(src).toContain('fail(502, "PROVIDER_API_ERROR", `The treatment was not written: ${r.why}`)');
    // the director's own text is never sent to be rewritten
    expect(src).toContain("if (writeText) {");
  });
});

describe("shots the treatment ties together (links)", () => {
  const board: GridShot[] = [
    { key: "c001", start: 0, end: 4, lyrics: "" },
    { key: "c002", start: 4, end: 8, lyrics: "" },
    { key: "c030", start: 120, end: 124, lyrics: "more cameras in the whip" },
  ];
  const clip = (key: string, links: unknown[], extra: Record<string, unknown> = {}) => ({
    key, shot_type: "b_roll", scene_description: `scene of ${key}`, environment: "", camera_direction: "", lighting: "", wardrobe: "none",
    wardrobe_from: "none", lyric_ref: "", priority: "normal", timed_beats: [], continuity: { location: "", props: [], lighting: "", links }, production: { method: "generate", note: "" }, ...extra,
  });

  it("keeps a link to another shot of the board — even one outside the chunk — and drops invented, self and unknown links", () => {
    const r = acceptShots([board[1]], { clips: [clip("c002", [
      { kind: "screen_shows", shot: "c030", note: "the monitor on the left" },
      { kind: "screen_shows", shot: "c099", note: "a shot that does not exist" },
      { kind: "reveals", shot: "c002", note: "itself" },
      { kind: "teleports", shot: "c001", note: "not a kind" },
      { kind: "screen_shows", shot: "c030", note: "the same link twice" },
    ])] }, [], board.map((b) => b.key));
    expect((r.clips[0].continuity as { links: unknown[] }).links).toEqual([{ kind: "screen_shows", shot: "c030", note: "the monitor on the left" }]);
  });

  it("without the board's keys, a link may only point inside the chunk (nothing outside is guessed at)", () => {
    expect(acceptLinks([{ kind: "reveals", shot: "c030", note: "" }], new Set(["c001", "c002"]), "c002")).toEqual([]);
  });

  it("keeps a production method only when it is a known word, and its note only with it", () => {
    expect(acceptProduction({ method: "edit_footage", note: "the grill rotates inside his real mouth" })).toEqual({ method: "edit_footage", note: "the grill rotates inside his real mouth" });
    expect(acceptProduction({ method: "magic", note: "x" })).toEqual({ method: "", note: "" });
    expect(acceptProduction(null)).toEqual({ method: "", note: "" });
  });

  it("finds both ends of every link, and the second ask shows each linked shot its partners' scenes", () => {
    const clips = [clip("c001", []), clip("c002", [{ kind: "screen_shows", shot: "c030", note: "" }]), clip("c030", [])];
    const partners = linkedShots(clips);
    expect([...partners.keys()].sort()).toEqual(["c002", "c030"]);
    const msg = JSON.parse(linkUserMessage([board[2]], clips, partners));
    expect(msg.linked_shots).toEqual([{ key: "c002", scene_description: "scene of c002", links: [{ kind: "screen_shows", shot: "c030", note: "" }] }]);
    expect(msg.shots.map((s: { key: string }) => s.key)).toEqual(["c030"]);
  });

  it("tells the writer how to say a link and how to choose a production method", () => {
    const system = shotsSystemPrompt({ hasPerformanceFootage: true }, "a treatment", board);
    expect(system).toContain("`continuity.links`");
    expect(system).toContain(PRODUCTION_RULES);
    expect(PRODUCTION_RULES).toContain("never from what would be easier");
  });
});

describe("who is in a shot (cast)", () => {
  const people = new Set(["FENDI", "THE_RIDER"]);
  it("keeps members the variation has, by key, with what they do HERE; drops a key the model made up", () => {
    expect(acceptCast({ members: [
      { key: "THE_RIDER", action: "settles a hand on the horse's neck", placement: "centre, among the models", framing: "medium, side-on" },
      { key: "A_STRANGER", action: "walks by", placement: "", framing: "" },
      { key: "THE_RIDER", action: "twice", placement: "", framing: "" },
    ], open: false, none: false }, people)).toEqual({ members: [{ key: "THE_RIDER", action: "settles a hand on the horse's neck", placement: "centre, among the models", framing: "medium, side-on" }], open: false, none: false });
  });
  it("silence is never ambiguous: none and open are kept as said; none with members is contradictory and read as none-without-members", () => {
    expect(acceptCast({ members: [], open: true, none: false }, people)).toEqual({ members: [], open: true, none: false });
    expect(acceptCast({ members: [], open: true, none: true }, people)).toEqual({ members: [], open: false, none: true });
    expect(acceptCast({ members: [{ key: "FENDI", action: "", placement: "", framing: "" }], open: false, none: true }, people).none).toBe(false);
    expect(acceptCast(undefined, people)).toEqual({ members: [], open: false, none: false });
  });
  it("the writer is told the People and how to cast them — and never to cast the artist on the director's behalf", () => {
    const entities = writerEntities([{ key: "THE_RIDER", kind: "character", name: "The rider", description: "One beautiful Black woman among the walking models." }]);
    expect(entities).toEqual([{ key: "THE_RIDER", kind: "character", name: "The rider", description: "One beautiful Black woman among the walking models." }]);
    const system = shotsSystemPrompt({ hasPerformanceFootage: true, entities }, "a treatment", [{ key: "c001", start: 0, end: 4, lyrics: "" }]);
    expect(system).toContain("People:\n- THE_RIDER — The rider: One beautiful Black woman among the walking models.");
    expect(system).toContain(CAST_RULES);
    expect(CAST_RULES).toContain("The artist is a member only in the shots the treatment puts him in");
  });
  it("accepted shots carry their cast", () => {
    const r = acceptShots([{ key: "c001", start: 0, end: 4 }], { clips: [{ key: "c001", scene_description: "she rides", cast: { members: [{ key: "THE_RIDER", action: "rides", placement: "", framing: "wide" }], open: false, none: false } }] }, [{ key: "THE_RIDER", kind: "character", name: "The rider" }]);
    expect(r.clips[0].cast).toEqual({ members: [{ key: "THE_RIDER", action: "rides", placement: "", framing: "wide" }], open: false, none: false });
  });
});
