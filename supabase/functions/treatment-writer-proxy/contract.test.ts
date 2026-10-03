import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { acceptShots, chunkGrid, contextBlocks, outlineLine, shotsSystemPrompt, shotsUserMessage, SHOTS_SCHEMA, treatmentSystemPrompt, TREATMENT_SCHEMA, type GridShot } from "./contract.ts";

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
    expect(SHOTS_SCHEMA.schema.properties.clips.items.required).toEqual(["key", "shot_type", "scene_description", "environment", "camera_direction", "lighting", "wardrobe", "lyric_ref", "priority"]);
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
