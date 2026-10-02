/**
 * Look presets — mirror config/look_presets.json (film_bar_v1 default).
 * Embedded so the compiler stays pure (no fs / network) in browser + vitest.
 */

import type { LookPreset } from "./types";

export const DEFAULT_LOOK_PRESET_ID = "film_bar_v1";

export const LOOK_PRESETS: Record<string, LookPreset> = {
  film_bar_v1: {
    preamble:
      "You are a world-class cinematographer and master gaffer. Generate images indistinguishable from 35mm or 70mm motion-picture film. Optics: Arri Alexa 65 or Panavision Millennium DXL2 sensors; specific focal lengths (35mm for environmental shots, 85mm for portraits). Lighting: Rembrandt lighting, negative fill or motivated lighting; high dynamic range with soft highlight roll-off and deep, textured shadows. Color science: Kodak Vision3 5219 film emulation; natural skin texture with no plastic look; a professional grade with rich micro-contrast.",
    shot_suffix:
      "24fps film grain. Cinematic, gritty, found-footage aesthetic. No clean or polished shots; it always feels captured in the moment.",
  },
  handheld_doc_v1: {
    preamble: "",
    shot_suffix:
      "Handheld camera work: raw, unstable, documentary-style. Harsh overexposed sunlight, long shadows. Mood chaotic, rebellious and surreal. No clean or polished shots; always feels captured in the moment.",
  },
};

export function resolveLookPreset(id?: string, override?: LookPreset): { id: string; look: LookPreset } {
  if (override) return { id: id ?? "custom", look: override };
  const key = id && LOOK_PRESETS[id] ? id : DEFAULT_LOOK_PRESET_ID;
  return { id: key, look: LOOK_PRESETS[key] };
}
