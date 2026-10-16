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

  it("the price rule", () => {
    for (const s of [4, 5, 6, 12])
      expect(edge.seedanceUsd("720p", s)).toBeCloseTo(seedanceUsd("720p", s), 10);
    expect(edge.seedanceUsd("720p", 4)).toBeCloseTo(2.219, 2);
  });
});
