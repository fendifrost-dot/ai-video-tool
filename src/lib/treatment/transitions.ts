/**
 * Transition presets for the cards (plan C2, 2026-10-02). The assembler (scripts/edit/transitions.py) renders a
 * card's `transitionIn.preset` from config/transition_presets.json on the beat grid; this module mirrors that file so
 * the storyboard can name a preset, suggest one per section, and show what the cut will do. The JSON is the source of
 * truth — transitions.test.ts asserts the mirror agrees with it.
 */
import type { Transition, TransitionType } from "./shotSpec";

export type TransitionPreset = { type: string; beats: number; side: "none" | "in" | "out" | "both"; suits: string };

export const DEFAULT_TRANSITION_PRESETS: Record<string, TransitionPreset> = {
  cut: { type: "cut", beats: 0, side: "none", suits: "every line on the 1; the default" },
  crossfade_1: { type: "crossfade", beats: 1, side: "both", suits: "verse mood shots, world → world" },
  crossfade_2: { type: "crossfade", beats: 2, side: "both", suits: "slow sections, dissolving into a world" },
  dip_black: { type: "dip_black", beats: 1, side: "both", suits: "a breath before a new scene" },
  dip_white: { type: "dip_white", beats: 0.5, side: "both", suits: "bright, icy — the ice-on motif" },
  flash: { type: "flash", beats: 0.25, side: "in", suits: "camera flashes, paparazzi, the hook's 1" },
  whip_left: { type: "whip_pan", beats: 0.5, side: "both", suits: "hook cuts, performance → world on the 1" },
  whip_right: { type: "whip_pan", beats: 0.5, side: "both", suits: "as whip_left, alternate direction" },
  whip_up: { type: "whip_pan", beats: 0.5, side: "both", suits: "crane / lift cuts" },
  zoom_punch: { type: "zoom_punch", beats: 0.5, side: "in", suits: "a hit on the 1, a close-up landing" },
  speed_ramp: { type: "speed_ramp", beats: 1, side: "out", suits: "the last beat of a shot rushes into the cut" },
  strobe_16: { type: "strobe", beats: 1, side: "in", suits: "club / strobe moments, sixteenth notes" },
  luma_wipe: { type: "luma_wipe", beats: 1, side: "both", suits: "light-driven reveals (headlights, flash)" },
  glitch: { type: "glitch", beats: 0.5, side: "in", suits: "digital hits, the money/camera lines" },
  light_leak: { type: "light_leak", beats: 1, side: "both", suits: "film-bar sections; a warm wash across the cut" },
  film_burn: { type: "film_burn", beats: 0.75, side: "both", suits: "found-footage / Super-8 feel" },
  match_cut: { type: "crossfade", beats: 0.25, side: "both", suits: "an object that physically becomes the next scene (motion_story_v1)" },
};

export const DEFAULT_TRANSITION_PRESET_NAMES = Object.keys(DEFAULT_TRANSITION_PRESETS);

/** Per-section suggestions, mirrored from the JSON's `section_defaults`. */
export const SECTION_TRANSITION_DEFAULTS: Record<string, { on_the_1: string[]; on_the_3?: string[]; elsewhere: string[] }> = {
  hook: { on_the_1: ["whip_left", "whip_right", "flash"], elsewhere: ["cut"] },
  verse: { on_the_1: ["cut"], on_the_3: ["crossfade_1"], elsewhere: ["cut"] },
  bridge: { on_the_1: ["dip_black"], elsewhere: ["cut"] },
};

/** Engine transition family → the card's DB-bound enum (nearest family; the preset name carries the rest). */
export const ENGINE_TRANSITION_TO_CARD: Record<string, TransitionType> = {
  cut: "cut", crossfade: "crossfade", dip_black: "fade_black", dip_white: "fade_white", whip_pan: "whip_pan", glitch: "glitch",
  flash: "flash", zoom_punch: "cut", speed_ramp: "cut", strobe: "flash", luma_wipe: "crossfade", light_leak: "crossfade", film_burn: "crossfade",
};

/** A card transition from a preset name; unknown names fall back to a plain cut with the name kept for the assembler. */
export function transitionInFromPreset(name: string, bpm?: number): Transition {
  const p = DEFAULT_TRANSITION_PRESETS[name];
  const type = p ? (ENGINE_TRANSITION_TO_CARD[p.type] ?? "cut") : "cut";
  const durationSeconds = p && bpm && p.beats > 0 ? Number(((p.beats * 60) / bpm).toFixed(3)) : null;
  return { type, preset: name, durationSeconds };
}

/** Human label for a card's transition: the preset when it has one, else the enum's family. */
export function transitionPresetLabel(t: Transition | undefined): string {
  if (!t) return "";
  if (t.preset && t.preset !== "cut") {
    const p = DEFAULT_TRANSITION_PRESETS[t.preset];
    return p ? `${t.preset.replace(/_/g, " ")} · ${p.beats} beat${p.beats === 1 ? "" : "s"}` : t.preset.replace(/_/g, " ");
  }
  return "";
}
