import raw from "./catalog.json";
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
export const ALTER_OPENINGS = file.openings;
export const ALTER_CLOSE = file.close;

export function getPreset(name: string): AlterPreset | null {
  return ALTER_PRESETS.find((preset) => preset.name === name) ?? null;
}

export function listPresets(mode?: AlterMode): AlterPreset[] {
  return mode ? ALTER_PRESETS.filter((preset) => preset.mode === mode) : [...ALTER_PRESETS];
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
