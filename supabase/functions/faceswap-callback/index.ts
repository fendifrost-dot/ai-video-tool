// AVT edge function — faceswap-callback
//
// Webhook counterpart to faceswap-proxy. CC (which subscribed to Fal's
// webhook for the submitted face-swap job) POSTs here when the job finishes.
// This function:
//
//   1. Authenticates via the shared COMPOSE_LOOK_PROXY_SECRET header
//      (reused — no new env var) using a constant-time compare.
//   2. Looks up the pending provider_jobs row by `job_id` (query param).
//   3. On failure: marks the row failed with error_text.
//   4. On success: downloads the rendered image from Fal, uploads it to the
//      project-clips bucket (service-role), inserts a project_assets row
//      (asset_type='generated_still', source_tool='fal', approval_status
//      ='pending', parent_asset_id = scene asset), and updates the
//      provider_jobs row to status='succeeded' with result_asset_id.
//
// Idempotent: a retried callback for an already-succeeded row returns 200
// without re-uploading or re-inserting.
//
// Env vars (AVT):
//   - COMPOSE_LOOK_PROXY_SECRET    (shared with CC)
//   - SUPABASE_URL                 (provided by Lovable)
//   - SUPABASE_SERVICE_ROLE_KEY    (provided by Lovable)
//
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Body = {
  status?: "succeeded" | "completed" | "failed";
  fal_image_url?: string;
  content_type?: string;
  width?: number;
  height?: number;
  model?: string;
  provider_job_id?: string;
  cost_cents?: number;
  error?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-proxy-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const proxySecret = Deno.env.get("COMPOSE_LOOK_PROXY_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!proxySecret || !supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }

  const headerSecret = req.headers.get("x-proxy-secret") ?? "";
  if (!headerSecret) return json(401, { error: "missing_proxy_secret" });
  if (!constantTimeEqual(headerSecret, proxySecret)) {
    return json(401, { error: "bad_proxy_secret" });
  }

  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id") ?? "";
  if (!jobId) return json(400, { error: "missing_job_id" });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ---- look up the job row -------------------------------------------
  const { data: jobRow, error: lookupErr } = await admin
    .from("provider_jobs")
    .select("id, user_id, project_id, status, request_payload_json, result_asset_id")
    .eq("id", jobId)
    .maybeSingle();
  if (lookupErr) return json(500, { error: "lookup_failed", detail: lookupErr.message });
  if (!jobRow) return json(404, { error: "job_not_found" });

  // Idempotent ack — a redelivered webhook for an already-finished row.
  if (jobRow.status === "succeeded" || jobRow.status === "failed") {
    return json(200, { ok: true, already: jobRow.status });
  }

  const req_payload = (jobRow.request_payload_json ?? {}) as Record<string, any>;
  const userId = jobRow.user_id as string;
  const projectId = jobRow.project_id as string;

  // ---- failure path --------------------------------------------------
  if (body.status === "failed" || body.error) {
    const errMsg = String(body.error ?? "cc_reported_failure").slice(0, 500);
    await admin
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: errMsg,
        response_payload_json: body as any,
        external_job_id: body.provider_job_id ?? null,
      })
      .eq("id", jobId);
    return json(200, { ok: true, marked: "failed" });
  }

  const falImageUrl = body.fal_image_url;
  if (!falImageUrl) {
    await admin
      .from("provider_jobs")
      .update({ status: "failed", error_text: "callback_missing_fal_url" })
      .eq("id", jobId);
    return json(400, { error: "missing_fal_url" });
  }

  // ---- download bytes from Fal ---------------------------------------
  let bytes: Uint8Array;
  let mime: "image/png" | "image/jpeg" | "image/webp";
  try {
    const dl = await fetch(falImageUrl, {
      headers: { Accept: "image/png, image/jpeg, image/webp" },
    });
    if (!dl.ok) throw new Error(`download_${dl.status}`);
    const buf = new Uint8Array(await dl.arrayBuffer());
    const sniffed = sniffMime(buf) ??
      (body.content_type?.includes("png") ? "image/png" :
       body.content_type?.includes("webp") ? "image/webp" : "image/jpeg");
    bytes = buf;
    mime = sniffed;
  } catch (err) {
    await admin
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: `fal_download_failed: ${String(err).slice(0, 300)}`,
      })
      .eq("id", jobId);
    return json(502, { error: "fal_download_failed" });
  }

  // ---- upload to project-clips (service-role) ------------------------
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const filename = `faceswap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const outPath = `${userId}/${projectId}/faceswap/${filename}`;
  const { error: uploadErr } = await admin.storage
    .from("project-clips")
    .upload(outPath, bytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    await admin
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: `upload_failed: ${uploadErr.message.slice(0, 300)}`,
      })
      .eq("id", jobId);
    return json(500, { error: "upload_failed", detail: uploadErr.message });
  }

  // ---- insert project_assets row -------------------------------------
  const { data: assetRow, error: insErr } = await admin
    .from("project_assets")
    .insert({
      user_id: userId,
      project_id: projectId,
      shot_id: req_payload.shotId ?? null,
      asset_type: "generated_still",
      file_url: outPath,
      source_tool: "fal",
      approval_status: "pending",
      parent_asset_id: req_payload.sceneAssetId ?? null,
      metadata_json: {
        capability: "identity_apply",
        bucket: "project-clips",
        model: body.model ?? "easel-ai/advanced-face-swap",
        provider_job_id: body.provider_job_id ?? null,
        cost_cents: body.cost_cents ?? null,
        face_feature_id: req_payload.faceFeatureId ?? null,
        source_scene_path: req_payload.scenePath ?? null,
        source_scene_bucket: req_payload.sceneBucket ?? null,
        width: body.width ?? null,
        height: body.height ?? null,
        content_type: body.content_type ?? mime,
      },
    })
    .select("*")
    .single();
  if (insErr || !assetRow) {
    await admin
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: `asset_insert_failed: ${insErr?.message?.slice(0, 300) ?? "unknown"}`,
      })
      .eq("id", jobId);
    return json(500, { error: "asset_insert_failed", detail: insErr?.message });
  }

  // ---- finalize provider_jobs row ------------------------------------
  const { error: jobUpdErr } = await admin
    .from("provider_jobs")
    .update({
      status: "succeeded",
      result_asset_id: assetRow.id,
      external_job_id: body.provider_job_id ?? null,
      response_payload_json: body as any,
      error_text: null,
    })
    .eq("id", jobId);
  if (jobUpdErr) {
    return json(500, { error: "job_update_failed", detail: jobUpdErr.message });
  }

  return json(200, { ok: true, assetId: assetRow.id });
});

// ---------------------------------------------------------------------------
// Helpers (inlined — Supabase edge functions deploy independently).
// ---------------------------------------------------------------------------
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sniffMime(
  buf: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
