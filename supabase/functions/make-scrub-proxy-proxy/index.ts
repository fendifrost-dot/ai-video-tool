// AVT edge function — make-scrub-proxy-proxy
//
// Scrub-proxy transcode dispatcher (P3). On video upload the client calls this
// with the just-created project_assets id. We transcode the (possibly 2 GB 4K
// HEVC) master down to a lightweight ~720p H.264 "scrub proxy" NEXT TO the
// untouched master, then write the proxy pointer onto the master asset's
// metadata_json so the client's resolveScrubSource() serves the proxy for
// preview/scrubbing. The hero frame is still captured full-res from the master.
//
// Why an edge function at all when it can't run ffmpeg itself: a Deno edge fn
// has no ffmpeg and short CPU/wall-clock limits, and the browser is the very
// 4K-decode choke we're removing. So the actual transcode runs on Fal, reached
// through Control Center exactly like every other Fal job in AVT — the generic
// `fal-run` action on CC `switchx-restyle`, polled via CC `fal-queue-poll`.
// AVT holds no FAL_KEY; CC does. This fn only dispatches + polls + writes back.
//
// The pattern mirrors wardrobe-vton-proxy (submit → EdgeRuntime.waitUntil poll
// → download result → upload to Storage → patch the row). No separate public
// callback endpoint is needed because CC's fal-queue-poll gives us the terminal
// status; we finish inside the background task.
//
// The `falInput` below is shaped for the specific model this is deployed with:
//   SCRUB_PROXY_FAL_MODEL = fal-ai/workflow-utilities/scale-video
// (resizes a video to target dimensions; modes stretch|pad|crop; dims 512–2048).
// If that secret is ever pointed at a different model, the input keys must be
// re-shaped to match — see the `falInput` comment.
//
// Env:
//   COMPOSE_LOOK_CC_URL           — CC base (…/compose-look); we swap the tail
//   SWITCHX_PROXY_SECRET | COMPOSE_LOOK_PROXY_SECRET — CC proxy secret
//   SCRUB_PROXY_FAL_MODEL         — Fal model CC's fal-run runs; deployed as
//                                    fal-ai/workflow-utilities/scale-video.
//                                    REQUIRED — no model is guessed here.
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
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

// A 4K→720p transcode of a multi-GB master can take a while on Fal — allow more
// headroom than the VTON path (5 min) but stay under the edge background cap.
const SIGN_TTL = 3000;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 12 * 60 * 1000;
// ~720p proxy box. scale-video with mode "pad" fits the master INSIDE this box
// preserving aspect ratio (letterbox), so a portrait or 4:3 master is never
// stretched. Both edges are even and inside the model's 512–2048 range.
const PROXY_LONG_EDGE = 1280;
const PROXY_SHORT_EDGE = 720;

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

function ccFalPollUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/fal-queue-poll");
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://");
}

/**
 * Storage bucket a project_assets row lives in — kept in lockstep with the
 * client `bucketForAssetType` (src/lib/queries/projectAssets.ts). The scrub
 * proxy is written into the SAME bucket as its master (the client resolver
 * defaults `scrub_proxy_bucket` to the master's bucket).
 */
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

function looksLikeVideo(fileUrl: string, mime: unknown): boolean {
  if (typeof mime === "string" && mime.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v|mkv)$/i.test(fileUrl);
}

/** Fal ffmpeg/transcode outputs vary; accept the common shapes for a video URL. */
function extractVideoUrl(result: Record<string, unknown>): string | null {
  const video = result?.video as { url?: string } | undefined;
  if (isHttpsUrl(video?.url)) return video!.url!.trim();
  if (isHttpsUrl(result?.video_url)) return String(result.video_url).trim();
  if (isHttpsUrl(result?.url)) return String(result.url).trim();
  const output = result?.output as { url?: string } | undefined;
  if (isHttpsUrl(output?.url)) return output!.url!.trim();
  const videos = result?.videos as Array<{ url?: string }> | undefined;
  if (Array.isArray(videos) && isHttpsUrl(videos[0]?.url)) {
    return videos[0]!.url!.trim();
  }
  return null;
}

/** Merge the proxy pointer fields into the master row's metadata_json. */
async function patchProxyMeta(
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
  const falModel = Deno.env.get("SCRUB_PROXY_FAL_MODEL")?.trim() ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!composeCcUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }
  if (!falModel) {
    // Fail loud rather than guess a Fal model id — the encode target is a
    // deploy-time decision (see SCRUB_PROXY_FAL_MODEL in the handoff).
    return json(500, { error: "server_misconfigured", detail: "missing_SCRUB_PROXY_FAL_MODEL" });
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
  if (!body?.assetId) return json(400, { error: "missing_asset_id" });

  const { data: asset, error: aErr } = await admin
    .from("project_assets")
    .select("id, user_id, asset_type, file_url, metadata_json")
    .eq("id", body.assetId)
    .maybeSingle();
  if (aErr) return json(500, { error: "asset_query_failed", detail: aErr.message });
  if (!asset) return json(404, { error: "asset_not_found" });
  if (asset.user_id !== userId) return json(403, { error: "not_owner" });

  const meta = (asset.metadata_json ?? {}) as Record<string, unknown>;
  const fileUrl = String(asset.file_url ?? "");
  if (!looksLikeVideo(fileUrl, meta.mime_type)) {
    return json(400, { error: "not_a_video" });
  }

  // Idempotency: don't re-dispatch if a proxy is already ready or in flight.
  const existingStatus = meta.scrub_proxy_status;
  if (existingStatus === "ready" || existingStatus === "processing") {
    return json(200, { ok: true, status: existingStatus, skipped: true, assetId: asset.id });
  }

  const masterBucket = bucketForAssetType(String(asset.asset_type));
  // INVARIANT — the proxy is VIEW-ONLY. It is written to a SEPARATE object
  // (`<master>.proxy.mp4`) and we only ever read `fileUrl` (the master) and
  // append pointer fields to its metadata_json — the master bytes and its
  // `file_url` are never modified or overwritten. Hero-frame capture and every
  // downstream/export path continue to read the full-res master.
  const proxyPath = `${fileUrl}.proxy.mp4`;

  // Sign the master so Fal (via CC) can pull it. Read-only.
  const { data: masterSigned, error: signErr } = await admin.storage
    .from(masterBucket)
    .createSignedUrl(fileUrl, SIGN_TTL);
  if (signErr || !masterSigned?.signedUrl) {
    return json(500, { error: "master_sign_failed", detail: signErr?.message });
  }

  // Flip to "processing" up front so the UI reflects an in-flight transcode and
  // repeat calls short-circuit above.
  await patchProxyMeta(admin, asset.id, {
    scrub_proxy_status: "processing",
    scrub_proxy_bucket: masterBucket,
    scrub_proxy_path: proxyPath,
  });

  const cc: CcEndpoints = {
    switchxUrl: ccSwitchxUrl(composeCcUrl),
    pollUrl: ccFalPollUrl(composeCcUrl),
    proxySecret,
  };
  const ctx: FalCallContext = {
    model: falModel,
    requestId: asset.id,
    label: "scrub_proxy",
    pollIntervalMs: POLL_INTERVAL_MS,
    pollTimeoutMs: POLL_TIMEOUT_MS,
  };

  // Input handed straight to CC `fal-run`, which forwards it verbatim to the Fal
  // model. These keys are the ACTUAL fal-ai/workflow-utilities/scale-video input
  // schema (video_url, width, height, mode∈{stretch,pad,crop}, pad_color,
  // codec∈{libx264,libx265}, preset, crf 0–51). "pad" preserves the master's
  // aspect ratio (fit-inside + letterbox) — it never stretches. libx264 keeps
  // H.264 output; the model exposes no faststart flag, so none is sent. crf 26
  // keeps the proxy small — it's view-only (scrub/preview), never a deliverable.
  const falInput: Record<string, unknown> = {
    video_url: masterSigned.signedUrl,
    width: PROXY_LONG_EDGE,
    height: PROXY_SHORT_EDGE,
    mode: "pad",
    pad_color: "black",
    codec: "libx264",
    preset: "fast",
    crf: 26,
  };

  let queue: FalQueueRef;
  try {
    queue = await falSubmit(cc, ctx, { action: "fal-run", model: falModel, input: falInput });
  } catch (err) {
    const diag = toFalDiagnostic(err, { phase: "submission", ctx });
    await persistFalDiagnostic(admin, asset.id, "scrub_proxy", diag, {
      scrub_proxy_status: "failed",
      scrub_proxy_error: diag.message,
    });
    return json(502, {
      error: "transcode_submit_failed",
      classification: diag.classification,
      falStatus: diag.fal_status,
      ccHttpStatus: diag.cc_http_status,
      assetId: asset.id,
    });
  }

  const finish = async () => {
    try {
      const result = await falPoll(cc, ctx, queue);
      const videoUrl = extractVideoUrl(result);
      if (!videoUrl) throw new Error("transcode_completed_without_video_url");
      const dl = await fetch(videoUrl, { headers: { Accept: "video/*" } });
      if (!dl.ok) throw new Error(`proxy_download_${dl.status}`);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from(masterBucket)
        .upload(proxyPath, bytes, {
          contentType: "video/mp4",
          cacheControl: "3600",
          upsert: true,
        });
      if (upErr) throw new Error(`proxy_upload_failed: ${upErr.message}`);

      await patchProxyMeta(admin, asset.id, {
        scrub_proxy_path: proxyPath,
        scrub_proxy_bucket: masterBucket,
        scrub_proxy_status: "ready",
      });
    } catch (err) {
      const diag = toFalDiagnostic(err, {
        phase: "output_retrieval",
        ctx,
        submittedAt: queue.submittedAt,
      });
      await persistFalDiagnostic(admin, asset.id, "scrub_proxy", diag, {
        scrub_proxy_status: "failed",
        scrub_proxy_error: diag.message,
      });
    }
  };

  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (er && typeof er.waitUntil === "function") {
    er.waitUntil(finish());
  } else {
    // Local/dev without EdgeRuntime — run inline.
    await finish();
  }

  return json(200, { ok: true, status: "processing", assetId: asset.id, proxyPath });
});
