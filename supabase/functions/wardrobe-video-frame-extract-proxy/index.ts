// AVT edge function — wardrobe-video-frame-extract-proxy
//
// GENERIC server-side SHOT / FRAME service. Every future video op (mask
// propagation, optical flow, temporal QA, rerender, final assembly) reuses THIS
// timestamped clip/frame service + its manifest — it is production infra, not
// throwaway scaffolding. See supabase/functions/_shared/frameExtract.ts and
// docs/VIDEO_SWAP_ARCHITECTURE.md §4/§6.
//
// THE PROBLEM IT REMOVES. To make a short frame sequence, the browser used to
// download + decode the whole (up to ~2 GB 4K HEVC) master (client WebCodecs,
// src/lib/video/extractFrames.ts). For large masters that is the exact choke the
// scrub-proxy was built to avoid — and 4K HEVC often won't decode in a browser
// at all.
//
// WHAT FAL ACTUALLY OFFERS (confirmed against fal.ai OpenAPI queue schemas,
// 2026-07-29). There is NO server-side full-frame-sequence extractor on Fal:
// `ffmpeg-api/extract-frame` is first/middle/last only, `compose` cannot seek
// into a source. The one server-side clip op is a SEEK+TRIM
// (`workflow-utilities/trim-video`). So this function does the part that MUST be
// server-side — cut ONLY the requested [start, start+duration] range out of the
// master ON FAL (never pulling the whole master to the browser), and normalize
// it to a small H.264 clip — then the frames are decoded from that SMALL clip
// (client WebCodecs, a few MB of H.264, not the 2 GB HEVC master). The trimmed
// clip is also Lane C's whole-clip input, so Lane C runs on exactly the range.
//
// WHY the scrub-proxy's scale-video hit fal_response_failed and this shouldn't:
// scale-video decodes+re-encodes the ENTIRE master; trim-video only touches the
// requested range. This is the "seek+trim to the clip range first" mitigation.
//
// FLOW (mirrors make-scrub-proxy-proxy / wardrobe-video-propagate-proxy):
//   dispatch → (idempotent: skip if clip already stored) → EdgeRuntime.waitUntil
//     [ trim-video → metadata probe → (force H.264 + dims via scale-video on the
//       SMALL clip when needed) → store clip.mp4 ] → status "frames_pending".
//   The client decodes the trimmed clip + uploads frames to the manifest paths,
//   then calls back with { finalize:true }: this LISTS storage, rebuilds the
//   server-authoritative manifest, and flips to "ready" when frames are gapless.
// Idempotent + resumable throughout (extraction id keys the clip + every frame
// path; re-invoking skips the existing clip and existing frames).
//
// Env:
//   COMPOSE_LOOK_CC_URL           — CC base (…/compose-look); tail swapped
//   SWITCHX_PROXY_SECRET | COMPOSE_LOOK_PROXY_SECRET — CC proxy secret
//   CLIP_TRIM_FAL_MODEL           — REQUIRED. CC-allowlisted seek/trim model;
//                                    deploy fal-ai/workflow-utilities/trim-video.
//   CLIP_SCALE_FAL_MODEL          — OPTIONAL. Force-H.264 + output-dims model
//                                    (fal-ai/workflow-utilities/scale-video —
//                                    ALREADY allowlisted as SCRUB_PROXY_FAL_MODEL).
//   CLIP_META_FAL_MODEL           — OPTIONAL but STRONGLY recommended. Source/clip
//                                    probe (fal-ai/ffmpeg-api/metadata). Header-only,
//                                    so safe on a 4K master. Drives the shared
//                                    preflight gate: when set, the MASTER is probed
//                                    up front and a source ABOVE Fal's ingest
//                                    envelope (4K) short-circuits to
//                                    extract_status="needs_transcode" instead of
//                                    submitting a Fal trim that 500s. Unset ⇒ legacy
//                                    trim-first path (assumes Fal-ingestable).
//   PREFLIGHT_CEILING_LONG_EDGE   — OPTIONAL processing ceiling (long edge px) the
//                                    shared preflight service targets. Default 1080p
//                                    (1920). See _shared/videoPreflight.ts.
//   EXTRACT_MAX_FRAMES            — OPTIONAL OOM/cost cap (default 900).
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type CcEndpoints,
  type FalCallContext,
  falPoll,
  falSubmit,
  persistFalDiagnostic,
  toFalDiagnostic,
} from "../_shared/falDiagnostics.ts";
import {
  buildExtractionManifest,
  buildMetadataInput,
  buildScaleInput,
  buildTrimInput,
  canonicalizeExtractConfig,
  contiguousFromZero,
  decideClipNormalize,
  extractClipVideoUrl,
  extractFramePrefix,
  extractionIdForConfig,
  extractVideoMeta,
  frameIndexFromPath,
  type ExtractConfig,
  type ExtractionManifest,
  type ExtractionRepro,
} from "../_shared/frameExtract.ts";
import {
  DEFAULT_CEILING_LONG_EDGE,
  planPreflight,
  readAssetSourceMedia,
  resolveSourceProbe,
  type SourceProbe,
} from "../_shared/videoPreflight.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 3000;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 12 * 60 * 1000;
const OUT_BUCKET = "project-exports";
const DEFAULT_MAX_FRAMES = 900;

// TEMPORARY RESEARCH INSTRUMENTATION — remove after the one-shot raw Fal
// metadata probe. Writes project_assets.metadata_json.debug_fal_meta so we
// can inspect the live Fal ffmpeg-api/metadata payload. Not a product
// change. The guard is hard-pinned to a single fixture id. Do not
// generalize it: no request flag, no env var, no wildcard, no second id.
// HDR is not inferred here. This block only captures the raw payload.
const DEBUG_FAL_META_ASSET_IDS: readonly string[] = [
  "059114c4-cb4b-4b29-ab22-6df3a8337c4d",
];

type Body = {
  assetId?: string;
  startSec?: number;
  durationSec?: number;
  fps?: number;
  width?: number;
  height?: number;
  maxFrames?: number;
  /** Post-decode callback: re-list storage + flip the manifest to ready. */
  finalize?: boolean;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ccSwitchxUrl(u: string): string {
  return u.replace(/\/compose-look\/?$/, "/switchx-restyle");
}
function ccFalPollUrl(u: string): string {
  return u.replace(/\/compose-look\/?$/, "/fal-queue-poll");
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

function looksLikeVideo(fileUrl: string, mime: unknown): boolean {
  if (typeof mime === "string" && mime.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v|mkv)$/i.test(fileUrl);
}

/**
 * Submit one job to CC fal-run, poll to completion, return the raw result object.
 * Built on the shared falSubmit/falPoll so any failure throws a
 * FalDiagnosticError carrying the full structured diagnostic (HTTP status,
 * upstream fal_status, provider error, bounded body/logs) for THIS model step.
 */
async function runFalViaCc(
  cc: CcEndpoints,
  requestId: string,
  model: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const ctx: FalCallContext = {
    model,
    requestId,
    label: `extract:${model}`,
    pollIntervalMs: POLL_INTERVAL_MS,
    pollTimeoutMs: POLL_TIMEOUT_MS,
  };
  const queue = await falSubmit(cc, ctx, { action: "fal-run", model, input });
  return await falPoll(cc, ctx, queue);
}

async function readMeta(
  admin: ReturnType<typeof createClient>,
  assetId: string,
): Promise<Record<string, unknown>> {
  const { data: row } = await admin
    .from("project_assets")
    .select("metadata_json")
    .eq("id", assetId)
    .maybeSingle();
  return (row?.metadata_json ?? {}) as Record<string, unknown>;
}

async function patchMeta(
  admin: ReturnType<typeof createClient>,
  assetId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const current = await readMeta(admin, assetId);
  await admin
    .from("project_assets")
    .update({ metadata_json: { ...current, ...patch } })
    .eq("id", assetId);
}

/**
 * TEMPORARY RESEARCH — persist the RAW Fal ffmpeg-api/metadata payload
 * under project_assets.metadata_json.debug_fal_meta for the pinned
 * fixture only.
 *
 * Purpose: determine whether pixel_format / profile / bitrate /
 * frame_count (or other useful stream metadata) are present in the live
 * Fal response and currently discarded by extractVideoMeta, or are
 * absent from Fal entirely. HDR stays out of scope.
 *
 * REMOVE after the single fixture probe. Best-effort: never throw, never
 * change extract / compatibility behaviour for any other asset.
 */
async function persistDebugFalMeta(
  admin: ReturnType<typeof createClient>,
  assetId: string,
  raw: Record<string, unknown>,
): Promise<void> {
  if (!DEBUG_FAL_META_ASSET_IDS.includes(assetId)) return;
  const media = (raw.media ?? raw) as Record<string, unknown>;
  const mediaObj = media && typeof media === "object" ? media : {};
  try {
    await patchMeta(admin, assetId, {
      debug_fal_meta: {
        note: "TEMPORARY — raw Fal metadata for parser-loss check. Remove after probe.",
        captured_at: new Date().toISOString(),
        top_level_keys: Object.keys(raw),
        media_keys: Object.keys(mediaObj),
        raw,
      },
    });
  } catch {
    // Research persist must never fail the extract path.
  }
}

/** List the frame indices already stored under the extraction prefix (resume set). */
async function listStoredFrameIndices(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<number[]> {
  const indices: number[] = [];
  // storage.list paginates; the prefix is the folder path (no trailing needed).
  const folder = prefix.replace(/\/$/, "");
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100, offset });
    if (error) throw new Error(`frame_list_failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const obj of data) {
      const idx = frameIndexFromPath(obj.name);
      if (idx !== null) indices.push(idx);
    }
    if (data.length < 100) break;
  }
  return [...new Set(indices)].sort((a, b) => a - b);
}

async function objectExists(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const { data } = await admin.storage.from(bucket).list(folder, { search: name, limit: 100 });
  return Boolean(data?.some((o) => o.name === name));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const composeCcUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret =
    Deno.env.get("SWITCHX_PROXY_SECRET")?.trim() ||
    Deno.env.get("COMPOSE_LOOK_PROXY_SECRET")?.trim() ||
    "";
  const trimModel = Deno.env.get("CLIP_TRIM_FAL_MODEL")?.trim() ?? "";
  const scaleModel = Deno.env.get("CLIP_SCALE_FAL_MODEL")?.trim() ?? "";
  const metaModel = Deno.env.get("CLIP_META_FAL_MODEL")?.trim() ?? "";
  const maxFramesCap = Math.max(
    1,
    Number(Deno.env.get("EXTRACT_MAX_FRAMES")) || DEFAULT_MAX_FRAMES,
  );
  // Processing ceiling (long edge, px) — the ONE knob the shared preflight service
  // reads. Default 1080p; set PREFLIGHT_CEILING_LONG_EDGE to change it globally.
  const preflightCeiling = Math.max(
    1,
    Number(Deno.env.get("PREFLIGHT_CEILING_LONG_EDGE")) || DEFAULT_CEILING_LONG_EDGE,
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!composeCcUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }
  if (!trimModel) {
    // Fail loud rather than guess a Fal model id (same posture as the other
    // proxies). The seek/trim target is a deploy-time decision.
    return json(500, { error: "server_misconfigured", detail: "missing_CLIP_TRIM_FAL_MODEL" });
  }

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

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!body.assetId) return json(400, { error: "missing_asset_id" });

  let config: ExtractConfig;
  try {
    config = {
      assetId: String(body.assetId),
      startSec: Number(body.startSec),
      durationSec: Number(body.durationSec),
      fps: Number(body.fps),
      width: body.width && Number(body.width) > 0 ? Number(body.width) : undefined,
      height: body.height && Number(body.height) > 0 ? Number(body.height) : undefined,
    };
    canonicalizeExtractConfig(config); // validates ranges
  } catch (err) {
    return json(400, { error: "invalid_extract_config", detail: String(err).slice(0, 200) });
  }
  if (config.width && !config.height) return json(400, { error: "width_requires_height" });
  if (config.height && !config.width) return json(400, { error: "height_requires_width" });
  if (config.width && !scaleModel) {
    return json(400, {
      error: "dims_need_scale_model",
      detail: "set CLIP_SCALE_FAL_MODEL to request output dims",
    });
  }
  const maxFrames = Math.min(maxFramesCap, Math.max(1, Number(body.maxFrames) || maxFramesCap));

  const { data: asset, error: aErr } = await admin
    .from("project_assets")
    .select("id, user_id, asset_type, file_url, metadata_json")
    .eq("id", config.assetId)
    .maybeSingle();
  if (aErr) return json(500, { error: "asset_query_failed", detail: aErr.message });
  if (!asset) return json(404, { error: "asset_not_found" });
  if (asset.user_id !== userId) return json(403, { error: "not_owner" });

  const assetMeta = (asset.metadata_json ?? {}) as Record<string, unknown>;
  const fileUrl = String(asset.file_url ?? "");
  if (!looksLikeVideo(fileUrl, assetMeta.mime_type)) return json(400, { error: "not_a_video" });

  const extractionId = extractionIdForConfig(config);
  const framePrefix = extractFramePrefix(userId, config.assetId, extractionId);
  const clipPath = `${framePrefix}clip.mp4`;
  const masterBucket = bucketForAssetType(String(asset.asset_type));

  // The repro block for this extraction (registry keeps prior runs' repro).
  const repro: ExtractionRepro = {
    falTrimModel: trimModel,
    falScaleModel: scaleModel || null,
    falMetaModel: metaModel || null,
    mode: "trim_video",
    sourceAssetPath: fileUrl || null,
    sourceCodec: null,
    sourceFps: null,
    clipCodec: null,
  };

  const buildManifest = (
    storedIndices: number[],
    clipReady: boolean,
    reproOverride?: ExtractionRepro,
  ): ExtractionManifest =>
    buildExtractionManifest({
      config,
      userId,
      frameBucket: OUT_BUCKET,
      repro: reproOverride ?? repro,
      maxFrames,
      clipPath: clipReady ? clipPath : null,
      clipBucket: clipReady ? OUT_BUCKET : null,
      framesOverride: storedIndices.length ? storedIndices : undefined,
      storedIndices,
    });

  const cc: CcEndpoints = {
    switchxUrl: ccSwitchxUrl(composeCcUrl),
    pollUrl: ccFalPollUrl(composeCcUrl),
    proxySecret,
  };
  const falRequestId = `${config.assetId}:${extractionId}`;

  // ---- FINALIZE: client uploaded frames; re-list + flip the manifest. --------
  if (body.finalize) {
    let stored: number[];
    try {
      stored = await listStoredFrameIndices(admin, OUT_BUCKET, framePrefix);
    } catch (err) {
      return json(500, { error: "frame_list_failed", detail: String(err).slice(0, 200) });
    }
    const priorManifest = ((await readMeta(admin, config.assetId)).extract_manifest ??
      null) as ExtractionManifest | null;
    const reproFinal = priorManifest?.extractionId === extractionId ? priorManifest.repro : repro;
    const clipReady = await objectExists(admin, OUT_BUCKET, clipPath);
    const manifest = buildManifest(stored, clipReady, reproFinal);
    const ready = clipReady && contiguousFromZero(stored);
    await patchMeta(admin, config.assetId, {
      extract_status: ready ? "ready" : "frames_pending",
      extract_session_id: extractionId,
      extract_manifest: manifest,
      extract_done_count: stored.length,
      extract_error: null,
    });
    return json(200, {
      ok: true,
      status: ready ? "ready" : "frames_pending",
      extractionId,
      manifest,
      storedCount: stored.length,
    });
  }

  // ---- DISPATCH: ensure the trimmed clip exists (idempotent). ----------------
  const clipReadyAlready = await objectExists(admin, OUT_BUCKET, clipPath);
  if (clipReadyAlready) {
    // Clip already produced for this exact config → skip the trim entirely.
    let stored: number[] = [];
    try {
      stored = await listStoredFrameIndices(admin, OUT_BUCKET, framePrefix);
    } catch {
      /* listing best-effort here; frames_pending is a safe default */
    }
    const priorManifest = (assetMeta.extract_manifest ?? null) as ExtractionManifest | null;
    const reproExisting =
      priorManifest?.extractionId === extractionId ? priorManifest.repro : repro;
    const ready = contiguousFromZero(stored);
    const manifest = buildManifest(stored, true, reproExisting);
    // BACKFILL the compatibility decision on this skip-the-trim path too, so
    // "the preflight block is always persisted" holds for clips produced before
    // the gate existed. The plan runs off the ASSET RECORD only — no signed URL,
    // no Fal probe, no network — and is INFORMATIONAL here: the clip already
    // exists, so we never flip an existing extract to "needs_transcode".
    const backfillPlan = planPreflight({
      source: readAssetSourceMedia(assetMeta),
      clip: { startSec: config.startSec, durationSec: config.durationSec },
      operation: config.width ? "scale" : "extract",
      ceilingLongEdge: preflightCeiling,
    });
    await patchMeta(admin, config.assetId, {
      extract_status: ready ? "ready" : "frames_pending",
      extract_session_id: extractionId,
      extract_manifest: manifest,
      extract_clip_path: clipPath,
      extract_clip_bucket: OUT_BUCKET,
      extract_preflight: backfillPlan.metadata,
      extract_preflight_transport: backfillPlan.transport,
      extract_preflight_needs_processing: backfillPlan.needsProcessing,
      extract_preflight_compatibility_reasons: backfillPlan.compatibilityReasons,
      extract_preflight_compatibility_version: backfillPlan.compatibilityVersion,
      extract_preflight_compatibility_result: backfillPlan.compatibilityResult,
      extract_preflight_compatibility_reason: backfillPlan.compatibilityReason,
      extract_preflight_recommended_action: backfillPlan.recommendedAction,
      extract_preflight_warnings: backfillPlan.warnings,
      // Self-describing: this decision describes the MASTER, not the stored clip,
      // and was recorded after the clip was already produced.
      extract_preflight_backfilled: true,
      extract_error: null,
    });
    return json(200, {
      ok: true,
      status: ready ? "ready" : "frames_pending",
      extractionId,
      manifest,
      clipPath,
      clipBucket: OUT_BUCKET,
      skippedTrim: true,
    });
  }

  // Sign the master (read-only) so Fal (via CC) can pull ONLY the requested range.
  const { data: masterSigned, error: signErr } = await admin.storage
    .from(masterBucket)
    .createSignedUrl(fileUrl, SIGN_TTL);
  if (signErr || !masterSigned?.signedUrl) {
    return json(500, { error: "master_sign_failed", detail: signErr?.message });
  }

  // ---- PROCESSING-COMPATIBILITY GATE (the shared video-preflight service) -----
  // AUTHORITY INVERSION: the MASTER's stored metadata on the project_assets row is
  // AUTHORITATIVE (width/height/codec/fps/duration/size). The ffmpeg-api/metadata
  // probe of the signed Supabase master URL is a FALLBACK only — it returns empty
  // width/height for large masters, which used to make planPreflight never run
  // (gate never evaluated, extract_preflight persisted null). We resolve the
  // source from the asset record first and fill only the gaps from the probe.
  //
  // planPreflight then applies the PROCESSING-COMPATIBILITY gate (codec/10-bit/
  // HDR/filesize/bitrate/resolution — not resolution alone). An INCOMPATIBLE
  // master (multi-GB 4K HEVC/10-bit/HDR) cannot be safely processed on Fal, so we
  // STOP here — the trim itself is a Fal decode op that would 500 or emit an
  // undecodable clip — and flag it honestly rather than submit-and-fail.
  const assetMedia = readAssetSourceMedia(assetMeta);
  let falProbe: SourceProbe | null = null;
  if (metaModel) {
    try {
      const srcMetaResult = await runFalViaCc(
        cc,
        falRequestId,
        metaModel,
        buildMetadataInput(masterSigned.signedUrl),
      );
      // TEMPORARY RESEARCH — persist raw Fal metadata for the pinned
      // fixture only. Must run on the raw result, before extractVideoMeta
      // keeps only duration / fps / codec / container / width / height.
      // Removal: delete DEBUG_FAL_META_ASSET_IDS, persistDebugFalMeta,
      // and this call after the one-shot probe is read. No product change.
      await persistDebugFalMeta(admin, config.assetId, srcMetaResult);

      const svm = extractVideoMeta(srcMetaResult);
      if (svm) {
        // Fal metadata does not surface pixel_format / HDR tags today; they pass
        // through as null (preflight keeps HDR tags as-is when present).
        falProbe = {
          width: svm.width,
          height: svm.height,
          fps: svm.fps,
          codec: svm.codec,
          durationSec: svm.durationSec,
        };
      }
    } catch {
      // Probe is best-effort; the asset record remains the authority.
    }
  }
  const { source: resolvedSource } = resolveSourceProbe(assetMedia, falProbe);
  // planPreflight ALWAYS runs now (even when the probe is empty) so the metadata
  // block ALWAYS persists — never null again.
  const preflightPlan = planPreflight({
    source: resolvedSource,
    clip: { startSec: config.startSec, durationSec: config.durationSec },
    operation: config.width ? "scale" : "extract",
    ceilingLongEdge: preflightCeiling,
  });
  if (preflightPlan.needsProcessing) {
    // The incompatible master — Fal cannot safely process it. Report exactly what
    // production needs; do NOT submit a Fal op that will 500 / emit garbage. The
    // persisted status string stays "needs_transcode" for client back-compat
    // (ScrubProxyStatus / extract_status consumers); the block below records the
    // richer compatibility semantics.
    await patchMeta(admin, config.assetId, {
      extract_status: "needs_transcode",
      extract_session_id: extractionId,
      extract_preflight: preflightPlan.metadata,
      extract_preflight_transport: preflightPlan.transport,
      extract_preflight_needs_processing: true,
      extract_preflight_reason: preflightPlan.processingReason,
      extract_preflight_compatibility_reasons: preflightPlan.compatibilityReasons,
      // Versioned compatibility decision — queryable top-level mirrors of the block.
      extract_preflight_compatibility_version: preflightPlan.compatibilityVersion,
      extract_preflight_compatibility_result: preflightPlan.compatibilityResult,
      extract_preflight_compatibility_reason: preflightPlan.compatibilityReason,
      extract_preflight_recommended_action: preflightPlan.recommendedAction,
      // Live decision (not the skip-the-trim backfill) — clears any stale marker.
      extract_preflight_backfilled: false,
      // Deprecated alias key kept so existing readers of the old field still work.
      extract_preflight_transcode_reason: preflightPlan.processingReason,
      extract_preflight_warnings: preflightPlan.warnings,
      extract_error: null,
    });
    return json(200, {
      ok: true,
      status: "needs_transcode",
      extractionId,
      transport: preflightPlan.transport,
      needsProcessing: true,
      processingReason: preflightPlan.processingReason,
      compatibilityReasons: preflightPlan.compatibilityReasons,
      compatibilityVersion: preflightPlan.compatibilityVersion,
      compatibilityResult: preflightPlan.compatibilityResult,
      compatibilityReason: preflightPlan.compatibilityReason,
      recommendedAction: preflightPlan.recommendedAction,
      // Deprecated alias field for back-compat.
      transcodeReason: preflightPlan.processingReason,
      preflight: preflightPlan.metadata,
      warnings: preflightPlan.warnings,
    });
  }

  // Advertise the planned set up-front so the UI shows progress immediately. The
  // SQL-readable preflight metadata block is ALWAYS persisted (with
  // preflight_version), never conditional — the null-metadata bug is fixed here.
  await patchMeta(admin, config.assetId, {
    extract_status: "processing",
    extract_session_id: extractionId,
    extract_clip_path: clipPath,
    extract_clip_bucket: OUT_BUCKET,
    extract_manifest: buildManifest([], false),
    extract_repro: repro,
    extract_preflight: preflightPlan.metadata,
    extract_preflight_transport: preflightPlan.transport,
    extract_preflight_needs_processing: false,
    extract_preflight_compatibility_reasons: preflightPlan.compatibilityReasons,
    extract_preflight_compatibility_version: preflightPlan.compatibilityVersion,
    extract_preflight_compatibility_result: preflightPlan.compatibilityResult,
    extract_preflight_compatibility_reason: preflightPlan.compatibilityReason,
    extract_preflight_recommended_action: preflightPlan.recommendedAction,
    extract_preflight_warnings: preflightPlan.warnings,
    extract_preflight_backfilled: false,
    extract_error: null,
  });

  const finish = async () => {
    try {
      // 1. SEEK+TRIM on Fal — pulls ONLY the [start, start+duration] range. This
      //    is the step that dodges the whole-2 GB-HEVC decode scale-video died on.
      const trimResult = await runFalViaCc(
        cc,
        falRequestId,
        trimModel,
        buildTrimInput(masterSigned.signedUrl, config.startSec, config.durationSec),
      );
      const trimmedUrl = extractClipVideoUrl(trimResult);
      if (!trimmedUrl) throw new Error("trim_completed_without_video_url");

      // 2. PROBE the trimmed clip (best-effort) — codec drives whether we must
      //    re-encode so the browser can decode it; dims let a codec-only re-encode
      //    PRESERVE resolution (pixel-preservation rule); fps/codec kept for repro.
      let clipCodec: string | null = null;
      let probedW: number | null = null;
      let probedH: number | null = null;
      const reproOut: ExtractionRepro = { ...repro };
      if (metaModel) {
        try {
          const metaResult = await runFalViaCc(
            cc,
            falRequestId,
            metaModel,
            buildMetadataInput(trimmedUrl),
          );
          const vm = extractVideoMeta(metaResult);
          if (vm) {
            clipCodec = vm.codec;
            probedW = vm.width;
            probedH = vm.height;
            reproOut.clipCodec = vm.codec;
            reproOut.sourceFps = vm.fps;
          }
        } catch {
          /* probe is best-effort; proceed without it */
        }
      }

      // 3. NORMALIZE on the SMALL clip when dims are requested, OR the codec isn't
      //    browser-decodable (e.g. HEVC passthrough), OR THE PREFLIGHT PLAN ITSELF
      //    ASKED FOR IT (decideClipNormalize — see _shared/frameExtract.ts for why
      //    the plan's own intent must be an input). scale-video forces libx264.
      //    The output DIMS come from the shared preflight service — NOT computed
      //    ad-hoc here — so every op scales through the same rules: explicit
      //    caller dims win, else the preflight proxy dims (ceiling-bounded, aspect
      //    preserved, even), else the probed source dims (codec-only re-encode
      //    must NOT downsample). scale-video still clamps its own 512–2048 range.
      let finalUrl = trimmedUrl;
      const normalizeDecision = decideClipNormalize({
        dimsRequested: Boolean(config.width && config.height),
        clipCodec,
        planNeedsScale: preflightPlan.needsScale,
        planNeedsCodecNormalize: preflightPlan.needsCodecNormalize,
        planTransport: preflightPlan.transport,
      });
      if (normalizeDecision.normalize) {
        // preflightPlan is always defined; proxy dims are 0 when source dims were
        // unknown, so use || (not ??) to fall through a 0 to the probed clip dims.
        const w = config.width || preflightPlan.transform.proxyWidth || probedW || 1280;
        const h = config.height || preflightPlan.transform.proxyHeight || probedH || 720;
        if (!scaleModel) {
          // No scaler wired → record a PRECISE warning naming what actually asked
          // for the normalize, so an over-large or undecodable stored clip is
          // self-explaining; the client decode fails loudly rather than faking it.
          reproOut.mode = "trim_video";
          await patchMeta(admin, config.assetId, {
            extract_warning:
              `${normalizeDecision.reasons.join("; ")} (target ${w}x${h}) but ` +
              `CLIP_SCALE_FAL_MODEL is unset — clip stored as trimmed`,
          });
        } else {
          const scaleResult = await runFalViaCc(
            cc,
            falRequestId,
            scaleModel,
            buildScaleInput(finalUrl, w, h),
          );
          const scaledUrl = extractClipVideoUrl(scaleResult);
          if (!scaledUrl) throw new Error("scale_completed_without_video_url");
          finalUrl = scaledUrl;
          reproOut.mode = "trim_scale";
          reproOut.clipCodec = "h264";
        }
      }

      // 4. Store the small clip next to its frames (Lane C's whole-clip input).
      const dl = await fetch(finalUrl, { headers: { Accept: "video/*" } });
      if (!dl.ok) throw new Error(`clip_download_${dl.status}`);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from(OUT_BUCKET)
        .upload(clipPath, bytes, { contentType: "video/mp4", cacheControl: "3600", upsert: true });
      if (upErr) throw new Error(`clip_upload_failed: ${upErr.message}`);

      // 5. Clip ready → frames_pending. The client decodes this clip + uploads
      //    frames, then calls finalize to flip the manifest to "ready".
      const stored = await listStoredFrameIndices(admin, OUT_BUCKET, framePrefix).catch(() => []);
      const manifest = buildManifest(stored, true, reproOut);
      await patchMeta(admin, config.assetId, {
        extract_status: contiguousFromZero(stored) && stored.length ? "ready" : "frames_pending",
        extract_manifest: manifest,
        extract_clip_path: clipPath,
        extract_clip_bucket: OUT_BUCKET,
        extract_repro: reproOut,
      });
    } catch (err) {
      // Record the EXACT Fal error (e.g. fal_response_failed on the trim) so the
      // large-HEVC behaviour is observable — "report exactly what works". The
      // structured diagnostic (upstream fal_status, provider error, bounded
      // body/logs) is persisted alongside so account-block vs job-failure is
      // no longer inferred.
      const diag = toFalDiagnostic(err, { phase: "processing", ctx: { requestId: falRequestId } });
      await persistFalDiagnostic(admin, config.assetId, "extract", diag, {
        extract_status: "failed",
        extract_error: diag.message,
      });
    }
  };

  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (er && typeof er.waitUntil === "function") er.waitUntil(finish());
  else await finish();

  return json(200, {
    ok: true,
    status: "processing",
    extractionId,
    clipPath,
    clipBucket: OUT_BUCKET,
  });
});
