// Caller-scoped storage access for edge functions that hold the service-role key.
//
// The service role bypasses bucket RLS, so a function that signs, downloads or lists a path a caller supplied must
// decide ownership itself. This mirrors the live bucket policies (SEC-4, 12 Oct 2026): the first path folder is the
// owner's auth uid, and public.storage_legacy_folder_grants gives a user read access to <folderUid>/<projectId>/
// prefixes uploaded by earlier anonymous sessions. Nothing here grants writes outside the caller's own folder.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StorageDecision = { ok: true; via: "owner" | "legacy_grant" } | { ok: false; reason: "invalid_path" | "not_owner" | "lookup_failed" };

/** True for a storage object key with no traversal, no leading slash and a uuid first folder. */
export function wellFormedObjectPath(path: unknown): path is string {
  if (typeof path !== "string" || !path || path.length > 1024 || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  return parts.length >= 2 && parts.every((p) => p !== "" && p !== "." && p !== "..") && UUID.test(parts[0]);
}

/**
 * May `userId` read `bucket/path`? Owner folder first; otherwise a legacy grant for <folder>/<project>/ in that bucket.
 * `admin` is a service-role client (the grants table has no client policies on purpose).
 */
// deno-lint-ignore no-explicit-any
export async function callerMayRead(admin: any, userId: string, bucket: string, path: unknown): Promise<StorageDecision> {
  if (!wellFormedObjectPath(path) || typeof bucket !== "string" || !/^[a-z0-9-]{1,64}$/.test(bucket)) return { ok: false, reason: "invalid_path" };
  const [folder, project] = path.split("/");
  if (folder === userId) return { ok: true, via: "owner" };
  // The SQL predicate reads storage.foldername(name)[2], which is NULL for a two-segment key, so a legacy grant never
  // covers an object sitting directly at <folder>/<project>; require a third segment here too.
  if (!UUID.test(project ?? "") || path.split("/").length < 3) return { ok: false, reason: "not_owner" };
  const { data, error } = await admin.from("storage_legacy_folder_grants").select("user_id").eq("bucket_id", bucket).eq("folder_uid", folder).eq("project_id", project).eq("user_id", userId).limit(1);
  if (error) return { ok: false, reason: "lookup_failed" };
  return Array.isArray(data) && data.length > 0 ? { ok: true, via: "legacy_grant" } : { ok: false, reason: "not_owner" };
}

/** Like callerMayRead for a path that may live in any of several buckets (fallback-bucket signers). */
// deno-lint-ignore no-explicit-any
export async function callerMayReadAny(admin: any, userId: string, buckets: readonly string[], path: unknown): Promise<StorageDecision> {
  let last: StorageDecision = { ok: false, reason: "invalid_path" };
  for (const bucket of buckets) { last = await callerMayRead(admin, userId, bucket, path); if (last.ok || last.reason !== "not_owner") return last; }
  return last;
}

/**
 * Does `userId` own `artists.id = artistId`? Routes that sign paths read from artist-scoped rows (character_features,
 * artist_looks) must check this before the row lookup: `row.artist_id === body.artistId` alone ties nothing to the
 * caller. Any lookup error is a refusal (`lookup_failed`), never an allow.
 */
// deno-lint-ignore no-explicit-any
export async function callerOwnsArtist(admin: any, userId: string, artistId: unknown): Promise<StorageDecision> {
  if (typeof artistId !== "string" || !UUID.test(artistId)) return { ok: false, reason: "invalid_path" };
  const { data, error } = await admin.from("artists").select("user_id").eq("id", artistId).maybeSingle();
  if (error) return { ok: false, reason: "lookup_failed" };
  return data && data.user_id === userId ? { ok: true, via: "owner" } : { ok: false, reason: "not_owner" };
}

/** HTTP status + error code for a refusal, shared by every route so a DB outage never reads as a caller error. */
export function refusalResponse(decision: { ok: false; reason: "invalid_path" | "not_owner" | "lookup_failed" }): { status: 400 | 403 | 500; error: string } {
  if (decision.reason === "invalid_path") return { status: 400, error: "invalid_storage_path" };
  if (decision.reason === "lookup_failed") return { status: 500, error: "storage_access_lookup_failed" };
  return { status: 403, error: "storage_path_forbidden" };
}

/** A path the caller may write: inside their own folder only. */
export function callerMayWrite(userId: string, path: unknown): boolean {
  return wellFormedObjectPath(path) && path.split("/")[0] === userId;
}

/** Sign `bucket/path` for the caller after the ownership check, or explain the refusal. Never logs the URL. */
// deno-lint-ignore no-explicit-any
export async function signForCaller(admin: any, userId: string, bucket: string, path: unknown, ttlSeconds: number): Promise<{ ok: true; url: string; via: "owner" | "legacy_grant" } | { ok: false; status: 400 | 403 | 404 | 500; error: string }> {
  const decision = await callerMayRead(admin, userId, bucket, path);
  if (!decision.ok) {
    if (decision.reason === "invalid_path") return { ok: false, status: 400, error: "invalid_storage_path" };
    if (decision.reason === "lookup_failed") return { ok: false, status: 500, error: "storage_access_lookup_failed" };
    return { ok: false, status: 403, error: "storage_path_forbidden" };
  }
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path as string, ttlSeconds);
  if (error || !data?.signedUrl) return { ok: false, status: 404, error: "storage_object_not_found" };
  return { ok: true, url: data.signedUrl, via: decision.via };
}
