/** Keep in step with src/lib/storyboard/seedanceDuration.ts — edge functions cannot import from src/. */
export const SEEDANCE_FPS = 24;

export function seedanceFileSeconds(asked: number): number {
  if (!(asked > 0) || !Number.isFinite(asked)) return asked;
  const whole = Math.round(asked);
  if (Math.abs(asked - whole) > 0.02) return Math.round(asked * 1e6) / 1e6;
  return Math.round(((whole * SEEDANCE_FPS + 1) / SEEDANCE_FPS) * 1e6) / 1e6;
}
