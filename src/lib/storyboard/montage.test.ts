import { describe, expect, it, vi } from "vitest";

// restage.ts (NEVER_WIDER) reaches the browser's Supabase client at import; the montage only needs its words
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));
vi.mock("@/lib/queries/storyboard", () => ({}));

import { NEVER_WIDER } from "./restage";
import { MONTAGE_MIN_SCENE_SECONDS, MONTAGE_STYLE, MONTAGE_SYNC, MONTAGE_VERSION, defaultMontageLines, montagePrompt, montageRecord, montageScript, planMontageScenes, thingOfLabel } from "./montage";

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

  it("prefills Fendi's five: him to camera, his profile, a zoom to the thing, a child petting it, back to him", () => {
    const lines = defaultMontageLines("the polar bear standing on the walkway behind him").split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/rapping straight to camera/);
    expect(lines[1]).toMatch(/profile/);
    expect(lines[2]).toMatch(/quick optical zoom onto the polar bear.*does not react/);
    expect(lines[3]).toMatch(/child walks up to the polar bear.*and pets it/);
    expect(lines[4]).toMatch(/back to him, closer/);
    // a plate with nothing unusual in it gets street cutaways, never a bear that is not there
    expect(defaultMontageLines(null)).not.toMatch(/polar bear/);
    expect(defaultMontageLines("  ")).toMatch(/passer-by/);
  });

  it("shares the seconds equally among untimed lines, in order, covering the whole clip", () => {
    const r = planMontageScenes(defaultMontageLines("the bear"), 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes.map((s) => [s.from, s.to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
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
    expect(p.match(/\n— \d\.\d–\d\.\d s: /g)).toHaveLength(5);
    expect(montageScript(scenes)).toContain("— 2.0–3.0 s: a quick optical zoom onto the polar bear; it does not react");
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
});
