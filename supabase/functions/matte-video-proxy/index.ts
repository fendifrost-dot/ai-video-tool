// AVT edge — matte-video-proxy
//
// Step 6 of the workflow, first half: cut the performer out of a dressed take. The browser names one of the caller's
// own video assets; this function signs it for an hour, hands it to Fal's video background-removal model through
// Control Center (`switchx-restyle` action `fal-run` — AVT holds no Fal key, CC does) and returns the queue handle.
// The browser polls `fal-queue-poll-proxy` for the result, downloads the alpha video itself (Fal's CDN allows it),
// and makes the composite over the plate in the page.
//
// What is spent: the model's list price per 30 frames of the source (_shared/matteRequest.ts), billed to CC's Fal
// account. Before anything is sent: the caller must be signed in (not anonymous), the asset must be theirs, the
// stored object must be under MATTE_MAX_BYTES (read off storage, not off the row the caller can edit), the row's
// length under MATTE_MAX_SECONDS, and no matte of the same asset may be in flight. A `provider_jobs` row is written
// first (provider "fal", lane "matte", no batchRun so provider-jobs-tick leaves it alone) as the record of the
// spend; the browser finishes it with the composite it files, or with the failure.
//
// Env: COMPOSE_LOOK_CC_URL, SWITCHX_PROXY_SECRET (or COMPOSE_LOOK_PROXY_SECRET), SUPABASE_URL, SUPABASE_ANON_KEY,
//      SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signForCaller } from "../_shared/storageAccess.ts";
import {
  buildMatteInput,
  MATTE_MAX_BYTES,
  MATTE_MODEL,
  matteEstimateUsd,
  matteFrames,
  parseFps,
  matteSourceCheck,
} from "../_shared/matteRequest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Long enough for the queue to pick the file up; the browser's own download is of the model's output, not this link. */
const SIGN_TTL = 3600;
/** A matte of the same asset started within this window is still running: a second one is not sent. */
const IN_FLIGHT_MINUTES = 20;
const VIDEO_RE = /\.(mp4|mov|m4v)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { assetId?: string };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ccSwitchxUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/switchx-restyle");
}

/** The request's id, from the status link Fal gave (the last path part before /status). */
function requestIdOf(statusUrl: string): string | null {
  const m = /\/requests\/([^/]+)\/status\/?$/.exec(statusUrl);
  return m ? m[1] : null;
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
  if (!authHeader.toLowerCase().startsWith("bearer "))
    return json(401, { error: "missing_bearer" });
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;
  // Paid work and the signing of private files are for a signed-in person, never an anonymous session (the same
  // refusal world-still-proxy and lyric-align-proxy make, for the reason RISK-001 gives).
  if ((userData.user as { is_anonymous?: boolean }).is_anonymous === true)
    return json(403, { error: "sign_in_required", detail: "Sign in to matte a take." });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
  if (!UUID_RE.test(assetId)) return json(400, { error: "missing_asset_id" });

  // The asset is read as the caller (RLS): a row that is not theirs is simply not found.
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
  const check = matteSourceCheck({
    seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
    isVideo,
  });
  if (!check.ok) return json(400, { error: "source_refused", detail: check.why });
  const bucket = typeof meta.bucket === "string" && meta.bucket ? meta.bucket : "project-clips";

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // The length on the row is the caller's to edit; the object's size is not. A source over the byte cap is refused
  // whatever the row says, so the row cannot talk the lane into matting a whole master.
  const path = String(asset.file_url);
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listed, error: listErr } = await admin.storage
    .from(bucket)
    .list(dir, { search: name });
  const object = Array.isArray(listed)
    ? (listed as { name: string; metadata?: Record<string, unknown> }[]).find(
        (o) => o.name === name,
      )
    : null;
  if (listErr || !object) return json(404, { error: "source_object_not_found" });
  const bytes = Number(object.metadata?.size ?? object.metadata?.contentLength ?? NaN);
  if (!Number.isFinite(bytes)) return json(500, { error: "source_size_unknown" });
  if (bytes > MATTE_MAX_BYTES)
    return json(413, { error: "source_too_large", bytes, max: MATTE_MAX_BYTES });

  // One matte of an asset at a time: a second press while the first runs would spend twice for one answer.
  const since = new Date(Date.now() - IN_FLIGHT_MINUTES * 60_000).toISOString();
  const { data: inFlight } = await admin
    .from("provider_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "fal")
    .eq("status", "running")
    .eq("request_payload_json->>lane", "matte")
    .eq("request_payload_json->>assetId", assetId)
    .gt("created_at", since)
    .limit(1);
  if (inFlight && inFlight.length)
    return json(409, { error: "matte_in_flight", jobId: inFlight[0].id });

  // The service role bypasses bucket RLS: only the caller's own folder (or a legacy grant) may be signed here.
  const signed = await signForCaller(admin, userId, bucket, path, SIGN_TTL);
  if (!signed.ok)
    return json(signed.status, {
      error: signed.error === "storage_object_not_found" ? "source_sign_failed" : signed.error,
    });

  const frames = matteFrames(seconds, parseFps(meta.fps)); // a row may carry ffprobe's "60000/1001"
  const estimate = matteEstimateUsd(frames);
  const input = buildMatteInput(signed.url);

  // The record of the spend, written before the call (durability: a submit that lands and a function that dies
  // still leaves a row). No batchRun: provider-jobs-tick never claims it; the browser finishes it.
  const { data: job, error: jobErr } = await admin
    .from("provider_jobs")
    .insert({
      user_id: userId,
      project_id: asset.project_id,
      provider: "fal",
      status: "running",
      request_payload_json: {
        lane: "matte",
        assetId,
        model: MATTE_MODEL,
        input: { ...input, video_url: `<signed ${bucket}/${path}, ${SIGN_TTL}s>` },
        source: { bucket, path, bytes, seconds, frames },
        estimate,
        settings: { route: "matte" },
      },
    })
    .select("id")
    .single();
  if (jobErr || !job) return json(500, { error: "job_record_failed" });

  let resp: Response;
  try {
    resp = await fetch(ccSwitchxUrl(composeCcUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
      body: JSON.stringify({ action: "fal-run", model: MATTE_MODEL, input }),
    });
  } catch {
    await admin
      .from("provider_jobs")
      .update({ status: "failed", error_text: "cc_unreachable" })
      .eq("id", job.id);
    return json(502, { error: "cc_unreachable" });
  }
  const text = await resp.text();
  let cc: Record<string, unknown> = {};
  try {
    cc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* keep empty */
  }
  if (!resp.ok || typeof cc.status_url !== "string" || typeof cc.response_url !== "string") {
    const detail = typeof cc.error === "string" ? cc.error : `cc_${resp.status}`;
    console.error(
      `[matte-video-proxy] submit_failed http=${resp.status} asset=${assetId} error=${detail}`,
    );
    await admin
      .from("provider_jobs")
      .update({ status: "failed", error_text: detail.slice(0, 500) })
      .eq("id", job.id);
    return json(502, { error: "matte_submit_failed", detail, model: MATTE_MODEL });
  }
  const requestId = requestIdOf(cc.status_url);
  await admin
    .from("provider_jobs")
    .update({
      external_job_id: requestId,
      response_payload_json: {
        status: "queued",
        status_url: cc.status_url,
        response_url: cc.response_url,
        model: MATTE_MODEL,
      },
    })
    .eq("id", job.id);
  console.log(
    `[matte-video-proxy] submitted asset=${assetId} frames=${frames} bytes=${bytes} job=${job.id} request=${requestId ?? "?"}`,
  );
  return json(200, {
    ok: true,
    jobId: job.id,
    model: MATTE_MODEL,
    status_url: cc.status_url,
    response_url: cc.response_url,
    source: { assetId, seconds, frames, bytes, bucket, path },
    estimate,
  });
});
