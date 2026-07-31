// AVT edge function — wardrobe-video-reassemble-proxy
//
// Phase 2a (encoder roundtrip foundation). Takes an ORDERED set of frame images
// the client already extracted + uploaded (see src/lib/video/extractFrames.ts)
// and muxes them back into an H.264 clip via Fal `fal-ai/ffmpeg-api/compose`,
// reached through Control Center exactly like every other Fal job in AVT — the
// generic `fal-run` action on CC `switchx-restyle`, polled via CC
// `fal-queue-poll`. AVT holds no FAL_KEY; CC does. This fn signs the frames,
// dispatches compose, polls, downloads the result, and writes it to Storage.
//
// The pattern mirrors make-scrub-proxy-proxy (submit → EdgeRuntime.waitUntil
// poll → download → upload → patch the row). Compose input is shaped by the
// pure _shared/videoCompose.ts helper (unit-tested).
//
// WHY frame extraction is NOT here: Fal's ffmpeg endpoints only extract
// first/middle/last frames, never a full sequence. The repo already owns a
// full-res master-bytes WebCodecs decoder (src/lib/video/mp4Demux.ts +
// webCodecsFrame.ts) that hero-frame capture uses, so batch extraction runs
// client-side and this fn only handles reassembly. Between the two, Phase 2b
// inserts the per-frame garment swap.
//
// Env:
//   COMPOSE_LOOK_CC_URL           — CC base (…/compose-look); we swap the tail
//   SWITCHX_PROXY_SECRET | COMPOSE_LOOK_PROXY_SECRET — CC proxy secret
//   VIDEO_COMPOSE_FAL_MODEL       — Fal model CC's fal-run runs; deploy as
//                                    fal-ai/ffmpeg-api/compose. REQUIRED —
//                                    no model is guessed here.
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildComposeTracks, extractComposeVideoUrl } from "../_shared/videoCompose.ts";
import {
  type CcEndpoints,
  type FalCallContext,
  falPoll,
  falSubmit,
  type FalQueueRef,
  persistFalDiagnostic,
  toFalDiagnostic,
} from "../_shared/falDiagnostics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 3000;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 12 * 60 * 1000;
// Supabase caps how many paths one createSignedUrls call accepts; chunk to stay
// well under it while preserving frame order across chunks.
const SIGN_CHUNK = 100;

type Body = {
  /** Source master asset — for ownership check + (optional) audio track. */
  assetId?: string;
  /** Extract session id — namespaces the frames + the output object. */
  sessionId?: string;
  /** Ordered frame object paths (presentation order). */
  framePaths?: string[];
  /** Bucket the frames live in (client uploaded them here). */
  frameBucket?: string;
  /** Playback frame rate the frames were sampled at. */
  fps?: number;
  /** Lay the master's original audio over the reassembled clip. */
  includeAudio?: boolean;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ccSwitchxUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/switchx-restyle");
}

function ccFalPollUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/fal-queue-poll");
}

/** Same asset_type → bucket map as the client (projectAssets.bucketForAssetType). */
function bucketForAssetType(assetType: string): string {
  switch (assetType) {
    case "reference_image":
    case "reference_video":
    case "lyrics_doc":
      return "project-references";
    case "ae_asset":
    case "premiere_export":
      return "project-exports";
    default:
      return "project-clips";
  }
}

async function signFramesInOrder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[],
): Promise<string[]> {
  const signed: string[] = [];
  for (let i = 0; i < paths.length; i += SIGN_CHUNK) {
    const chunk = paths.slice(i, i + SIGN_CHUNK);
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(chunk, SIGN_TTL);
    if (error) throw new Error(`frame_sign_failed: ${error.message}`);
    // createSignedUrls preserves input order; guard anyway.
    for (let j = 0; j < chunk.length; j++) {
      const row = data?.[j];
      if (!row?.signedUrl) throw new Error(`frame_sign_missing: ${chunk[j]}`);
      signed.push(row.signedUrl);
    }
  }
  return signed;
}

async function patchMeta(
  admin: ReturnType<typeof createClient>,
  assetId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data: row } = await admin
    .from("project_assets")
    .select("metadata_json")
    .eq("id", assetId)
    .maybeSingle();
  const current = (row?.metadata_json ?? {}) as Record<string, unknown>;
  await admin
    .from("project_assets")
    .update({ metadata_json: { ...current, ...patch } })
    .eq("id", assetId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const composeCcUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret =
    Deno.env.get("SWITCHX_PROXY_SECRET")?.trim() ||
    Deno.env.get("COMPOSE_LOOK_PROXY_SECRET")?.trim() ||
    "";
  const falModel = Deno.env.get("VIDEO_COMPOSE_FAL_MODEL")?.trim() ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!composeCcUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }
  if (!falModel) {
    // Fail loud rather than guess a Fal model id — the encode target is a
    // deploy-time decision (VIDEO_COMPOSE_FAL_MODEL = fal-ai/ffmpeg-api/compose).
    return json(500, { error: "server_misconfigured", detail: "missing_VIDEO_COMPOSE_FAL_MODEL" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "missing_bearer" });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const framePaths = Array.isArray(body.framePaths) ? body.framePaths.filter(Boolean) : [];
  if (!body.assetId) return json(400, { error: "missing_asset_id" });
  if (!body.sessionId) return json(400, { error: "missing_session_id" });
  if (framePaths.length === 0) return json(400, { error: "no_frames" });
  if (!(Number(body.fps) > 0)) return json(400, { error: "invalid_fps" });

  const { data: asset, error: aErr } = await admin
    .from("project_assets")
    .select("id, user_id, asset_type, file_url")
    .eq("id", body.assetId)
    .maybeSingle();
  if (aErr) return json(500, { error: "asset_query_failed", detail: aErr.message });
  if (!asset) return json(404, { error: "asset_not_found" });
  if (asset.user_id !== userId) return json(403, { error: "not_owner" });

  const frameBucket = body.frameBucket || "project-exports";
  // Confine the client to frames it owns: every path must sit under its user id.
  if (framePaths.some((p) => !p.startsWith(`${userId}/`))) {
    return json(403, { error: "frame_path_not_owned" });
  }

  let frameUrls: string[];
  try {
    frameUrls = await signFramesInOrder(admin, frameBucket, framePaths);
  } catch (err) {
    return json(500, { error: "frame_sign_failed", detail: String(err).slice(0, 200) });
  }

  let audioUrl: string | null = null;
  if (body.includeAudio) {
    const masterBucket = bucketForAssetType(String(asset.asset_type));
    const { data: masterSigned } = await admin.storage
      .from(masterBucket)
      .createSignedUrl(String(asset.file_url ?? ""), SIGN_TTL);
    audioUrl = masterSigned?.signedUrl ?? null;
    // Audio is best-effort in 2a — a missing master audio track must not sink
    // the frames→video proof, so we proceed video-only when signing fails.
  }

  let payload: ReturnType<typeof buildComposeTracks>;
  try {
    payload = buildComposeTracks(frameUrls, Number(body.fps), audioUrl);
  } catch (err) {
    return json(400, { error: "compose_shape_failed", detail: String(err).slice(0, 200) });
  }

  const cc: CcEndpoints = {
    switchxUrl: ccSwitchxUrl(composeCcUrl),
    pollUrl: ccFalPollUrl(composeCcUrl),
    proxySecret,
  };
  const ctx: FalCallContext = {
    model: falModel,
    requestId: `${asset.id}:${body.sessionId}`,
    label: "reassemble",
    pollIntervalMs: POLL_INTERVAL_MS,
    pollTimeoutMs: POLL_TIMEOUT_MS,
  };
  const outPath = `${userId}/${asset.id}/reassembled/${body.sessionId}.mp4`;

  await patchMeta(admin, asset.id, {
    reassemble_status: "processing",
    reassemble_session_id: body.sessionId,
    reassemble_path: outPath,
    reassemble_bucket: "project-exports",
  });

  let queue: FalQueueRef;
  try {
    queue = await falSubmit(cc, ctx, { action: "fal-run", model: falModel, input: payload });
  } catch (err) {
    const diag = toFalDiagnostic(err, { phase: "submission", ctx });
    await persistFalDiagnostic(admin, asset.id, "reassemble", diag, {
      reassemble_status: "failed",
      reassemble_error: diag.message,
    });
    return json(502, {
      error: "compose_submit_failed",
      classification: diag.classification,
      falStatus: diag.fal_status,
      ccHttpStatus: diag.cc_http_status,
      assetId: asset.id,
    });
  }

  const finish = async () => {
    try {
      const result = await falPoll(cc, ctx, queue);
      const videoUrl = extractComposeVideoUrl(result);
      if (!videoUrl) throw new Error("compose_completed_without_video_url");
      const dl = await fetch(videoUrl, { headers: { Accept: "video/*" } });
      if (!dl.ok) throw new Error(`reassembled_download_${dl.status}`);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from("project-exports")
        .upload(outPath, bytes, { contentType: "video/mp4", cacheControl: "3600", upsert: true });
      if (upErr) throw new Error(`reassembled_upload_failed: ${upErr.message}`);

      await patchMeta(admin, asset.id, {
        reassemble_status: "ready",
        reassemble_path: outPath,
        reassemble_bucket: "project-exports",
        reassemble_frame_count: framePaths.length,
        reassemble_fps: Number(body.fps),
      });
    } catch (err) {
      const diag = toFalDiagnostic(err, {
        phase: "output_retrieval",
        ctx,
        submittedAt: queue.submittedAt,
      });
      await persistFalDiagnostic(admin, asset.id, "reassemble", diag, {
        reassemble_status: "failed",
        reassemble_error: diag.message,
      });
    }
  };

  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (er && typeof er.waitUntil === "function") {
    er.waitUntil(finish());
  } else {
    await finish();
  }

  return json(200, {
    ok: true,
    status: "processing",
    assetId: asset.id,
    sessionId: body.sessionId,
    outPath,
    frameCount: framePaths.length,
  });
});
