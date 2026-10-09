/**
 * Is what a box SHOWS still dressed in what the shot wears now? Pure.
 *
 * The evidence is the displayed media's own job — and, for a clip animated from an existing picture, that picture's
 * job too. A clip made from an old picture wears the picture's clothes, whatever outfit the clip's own job recorded
 * at submit time; so the clip's record never certifies the picture's wardrobe. Missing evidence stays missing: when
 * the shot wears an outfit and the provenance cannot be read, it is reported, not passed.
 */
import { outfitOutdated, outfitRecordOf, type ShotOutfit } from "@/lib/wardrobe/outfits";
import { isOriginalTake, type MediaAsset } from "./media";

export type ProvenanceJob = { result_asset_id: string | null; request_payload_json: unknown };

/** Pictures drawn for a continuity entity carry no shot's wardrobe (generate.ts ENTITY_RUN). */
const ENTITY_RUN = "continuity";

function settings(job: ProvenanceJob): Record<string, unknown> | null {
  const s = (job.request_payload_json as { settings?: unknown } | null)?.settings;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
}

export function displayedOutfitOutdated(input: {
  showing: MediaAsset | null;
  resolved: ShotOutfit;
  pieces: readonly string[];
  jobs: readonly ProvenanceJob[];
  assets: readonly MediaAsset[];
}): string | null {
  const { showing, resolved, pieces, jobs, assets } = input;
  if (!showing) return null;
  // his take as filmed is not a generated picture; whether its clothes meet the shot is the unmet-requirement check
  if (isOriginalTake(showing)) return null;
  const job = jobs.find((j) => j.result_asset_id === showing.id);
  const s = job ? settings(job) : null;
  if (!job || !s) return resolved.outfit ? `made before the shot wore “${resolved.outfit.name}”` : null;
  const own = outfitOutdated(resolved, outfitRecordOf(s), pieces);
  const stillPath = typeof s.stillPath === "string" ? s.stillPath : null;
  // a still job, or a clip that drew its own picture in the same job: that job's record is the picture's record
  const drewItsOwn = s.mode === "still_only" || (job.request_payload_json as { mode?: unknown } | null)?.mode === "still_only" || (Array.isArray(s.stillCandidates) && !!stillPath && s.stillCandidates.includes(stillPath));
  if (!stillPath || drewItsOwn || !showing.isVideo) return own;
  // a clip animated from an existing picture: that picture's own record decides what it wears
  const still = assets.find((a) => a.path === stillPath && a.id !== showing.id);
  const stillJob = still ? jobs.find((j) => j.result_asset_id === still.id) : undefined;
  const ss = stillJob ? settings(stillJob) : null;
  if (ss?.batchRun === ENTITY_RUN) return own;
  if (!ss) return resolved.outfit ? `made from a picture whose outfit is not recorded; the shot wears “${resolved.outfit.name}”` : own;
  const fromStill = outfitOutdated(resolved, outfitRecordOf(ss), pieces);
  return fromStill ? `made from a picture ${fromStill}` : own;
}
