// AVT edge — switchx-background-proxy
//
// The OTHER way of putting him in a place, for the benchmark against the composite lane: Beeble SwitchX "background"
// mode regenerates the background and relights him in one generative pass with its own matte. The vendor says the
// subject is kept; our runs found it relights his face and changed wardrobe colours (16 Oct, 13 Nov 2026). Control Center's `switchx-restyle` is the Beeble orchestrator (CC holds
// BEEBLE_API_KEY; AVT never does); this function signs the caller's own take and reference picture for it and keeps
// the record. Two actions:
//
//   { action: "submit", assetId, referenceAssetId?, prompt? }
//       -> { ok, jobId, beeble_job_id, estimate, source, reference, prompt }
//          A `provider_jobs` row (provider "other" — the enum has no beeble — vendor "beeble", lane "switchx_background", no batchRun so provider-jobs-tick
//          leaves it alone) is written BEFORE the call, as the record of the spend. CC queues the job and answers
//          Beeble's id at once.
//   { action: "submit", assetId, alphaAssetId, prompt, referenceAssetId? }          (the keep-mask pass, 26 Nov 2026)
//       -> the same answer, lane "switchx_keep_mask", CC mode "custom" (Beeble alpha_mode "custom").
//          `alphaAssetId` is the caller's own matte VIDEO of the same frames as the take: WHITE is kept from the take
//          (and relit by the model), BLACK is generated from the words and the reference picture. A CANDIDATE UNDER
//          BENCHMARK for a clothing change (the garment black); the approved route on his real takes stays Genjutsu
//          `dress-clip` + the put-back. It is an intermediate: the kept region is relit, so the face-preserving
//          put-back still runs after it. The words are required (no default). Both records must carry a measured
//          frame count (metadata_json.frame_count) and the counts must be equal.
//   { action: "submit", …, dryRun: true }
//       -> { ok, dryRun: true, lane, mode, estimate, prompt, source, reference, alpha } after every check, with nothing
//          signed, recorded or sent.
//   { action: "status", jobId }
//       -> { ok, state: "running" | "succeeded" | "failed", render_url, frames, resolution, estimate, error }
//          Asks CC's `beeble-poll-debug` for Beeble's status and writes it onto the row (succeeded with the render
//          link, or failed with the reason). The render is Beeble's file: whoever judges it downloads it from there.
//
// What is spent: Beeble's list price per 30 frames of the source at 720p (contract.ts). Before anything is sent: the
// caller must be signed in (not anonymous), the take, the matte and the reference picture must be theirs and of one
// project (read as the caller under RLS, signed only through signForCaller), each stored video under
// SWITCHX_BG_MAX_BYTES (read off storage, not the row), the length under SWITCHX_BG_MAX_SECONDS, the matte the same
// length as the take, and no SwitchX pass of the same asset in the same lane may be in flight.
//
// Env: COMPOSE_LOOK_CC_URL, SWITCHX_PROXY_SECRET (or COMPOSE_LOOK_PROXY_SECRET), SUPABASE_URL, SUPABASE_ANON_KEY,
//      SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callerMayRead, refusalResponse, signForCaller } from "../_shared/storageAccess.ts";
import {
  beebleEstimateUsd,
  isSwitchxLane,
  keepMaskPrompt,
  normalizePrompt,
  readBeebleStatus,
  SWITCHX_BG_LANE,
  SWITCHX_BG_MAX_BYTES,
  SWITCHX_BG_MODE,
  SWITCHX_BG_PROVIDER,
  SWITCHX_BG_VENDOR,
  SWITCHX_KEEP_LANE,
  SWITCHX_KEEP_MODE,
  NO_RENDER_LINK,
  SWITCHX_BG_RESOLUTION,
  switchxBackgroundRequest,
  ccRanKeepMask,
  type MeasuredVideo,
  readDryRun,
  recordedGenerationMetadata,
  SWITCHX_BG_MAX_FRAMES,
  switchxFramesOf,
  switchxKeepMaskCheck,
  withoutLinks,
  switchxKeepMaskRequest,
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

type Body = {
  action?: string;
  assetId?: string;
  referenceAssetId?: string;
  alphaAssetId?: unknown;
  prompt?: string;
  jobId?: string;
  dryRun?: unknown;
  dry_run?: unknown;
};

/**
 * What a record says it measured of a video. The measured columns of project_assets (frame_count, fps, width, height:
 * migration 20261113120000) are not applied to the live database (STORE-5), so these are read from `metadata_json`,
 * where whoever files the asset writes them from a probe of the file (live rows carry `frame_count` or `frames`, and
 * `fps` as a number or as ffprobe's "30/1"); selecting the columns would fail every call. They are the filer's own
 * words, not a server measurement (SWITCHX-1).
 */
function measuredVideo(meta: Record<string, unknown>): MeasuredVideo {
  const n = (v: unknown) => {
    if (typeof v === "string") {
      const m = /^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(v.trim());
      v = m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : NaN;
    }
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  };
  const frames = n(meta.frame_count) ?? n(meta.frames);
  return { frames: frames != null && Number.isInteger(frames) ? frames : null, fps: n(meta.fps), width: n(meta.width), height: n(meta.height) };
}

/**
 * The size of a stored object, read off storage (the row's own word on it is the caller's to edit). The bucket and
 * path come from a row the caller can write, and `admin` bypasses bucket RLS: the object must be one the caller may
 * read BEFORE it is listed, or a row pointed at someone else's file would answer whether it exists and how big it is.
 */
// deno-lint-ignore no-explicit-any
async function objectBytes(admin: any, userId: string, bucket: string, path: string): Promise<{ ok: true; bytes: number } | { ok: false; status: number; error: string }> {
  const may = await callerMayRead(admin, userId, bucket, path);
  if (!may.ok) return { ok: false, ...refusalResponse(may) };
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listed, error: listErr } = await admin.storage.from(bucket).list(dir, { search: name });
  const object = Array.isArray(listed)
    ? (listed as { name: string; metadata?: Record<string, unknown> }[]).find((o) => o.name === name)
    : null;
  if (listErr || !object) return { ok: false, status: 404, error: "object_not_found" };
  const bytes = Number(object.metadata?.size ?? object.metadata?.contentLength ?? NaN);
  if (!Number.isFinite(bytes)) return { ok: false, status: 500, error: "size_unknown" };
  return { ok: true, bytes };
}

/** The error an objectBytes refusal answers with: the ownership refusals by their own names, the rest named for the file. */
function sizeError(which: "source" | "alpha", refusal: { error: string }): string {
  return refusal.error === "object_not_found" || refusal.error === "size_unknown" ? `${which}_${refusal.error}` : refusal.error;
}

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
    if (!isSwitchxLane(payload.lane)) return json(400, { error: "not_a_switchx_job" });
    const pass = payload.lane === SWITCHX_KEEP_LANE ? "keep-mask" : "background";
    if (!job.external_job_id) return json(409, { error: "job_has_no_provider_id" });
    // The row is the caller's to edit (update_own): the id asked about must be the one CC answered at submit time,
    // kept in the response record this function wrote — not whatever the row carries now.
    const answered = ((job.response_payload_json ?? {}) as Record<string, unknown>).beeble_job_id;
    if (typeof answered !== "string" || answered !== job.external_job_id) return json(409, { error: "job_id_mismatch" });
    const estimate = payload.estimate ?? null;
    const prior0 = (job.response_payload_json ?? {}) as Record<string, unknown>;
    // a job this function itself failed for "no render link" is asked again: that was the reader's fault, not Beeble's
    const askAgain = job.status === "failed" && prior0.error === NO_RENDER_LINK;
    if ((job.status === "succeeded" || job.status === "failed") && !askAgain) {
      const prior = prior0;
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
      const detail = withoutLinks(typeof (cc as { error?: unknown }).error === "string" ? (cc as { error: string }).error : `cc_${resp.status}`);
      return json(502, { error: "status_failed", detail });
    }
    const read = readBeebleStatus(cc);
    if (read.error) read.error = withoutLinks(read.error);
    if (read.state === "running") return json(200, { ok: true, state: "running", status: read.status, estimate });
    const frames = read.frames ?? (typeof (payload.source as { frames?: unknown })?.frames === "number" ? ((payload.source as { frames: number }).frames) : null);
    const resolution = (read.resolution === "1080p" ? "1080p" : SWITCHX_BG_RESOLUTION) as "720p" | "1080p";
    const finalEstimate = frames != null ? beebleEstimateUsd(frames, resolution, pass) : estimate;
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
          alpha_url: read.alphaUrl,
          frames,
          resolution,
          estimate: finalEstimate,
          error: read.error,
        },
      })
      .eq("id", job.id);
    if (writeErr) return json(500, { error: "job_record_failed" });
    return json(200, { ok: true, state: read.state, render_url: read.renderUrl, alpha_url: read.alphaUrl, frames, resolution, estimate: finalEstimate, error: read.error });
  }

  if (action !== "submit") return json(400, { error: "unknown_action" });

  // ---- submit -------------------------------------------------------------------------------------------------
  const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
  if (!UUID_RE.test(assetId)) return json(400, { error: "missing_asset_id" });
  const referenceAssetId = typeof body.referenceAssetId === "string" ? body.referenceAssetId.trim() : "";
  if (referenceAssetId && !UUID_RE.test(referenceAssetId)) return json(400, { error: "bad_reference_asset_id" });
  // A matte makes it the keep-mask pass; none, the background pass as before.
  // A matte key that is present must be a record id: any other value would otherwise fall through to a paid
  // background pass the caller did not ask for.
  const alphaGiven = body.alphaAssetId !== undefined;
  const alphaAssetId = typeof body.alphaAssetId === "string" ? body.alphaAssetId.trim() : "";
  if (alphaGiven && !UUID_RE.test(alphaAssetId)) return json(400, { error: "bad_alpha_asset_id" });
  const keepMask = alphaGiven;
  const lane = keepMask ? SWITCHX_KEEP_LANE : SWITCHX_BG_LANE;
  const mode = keepMask ? SWITCHX_KEEP_MODE : SWITCHX_BG_MODE;
  const dry = readDryRun(body);
  if (!dry.ok) return json(400, { error: "bad_dry_run", detail: "dryRun must be true or false" });
  const dryRun = dry.dryRun;

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

  // The matte of a keep-mask pass: the caller's own video, of the take's project and the take's length.
  let alpha: { id: string; bucket: string; path: string; seconds: number; bytes: number } | null = null;
  if (keepMask) {
    const { data: a } = await userClient
      .from("project_assets")
      .select("id, user_id, project_id, file_url, metadata_json")
      .eq("id", alphaAssetId)
      .maybeSingle();
    if (!a || a.user_id !== userId || a.project_id !== asset.project_id) return json(404, { error: "alpha_not_found" });
    const ameta = (a.metadata_json ?? {}) as Record<string, unknown>;
    const amime = typeof ameta.mime_type === "string" ? ameta.mime_type : "";
    const aseconds = Number(ameta.duration_seconds);
    const acheck = switchxKeepMaskCheck({
      source: measuredVideo(meta),
      mask: measuredVideo(ameta),
      maskIsVideo: amime.startsWith("video/") || VIDEO_RE.test(String(a.file_url)),
      sameAsset: a.id === asset.id,
    });
    if (!acheck.ok) return json(400, { error: "alpha_refused", detail: acheck.why });
    const abucket = typeof ameta.bucket === "string" && ameta.bucket ? ameta.bucket : "project-clips";
    const asize = await objectBytes(admin, userId, abucket, String(a.file_url));
    if (!asize.ok) return json(asize.status, { error: sizeError("alpha", asize) });
    if (asize.bytes > SWITCHX_BG_MAX_BYTES) return json(413, { error: "alpha_too_large", bytes: asize.bytes, max: SWITCHX_BG_MAX_BYTES });
    alpha = { id: a.id, bucket: abucket, path: String(a.file_url), seconds: aseconds, bytes: asize.bytes };
  }

  // The words: the keep-mask pass has no default (what is generated is the whole instruction).
  let prompt: string;
  if (keepMask) {
    const words = keepMaskPrompt(body.prompt);
    if (!words.ok) return json(400, { error: "prompt_required", detail: words.why });
    prompt = words.prompt;
  } else {
    prompt = normalizePrompt(body.prompt, reference?.sceneTitle ?? null);
  }

  // The length on the row is the caller's to edit; the object's size is not.
  const path = String(asset.file_url);
  const size = await objectBytes(admin, userId, bucket, path);
  if (!size.ok) return json(size.status, { error: sizeError("source", size) });
  const bytes = size.bytes;
  if (bytes > SWITCHX_BG_MAX_BYTES) return json(413, { error: "source_too_large", bytes, max: SWITCHX_BG_MAX_BYTES });

  // One pass of an asset at a time: a second press while the first runs would spend twice for one answer.
  const since = new Date(Date.now() - IN_FLIGHT_MINUTES * 60_000).toISOString();
  const { data: inFlight } = await admin
    .from("provider_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", SWITCHX_BG_PROVIDER)
    .eq("status", "running")
    .eq("request_payload_json->>lane", lane)
    .eq("request_payload_json->>assetId", assetId)
    .gt("created_at", since)
    .limit(1);
  if (inFlight && inFlight.length) return json(409, { error: "switchx_in_flight", jobId: inFlight[0].id });

  const frames = switchxFramesOf(measuredVideo(meta), seconds, typeof meta.fps === "number" ? meta.fps : null);
  if (frames > SWITCHX_BG_MAX_FRAMES) return json(400, { error: "source_refused", detail: `the source is ${frames} frames; Beeble takes at most ${SWITCHX_BG_MAX_FRAMES} a job` });
  const estimate = beebleEstimateUsd(frames, SWITCHX_BG_RESOLUTION, keepMask ? "keep-mask" : "background");
  const answerSource = { assetId, seconds, frames, bytes, bucket, path };
  const answerReference = reference ? { assetId: reference.id, bucket: reference.bucket, path: reference.path } : null;
  const answerAlpha = alpha ? { assetId: alpha.id, seconds: alpha.seconds, bytes: alpha.bytes, bucket: alpha.bucket, path: alpha.path } : null;

  // The reference picture's file is owner-checked here too, so a dry run that answers ok is not refused for
  // ownership at the real submit (a file that is missing still fails at signing, before any spend).
  if (reference) {
    const may = await callerMayRead(admin, userId, reference.bucket, reference.path);
    if (!may.ok) return json(refusalResponse(may).status, { error: refusalResponse(may).error });
  }

  // A dry run stops here: every check has passed, nothing is signed, recorded or sent.
  if (dryRun)
    return json(200, { ok: true, dryRun: true, lane, mode, resolution: SWITCHX_BG_RESOLUTION, estimate, prompt, source: answerSource, reference: answerReference, alpha: answerAlpha });

  // The service role bypasses bucket RLS: only the caller's own folder (or a legacy grant) may be signed here.
  const signed = await signForCaller(admin, userId, bucket, path, SIGN_TTL);
  if (!signed.ok) return json(signed.status, { error: signed.error === "storage_object_not_found" ? "source_sign_failed" : signed.error });
  let referenceUrl: string | null = null;
  if (reference) {
    const rs = await signForCaller(admin, userId, reference.bucket, reference.path, SIGN_TTL);
    if (!rs.ok) return json(rs.status, { error: rs.error === "storage_object_not_found" ? "reference_sign_failed" : rs.error });
    referenceUrl = rs.url;
  }
  let alphaUrl: string | null = null;
  if (alpha) {
    const as = await signForCaller(admin, userId, alpha.bucket, alpha.path, SIGN_TTL);
    if (!as.ok) return json(as.status, { error: as.error === "storage_object_not_found" ? "alpha_sign_failed" : as.error });
    alphaUrl = as.url;
  }

  const request = alphaUrl
    ? switchxKeepMaskRequest({ sourceVideoUrl: signed.url, alphaUrl, referenceImageUrl: referenceUrl, prompt })
    : switchxBackgroundRequest({ sourceVideoUrl: signed.url, referenceImageUrl: referenceUrl, prompt });
  // What the record keeps of the request: the same body, the signed links replaced by what they point at.
  const recordedRequest: Record<string, unknown> = {
    ...request,
    sourceVideoUrl: `<signed ${bucket}/${path}, ${SIGN_TTL}s>`,
    referenceImageUrl: reference ? `<signed ${reference.bucket}/${reference.path}, ${SIGN_TTL}s>` : null,
  };
  if (alpha) recordedRequest.alphaUrl = `<signed ${alpha.bucket}/${alpha.path}, ${SIGN_TTL}s>`;

  // The record of the spend, written before the call. No batchRun: provider-jobs-tick never claims it.
  const { data: job, error: jobErr } = await admin
    .from("provider_jobs")
    .insert({
      user_id: userId,
      project_id: asset.project_id,
      provider: SWITCHX_BG_PROVIDER,
      status: "running",
      request_payload_json: {
        lane,
        vendor: SWITCHX_BG_VENDOR,
        assetId,
        referenceAssetId: reference?.id ?? null,
        alphaAssetId: alpha?.id ?? null,
        mode,
        resolution: SWITCHX_BG_RESOLUTION,
        prompt,
        request: recordedRequest,
        source: { bucket, path, bytes, seconds, frames },
        alpha: alpha ? { bucket: alpha.bucket, path: alpha.path, bytes: alpha.bytes, seconds: alpha.seconds } : null,
        estimate,
        settings: { route: lane },
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
    // A provider may quote the signed input it could not fetch: no link reaches the log, the record or the answer.
    const detail = withoutLinks(typeof cc.error === "string" ? `${cc.error}${typeof cc.detail === "string" ? `: ${cc.detail}` : ""}` : `cc_${resp.status}`);
    console.error(`[switchx-background-proxy] submit_failed http=${resp.status} asset=${assetId} error=${detail.slice(0, 300)}`);
    await admin.from("provider_jobs").update({ status: "failed", error_text: detail.slice(0, 500) }).eq("id", job.id);
    return json(502, { error: "switchx_submit_failed", detail: detail.slice(0, 500) });
  }
  const generationMetadata = recordedGenerationMetadata(cc.generation_metadata);
  // A keep-mask job that Control Center did not run as one (an older deployment reads an unknown mode as
  // "background" and drops the matte) is a paid job of the wrong kind: it is filed failed, with Beeble's id kept so
  // the spend is on the record, and never handed on as a keep-mask result.
  if (keepMask && !ccRanKeepMask(cc.generation_metadata)) {
    console.error(`[switchx-background-proxy] cc_mode_mismatch asset=${assetId} job=${job.id} beeble=${beebleJobId}`);
    await admin
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: "cc_mode_mismatch",
        external_job_id: beebleJobId,
        response_payload_json: { status: "queued", beeble_job_id: beebleJobId, generation_metadata: generationMetadata, error: "cc_mode_mismatch" },
      })
      .eq("id", job.id);
    return json(502, { error: "cc_mode_mismatch", detail: "Control Center did not queue a keep-mask job; the job it queued is on the record as spent", jobId: job.id, beeble_job_id: beebleJobId });
  }
  await admin
    .from("provider_jobs")
    .update({
      external_job_id: beebleJobId,
      response_payload_json: { status: "queued", beeble_job_id: beebleJobId, generation_metadata: generationMetadata },
    })
    .eq("id", job.id);
  console.log(`[switchx-background-proxy] submitted asset=${assetId} frames=${frames} bytes=${bytes} job=${job.id} beeble=${beebleJobId}`);
  return json(200, {
    ok: true,
    jobId: job.id,
    beeble_job_id: beebleJobId,
    lane,
    mode,
    resolution: SWITCHX_BG_RESOLUTION,
    estimate,
    prompt,
    source: answerSource,
    reference: answerReference,
    alpha: answerAlpha,
  });
});
