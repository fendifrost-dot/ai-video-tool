/**
 * Seedance's "N second" file is N×24 + 1 frames (a 4 s request is 97 frames, 4.041667 s).
 * Filing the rounded request as 4.0 s makes a clip that covers its shot look short by a frame.
 * Ledger rows 59, 61, 75, 92 (16 Oct 2026) measured 97 frames on the 4 s montages.
 */
export const SEEDANCE_FPS = 24;

export function seedanceFileSeconds(asked: number): number {
  if (!(asked > 0) || !Number.isFinite(asked)) return asked;
  const whole = Math.round(asked);
  if (Math.abs(asked - whole) > 0.02) return Math.round(asked * 1e6) / 1e6;
  return Math.round(((whole * SEEDANCE_FPS + 1) / SEEDANCE_FPS) * 1e6) / 1e6;
}

/** What to store, and what to read, for a montage or restage. A duration already off a whole second is left alone. */
export function filedSeedanceSeconds(input: {
  asked: number | null;
  method?: string | null;
  stored?: number | null;
}): number | null {
  const stored = input.stored != null && input.stored > 0 ? input.stored : null;
  if (stored != null && Math.abs(stored - Math.round(stored)) > 0.02) return stored;
  const asked = stored ?? (input.asked != null && input.asked > 0 ? input.asked : null);
  if (asked == null) return null;
  if (input.method === "montage" || input.method === "restaged") return seedanceFileSeconds(asked);
  return asked;
}
