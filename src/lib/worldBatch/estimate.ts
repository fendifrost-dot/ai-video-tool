/** Cost of a shot list BEFORE any call — the same arithmetic as run_world_batch.py's estimate. */
import type { BatchShot } from "./dialect";
import { PROVIDER_RATES as R } from "./rates";

/** Seconds the provider will bill for a non-seedance motion: the dialect snaps to 5 or 10. */
export function billedSeconds(shot: BatchShot): number {
  return Math.trunc(shot.seconds) > 5 ? 10 : 5;
}

export function sourceSeconds(shot: BatchShot): number {
  if (shot.source_seconds) return shot.source_seconds;
  if (shot.source_trim) return Math.max(0, shot.source_trim[1] - shot.source_trim[0]);
  return shot.seconds;
}

/**
 * What a Seedance 2.5 job costs, by the provider's own published rule: it bills TOKENS —
 *   ceil(output pixels × (input video seconds + generated seconds) × 24 / 1024)
 * — at a rate per thousand that is multiplied by 0.6 when the job has a video input. So a restage (which always has
 * one: the cut of the take) pays for the seconds it is given as well as the seconds it returns, at six tenths of the
 * rate. At 720p, 4 s from a 4 s source: $2.22 — the amount charged. The rule has been held against real charges only
 * at 720p 9:16 with a source as long as the output; elsewhere it is the published rule, not yet charged
 * (config/provider_rates.json → _seedance_tokens). `inputSeconds` 0 = no video input.
 */
export function seedanceUsd(resolution: string, outputSeconds: number, inputSeconds: number = outputSeconds): number {
  const t = R.seedance_tokens;
  // a size the rule has no numbers for cannot be priced, so it cannot be authorized: say so rather than return NaN
  // (NaN is not above any ceiling, and a run would go ahead with no bound on what it costs)
  if (!(t.pixels[resolution] > 0) || !(t.usd_per_1000_tokens[resolution] > 0)) {
    throw new Error(`Seedance at ${resolution} cannot be priced — no published rate is on file for that size, so it is not submitted`);
  }
  const tokens = Math.ceil((t.pixels[resolution] * (inputSeconds + outputSeconds) * t.frames_per_second) / t.divisor);
  return (tokens / 1000) * t.usd_per_1000_tokens[resolution] * (inputSeconds > 0 ? t.video_input_factor : 1);
}

/**
 * What a Seedance estimate at this size rests on. "charged": a real charge has matched the rule at this size (720p).
 * "published": the provider's published rule and per-second figures agree with the estimate, and nothing has been
 * charged at this size yet (480p, 1080p) — an estimate, not a verified price.
 */
export type PriceBasis = "charged" | "published";
export function seedancePriceBasis(resolution: string): PriceBasis {
  return R.seedance_tokens.charged.includes(resolution) ? "charged" : "published";
}

/** The Seedance sizes in a shot list whose price has never been charged, for the line under an estimate. */
export function unchargedSeedanceSizes(shots: readonly BatchShot[]): string[] {
  return [...new Set(shots.filter((s) => s.route === "seedance_ref" && seedancePriceBasis(s.resolution) === "published").map((s) => s.resolution))].sort();
}

export function estimateShotUsd(shot: BatchShot): number {
  // a restage is given a cut of the take as long as what it returns
  if (shot.route === "seedance_ref") return seedanceUsd(shot.resolution, sourceSeconds(shot));
  const still = shot.route.startsWith("still") && !shot.still_path ? R.still_usd_each * shot.stills : 0;
  const perSecond =
    shot.route === "still_runway"
      ? R.runway.gen4_turbo
      : shot.route === "runway_t2v" || shot.route === "still_runway45"
        ? R.runway["gen4.5"]
        : shot.route === "still_dop"
          ? R.dop_usd_per_s
          : R.kling_usd_per_s;
  return still + billedSeconds(shot) * perSecond;
}

export function estimateBatchUsd(shots: readonly BatchShot[]): number {
  return shots.reduce((a, s) => a + estimateShotUsd(s), 0);
}

export const usd = (n: number) => `$${n.toFixed(2)}`;
