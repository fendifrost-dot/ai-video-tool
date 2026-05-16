import { supabase } from "@/lib/supabase";

export type StorageBucket =
  | "artist-assets"
  | "project-audio"
  | "project-references"
  | "project-clips"
  | "project-exports";

/**
 * Build the canonical storage path for a bucket. The first segment MUST be the
 * user_id — RLS policies enforce this. Subsequent segments are bucket-specific.
 *
 * Examples:
 *   artist-assets       {user_id}/{artist_id}/{filename}
 *   project-audio       {user_id}/{project_id}/{filename}
 *   project-references  {user_id}/{project_id}/{filename}
 *   project-clips       {user_id}/{project_id}/{shot_id?}/{filename}
 *   project-exports     {user_id}/{project_id}/exports/{filename}
 */
export function buildStoragePath(userId: string, ...segments: string[]): string {
  return [userId, ...segments].filter(Boolean).map(sanitizeSegment).join("/");
}

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Upload a single file to a bucket via direct fetch to Supabase's storage REST
 * endpoint. We previously used `supabase.storage.from(bucket).upload(...)` but
 * the SDK call hangs on certain payloads (observed: video/mp4 + project-clips
 * bucket — POST fires but the response promise never resolves, button stays
 * "Uploading..." indefinitely). Plain fetch with the same headers + raw File
 * body returns 200 in milliseconds. Same endpoint, same auth, same path.
 *
 * Returns the storage path that was used (relative to the bucket) — store
 * this in the `file_url` column.
 */
export async function uploadToBucket(
  bucket: StorageBucket,
  path: string,
  file: File,
  options?: { upsert?: boolean },
): Promise<string> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const session = sessionData.session;
  if (!session) throw new Error("Not signed in");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL in env");
  }

  const upsert = options?.upsert ?? false;
  const url = `${baseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${path}`;

  const resp = await fetch(url, {
    method: upsert ? "PUT" : "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": file.type || "application/octet-stream",
      "cache-control": "max-age=3600",
      "x-upsert": String(upsert),
    },
    body: file,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Storage upload failed: ${resp.status} ${resp.statusText} — ${text.slice(0, 200)}`,
    );
  }
  return path;
}

/**
 * Get a short-lived signed URL for displaying a private asset.
 */
export async function signedUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Batch-sign URLs. Returns a map from path -> signed URL. Failures are
 * silently swallowed (the path will be missing from the result map).
 */
export async function signedUrls(
  bucket: StorageBucket,
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresInSeconds);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

/**
 * Delete a file from a bucket.
 */
export async function deleteFromBucket(
  bucket: StorageBucket,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

/**
 * Construct a deterministic filename to avoid collisions.
 */
export function makeUploadFilename(original: string): string {
  const dot = original.lastIndexOf(".");
  const ext = dot >= 0 ? original.slice(dot) : "";
  const stem = (dot >= 0 ? original.slice(0, dot) : original)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stem || "file"}_${ts}_${rand}${ext}`;
}
