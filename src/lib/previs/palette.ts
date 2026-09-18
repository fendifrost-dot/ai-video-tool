/**
 * Deterministic colour + seed derivation for animated previs (Lane E).
 *
 * A previs must be reproducible: the SAME Shot Spec always yields the SAME
 * asset, with no calls to any paid model and no randomness. Every value here
 * is derived from a stable string hash of the spec's creative fields, then
 * nudged by a small set of well-known keywords (time-of-day / lighting).
 *
 * Nothing here is project-specific — a "look" is a free string, exactly as in
 * the Shot Specification contract.
 */

/** FNV-1a 32-bit — small, fast, deterministic, dependency-free. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in the int range.
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 → unsigned 32-bit.
  return h >>> 0;
}

/** Stable hue in [0,360) from an arbitrary string (empty → mid spectrum). */
export function hueFrom(input: string, fallback = 210): number {
  const s = input.trim();
  if (!s) return fallback;
  return hashString(s) % 360;
}

export type PrevisPalette = {
  /** Sky / backdrop gradient top → bottom. */
  skyTop: string;
  skyBottom: string;
  /** Ground plane. */
  ground: string;
  /** The performer / subject figure. */
  subject: string;
  /** FX / energy accent (framing guides, motion arrows). */
  accent: string;
  /** Foreground ink for captions drawn inside the SVG. */
  ink: string;
  /** Whether the scene reads as a dark (night) frame — used for ink contrast. */
  dark: boolean;
};

function hsl(h: number, s: number, l: number): string {
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  return `hsl(${((h % 360) + 360) % 360} ${clamp(s, 0, 100)}% ${clamp(l, 0, 100)}%)`;
}

/**
 * Keyword lighting profile. `lightness` shifts the whole backdrop; `warmth`
 * rotates hue toward orange (positive) or blue (negative). Keeps the palette
 * legible instead of literally correct.
 */
function toneFromKeywords(text: string): { lightness: number; warmth: number; dark: boolean } {
  const t = text.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  if (has("night", "midnight", "moon", "dark")) return { lightness: -26, warmth: -30, dark: true };
  if (has("dusk", "sunset", "golden", "magic hour", "amber"))
    return { lightness: -6, warmth: 34, dark: false };
  if (has("dawn", "sunrise", "morning")) return { lightness: 6, warmth: 20, dark: false };
  if (has("noon", "midday", "bright", "sun", "daylight", "day"))
    return { lightness: 12, warmth: 6, dark: false };
  if (has("neon", "club", "studio", "stage")) return { lightness: -14, warmth: -10, dark: true };
  if (has("overcast", "fog", "grey", "gray", "rain"))
    return { lightness: -2, warmth: -14, dark: false };
  return { lightness: 0, warmth: 0, dark: false };
}

/**
 * Build a full palette from the creative descriptors of a shot. Deterministic:
 * identical inputs → identical colours.
 */
export function buildPalette(input: {
  environment: string;
  timeOfDay: string;
  lighting: string;
  wardrobe: string;
}): PrevisPalette {
  const baseHue = hueFrom(`${input.environment} ${input.timeOfDay}`, 210);
  const { lightness, warmth, dark } = toneFromKeywords(
    `${input.timeOfDay} ${input.lighting} ${input.environment}`,
  );

  const skyHue = baseHue + warmth * 0.4;
  const groundHue = baseHue + 24;
  const subjectHue = hueFrom(input.wardrobe, (baseHue + 180) % 360);
  const accentHue = (subjectHue + 40) % 360;

  return {
    skyTop: hsl(skyHue, 46, 62 + lightness),
    skyBottom: hsl(skyHue + 12, 52, 44 + lightness),
    ground: hsl(groundHue, 30, 30 + lightness),
    subject: hsl(subjectHue, 58, dark ? 58 : 46),
    accent: hsl(accentHue, 82, dark ? 66 : 54),
    ink: dark ? "hsl(0 0% 96%)" : "hsl(222 30% 14%)",
    dark,
  };
}
