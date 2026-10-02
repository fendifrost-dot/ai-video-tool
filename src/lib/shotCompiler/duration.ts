/**
 * Duration snap — model enums, never send 12 s to Kling.
 * Seedance: duration = source seconds (clamp 4–30); a longer ask comes back stretched.
 * Genjutsu (deferred): = source. Hailuo (if ever routed): 6 | 10.
 */

import type { WorldBatchRoute } from "./types";

export const KLING_DURATIONS = [5, 10] as const;
export const RUNWAY_DURATIONS = [5, 10] as const;
export const HAILUO_DURATIONS = [6, 10] as const;
export const SEEDANCE_MIN = 4;
export const SEEDANCE_MAX = 30;

/** Nearest allowed duration; ties prefer the shorter enum (cheaper / less stretch risk). */
export function snapToEnum(seconds: number, allowed: readonly number[]): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return allowed[0];
  let best = allowed[0];
  let bestDist = Math.abs(seconds - best);
  for (const a of allowed) {
    const d = Math.abs(seconds - a);
    if (d < bestDist || (d === bestDist && a < best)) {
      best = a;
      bestDist = d;
    }
  }
  return best;
}

/** Match run_world_batch.py: `10 if sec > 5 else 5` for Kling/Runway motion routes. */
export function snapKlingOrRunway(seconds: number): number {
  const sec = Math.max(1, Math.round(seconds));
  return sec > 5 ? 10 : 5;
}

/** Seedance: duration = source seconds, clamped 4–30, rounded to int. */
export function snapSeedance(sourceSeconds: number): number {
  const sec = Math.round(sourceSeconds);
  return Math.max(SEEDANCE_MIN, Math.min(SEEDANCE_MAX, sec));
}

export function snapDurationForRoute(
  route: WorldBatchRoute | "take_move" | "living_plate",
  seconds: number,
  sourceSeconds?: number,
): number {
  if (route === "seedance_ref") {
    return snapSeedance(sourceSeconds ?? seconds);
  }
  if (route === "take_move" || route === "living_plate") {
    // Stubs follow the song window; no provider enum.
    return Math.max(0.1, Number(seconds.toFixed(4)));
  }
  if (route === "runway_t2v" || route === "still_runway" || route === "still_runway45") {
    return snapKlingOrRunway(seconds);
  }
  // still_kling, still_dop, kling_t2v
  return snapKlingOrRunway(seconds);
}
