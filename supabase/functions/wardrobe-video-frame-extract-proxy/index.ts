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
//   CLIP_META_FAL_MODEL           — OPTIONAL. Source/clip probe
//                                    (fal-ai/ffmpeg-api/metadata) for repro + to
//                                    decide whether a re-encode is needed.
//   EXTRACT_MAX_FRAMES            — OPTIONAL OOM/cost cap (default 900).
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildExtractionManifest,
  buildMetadataInput,
  buildScaleInput,
  buildTrimInput,
  canonicalizeExtractConfig,
  contiguousFromZero,
  extractClipVideoUrl,
  extractFramePrefix,
  extractionIdForConfig,
  extractVideoMeta,
  frameIndexFromPath,
  isBrowserDecodableCodec,
  type ExtractConfig,
  type ExtractionManifest,
  type ExtractionRepro,
} from "../_shared/frameExtract.ts";

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

/** Submit one job to CC fal-run, poll to completion, return the raw result object. */
async function runFalViaCc(
  switchxUrl: string,
  pollUrl: string,
  proxySecret: string,
  model: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const submit = await fetch(switchxUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
    body: JSON.stringify({ action: "fal-run", model, input }),
  });
  const sub = await submit.json().catch(() => ({}));
  if (!submit.ok || !sub?.status_url || !sub?.response_url) {
    throw new Error(
      `fal_submit_${submit.status}(${model}): ${sub?.error ?? sub?.detail ?? JSON.stringify(sub).slice(0, 200)}`,
    );
  }
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(pollUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
      body: JSON.stringify({ status_url: sub.status_url, response_url: sub.response_url }),
    });
    const b = await resp.json().catch(() => ({}));
    const status = String(b?.status ?? "");
    if (status === "COMPLETED") return (b?.result ?? b) as Record<string, unknown>;
    if (status === "FAILED" || b?.error) {
      throw new Error(`fal_response_failed(${model}): ${b?.error ?? b?.detail ?? status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`fal_poll_timeout(${model})`);
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

  const switchxUrl = ccSwitchxUrl(composeCcUrl);
  const pollUrl = ccFalPollUrl(composeCcUrl);

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
    await patchMeta(admin, config.assetId, {
      extract_status: ready ? "ready" : "frames_pending",
      extract_session_id: extractionId,
      extract_manifest: manifest,
      extract_clip_path: clipPath,
      extract_clip_bucket: OUT_BUCKET,
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

  // Advertise the planned set up-front so the UI shows progress immediately.
  await patchMeta(admin, config.assetId, {
    extract_status: "processing",
    extract_session_id: extractionId,
    extract_clip_path: clipPath,
    extract_clip_bucket: OUT_BUCKET,
    extract_manifest: buildManifest([], false),
    extract_repro: repro,
    extract_error: null,
  });

  const finish = async () => {
    try {
      // 1. SEEK+TRIM on Fal — pulls ONLY the [start, start+duration] range. This
      //    is the step that dodges the whole-2 GB-HEVC decode scale-video died on.
      const trimResult = await runFalViaCc(
        switchxUrl,
        pollUrl,
        proxySecret,
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
            switchxUrl,
            pollUrl,
            proxySecret,
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

      // 3. NORMALIZE on the SMALL clip when dims are requested OR the codec isn't
      //    browser-decodable (e.g. HEVC passthrough). scale-video forces libx264.
      //    For a codec-only re-encode we target the PROBED source dims so we do
      //    NOT downsample (scale-video still clamps its 512–2048 range).
      let finalUrl = trimmedUrl;
      const dimsRequested = Boolean(config.width && config.height);
      const codecUndecodable = clipCodec !== null && !isBrowserDecodableCodec(clipCodec);
      if (dimsRequested || codecUndecodable) {
        const w = config.width ?? probedW ?? 1280;
        const h = config.height ?? probedH ?? 720;
        if (!scaleModel) {
          // Codec undecodable and no scaler wired → record a precise warning; the
          // client decode will fail loudly rather than fake a result.
          reproOut.mode = "trim_video";
          await patchMeta(admin, config.assetId, {
            extract_warning: `trimmed clip codec ${clipCodec ?? "unknown"} may not decode in-browser and CLIP_SCALE_FAL_MODEL is unset`,
          });
        } else {
          const scaleResult = await runFalViaCc(
            switchxUrl,
            pollUrl,
            proxySecret,
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
      // large-HEVC behaviour is observable — "report exactly what works".
      await patchMeta(admin, config.assetId, {
        extract_status: "failed",
        extract_error: String(err).slice(0, 400),
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
