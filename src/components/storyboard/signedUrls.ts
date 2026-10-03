/**
 * Signed links for the media the storyboard shows. Links are signed in one batch per bucket and remembered for most
 * of their life, so forty boxes that all play the same take ask for one link, once.
 */
import { useEffect, useMemo, useState } from "react";
import { signedUrls, type StorageBucket } from "@/lib/storage";
import type { MediaAsset } from "@/lib/storyboard/media";

const TTL_SECONDS = 3600;
const cache = new Map<string, { url: string; expires: number }>();

export type MediaRef = { bucket: string; path: string };
export const mediaRefKey = (r: MediaRef) => `${r.bucket}:${r.path}`;

/** What the browser should load for an asset: its lighter playback copy when one exists, else the file itself. */
export function playbackRef(asset: Pick<MediaAsset, "bucket" | "path" | "playback">): MediaRef {
  return asset.playback ?? { bucket: asset.bucket, path: asset.path };
}

function cached(key: string): string | null {
  const hit = cache.get(key);
  return hit && hit.expires > Date.now() ? hit.url : null;
}

export async function signRefs(refs: readonly MediaRef[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const byBucket = new Map<string, string[]>();
  for (const r of refs) {
    const key = mediaRefKey(r);
    const hit = cached(key);
    if (hit) out[key] = hit;
    else byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r.path]);
  }
  await Promise.all(
    [...byBucket].map(async ([bucket, paths]) => {
      const unique = [...new Set(paths)];
      try {
        const signed = await signedUrls(bucket as StorageBucket, unique, TTL_SECONDS);
        for (const [path, url] of Object.entries(signed)) {
          const key = mediaRefKey({ bucket, path });
          cache.set(key, { url, expires: Date.now() + (TTL_SECONDS - 300) * 1000 });
          out[key] = url;
        }
      } catch {
        // an unsigned link shows as "not available" on its box; the rest of the board still loads
      }
    }),
  );
  return out;
}

/** Signed links for a set of refs, keyed by `mediaRefKey`. Re-signs only what is new. */
export function useSignedRefs(refs: readonly MediaRef[]): Record<string, string> {
  const key = useMemo(() => [...new Set(refs.map(mediaRefKey))].sort().join("|"), [refs]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return;
    let stop = false;
    void signRefs(refs).then((signed) => {
      if (!stop) setUrls((prev) => ({ ...prev, ...signed }));
    });
    return () => {
      stop = true;
    };
    // `refs` is represented by `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
