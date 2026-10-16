// AVT edge — switchx-background-proxy
//
// The OTHER way of putting him in a place, for the benchmark against the composite lane: Beeble SwitchX "background"
// mode regenerates the background and relights him in one generative pass with its own matte; his face, clothes and
// motion are preserved by the model. Control Center's `switchx-restyle` is the Beeble orchestrator (CC holds
// BEEBLE_API_KEY; AVT never does); this function signs the caller's own take and reference picture for it and keeps
// the record. Two actions:
//
//   { action: "submit", assetId, referenceAssetId?, prompt? }
//       -> { ok, jobId, beeble_job_id, estimate, source, reference, prompt }
//          A `provider_jobs` row (provider "other" — the enum has no beeble — vendor "beeble", lane "switchx_background", no batchRun so provider-jobs-tick
//          leaves it alone) is written BEFORE the call, as the record of the spend. CC queues the job and answers
//          Beeble's id at once.
//   { action: "status", jobId }
//       -> { ok, state: "running" | "succeeded" | "failed", render_url, frames, resolution, estimate, error }
//          Asks CC's `beeble-poll-debug` for Beeble's status and writes it onto the row (succeeded with the render
//          link, or failed with the reason). The render is Beeble's file: whoever judges it downloads it from there.
//
// What is spent: Beeble's list price per 30 frames of the source at 720p (contract.ts). Before anything is sent: the
// caller must be signed in (not anonymous), the take and the reference picture must be theirs (read as the caller
// under RLS, signed only through signForCaller), the stored object under SWITCHX_BG_MAX_BYTES (read off storage, not
// the row), the length under SWITCHX_BG_MAX_SECONDS, and no SwitchX pass of the same asset may be in flight.
//
// Env: COMPOSE_LOOK_CC_URL, SWITCHX_PROXY_SECRET (or COMPOSE_LOOK_PROXY_SECRET), SUPABASE_URL, SUPABASE_ANON_KEY,
//      SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signForCaller } from "../_shared/storageAccess.ts";
import {
  beebleEstimateUsd,
  normalizePrompt,
  readBeebleStatus,
  SWITCHX_BG_LANE,
  SWITCHX_BG_MAX_BYTES,
  SWITCHX_BG_MODE,
  SWITCHX_BG_PROVIDER,
  SWITCHX_BG_VENDOR,
  SWITCHX_BG_RESOLUTION,
  switchxBackgroundRequest,
  switchxFrames,
  switchxSourceCheck,
} from "./contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Long enough for Beeble to fetch the files (it reads them at the start of the job). */
const SIGN_TTL = 3600;
/** A SwitchX pass of the same asset started within this window is still running: a second one is not sent. */
const IN_FLIGHT_MINUTES = 30;
const VIDEO_RE = /\.(mp4|mov|m4v)$/i;
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { action?: string; assetId?: string; referenceAssetId?: string; prompt?: string; jobId?: string };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ccUrl(composeLookCcUrl: string, fn: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, `/${fn}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const composeCcUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret =
    Deno.env.get("SWITCHX_PROXY_SECRET")?.trim() ||
    Deno.env.get("COMPOSE_LOOK_PROXY_SECRET")?.trim() ||
    "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!composeCcUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey)
    return json(500, { error: "server_misconfigured" });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "missing_bearer" });
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;
  if ((userData.user as { is_anonymous?: boolean }).is_anonymous === true)
    return json(403, { error: "sign_in_required", detail: "Sign in to send a take to SwitchX." });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const action = typeof body.action === "string" ? body.action : "submit";

  // ---- status: Beeble's word on a job of the caller's, written onto the row -------------------------------------
  if (action === "status") {
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!UUID_RE.test(jobId)) return json(400, { error: "missing_job_id" });
    const { data: job } = await admin
      .from("provider_jobs")
      .select("id, user_id, status, external_job_id, request_payload_json, response_payload_json")
      .eq("id", jobId)
      .maybeSingle();
    if (!job || job.user_id !== userId) return json(404, { error: "job_not_found" });
    const payload = (job.request_payload_json ?? {}) as Record<string, unknown>;
    if (payload.lane !== SWITCHX_BG_LANE) return json(400, { error: "not_a_switchx_job" });
    if (!job.external_job_id) return json(409, { error: "job_has_no_provider_id" });
    // The row is the caller's to edit (update_own): the id asked about must be the one CC answered at submit time,
    // kept in the response record this function wrote — not whatever the row carries now.
    const answered = ((job.response_payload_json ?? {}) as Record<string, unknown>).beeble_job_id;
    if (typeof answered !== "string" || answered !== job.external_job_id) return json(409, { error: "job_id_mismatch" });
    const estimate = payload.estimate ?? null;
    if (job.status === "succeeded" || job.status === "failed") {
      const prior = (job.response_payload_json ?? {}) as Record<string, unknown>;
      return json(200, {
        ok: true,
        state: job.status,
        render_url: prior.render_url ?? null,
        frames: prior.frames ?? null,
        resolution: prior.resolution ?? null,
        estimate,
        error: prior.error ?? null,
      });
    }
    let resp: Response;
    try {
      resp = await fetch(`${ccUrl(composeCcUrl, "beeble-poll-debug")}?job_id=${encodeURIComponent(job.external_job_id)}`, {
        headers: { "X-Proxy-Secret": proxySecret },
      });
    } catch {
      return json(502, { error: "cc_unreachable" });
    }
    const text = await resp.text();
    let cc: unknown = {};
    try {
      cc = JSON.parse(text);
    } catch {
      /* keep empty */
    }
    if (!resp.ok) {
      const detail = typeof (cc as { error?: unknown }).error === "string" ? (cc as { error: string }).error : `cc_${resp.status}`;
      return json(502, { error: "status_failed", detail });
    }
    const read = readBeebleStatus(cc);
    if (read.state === "running") return json(200, { ok: true, state: "running", status: read.status, estimate });
    const frames = read.frames ?? (typeof (payload.source as { frames?: unknown })?.frames === "number" ? ((payload.source as { frames: number }).frames) : null);
    const resolution = (read.resolution === "1080p" ? "1080p" : SWITCHX_BG_RESOLUTION) as "720p" | "1080p";
    const finalEstimate = frames != null ? beebleEstimateUsd(frames, resolution) : estimate;
    const { error: writeErr } = await admin
      .from("provider_jobs")
      .update({
        status: read.state,
        error_text: read.error,
        finalized_at: new Date().toISOString(),
        response_payload_json: {
          status: read.status,
          beeble_job_id: job.external_job_id,
          render_url: read.renderUrl,
          frames,
          resolution,
          estimate: finalEstimate,
          error: read.error,
        },
      })
      .eq("id", job.id);
    if (writeErr) return json(500, { error: "job_record_failed" });
    return json(200, { ok: true, state: read.state, render_url: read.renderUrl, frames, resolution, estimate: finalEstimate, error: read.error });
  }

  if (action !== "submit") return json(400, { error: "unknown_action" });

  // ---- submit -------------------------------------------------------------------------------------------------
  const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
  if (!UUID_RE.test(assetId)) return json(400, { error: "missing_asset_id" });
  const referenceAssetId = typeof body.referenceAssetId === "string" ? body.referenceAssetId.trim() : "";
  if (referenceAssetId && !UUID_RE.test(referenceAssetId)) return json(400, { error: "bad_reference_asset_id" });

  // The assets are read as the caller (RLS): a row that is not theirs is simply not found.
  const { data: asset, error: assetErr } = await userClient
    .from("project_assets")
    .select("id, user_id, project_id, file_url, asset_type, metadata_json")
    .eq("id", assetId)
    .maybeSingle();
  if (assetErr) return json(500, { error: "asset_lookup_failed" });
  if (!asset || asset.user_id !== userId) return json(404, { error: "asset_not_found" });
  const meta = (asset.metadata_json ?? {}) as Record<string, unknown>;
  const mime = typeof meta.mime_type === "string" ? meta.mime_type : "";
  const isVideo = mime.startsWith("video/") || VIDEO_RE.test(String(asset.file_url));
  const seconds = Number(meta.duration_seconds);
  const check = switchxSourceCheck({ seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null, isVideo });
  if (!check.ok) return json(400, { error: "source_refused", detail: check.why });
  const bucket = typeof meta.bucket === "string" && meta.bucket ? meta.bucket : "project-clips";

  let reference: { id: string; bucket: string; path: string; sceneTitle: string | null } | null = null;
  if (referenceAssetId) {
    const { data: ref } = await userClient
      .from("project_assets")
      .select("id, user_id, project_id, file_url, metadata_json")
      .eq("id", referenceAssetId)
      .maybeSingle();
    if (!ref || ref.user_id !== userId || ref.project_id !== asset.project_id) return json(404, { error: "reference_not_found" });
    const rmeta = (ref.metadata_json ?? {}) as Record<string, unknown>;
    const rmime = typeof rmeta.mime_type === "string" ? rmeta.mime_type : "";
    if (!(rmime.startsWith("image/") || IMAGE_RE.test(String(ref.file_url)))) return json(400, { error: "reference_not_an_image" });
    reference = {
      id: ref.id,
      bucket: typeof rmeta.bucket === "string" && rmeta.bucket ? rmeta.bucket : "project-references",
      path: String(ref.file_url),
      sceneTitle: typeof rmeta.scene_title === "string" ? rmeta.scene_title : null,
    };
  }

  // The length on the row is the caller's to edit; the object's size is not.
  const path = String(asset.file_url);
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listed, error: listErr } = await admin.storage.from(bucket).list(dir, { search: name });
  const object = Array.isArray(listed)
    ? (listed as { name: string; metadata?: Record<string, unknown> }[]).find((o) => o.name === name)
    : null;
  if (listErr || !object) return json(404, { error: "source_object_not_found" });
  const bytes = Number(object.metadata?.size ?? object.metadata?.contentLength ?? NaN);
  if (!Number.isFinite(bytes)) return json(500, { error: "source_size_unknown" });
  if (bytes > SWITCHX_BG_MAX_BYTES) return json(413, { error: "source_too_large", bytes, max: SWITCHX_BG_MAX_BYTES });

  // One pass of an asset at a time: a second press while the first runs would spend twice for one answer.
  const since = new Date(Date.now() - IN_FLIGHT_MINUTES * 60_000).toISOString();
  const { data: inFlight } = await admin
    .from("provider_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", SWITCHX_BG_PROVIDER)
    .eq("status", "running")
    .eq("request_payload_json->>lane", SWITCHX_BG_LANE)
    .eq("request_payload_json->>assetId", assetId)
    .gt("created_at", since)
    .limit(1);
  if (inFlight && inFlight.length) return json(409, { error: "switchx_in_flight", jobId: inFlight[0].id });

  // The service role bypasses bucket RLS: only the caller's own folder (or a legacy grant) may be signed here.
  const signed = await signForCaller(admin, userId, bucket, path, SIGN_TTL);
  if (!signed.ok) return json(signed.status, { error: signed.error === "storage_object_not_found" ? "source_sign_failed" : signed.error });
  let referenceUrl: string | null = null;
  if (reference) {
    const rs = await signForCaller(admin, userId, reference.bucket, reference.path, SIGN_TTL);
    if (!rs.ok) return json(rs.status, { error: rs.error === "storage_object_not_found" ? "reference_sign_failed" : rs.error });
    referenceUrl = rs.url;
  }

  const frames = switchxFrames(seconds, typeof meta.fps === "number" ? meta.fps : null);
  const estimate = beebleEstimateUsd(frames, SWITCHX_BG_RESOLUTION);
  const prompt = normalizePrompt(body.prompt, reference?.sceneTitle ?? null);
  const request = switchxBackgroundRequest({ sourceVideoUrl: signed.url, referenceImageUrl: referenceUrl, prompt });

  // The record of the spend, written before the call. No batchRun: provider-jobs-tick never claims it.
  const { data: job, error: jobErr } = await admin
    .from("provider_jobs")
    .insert({
      user_id: userId,
      project_id: asset.project_id,
      provider: SWITCHX_BG_PROVIDER,
      status: "running",
      request_payload_json: {
        lane: SWITCHX_BG_LANE,
        vendor: SWITCHX_BG_VENDOR,
        assetId,
        referenceAssetId: reference?.id ?? null,
        mode: SWITCHX_BG_MODE,
        resolution: SWITCHX_BG_RESOLUTION,
        prompt,
        request: { ...request, sourceVideoUrl: `<signed ${bucket}/${path}, ${SIGN_TTL}s>`, referenceImageUrl: reference ? `<signed ${reference.bucket}/${reference.path}, ${SIGN_TTL}s>` : null },
        source: { bucket, path, bytes, seconds, frames },
        estimate,
        settings: { route: SWITCHX_BG_LANE },
      },
    })
    .select("id")
    .single();
  if (jobErr || !job) return json(500, { error: "job_record_failed" });

  let resp: Response;
  try {
    resp = await fetch(ccUrl(composeCcUrl, "switchx-restyle"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
      body: JSON.stringify(request),
    });
  } catch {
    await admin.from("provider_jobs").update({ status: "failed", error_text: "cc_unreachable" }).eq("id", job.id);
    return json(502, { error: "cc_unreachable" });
  }
  const text = await resp.text();
  let cc: Record<string, unknown> = {};
  try {
    cc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* keep empty */
  }
  const beebleJobId = typeof cc.beeble_job_id === "string" ? cc.beeble_job_id : null;
  if (!resp.ok || !beebleJobId) {
    const detail = typeof cc.error === "string" ? `${cc.error}${typeof cc.detail === "string" ? `: ${cc.detail}` : ""}` : `cc_${resp.status}`;
    console.error(`[switchx-background-proxy] submit_failed http=${resp.status} asset=${assetId} error=${detail.slice(0, 300)}`);
    await admin.from("provider_jobs").update({ status: "failed", error_text: detail.slice(0, 500) }).eq("id", job.id);
    return json(502, { error: "switchx_submit_failed", detail: detail.slice(0, 500) });
  }
  await admin
    .from("provider_jobs")
    .update({
      external_job_id: beebleJobId,
      response_payload_json: { status: "queued", beeble_job_id: beebleJobId, generation_metadata: cc.generation_metadata ?? null },
    })
    .eq("id", job.id);
  console.log(`[switchx-background-proxy] submitted asset=${assetId} frames=${frames} bytes=${bytes} job=${job.id} beeble=${beebleJobId}`);
  return json(200, {
    ok: true,
    jobId: job.id,
    beeble_job_id: beebleJobId,
    mode: SWITCHX_BG_MODE,
    resolution: SWITCHX_BG_RESOLUTION,
    estimate,
    prompt,
    source: { assetId, seconds, frames, bytes, bucket, path },
    reference: reference ? { assetId: reference.id, bucket: reference.bucket, path: reference.path } : null,
  });
});
