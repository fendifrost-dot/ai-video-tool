import { songToPerformance, type PerformanceSync } from "@/lib/sync/performanceSync";
import { isUsableSync, type TakeSync } from "@/lib/storyboard/media";
import { songTimeAt } from "@/lib/editor/playback";
import type { EditClip, EditSequence } from "../../../supabase/functions/edit-render/model";

export type DerivedLink = {
  assetId: string;
  method?: string | null;
};

export type CompareAsset = {
  id: string;
  footage_role?: string | null;
  asset_type?: string | null;
  metadata_json?: unknown;
};

export type CompareResolveOk = {
  ok: true;
  originalAssetId: string;
  sourceTime: number;
  songTime: number;
  syncOffset: number;
  chain: string[];
};

export type CompareResolveFail = {
  ok: false;
  reason: string;
};

export type CompareResolve = CompareResolveOk | CompareResolveFail;

function derivedOf(meta: unknown): DerivedLink | null {
  const d = (meta as { derived_from?: { asset_id?: unknown; method?: unknown } } | null)?.derived_from;
  if (!d || typeof d.asset_id !== "string" || !d.asset_id) return null;
  return {
    assetId: d.asset_id,
    method: typeof d.method === "string" ? d.method : null,
  };
}

/**
 * Walk metadata_json.derived_from to the camera original (no further parent).
 * Stops on cycles. Returns the starting id when it is already an original.
 */
export function resolveOriginalAssetId(
  startAssetId: string,
  byId: ReadonlyMap<string, CompareAsset>,
): { originalId: string; chain: string[] } | null {
  const chain: string[] = [];
  const seen = new Set<string>();
  let id: string | null = startAssetId;
  while (id) {
    if (seen.has(id)) return null;
    seen.add(id);
    chain.push(id);
    const asset = byId.get(id);
    if (!asset) {
      // Parent missing from the project map — last known id is the best we have.
      return { originalId: id, chain };
    }
    const parent = derivedOf(asset.metadata_json);
    if (!parent) return { originalId: id, chain };
    id = parent.assetId;
  }
  return null;
}

function syncFor(
  originalId: string,
  syncs: readonly TakeSync[],
): TakeSync | PerformanceSync | null {
  const matches = syncs.filter((s) => s.performanceAssetId === originalId && isUsableSync(s));
  if (matches.length) {
    // Prefer confirmed/manual, then newest.
    const rank = (s: TakeSync) =>
      s.status === "confirmed" ? 3 : s.status === "manual" ? 2 : s.status === "auto" ? 1 : 0;
    return [...matches].sort((a, b) => rank(b) - rank(a) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0]!;
  }
  return null;
}

/**
 * Resolve the camera original for the active timeline clip and map song time →
 * original source time via performance_syncs. Never assumes source == song.
 */
export function resolveCompareOriginal(input: {
  sequence: EditSequence;
  clip: EditClip | null;
  playhead: number;
  assets: readonly CompareAsset[];
  syncs: readonly TakeSync[];
}): CompareResolve {
  if (!input.clip?.assetId) {
    return { ok: false, reason: "Select a clip with picture to compare against the original take." };
  }
  const byId = new Map(input.assets.map((a) => [a.id, a]));
  const resolved = resolveOriginalAssetId(input.clip.assetId, byId);
  if (!resolved) {
    return { ok: false, reason: "Could not follow this clip’s source chain (cycle or missing parent)." };
  }
  const original = byId.get(resolved.originalId);
  if (!original) {
    return {
      ok: false,
      reason: `Original take ${resolved.originalId.slice(0, 8)}… is not in this project’s media.`,
    };
  }
  const role = original.footage_role ?? null;
  if (role && role !== "performance" && derivedOf(original.metadata_json)) {
    return {
      ok: false,
      reason: "Source chain did not reach a camera performance take.",
    };
  }
  const sync = syncFor(resolved.originalId, input.syncs);
  if (!sync) {
    return {
      ok: false,
      reason:
        "No usable performance sync for the original take — song time cannot be mapped to its source frames.",
    };
  }
  const songTime = songTimeAt(input.sequence, input.playhead);
  const sourceTime = songToPerformance(songTime, sync);
  if (sourceTime < -0.05) {
    return {
      ok: false,
      reason: `At this song time the original take has not started yet (sync offset ${sync.offsetSeconds.toFixed(3)} s).`,
    };
  }
  return {
    ok: true,
    originalAssetId: resolved.originalId,
    sourceTime: Math.max(0, sourceTime),
    songTime,
    syncOffset: sync.offsetSeconds,
    chain: resolved.chain,
  };
}
