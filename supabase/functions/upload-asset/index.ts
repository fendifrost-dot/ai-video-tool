// =============================================================================
// upload-asset — server-side upload bypass for the workspace-File-hang bug
// =============================================================================
// Browser File objects whose backing source has detached (Chrome MCP-injected
// files from non-uploads mounts, also files held past input.value="") will
// hang any browser-side upload path that reads them. This edge function gives
// programmatic callers a way to upload raw bytes from anywhere — Claude in
// Cowork, scripts, CI — without ever touching a browser File.
//
// Request:
//   POST /functions/v1/upload-asset
//   Authorization: Bearer <user_jwt>
//   Content-Type: <file mime-type>
//   X-Bucket: artist-assets | project-audio | project-references |
//             project-clips | project-exports | product-assets
//   X-Path: <user_id>/<segments>/<filename>     # see buildStoragePath
//   X-Upsert: true | false                       # optional, default false
//   Body: raw bytes
//
// Response:
//   200 { ok: true, path, bucket, size_bytes }
//   400 invalid input
//   401 missing/invalid JWT
//   403 path does not start with caller's user_id (RLS guard)
//   413 body too large (we cap at 500 MB to match the UI)
//   5xx storage error
// =============================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const ALLOWED_BUCKETS = new Set([
  "artist-assets",
  "project-audio",
  "project-references",
  "project-clips",
  "project-exports",
  "product-assets",
]);

// Match the UI's 500 MB ceiling. The platform-side limit is 5 GB on paid
// tiers, but our flows don't need anything close to that yet.
const MAX_BYTES = 500 * 1024 * 1024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-bucket, x-path, x-upsert, x-client-info, apikey",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // ---------------------------------------------------------------------------
  // 1. Validate inputs
  // ---------------------------------------------------------------------------
  const bucket = req.headers.get("x-bucket") ?? "";
  const path = req.headers.get("x-path") ?? "";
  const upsert = (req.headers.get("x-upsert") ?? "false").toLowerCase() === "true";
  const contentType = req.headers.get("content-type") ?? "application/octet-stream";

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return json(400, { error: "invalid_bucket", bucket });
  }
  if (!path || path.includes("..") || path.startsWith("/")) {
    return json(400, { error: "invalid_path", path });
  }

  // ---------------------------------------------------------------------------
  // 2. Authenticate — extract user from the caller's JWT
  // ---------------------------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "missing_jwt" });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json(401, { error: "invalid_jwt", detail: userErr?.message });
  }
  const userId = userData.user.id;

  // Path must start with `${userId}/` — same invariant the RLS storage
  // policies enforce. Caught here too so a bad caller fails fast.
  const firstSegment = path.split("/")[0];
  if (firstSegment !== userId) {
    return json(403, {
      error: "path_must_start_with_user_id",
      expected_prefix: `${userId}/`,
      got: path,
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Read body — cap at MAX_BYTES
  // ---------------------------------------------------------------------------
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BYTES) {
    return json(413, { error: "payload_too_large", max_bytes: MAX_BYTES });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return json(400, { error: "empty_body" });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return json(413, { error: "payload_too_large", max_bytes: MAX_BYTES });
  }

  // ---------------------------------------------------------------------------
  // 4. Upload via service-role client (bypasses storage RLS, but we've already
  //    enforced the user_id prefix invariant above)
  // ---------------------------------------------------------------------------
  const { error: uploadErr } = await adminClient.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType,
      upsert,
    });

  if (uploadErr) {
    return json(500, { error: "storage_upload_failed", detail: uploadErr.message });
  }

  return json(200, {
    ok: true,
    bucket,
    path,
    size_bytes: bytes.byteLength,
  });
});
