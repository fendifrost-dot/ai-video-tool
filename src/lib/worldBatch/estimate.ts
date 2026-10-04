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
 * A seedance reference-to-video job of `seconds`, made from a source clip as long. What the provider has been seen to
 * charge for the resolution, where it has been seen: per second of output. Where it has not, the list rate — which
 * is per second of input as well as of output.
 */
export function seedanceUsd(resolution: string, seconds: number): number {
  const charged = R.seedance_charged_usd_per_output_s[resolution];
  return charged != null ? charged * seconds : R.seedance_usd_per_s[resolution] * 2 * seconds;
}

export function estimateShotUsd(shot: BatchShot): number {
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
