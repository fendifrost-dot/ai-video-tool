import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_TRANSITION_PRESETS, SECTION_TRANSITION_DEFAULTS, transitionInFromPreset, transitionPresetLabel } from "./transitions";

describe("transition presets", () => {
  it("mirrors config/transition_presets.json (the assembler's source of truth)", () => {
    const json = JSON.parse(readFileSync(resolve(process.cwd(), "config/transition_presets.json"), "utf8"));
    expect(Object.keys(DEFAULT_TRANSITION_PRESETS).sort()).toEqual(Object.keys(json.presets).sort());
    for (const [name, p] of Object.entries(json.presets as Record<string, { type: string; beats: number; side: string }>)) {
      expect([DEFAULT_TRANSITION_PRESETS[name].type, DEFAULT_TRANSITION_PRESETS[name].beats, DEFAULT_TRANSITION_PRESETS[name].side]).toEqual([p.type, p.beats, p.side]);
    }
    for (const [sec, d] of Object.entries(json.section_defaults as Record<string, { on_the_1: string[]; elsewhere: string[] }>)) {
      expect(SECTION_TRANSITION_DEFAULTS[sec].on_the_1).toEqual(d.on_the_1);
      expect(SECTION_TRANSITION_DEFAULTS[sec].elsewhere).toEqual(d.elsewhere);
    }
  });
  it("builds a card transition from a preset, timed from the BPM when given", () => {
    expect(transitionInFromPreset("whip_left")).toEqual({ type: "whip_pan", preset: "whip_left", durationSeconds: null });
    expect(transitionInFromPreset("crossfade_2", 120)).toEqual({ type: "crossfade", preset: "crossfade_2", durationSeconds: 1 });
    expect(transitionInFromPreset("no_such_preset")).toEqual({ type: "cut", preset: "no_such_preset", durationSeconds: null });
  });
  it("labels the preset, not the family", () => {
    expect(transitionPresetLabel({ type: "whip_pan", preset: "whip_left", durationSeconds: null })).toBe("whip left · 0.5 beats");
    expect(transitionPresetLabel({ type: "cut", preset: "cut", durationSeconds: null })).toBe("");
  });
});
