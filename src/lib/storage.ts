import { supabase } from "@/lib/supabase";

export type StorageBucket =
  | "artist-assets"
  | "look-composites"
  | "project-audio"
  | "project-references"
  | "project-clips"
  | "project-exports"
  | "style-references"
  | "product-assets"
  | "wardrobe-refs"
  | "location-refs"
  | "prop-refs";

/**
 * Build the canonical storage path for a bucket. The first segment MUST be the
 * user_id — RLS policies enforce this. Subsequent segments are bucket-specific.
 *
 * Examples:
 *   artist-assets       {user_id}/{artist_id}/{filename}
 *   look-composites     {user_id}/{artist_id}/{look_id}.{ext}
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

// =============================================================================
// Upload timeouts
// =============================================================================
// Silent hangs are the worst class of upload failure — the UI just sits there
// forever and the user has no idea what's happening. We wrap every network
// step with explicit deadlines so a hang surfaces as a clear, actionable error
// rather than an infinite spinner.

const DEFAULT_NETWORK_TIMEOUT_MS = 120_000; // PUT/POST to Storage REST

/**
 * Race a promise against a timeout. The timeout rejects with an Error that
 * includes the `label` so the call site stack tells you exactly what hung.
 *
 * Note: this does NOT cancel the underlying work — JS doesn't give us a kill
 * switch for promises in flight. But we stop *waiting* for it, the UI unblocks,
 * the toast fires, and the user can retry. The orphaned work will eventually
 * settle (resolved or rejected) into the void.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${label} timed out after ${(ms / 1000).toFixed(0)}s — the file source may be detached (try re-selecting the file, or use the direct-bytes upload path)`,
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}



// Coerce ArrayBuffer | TypedArray | Blob into a Blob. We can't pass a
// `Uint8Array<ArrayBufferLike>` to `new Blob([...])` directly under strict TS
// libs because the buffer might be a SharedArrayBuffer; copying into a fresh
// Uint8Array forces it onto a plain ArrayBuffer.
function toBlob(
  bytes: ArrayBuffer | Uint8Array | Blob,
  contentType: string,
): Blob {
  if (bytes instanceof Blob) return bytes;
  if (bytes instanceof ArrayBuffer) {
    return new Blob([bytes], { type: contentType });
  }
  // TypedArray path — copy into a fresh ArrayBuffer-backed view.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: contentType });
}

// =============================================================================
// Direct-bytes upload — the canonical entry point
// =============================================================================
/**
 * Upload raw bytes to a Supabase Storage bucket via the REST endpoint.
 *
 * Why this exists (and not just `supabase.storage.from(b).upload(file)`):
 *   1. The supabase-js storage upload path streams a File via ReadableStream.
 *      File objects whose backing source is detached (observed with files
 *      injected by browser-automation tools like Chrome MCP, also after
 *      input.value="" runs against an active FileList) hang the fetch
 *      indefinitely — no error, no timeout, just a permanent pending.
 *   2. Plain fetch with a materialised Blob body completes in milliseconds
 *      against the same endpoint with the same headers.
 *   3. Taking bytes directly (vs. a File) means programmatic callers — server
 *      code, edge functions, scripts, Claude-driven automation — never have
 *      to construct a synthetic File at all.
 *
 * Pass an ArrayBuffer, Uint8Array, or Blob. Returns the storage path on
 * success. Throws on timeout or HTTP error.
 */
export async function uploadBytesToBucket(
  bucket: StorageBucket,
  path: string,
  bytes: ArrayBuffer | Uint8Array | Blob,
  contentType: string,
  options?: {
    upsert?: boolean;
    /** Network-side timeout in ms (PUT/POST to Storage REST). Default 120s. */
    networkTimeoutMs?: number;
  },
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
  const networkTimeoutMs = options?.networkTimeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS;

  const url = `${baseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${path}`;
  const effectiveContentType = contentType || "application/octet-stream";
  const body = toBlob(bytes, effectiveContentType);

  // AbortController gives us a real cancel on the network side. We still race
  // it against the same timeout via withTimeout so a stuck fetch produces a
  // clean error message even if abort doesn't take effect immediately.
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), networkTimeoutMs);

  let resp: Response;
  try {
    resp = await withTimeout(
      fetch(url, {
        method: upsert ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": effectiveContentType,
          "cache-control": "max-age=3600",
          "x-upsert": String(upsert),
        },
        body,
        signal: controller.signal,
      }),
      networkTimeoutMs,
      `Storage upload to ${bucket}/${path}`,
    );
  } finally {
    clearTimeout(abortTimer);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Storage upload failed: ${resp.status} ${resp.statusText} — ${text.slice(0, 200)}`,
    );
  }
  return path;
}

// =============================================================================
// File-based upload — convenience wrapper for browser UI callers
// =============================================================================
/**
 * Upload a browser `File` to a bucket. Streams the File/Blob body directly to
 * the Storage REST endpoint without materialising it into an ArrayBuffer
 * first. iOS Safari detaches FileSystem-backed File handles aggressively when
 * memory is tight (notably during bulk HEIC picks where each heic2any decode
 * spikes RAM), and any subsequent `.arrayBuffer()` on a detached handle hangs
 * forever — the 30s timeout we used to wrap that read would fire, but the
 * rejection could be silently swallowed by callers that batched uploads with
 * Promise.all, so the UI claimed success while individual files vanished. By
 * handing the File straight to fetch as the body we sidestep the read entirely;
 * the browser streams the bytes on demand, and the network timeout is the only
 * deadline we need.
 *
 * The `bytesReadTimeoutMs` option is retained for backwards compatibility but
 * is ignored — there is no separate read step to time out.
 */
export async function uploadToBucket(
  bucket: StorageBucket,
  path: string,
  file: File,
  options?: {
    upsert?: boolean;
    networkTimeoutMs?: number;
    /** @deprecated No-op; the File is streamed directly without a separate read step. */
    bytesReadTimeoutMs?: number;
  },
): Promise<string> {
  return uploadBytesToBucket(
    bucket,
    path,
    file,
    file.type || "application/octet-stream",
    {
      upsert: options?.upsert,
      networkTimeoutMs: options?.networkTimeoutMs,
    },
  );
}

// =============================================================================
// Read / delete
// =============================================================================
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
  // Pair results to the INPUT paths by index: createSignedUrls returns items in
  // the same order as the request. item.path can come back null/normalised and
  // never match the caller's key; and across @supabase/storage-js versions the
  // URL is exposed as either `signedUrl` (newer) or `signedURL` (older). Reading
  // item.path/item.signedUrl directly left the map empty -> every thumbnail
  // stuck on "Loading…" despite the sign request returning 200.
  (data ?? []).forEach((item, i) => {
    const rec = item as { signedUrl?: string | null; signedURL?: string | null };
    const url = rec?.signedUrl ?? rec?.signedURL ?? null;
    const key = paths[i];
    if (key && url) map[key] = url;
  });
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

// =============================================================================
// Internals exposed for testing
// =============================================================================
export const _internal = { withTimeout };

// =============================================================================
// Edge Function client — bypass the browser File path entirely
// =============================================================================
/**
 * Upload via the `upload-asset` Supabase Edge Function. The function takes raw
 * bytes server-side and uses the service-role key to write Storage, after
 * re-verifying that the path begins with the caller's user_id.
 *
 * Use this when:
 *   - You're a programmatic caller (Claude in Cowork, script, server code).
 *   - The browser File path keeps hanging despite the timeout (e.g. very
 *     large detached files where the materialise step itself can't complete).
 *
 * Browser UI callers should normally use `uploadToBucket` instead — it's one
 * network hop, this is two.
 */
export async function uploadViaEdgeFunction(
  bucket: StorageBucket,
  path: string,
  bytes: ArrayBuffer | Uint8Array | Blob,
  contentType: string,
  options?: {
    upsert?: boolean;
    networkTimeoutMs?: number;
  },
): Promise<{ ok: true; bucket: string; path: string; size_bytes: number }> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const session = sessionData.session;
  if (!session) throw new Error("Not signed in");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL in env");

  const networkTimeoutMs = options?.networkTimeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS;
  const url = `${baseUrl.replace(/\/$/, "")}/functions/v1/upload-asset`;
  const effectiveContentType = contentType || "application/octet-stream";
  const body = toBlob(bytes, effectiveContentType);

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), networkTimeoutMs);

  let resp: Response;
  try {
    resp = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": effectiveContentType,
          "X-Bucket": bucket,
          "X-Path": path,
          "X-Upsert": String(options?.upsert ?? false),
        },
        body,
        signal: controller.signal,
      }),
      networkTimeoutMs,
      `Edge function upload to ${bucket}/${path}`,
    );
  } finally {
    clearTimeout(abortTimer);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Edge function upload failed: ${resp.status} ${resp.statusText} — ${text.slice(0, 200)}`,
    );
  }
  return (await resp.json()) as {
    ok: true;
    bucket: string;
    path: string;
    size_bytes: number;
  };
}
