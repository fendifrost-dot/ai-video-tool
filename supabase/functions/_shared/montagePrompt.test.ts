import { describe, expect, it, vi } from "vitest";

// restage.ts reaches the browser's Supabase client at import; the words are all this test needs
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({ browserRunnerDeps: vi.fn() }));
vi.mock("@/lib/queries/storyboard", () => ({}));

import * as app from "../../../src/lib/storyboard/montage";
import {
  FRAME_ALLOWANCE,
  NEVER_WIDER,
  RESTAGE_MAX_SECONDS,
  RESTAGE_MIN_SECONDS,
  RESTAGE_RESOLUTION,
  restageKeep,
  restageSeconds,
} from "../../../src/lib/storyboard/restage";
import { PLACE_LIGHT, seedanceAnglePrompt } from "../../../src/lib/shotCompiler/prompts";
import { DEFAULT_LOOK_PRESET_ID, LOOK_PRESETS } from "../../../src/lib/shotCompiler/lookPresets";
import { seedanceUsd } from "../../../src/lib/worldBatch/estimate";
import * as edge from "./montagePrompt";

const LINES = [
  "0-1.4 s: the orcas surface outside the window; he is not in it",
  "HARD CUT to him in profile by the window, rapping",
  "HARD CUT to a tight shot of one orca's eye",
  "3.2-4.0 s: HARD CUT to a low angle from the seats",
].join("\n");

describe("the Deno copy of the montage's words is the app's, word for word", () => {
  it("constants", () => {
    expect(edge.MONTAGE_VERSION).toBe(app.MONTAGE_VERSION);
    expect(edge.MONTAGE_LINES_MAX).toBe(app.MONTAGE_LINES_MAX);
    expect(edge.MONTAGE_MIN_SCENE_SECONDS).toBe(app.MONTAGE_MIN_SCENE_SECONDS);
    expect(edge.MONTAGE_MAX_SCENES).toBe(app.MONTAGE_MAX_SCENES);
    expect(edge.MONTAGE_STYLE).toBe(app.MONTAGE_STYLE);
    expect(edge.MONTAGE_SYNC).toBe(app.MONTAGE_SYNC);
    expect(edge.NEVER_WIDER).toBe(NEVER_WIDER);
    expect(edge.PLACE_LIGHT).toBe(PLACE_LIGHT);
    expect(edge.DEFAULT_LOOK_PRESET_ID).toBe(DEFAULT_LOOK_PRESET_ID);
    expect(edge.DEFAULT_LOOK_SUFFIX).toBe(LOOK_PRESETS[DEFAULT_LOOK_PRESET_ID].shot_suffix);
    expect(edge.RESTAGE_MIN_SECONDS).toBe(RESTAGE_MIN_SECONDS);
    expect(edge.RESTAGE_MAX_SECONDS).toBe(RESTAGE_MAX_SECONDS);
    expect(edge.RESTAGE_RESOLUTION).toBe(RESTAGE_RESOLUTION);
    expect(edge.FRAME_ALLOWANCE).toBe(FRAME_ALLOWANCE);
  });

  it("the default scenes, the thing in a plate, the scenes with their seconds, the script and the record", () => {
    for (const thing of [null, "the polar bear", "the orcas"])
      expect(edge.defaultMontageLines(thing)).toBe(app.defaultMontageLines(thing));
    for (const label of [
      "plate_79th_lafayette_bear_edge",
      "plate_redline_orcas",
      "plate_79th_walrus_train",
      "",
      null,
    ])
      expect(edge.thingOfLabel(label)).toBe(app.thingOfLabel(label));
    for (const [lines, seconds] of [
      [LINES, 4],
      [app.defaultMontageLines("the polar bear"), 5],
      ["one\ntwo", 4],
      ["0-9 s: too long", 4],
      ["", 4],
    ] as const) {
      expect(edge.planMontageScenes(lines, seconds)).toEqual(app.planMontageScenes(lines, seconds));
    }
    const planned = app.planMontageScenes(LINES, 4);
    if (!planned.ok) throw new Error(planned.why);
    expect(edge.montageScript(planned.scenes)).toBe(app.montageScript(planned.scenes));
    expect(edge.montagePrompt(planned.scenes)).toBe(app.montagePrompt(planned.scenes));
    expect(edge.montageRecord(planned.scenes, "the orcas")).toEqual(
      app.montageRecord(planned.scenes, "the orcas"),
    );
  });

  it("no shots of his feet, the cast, the b-roll montage and its scenes over the shot's own seconds", () => {
    expect(edge.NO_FEET).toBe(app.NO_FEET);
    expect(edge.BROLL_PLACE).toBe(app.BROLL_PLACE);
    expect(edge.BROLL_NO_FEET).toBe(app.BROLL_NO_FEET);
    for (const n of [1, 2, 3]) expect(edge.castLine(n)).toBe(app.castLine(n));
    for (const [lines, shot, render] of [
      ["one\ntwo\nthree", 1.48, 4],
      [LINES, 4, 4],
      ["0-0.5 s: a\n0.5-1.5 s: b", 1.5, 4],
      ["0-3 s: too long for the shot", 1.5, 4],
      ["a\nb\nc\nd\ne", 1.47, 4],
    ] as const) {
      expect(edge.planShotMontageScenes(lines, shot, render)).toEqual(
        app.planShotMontageScenes(lines, shot, render),
      );
    }
    const planned = app.planShotMontageScenes("one\ntwo\nthree", 1.48, 4);
    if (!planned.ok) throw new Error(planned.why);
    for (const cast of [null, 1, 2])
      expect(edge.brollMontagePrompt(planned.scenes, cast)).toBe(
        app.brollMontagePrompt(planned.scenes, cast),
      );
    expect(edge.montageRecord(planned.scenes, null, null, { cast: { id: "c" }, broll: true })).toEqual(
      app.montageRecord(planned.scenes, null, null, { cast: { id: "c" }, broll: true }),
    );
  });

  it("the keep list, the restage seconds and the whole prompt around the montage", () => {
    expect(edge.restageKeep({ shows: null })).toEqual(restageKeep({ shows: null }));
    expect(edge.restageKeep({ shows: " the Mastic track jacket " })).toEqual(
      restageKeep({ shows: " the Mastic track jacket " }),
    );
    for (const s of [1.48, 3.45, 3.96, 4.0, 4.5, 11.9, 12.5])
      expect(edge.restageSeconds(s)).toBe(restageSeconds(s));
    const planned = app.planMontageScenes(LINES, 4);
    if (!planned.ok) throw new Error(planned.why);
    const angle = app.montagePrompt(planned.scenes);
    const keep = restageKeep({ shows: null });
    expect(edge.seedanceAnglePrompt(angle, keep)).toBe(
      seedanceAnglePrompt(angle, keep, LOOK_PRESETS[DEFAULT_LOOK_PRESET_ID], true, {
        timedChanges: false,
      }),
    );
    expect(edge.seedanceAnglePrompt(`${angle} The light: sodium streetlight`, keep)).toBe(
      seedanceAnglePrompt(
        `${angle} The light: sodium streetlight`,
        keep,
        LOOK_PRESETS[DEFAULT_LOOK_PRESET_ID],
        true,
        { timedChanges: false },
      ),
    );
  });

  it("his shoes: the footwear picture among the pieces he wears, and its sentence", () => {
    const items = [
      {
        id: "coat",
        feature_type: "wardrobe_outerwear",
        label: "Coat",
        storage_path: "u/a/coat.jpg",
      },
      { id: "nopic", feature_type: "wardrobe_footwear", label: "No picture", storage_path: null },
      {
        id: "prada",
        feature_type: "wardrobe_footwear",
        label: " Prada America's Cup Sneakers - Black Patent Leather ",
        storage_path: "u/a/prada.jpg",
        dimensions_description: "black patent leather, red tab. ",
      },
      {
        id: "lewis",
        feature_type: "wardrobe_footwear",
        label: "Lewis",
        storage_path: "u/a/lewis.jpg",
      },
    ];
    for (const ids of [["coat", "nopic", "prada", "lewis"], ["coat"], [], ["lewis", "prada"]])
      expect(edge.montageFootwear(ids, items)).toEqual(app.montageFootwear(ids, items));
    const shoes = app.montageFootwear(["coat", "nopic", "prada", "lewis"], items);
    expect(shoes).toEqual({
      id: "prada",
      bucket: "wardrobe-refs",
      path: "u/a/prada.jpg",
      label: "Prada America's Cup Sneakers - Black Patent Leather",
      words: "black patent leather, red tab.",
    });
    expect(app.footwearLine(shoes)).toBe(
      "His shoes are the pair in @Image2 (Prada America's Cup Sneakers - Black Patent Leather: black patent leather, red tab); whenever his feet are in a frame he wears exactly that pair, never any other shoes.",
    );
    for (const f of [shoes, null, { label: "Lewis", words: null }])
      expect(edge.footwearLine(f)).toBe(app.footwearLine(f));
    const planned = app.planMontageScenes(LINES, 4);
    if (!planned.ok) throw new Error(planned.why);
    expect(edge.montageRecord(planned.scenes, null, shoes)).toEqual(
      app.montageRecord(planned.scenes, null, shoes),
    );
    expect(app.montageRecord(planned.scenes, null, shoes).footwear).toEqual({
      id: "prada",
      label: "Prada America's Cup Sneakers - Black Patent Leather",
    });
    expect(app.montageRecord(planned.scenes, null)).not.toHaveProperty("footwear");
  });

  it("the price rule", () => {
    for (const s of [4, 5, 6, 12])
      expect(edge.seedanceUsd("720p", s)).toBeCloseTo(seedanceUsd("720p", s), 10);
    expect(edge.seedanceUsd("720p", 4)).toBeCloseTo(2.219, 2);
  });
});
