// Local cache rules shared by the worker and avt-mcp. Disposable copies can be evicted.
// Originals, locked or approved masters, and anything not sha256-verified cannot.

export const DEFAULT_CACHE_CAP_BYTES = 20 * 1024 * 1024 * 1024;
export const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PROTECTED_KINDS = new Set(["original", "camera", "master", "locked", "approved"]);

export type CacheEntry = {
  key: string;
  bytes: number;
  class?: "disposable" | "protected";
  lastUsed: number;
  verified?: boolean;
  locked?: boolean;
  approved?: boolean;
  kind?: string;
};

export function isProtected(entry: CacheEntry | null | undefined): boolean {
  if (!entry || entry.class === "protected") return true;
  if (entry.verified !== true) return true;
  if (entry.locked === true || entry.approved === true) return true;
  if (entry.kind && PROTECTED_KINDS.has(entry.kind)) return true;
  return false;
}

export function evictionPlan(input: {
  entries: CacheEntry[];
  capBytes?: number;
  ttlMs?: number;
  now?: number;
}) {
  const capBytes = input.capBytes ?? DEFAULT_CACHE_CAP_BYTES;
  const ttlMs = input.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = input.now ?? Date.now();
  const kept: CacheEntry[] = [];
  const evict: (CacheEntry & { reason: string })[] = [];
  for (const entry of input.entries) {
    const expired = entry.class === "disposable" && entry.verified === true && now - entry.lastUsed > ttlMs;
    if (expired && !isProtected(entry)) evict.push({ ...entry, reason: "ttl" });
    else kept.push(entry);
  }
  const disposable = kept.filter((entry) => !isProtected(entry)).sort((a, b) => a.lastUsed - b.lastUsed);
  let used = kept.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
  for (const entry of disposable) {
    if (used <= capBytes) break;
    evict.push({ ...entry, reason: "lru" });
    used -= entry.bytes || 0;
  }
  const evictKeys = new Set(evict.map((entry) => entry.key));
  return {
    evict,
    kept: kept.filter((entry) => !evictKeys.has(entry.key)),
    cache_bytes: input.entries.reduce((sum, entry) => sum + (entry.bytes || 0), 0) - evict.reduce((sum, entry) => sum + (entry.bytes || 0), 0),
    cap_bytes: capBytes,
    deletes_remote: false as const,
  };
}

export function assetsToFetch(inputAssetIds: readonly string[], cachedKeys: ReadonlySet<string> | readonly string[]): string[] {
  const have = cachedKeys instanceof Set ? cachedKeys : new Set(cachedKeys);
  return [...new Set(inputAssetIds)].filter((id) => id && !have.has(id));
}

export function mayClearScratch(input: { uploaded?: boolean; sha256Match?: boolean; jobComplete?: boolean }): boolean {
  return input.uploaded === true && input.sha256Match === true && input.jobComplete === true;
}
