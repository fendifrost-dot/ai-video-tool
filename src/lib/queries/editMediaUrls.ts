import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { signedUrls, type StorageBucket } from "@/lib/storage";
import type { EditSequence } from "../../../supabase/functions/edit-render/model";

function bucketAndPath(fileUrl: string, meta: Record<string, unknown> | null): {
  bucket: StorageBucket;
  path: string;
} | null {
  const bucket =
    (typeof meta?.bucket === "string" && meta.bucket) ||
    (fileUrl.includes("project-audio")
      ? "project-audio"
      : fileUrl.includes("project-references")
        ? "project-references"
        : "project-clips");
  const path = fileUrl.replace(/^\/+/, "");
  if (!path) return null;
  return { bucket: bucket as StorageBucket, path };
}

export type EditMediaMap = {
  songUrl: string | null;
  byAssetId: Record<string, string>;
};

/**
 * Signed URLs for the sequence song and every clip asset. Preview-only — does not
 * change production selection or board assignments.
 */
export function useEditMediaUrls(sequence: EditSequence | null) {
  const assetIds = [
    ...new Set(
      (sequence?.clips ?? [])
        .map((c) => c.assetId)
        .filter((id): id is string => !!id)
        .concat(sequence?.songAssetId ? [sequence.songAssetId] : []),
    ),
  ].sort();

  return useQuery({
    queryKey: ["edit-media-urls", sequence?.id ?? "", assetIds.join(",")],
    enabled: !!sequence && assetIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<EditMediaMap> => {
      const { data, error } = await supabase
        .from("project_assets")
        .select("id, file_url, metadata_json, asset_type")
        .in("id", assetIds);
      if (error) throw new Error(error.message);
      const byBucket = new Map<StorageBucket, string[]>();
      const idToKey = new Map<string, { bucket: StorageBucket; path: string }>();
      for (const row of data ?? []) {
        if (!row.file_url) continue;
        const bp = bucketAndPath(row.file_url, (row.metadata_json ?? {}) as Record<string, unknown>);
        if (!bp) continue;
        idToKey.set(row.id, bp);
        const list = byBucket.get(bp.bucket) ?? [];
        list.push(bp.path);
        byBucket.set(bp.bucket, list);
      }
      const byAssetId: Record<string, string> = {};
      for (const [bucket, paths] of byBucket) {
        const unique = [...new Set(paths)];
        const urls = await signedUrls(bucket, unique, 3600);
        for (const [id, key] of idToKey) {
          if (key.bucket !== bucket) continue;
          const url = urls[key.path];
          if (url) byAssetId[id] = url;
        }
      }
      return {
        songUrl: sequence!.songAssetId ? (byAssetId[sequence!.songAssetId] ?? null) : null,
        byAssetId,
      };
    },
  });
}
