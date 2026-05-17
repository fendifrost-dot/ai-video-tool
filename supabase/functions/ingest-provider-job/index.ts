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
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

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

type IngestRow = {
  id: string;
  user_id: string;
  project_id: string;
  prompt_id: string | null;
  provider: string;
  external_job_id: string | null;
  request_payload_json: Record<string, unknown> | null;
  result_asset_id: string | null;
};

async function ingestOne(
  row: IngestRow,
  ccUrl: string,
  ccKey: string,
  admin: ReturnType<typeof createClient>,
): Promise<{ jobId: string; assetId: string; sizeBytes: number }> {
  // 1. Already ingested? Bail idempotently.
  if (row.result_asset_id) {
    return { jobId: row.id, assetId: row.result_asset_id, sizeBytes: 0 };
  }
  if (!row.external_job_id) {
    throw new Error("no external_job_id on row — nothing to fetch upstream");
  }

  // 2. Resolve the upstream resultUrl via CC. We prefer this over the
  //    legacy inline=1 path because Supabase Edge functions cap responses
  //    near 6 MB — clips >~4 MB raw exceed that once base64-encoded,
  //    causing the upstream "CC job-result returned 546: unknown" failure
  //    that Higgsfield (~11 MB) and Veo (~6-10 MB) routinely trip. By
  //    asking CC only for the URL and then streaming bytes from the CDN
  //    directly to this function, we sidestep the response-size ceiling.
  const modelVariant =
    (row.request_payload_json?.modelVariant as string | undefined) ?? "";
  const shotId = (row.request_payload_json?.shotId as string | undefined) ?? null;

  const urlParams = new URLSearchParams({
    provider: row.provider,
    id: row.external_job_id,
  });
  if ((row.provider === "fal" || row.provider === "pika") && modelVariant) {
    urlParams.set("modelPath", modelVariant);
  }

  // 3. Fetch resultUrl (small JSON envelope, never hits the size ceiling).
  const ctrlMeta = new AbortController();
  const metaTimer = setTimeout(() => ctrlMeta.abort(), 30_000);
  let resultUrl: string;
  try {
    const metaResp = await fetch(
      `${ccUrl.replace(/\/$/, "")}/functions/v1/video-providers-job-result?${urlParams.toString()}`,
      { method: "GET", headers: { "x-api-key": ccKey }, signal: ctrlMeta.signal },
    );
    const metaText = await metaResp.text();
    let metaBody: { ok?: boolean; resultUrl?: string; errorMessage?: string };
    try { metaBody = metaText ? JSON.parse(metaText) : {}; }
    catch { throw new Error(`CC job-result returned non-JSON: ${metaText.slice(0, 200)}`); }
    if (!metaResp.ok || metaBody.ok === false || !metaBody.resultUrl) {
      throw new Error(`CC job-result returned ${metaResp.status}: ${metaBody.errorMessage ?? "no_result_url"}`);
    }
    resultUrl = metaBody.resultUrl;
  } finally { clearTimeout(metaTimer); }

  // 4. Stream bytes. Most providers serve unauthenticated CDN URLs
  //    (Runway → CloudFront, Fal → fal.media, Higgsfield → higgsfield CDN,
  //    Grok → x.ai CDN, Pika → fal.media) and AVT can hit them directly.
  //    Veo's :download URL is the exception — it needs the Gemini API key.
  //    For Veo we fall back to the legacy CC inline path; size is usually
  //    under the ceiling for 5s/720p clips. Larger Veo outputs will still
  //    need a follow-up (CC-side direct-to-storage upload).
  const veoNeedsAuth =
    row.provider === "veo" && resultUrl.includes("generativelanguage.googleapis.com");

  let bytes: Uint8Array;
  let contentType = "video/mp4";

  if (veoNeedsAuth) {
    // Legacy path: ask CC to base64 the bytes for us (key stays server-side
    // on CC). Will fail for clips that exceed Supabase's response limit.
    const inlineParams = new URLSearchParams(urlParams);
    inlineParams.set("inline", "1");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const ccResp = await fetch(
        `${ccUrl.replace(/\/$/, "")}/functions/v1/video-providers-job-result?${inlineParams.toString()}`,
        { method: "GET", headers: { "x-api-key": ccKey }, signal: ctrl.signal },
      );
      const ccText = await ccResp.text();
      let ccBody: { ok?: boolean; bytes_base64?: string; contentType?: string; sizeBytes?: number; errorMessage?: string };
      try { ccBody = ccText ? JSON.parse(ccText) : {}; }
      catch { throw new Error(`CC job-result returned non-JSON: ${ccText.slice(0, 200)}`); }
      if (!ccResp.ok || ccBody.ok === false || !ccBody.bytes_base64) {
        throw new Error(
          `CC job-result (inline) returned ${ccResp.status}: ${ccBody.errorMessage ?? "no_bytes"}` +
            ` — Veo clip likely exceeds Supabase 6MB response limit; ` +
            `needs CC-side direct-to-storage upload (tracked).`,
        );
      }
      bytes = decodeBase64(ccBody.bytes_base64);
      contentType = ccBody.contentType || contentType;
    } finally { clearTimeout(timer); }
  } else {
    const dlCtrl = new AbortController();
    const dlTimer = setTimeout(() => dlCtrl.abort(), 90_000);
    try {
      const dl = await fetch(resultUrl, { signal: dlCtrl.signal });
      if (!dl.ok) {
        throw new Error(`direct download from ${row.provider} CDN returned ${dl.status}`);
      }
      const buf = await dl.arrayBuffer();
      bytes = new Uint8Array(buf);
      contentType = dl.headers.get("content-type") ?? contentType;
    } finally { clearTimeout(dlTimer); }
  }

  // 4b. Upload to project-clips.
  const filename = `generated_${row.provider}_${row.external_job_id.slice(0, 12)}.mp4`;
  const path = `${row.user_id}/${row.project_id}/${row.id}/${filename}`;

  const { error: uploadErr } = await (admin as any).storage
    .from("project-clips")
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadErr) {
    throw new Error(`upload failed: ${uploadErr.message}`);
  }

  // 5. Insert project_assets row.
  const { data: assetRow, error: assetErr } = await (admin as any)
    .from("project_assets")
    .insert({
      user_id: row.user_id,
      project_id: row.project_id,
      shot_id: shotId,
      prompt_id: row.prompt_id,
      asset_type: "generated_clip",
      file_url: path,
      source_tool: row.provider,
      approval_status: "pending",
      metadata_json: {
        bucket: "project-clips",
        file_size_bytes: bytes.byteLength,
        mime_type: contentType,
        provider_job_id: row.id,
        external_job_id: row.external_job_id,
        ingested_by: "ingest-provider-job",
      },
    })
    .select("id")
    .single();
  if (assetErr || !assetRow) {
    throw new Error(
      `project_assets insert failed: ${assetErr?.message ?? "no row returned"}`,
    );
  }

  // 6. Link the job to its asset.
  await (admin as any)
    .from("provider_jobs")
    .update({ result_asset_id: assetRow.id })
    .eq("id", row.id);

  return {
    jobId: row.id,
    assetId: assetRow.id as string,
    sizeBytes: bytes.byteLength,
  };
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
