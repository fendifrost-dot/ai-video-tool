import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { acceptTimedBeats, WRITTEN_BEATS_MAX, WRITTEN_EFFECTS } from "../_shared/timedBeats.ts";
import { acceptShots, writerEntities, chunkGrid, contextBlocks, outlineLine, shotsSystemPrompt, shotsUserMessage, SHOTS_SCHEMA, treatmentSystemPrompt, TREATMENT_SCHEMA, type GridShot } from "./contract.ts";

const grid: GridShot[] = [
  { key: "c001", start: 0, end: 3.92, section: "intro", energy: "low", lyrics: "" },
  { key: "c002", start: 3.92, end: 7.84, section: "verse", energy: "mid", lyrics: "Never take a cheat day / Feel free today" },
  { key: "c003", start: 7.84, end: 11.76, section: "hook", energy: "high", lyrics: "You don't gotta cut the lights on" },
];
const ctx = { songTitle: "Song", lyrics: "line one\nline two", artistProfile: "A rapper.", visualStyle: "A runway at night.", mood: "Cold.", notes: "REAL PERFORMANCE FOOTAGE: take.mp4 — in it he wears: a camouflage shirt.\n\nNo logos.", looks: [{ name: "Black suit", description: "double-breasted" }] };

describe("what the treatment writer is told", () => {
  it("is the project's own words and nothing blank", () => {
    const blocks = contextBlocks(ctx);
    expect(blocks).toContain("Visual direction:\nA runway at night.");
    expect(blocks).toContain("these are constraints: nothing you write may break them:\nREAL PERFORMANCE FOOTAGE");
    expect(blocks).toContain("Lyrics:\nline one");
    expect(contextBlocks({ songTitle: "Song", mood: " " })).toBe("Song:\nSong");
  });

  it("with real footage, he is that footage: the looks on file are not offered and the scene is the place", () => {
    const withTake = treatmentSystemPrompt({ ...ctx, hasPerformanceFootage: true });
    expect(withTake).toContain("REAL performance footage");
    expect(withTake).toContain("write the PLACE he performs in");
    expect(withTake).toContain("He appears ONLY in performance shots");
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
    expect(SHOTS_SCHEMA.schema.properties.clips.items.required).toEqual(["key", "shot_type", "scene_description", "environment", "camera_direction", "lighting", "wardrobe", "lyric_ref", "priority", "timed_beats", "continuity"]);
    expect(SHOTS_SCHEMA.schema.properties.clips.items.properties.shot_type.enum).toContain("performance");
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

describe("a writer can make a shot change while it plays", () => {
  it("is told what timed beats are for, and that most shots have none", () => {
    const p = shotsSystemPrompt(ctx, "ONE IDEA.", grid);
    expect(p).toContain("Change inside a shot (`timed_beats`):");
    expect(p).toContain("Most shots are ONE state from the first frame to the last: return an empty list for those.");
    expect(p).toContain("`scene_description` is then how the shot OPENS.");
    expect(p).toContain("At most 4 beats in a shot");
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
    expect(c3.continuity).toEqual({ location: "BLACK_RUNWAY", props: ["BLACK_SEDAN"], lighting: "" });
    // the beat switches to a lighting state on file; a state that is not on file is not a beat
    expect((c3.timed_beats as { lighting_state: string }[]).map((b) => b.lighting_state)).toEqual(["ICE_KEY"]);
    expect(r.clips.find((c) => c.key === "c002")!.continuity).toEqual({ location: "", props: [], lighting: "" });
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
