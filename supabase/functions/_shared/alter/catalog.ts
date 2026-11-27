import raw from "./catalog.data.ts";
import type { AlterMode, AlterPreset, CheckMode } from "./types.ts";

type FileShape = {
  attribution: { title: string; license: string; source: string; note: string };
  openings: Record<string, string>;
  close: Record<string, string>;
  presets: AlterPreset[];
};

const file = raw as unknown as FileShape;

export const ALTER_ATTRIBUTION = file.attribution;
export const ALTER_PRESETS: readonly AlterPreset[] = file.presets;

/**
 * AVT's own preset and wording, not part of the scenario-alter set. It is the prompt of the draft Fendi passed on
 * 26 and 27 Nov 2026 (docs/alter/TEST_2026-11-26.md) with the shot's particulars turned into slots.
 */
export const AVT_PRESETS: readonly AlterPreset[] = [
  {
    name: "action",
    group: "Action on a performance (AVT)",
    mode: "swap",
    opening: "A",
    check: "action",
    targetFrame: false,
    change: "Change only this. {action}",
    fill: {
      keep: "what else of him must stay, e.g. his teal bathrobe with the gold cuffs; his cross-legged seat",
      action:
        "what happens, with times in seconds: who enters and from which edge, what they do, what he does, when it ends. Say that nothing passes in front of his face and that his head stays where it is.",
    },
    refs: ["his face photographs from the tool, two to four"],
  },
];

export const ALTER_OPENINGS: Record<string, string> = {
  ...file.openings,
  A: "Edit @Video1. Real footage, not a render. Keep exactly the same camera position, framing, lens, set, light and timing as @Video1. Keep {who} exactly as in @Video1, frame for frame: the face, the position of the head, the eyes, every expression, and every movement of the mouth and jaw; {keep}.",
};
export const ALTER_CLOSE: Record<string, string> = {
  ...file.close,
  A: "Nothing else changes. Add no text, no letters, no logos, no watermarks.",
};

export function getPreset(name: string): AlterPreset | null {
  return [...ALTER_PRESETS, ...AVT_PRESETS].find((preset) => preset.name === name) ?? null;
}

export function listPresets(mode?: AlterMode): AlterPreset[] {
  const all = [...ALTER_PRESETS, ...AVT_PRESETS];
  return mode ? all.filter((preset) => preset.mode === mode) : all;
}

export function presetGroups(mode?: AlterMode): { group: string; presets: AlterPreset[] }[] {
  const groups: { group: string; presets: AlterPreset[] }[] = [];
  for (const preset of listPresets(mode)) {
    const found = groups.find((group) => group.group === preset.group);
    if (found) found.presets.push(preset);
    else groups.push({ group: preset.group, presets: [preset] });
  }
  return groups;
}

export function checkModeOf(preset: AlterPreset): CheckMode {
  return preset.check;
}
