import { describe, expect, it, vi } from "vitest";

// restage.ts (NEVER_WIDER) reaches the browser's Supabase client at import; the montage only needs its words
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));
vi.mock("@/lib/queries/storyboard", () => ({}));

import { NEVER_WIDER } from "./restage";
import { BROLL_NO_FEET, BROLL_PLACE, MONTAGE_MIN_SCENE_SECONDS, MONTAGE_STYLE, MONTAGE_SYNC, MONTAGE_TAIL_TRIM_SECONDS, MONTAGE_VERSION, NO_FEET, WAIST_UP, brollMontagePrompt, castLine, defaultMontageLines, planBeatLockedScenes, montagePrompt, montageRecord, montageScript, planMontageScenes, planShotMontageScenes, thingOfLabel } from "./montage";

describe("the montage's scenes", () => {
  it("names the unusual thing from the plate's label, never the label's last word", () => {
    // the first live dry run asked for "a quick optical zoom onto the edge" — the label was plate_79th_lafayette_bear_edge
    expect(thingOfLabel("plate_79th_lafayette_bear_edge")).toBe("the polar bear");
    expect(thingOfLabel("plate_79th_lafayette_bear")).toBe("the polar bear");
    expect(thingOfLabel("plate_79th_lafayette_trex")).toBe("the T-rex");
    expect(thingOfLabel("plate_79th_lafayette_horse_b")).toBe("the horse");
    expect(thingOfLabel("plate_79th_lafayette_b")).toBeNull();
    expect(thingOfLabel(null)).toBeNull();
  });

  it("prefills four scenes ending on the cutaway — him to camera, his profile, a zoom to the thing, a child petting it — with HARD CUT on every cut, and no snap back", () => {
    const lines = defaultMontageLines("the polar bear").split("\n");
    expect(lines).toHaveLength(4);
    // the orca shape: the place opens WITHOUT him, and he is never "straight to camera" — that line is the paste-in
    expect(lines[0]).toMatch(/^the place: a wide shot with the polar bear in it.*he is not in it$/);
    expect(lines[1]).toMatch(/^HARD CUT to him in profile.*a hand on something in the place.*not pasted in front of it$/);
    expect(lines[2]).toMatch(/^HARD CUT to a tight shot of the polar bear.*does not react/);
    expect(lines[3]).toMatch(/^HARD CUT to a medium close-up from chest height: him leaning on something in the place.*the polar bear behind his shoulder/);
    expect(defaultMontageLines("the polar bear")).not.toMatch(/straight to camera|medium shot/);
    // the model's closing beat comes out as a flash or a freeze (c047 v2: two frames of him); the cut back is the edit's
    expect(defaultMontageLines("the bear")).not.toMatch(/back to him/);
    expect(MONTAGE_TAIL_TRIM_SECONDS).toBeGreaterThan(0.08);
    // a plate with nothing unusual in it names no animal that is not there
    expect(defaultMontageLines(null)).not.toMatch(/polar bear/);
    expect(defaultMontageLines("  ")).toMatch(/^the place: a wide shot of it/);
  });

  it("shares the seconds equally among untimed lines, in order, covering the whole clip", () => {
    const r = planMontageScenes(defaultMontageLines("the bear"), 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes.map((s) => [s.from, s.to])).toEqual([
      [0, 1.3],
      [1.3, 2.5],
      [2.5, 3.8],
      [3.8, 5],
    ]);
  });

  it("keeps a line's own window; the untimed lines around it share the gaps", () => {
    const r = planMontageScenes("him to camera\n2.0-2.6 s: a quick zoom onto the bear\n— snap back to him", 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes).toEqual([
      { from: 0, to: 2, text: "him to camera" },
      { from: 2, to: 2.6, text: "a quick zoom onto the bear" },
      { from: 2.6, to: 5, text: "snap back to him" },
    ]);
    // two untimed lines before a timed one split the gap; a timed line that overlaps the one before it is refused
    const two = planMontageScenes("a\nb\n3-5: c", 5);
    expect(two.ok && two.scenes.map((s) => [s.from, s.to])).toEqual([[0, 1.5], [1.5, 3], [3, 5]]);
    expect(planMontageScenes("0-3: a\n2-5: b", 5)).toMatchObject({ ok: false, why: expect.stringMatching(/before the scene ahead/) });
    expect(planMontageScenes("0-3: a\n3-4: b", 5)).toMatchObject({ ok: false, why: expect.stringMatching(/reach the end/) });
  });

  it("refuses what the model cannot cut: too many scenes, a window outside the clip, a scene shorter than the floor", () => {
    expect(planMontageScenes(Array(9).fill("x").join("\n"), 5)).toMatchObject({ ok: false, why: expect.stringMatching(/at most 8/) });
    expect(planMontageScenes("0-6 s: too long", 5)).toMatchObject({ ok: false, why: expect.stringMatching(/outside/) });
    expect(planMontageScenes("a\nb\nc\nd\ne\nf\ng\nh", 2)).toMatchObject({ ok: false, why: expect.stringMatching(/fewer scenes/) });
    expect(planMontageScenes("0-0.2 s: a blink\nthe rest", 5)).toMatchObject({ ok: false, why: expect.stringMatching(new RegExp(`at least ${MONTAGE_MIN_SCENE_SECONDS}`)) });
    expect(planMontageScenes("", 5)).toMatchObject({ ok: false });
    expect(planMontageScenes("x", 0)).toMatchObject({ ok: false });
  });
});

describe("the montage prompt", () => {
  const scenes = (planMontageScenes(defaultMontageLines("the polar bear"), 5) as { ok: true; scenes: ReturnType<typeof montageRecord>["scenes"] }).scenes;

  it("is Thuggpapi's shape: one style line, 'Show in order' with one dash per scene and its seconds, deadpan", () => {
    const p = montagePrompt(scenes);
    expect(p).toContain("fast-cut montage in the place of @Image1");
    expect(p).toContain(MONTAGE_STYLE);
    expect(MONTAGE_STYLE).toMatch(/shaky handheld camerawork, quick optical zooms, 35mm film grain/);
    expect(MONTAGE_STYLE).toMatch(/Deadpan/);
    expect(p).toContain("Show in order, in seconds from the first frame:");
    expect(p.match(/\n— \d\.\d–\d\.\d s: /g)).toHaveLength(4);
    expect(montageScript(scenes)).toContain("— 2.5–3.8 s: HARD CUT to a tight shot of the polar bear, a quick optical zoom in on its face; it does not react");
  });

  it("keeps the performance in sync through the cutaways and never shows more of him than the take", () => {
    const p = montagePrompt(scenes);
    expect(p).toContain(MONTAGE_SYNC);
    expect(MONTAGE_SYNC).toMatch(/exactly @Video1's at that same second/);
    expect(MONTAGE_SYNC).toMatch(/does not pause, repeat or shift/);
    expect(p).toContain(NEVER_WIDER);
  });

  it("records what was asked, versioned", () => {
    expect(montageRecord(scenes, " the polar bear ")).toEqual({ version: MONTAGE_VERSION, scenes, thing: "the polar bear" });
    expect(montageRecord(scenes, null).thing).toBeNull();
  });

  it("never makes his shoes or feet a shot of their own (Fendi, 17 Oct 2026: no more shoe shots)", () => {
    expect(montagePrompt(scenes)).toContain(NO_FEET);
    expect(NO_FEET).toMatch(/never a close-up of them, never a cutaway or a tilt down to them/);
    // "Stop the full body shots": every shot of him is waist-up or closer
    expect(montagePrompt(scenes)).toContain(WAIST_UP);
    expect(WAIST_UP).toMatch(/never a full-body or wide shot of him/);
  });

  it("records the cast and a b-roll montage when there is one", () => {
    expect(montageRecord(scenes, null, null, { cast: { id: "cast-1" }, broll: true })).toEqual({ version: MONTAGE_VERSION, scenes, thing: null, cast: { id: "cast-1" }, broll: true });
    expect(montageRecord(scenes, null, null, { cast: null, broll: false })).toEqual({ version: MONTAGE_VERSION, scenes, thing: null });
  });
});

describe("a montage of a shot he is not in, and the people of its scene", () => {
  it("makes the people of the scene still the cast, by their picture's number", () => {
    expect(castLine(3)).toBe("The people in this place are the people in @Image3: the same faces, the same clothes, the same things in their hands, in every shot they are in; nobody new takes their place.");
  });

  it("is the same fast cuts with no performer: no @Video1, no sync rule, the place's own light", () => {
    const planned = planShotMontageScenes("a\nb\nc", 1.5, 4);
    if (!planned.ok) throw new Error(planned.why);
    const p = brollMontagePrompt(planned.scenes, 1);
    expect(p).toContain(`a fast-cut montage in the place of @Image1, ${MONTAGE_STYLE}`);
    expect(p).toContain(BROLL_PLACE);
    expect(p).toContain(BROLL_NO_FEET);
    expect(p).toContain(castLine(1));
    expect(p).not.toMatch(/@Video1/);
    expect(brollMontagePrompt(planned.scenes)).not.toMatch(/people in @Image/);
  });

  it("shares the SHOT's seconds among the lines and lets the last one hold to the end of the render", () => {
    expect(planShotMontageScenes("a\nb\nc", 1.48, 4)).toEqual({
      ok: true,
      scenes: [
        { from: 0, to: 0.5, text: "a" },
        { from: 0.5, to: 1, text: "b" },
        { from: 1, to: 4, text: "c" },
      ],
    });
    expect(planShotMontageScenes("0-3 s: past the shot", 1.5, 4).ok).toBe(false);
    // a shot as long as the render: nothing to hold
    const whole = planShotMontageScenes("a\nb", 4, 4);
    expect(whole.ok && whole.scenes[1]).toEqual({ from: 2, to: 4, text: "b" });
  });
});

describe("cut to the song: the lines share the shot's beats (Fendi, 17 Oct 2026)", () => {
  // 122 BPM: a beat every 0.4918 s
  const beats = Array.from({ length: 20 }, (_, k) => Number((k * 0.4918).toFixed(4)));

  it("cuts on the beats inside the part the edit plays, the last scene holding to the end of the render", () => {
    const r = planBeatLockedScenes("a\nb\nc", { renderSeconds: 4, shotIn: 0, shotOut: 1.48, beats });
    expect(r).toEqual({
      ok: true,
      locked: 2,
      scenes: [
        { from: 0, to: 0.49, text: "a" },
        { from: 0.49, to: 0.98, text: "b" },
        { from: 0.98, to: 4, text: "c" },
      ],
    });
  });

  it("a head handle before the shot belongs to the first scene; the cuts fall inside the shot", () => {
    // c007: the shot plays 1.139–2.619 of the dressed take; beats on the song clock moved onto the clip's
    const r = planBeatLockedScenes("place\nhim\nface", { renderSeconds: 4, shotIn: 1.139, shotOut: 2.619, beats: beats.map((t) => t + 0.1) });
    if (!r || !r.ok) throw new Error("not planned");
    expect(r.scenes[0].from).toBe(0);
    expect(r.scenes[1].from).toBeGreaterThanOrEqual(1.139 + 0.4 - 1e-6);
    expect(r.scenes[2].from).toBeLessThanOrEqual(2.619 - 0.4 + 1e-6);
    expect(r.scenes[2].to).toBe(4);
    // a 1.48 s shot with three scenes of 0.4 s or more leaves room for one cut on a beat here, not both
    expect(r.locked).toBeGreaterThanOrEqual(1);
  });

  it("with no beat near a cut it keeps the even share; timed lines and shots too short for the lines are the caller's", () => {
    const even = planBeatLockedScenes("a\nb", { renderSeconds: 4, shotIn: 0, shotOut: 2, beats: [] });
    expect(even).toEqual({ ok: true, locked: 0, scenes: [{ from: 0, to: 1, text: "a" }, { from: 1, to: 4, text: "b" }] });
    expect(planBeatLockedScenes("0-1 s: a\nb", { renderSeconds: 4, shotIn: 0, shotOut: 2, beats })).toBeNull();
    expect(planBeatLockedScenes("a\nb\nc\nd", { renderSeconds: 4, shotIn: 0, shotOut: 1.48, beats })).toBeNull();
  });
});

