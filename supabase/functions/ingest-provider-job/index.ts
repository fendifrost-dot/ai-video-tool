// =============================================================================
// ingest-provider-job — server-side fetch + upload of provider-job result clips
// =============================================================================
// The previous client-side path piped a 5-10 MB base64 payload through
// supabase.functions.invoke -> proxy-provider-call -> CC -> back. When that
// chain hiccuped (function memory limits, fetch timeouts, atob blow-ups in
// the browser, or just navigation mid-ingest), the asset was never written
// and the failure was swallowed by the React Query effect's try/catch.
//
// This function moves the entire ingest server-side. It:
//   1. Reads the provider_jobs row (service role; we enforce caller user_id
//      matches the row's user_id).
//   2. Calls Control Center's video-providers-job-result endpoint with
//      inline=1 over a server-to-server fetch — no browser memory pressure.
//   3. Decodes the returned base64 and uploads the bytes to project-clips.
//   4. Inserts the project_assets row and links it via
//      provider_jobs.result_asset_id.
//
// Modes:
//   POST /functions/v1/ingest-provider-job
//   body: { "jobId": "<provider_jobs.id>" }              # one row
//   body: { "all": true, "limit": 50 }                   # backfill (caller's rows)
//
// Response: { ok, ingested: [{ jobId, assetId, sizeBytes }], errors: [...] }
//
// Idempotent: a row with result_asset_id already set returns the existing
// asset id without re-downloading.
// =============================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ingestOne, type IngestRow } from "../_shared/ingestClip.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-client-info, apikey",
};

const BACKFILL_DEFAULT_LIMIT = 25;
const BACKFILL_MAX_LIMIT = 100;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ccUrl = Deno.env.get("CONTROL_CENTER_URL")?.trim();
  const ccKey = Deno.env.get("AVT_PROXY_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: "server_misconfigured", detail: "supabase env missing" });
  }
  if (!ccUrl || !ccKey) {
    return json(503, {
      ok: false,
      errorCode: "PROVIDER_KEY_NOT_CONFIGURED",
      error:
        "AVT cannot reach Control Center. CONTROL_CENTER_URL and AVT_PROXY_KEY must be configured as Edge Function secrets.",
    });
  }

  // ---- auth -----------------------------------------------------------------
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { ok: false, error: "missing_jwt" });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json(401, { ok: false, error: "invalid_jwt", detail: userErr?.message });
  }
  const userId = userData.user.id;

  // ---- input ----------------------------------------------------------------
  let body: { jobId?: string; all?: boolean; limit?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  // ---- fetch candidate rows -------------------------------------------------
  type Row = IngestRow;
  let rows: Row[] = [];

  if (body.jobId) {
    const { data, error } = await (admin as any)
      .from("provider_jobs")
      .select(
        "id, user_id, project_id, prompt_id, provider, external_job_id, request_payload_json, result_asset_id, status",
      )
      .eq("id", body.jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return json(500, { ok: false, error: "lookup_failed", detail: error.message });
    if (!data) return json(404, { ok: false, error: "job_not_found" });
    if (data.status !== "succeeded") {
      return json(409, {
        ok: false,
        error: "job_not_succeeded",
        status: data.status,
      });
    }
    rows = [data as Row];
  } else if (body.all) {
    const limit = Math.max(
      1,
      Math.min(BACKFILL_MAX_LIMIT, body.limit ?? BACKFILL_DEFAULT_LIMIT),
    );
    const { data, error } = await (admin as any)
      .from("provider_jobs")
      .select(
        "id, user_id, project_id, prompt_id, provider, external_job_id, request_payload_json, result_asset_id",
      )
      .eq("user_id", userId)
      .eq("status", "succeeded")
      .is("result_asset_id", null)
      .not("external_job_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return json(500, { ok: false, error: "lookup_failed", detail: error.message });
    rows = (data ?? []) as Row[];
  } else {
    return json(400, { ok: false, error: "missing_input", detail: "expected jobId or all=true" });
  }

  // ---- ingest sequentially --------------------------------------------------
  const ingested: Array<{ jobId: string; assetId: string; sizeBytes: number }> = [];
  const errors: Array<{ jobId: string; error: string }> = [];
  for (const row of rows) {
    try {
      const out = await ingestOne(row, ccUrl, ccKey, admin);
      ingested.push(out);
    } catch (err) {
      errors.push({ jobId: row.id, error: String(err) });
    }
  }

  return json(200, {
    ok: true,
    examined: rows.length,
    ingested,
    errors,
  });
});
