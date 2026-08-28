// AVT edge function — wardrobe-video-propagate-proxy
//
// LANE A middle step of the LOCKED video garment-swap architecture
// (docs/VIDEO_SWAP_ARCHITECTURE.md §3). This REPLACES Phase 2b's per-frame
// independent swap with keyframe + temporal PROPAGATION:
//
//   extract (client) → generate approved Grok KEYFRAMES (existing
//   grok-image-garment-proxy) → [THIS: propagate garment across intermediates]
//   → reassemble (existing wardrobe-video-reassemble-proxy)
//
// Only the MIDDLE generation step changes vs. 2b. Frame extract, ordered storage,
// Fal-via-CC routing, bounded concurrency, status tracking, and reassembly are
// reused. See §4 ("Phase 2b — what to keep").
//
// WHAT IT DOES:
//   1. Places each APPROVED keyframe image at its frame index (source of truth).
//   2. For every intermediate frame, PROPAGATES the bracketing keyframe garment
//      via the ENV-SELECTABLE propagation engine (_shared/propagation.ts):
//        - fal-flow / fal-v2v : CC fal-run on PROPAGATION_FAL_MODEL (a Fal
//          optical-flow / warp / EbSynth-equivalent or video-native model).
//        - nearest-keyframe   : DIAGNOSTIC — copies the nearest keyframe (no
//          warp), to exercise the full plumbing before a flow model is wired.
//        - disabled (default) : BLOCKS with a precise "what to wire" reason.
//          It does NOT fake temporal consistency.
//   3. Detects FLOW BREAKS (_shared/flowBreak.ts) from optional per-frame
//      metrics and reports the indices that need a fresh Grok keyframe. Those
//      frames are left BLOCKED (not faked); the caller regenerates a keyframe
//      there and re-invokes — this fn skips already-completed frames (resume).
//
// ENGINEERING PREREQS honored (§6): per-frame PERSISTED status + retries +
// resume + skip-completed (no fail-fast); reproducibility metadata recorded;
// true output ext preserved (not always .jpg).
//
// Env:
//   COMPOSE_LOOK_CC_URL              — CC base (…/compose-look); tail swapped
//   SWITCHX_PROXY_SECRET | COMPOSE_LOOK_PROXY_SECRET — CC proxy secret
//   WARDROBE_PROP_ENGINE             — fal-flow | fal-v2v | nearest-keyframe | disabled
//   PROPAGATION_FAL_MODEL            — Fal model id for the fal-* modes (CC allowlisted)
//   PROPAGATE_CONCURRENCY            — OPTIONAL parallel frames (default 4)
//   PROPAGATE_MAX_RETRIES            — OPTIONAL per-frame retries (default 2)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { vtonCategoryForFeatureType } from "../_shared/garmentReference.ts";
import { assignSegments, type FrameSegment } from "../_shared/keyframePlan.ts";
import { planReanchors, type FlowMetrics } from "../_shared/flowBreak.ts";
import {
  buildPropagationBody,
  engineBlockReason,
  extractPropagatedImageUrl,
  isEngineActive,
  propagatedFrameName,
  propagatedFramePrefix,
  resolvePropagationEngine,
} from "../_shared/propagation.ts";
import {
  type CcEndpoints,
  type FalCallContext,
  falPoll,
  falSubmit,
  persistFalDiagnostic,
  toFalDiagnostic,
} from "../_shared/falDiagnostics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 3000;
const POLL_INTERVAL_MS = 4000;
const PER_FRAME_TIMEOUT_MS = 5 * 60 * 1000;
const SIGN_CHUNK = 100;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_RETRIES = 2;
const OUT_BUCKET = "project-exports";

type KeyframeRef = { index: number; path: string; bucket?: string };

type Body = {
  assetId?: string;
  sessionId?: string;
  framePaths?: string[];
  frameBucket?: string;
  keyframes?: KeyframeRef[];
  artistId?: string;
  wardrobeFeatureId?: string;
  /** Optional per-frame flow metrics driving flow-break re-anchor detection. */
  flowMetrics?: FlowMetrics[];
  /** Recorded for reproducibility; the keyframe set is authoritative. */
  cadenceFrames?: number;
};

type FrameState = {
  status: "done" | "blocked_no_engine" | "blocked_reanchor" | "failed";
  kind?: "keyframe" | "propagated" | "diagnostic";
  ext?: string;
  reasons?: string[];
  error?: string;
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

function sniffExt(buf: Uint8Array): "jpg" | "png" | "webp" {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45
  ) return "webp";
  return "jpg";
}
function contentTypeFor(ext: string): string {
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

async function signInOrder(
  admin: any,
  bucket: string,
  paths: string[],
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < paths.length; i += SIGN_CHUNK) {
    const chunk = paths.slice(i, i + SIGN_CHUNK);
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(chunk, SIGN_TTL);
    if (error) throw new Error(`frame_sign_failed: ${error.message}`);
    for (let j = 0; j < chunk.length; j++) {
      const row = data?.[j];
      if (!row?.signedUrl) throw new Error(`frame_sign_missing: ${chunk[j]}`);
      out.push(row.signedUrl);
    }
  }
  return out;
}

/**
 * Submit one propagation job to CC, poll to completion, return the image URL.
 * Built on the shared falSubmit/falPoll so a submit/poll/job failure throws a
 * FalDiagnosticError carrying the full structured diagnostic for THIS frame.
 */
async function propagateViaCc(
  cc: CcEndpoints,
  ctx: FalCallContext,
  body: Record<string, unknown>,
): Promise<string> {
  const queue = await falSubmit(cc, ctx, body);
  const result = await falPoll(cc, ctx, queue);
  const url = extractPropagatedImageUrl(result);
  if (!url) throw new Error("propagate_completed_without_image_url");
  return url;
}

async function readMeta(
  admin: any,
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
  admin: any,
  assetId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const current = await readMeta(admin, assetId);
  await admin.from("project_assets").update({ metadata_json: { ...current, ...patch } }).eq("id", assetId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const composeCcUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret =
    Deno.env.get("SWITCHX_PROXY_SECRET")?.trim() ||
    Deno.env.get("COMPOSE_LOOK_PROXY_SECRET")?.trim() ||
    "";
  const concurrency = Math.max(1, Number(Deno.env.get("PROPAGATE_CONCURRENCY")) || DEFAULT_CONCURRENCY);
  const maxRetries = Math.max(0, Number(Deno.env.get("PROPAGATE_MAX_RETRIES")) || DEFAULT_MAX_RETRIES);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!composeCcUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }

  const engine = resolvePropagationEngine((k) => Deno.env.get(k));

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "missing_bearer" });
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
  const keyframes = Array.isArray(body.keyframes) ? body.keyframes.filter((k) => k && typeof k.index === "number" && k.path) : [];
  if (!body.assetId) return json(400, { error: "missing_asset_id" });
  if (!body.sessionId) return json(400, { error: "missing_session_id" });
  if (!body.artistId || !body.wardrobeFeatureId) return json(400, { error: "missing_artist_or_wardrobe" });
  if (framePaths.length === 0) return json(400, { error: "no_frames" });
  if (keyframes.length === 0) return json(400, { error: "no_keyframes" });

  const { data: asset, error: aErr } = await admin
    .from("project_assets")
    .select("id, user_id")
    .eq("id", body.assetId)
    .maybeSingle();
  if (aErr) return json(500, { error: "asset_query_failed", detail: aErr.message });
  if (!asset) return json(404, { error: "asset_not_found" });
  if (asset.user_id !== userId) return json(403, { error: "not_owner" });

  const frameBucket = body.frameBucket || OUT_BUCKET;
  if (framePaths.some((p) => !p.startsWith(`${userId}/`))) {
    return json(403, { error: "frame_path_not_owned" });
  }
  if (keyframes.some((k) => !k.path.startsWith(`${userId}/`))) {
    return json(403, { error: "keyframe_path_not_owned" });
  }

  const frameCount = framePaths.length;
  const keyframeIndices = [...new Set(keyframes.map((k) => k.index))].sort((a, b) => a - b);
  // Lane A requires both ends anchored so no intermediate extrapolates past a
  // real keyframe (assignSegments enforces this — surface it as a 400).
  if (keyframeIndices[0] !== 0 || keyframeIndices[keyframeIndices.length - 1] !== frameCount - 1) {
    return json(400, {
      error: "keyframes_must_cover_ends",
      detail: `first=${keyframeIndices[0]} last=${keyframeIndices[keyframeIndices.length - 1]} need 0..${frameCount - 1}`,
    });
  }

  let segments: FrameSegment[];
  try {
    segments = assignSegments(keyframeIndices, frameCount);
  } catch (err) {
    return json(400, { error: "segment_plan_failed", detail: String(err).slice(0, 200) });
  }

  // Flow-break → which frames need a fresh Grok keyframe (not covered yet).
  const reanchor = planReanchors(body.flowMetrics ?? [], keyframeIndices);
  const reanchorSet = new Set(reanchor.reanchorAt);

  // Garment description (metadata + engine hint).
  const { data: wardrobe } = await admin
    .from("character_features")
    .select("id, artist_id, feature_type, label")
    .eq("id", body.wardrobeFeatureId)
    .maybeSingle();
  if (!wardrobe || wardrobe.artist_id !== body.artistId) return json(404, { error: "wardrobe_not_found" });
  const garmentDescription = String(wardrobe.label ?? "garment");
  const category = vtonCategoryForFeatureType(String(wardrobe.feature_type));

  const cc: CcEndpoints = {
    switchxUrl: ccSwitchxUrl(composeCcUrl),
    pollUrl: ccFalPollUrl(composeCcUrl),
    proxySecret,
  };
  const prefix = propagatedFramePrefix(userId, asset.id, body.sessionId);

  // Resume: load any prior per-frame status for this session and skip completed.
  const priorMeta = await readMeta(admin, asset.id);
  const priorSession = String(priorMeta.propagate_session_id ?? "");
  const frameState: Record<number, FrameState> =
    priorSession === body.sessionId
      ? ((priorMeta.propagate_frames ?? {}) as Record<number, FrameState>)
      : {};

  const engineLabel = isEngineActive(engine)
    ? engine.mode === "fal-flow" || engine.mode === "fal-v2v"
      ? `${engine.mode}:${engine.falModel}`
      : engine.mode
    : `${engine.mode}(inactive)`;

  await patchMeta(admin, asset.id, {
    propagate_status: "processing",
    propagate_session_id: body.sessionId,
    propagate_prefix: prefix,
    propagate_bucket: OUT_BUCKET,
    propagate_engine: engineLabel,
    propagate_frame_total: frameCount,
    propagate_keyframe_indices: keyframeIndices,
    propagate_reanchor_needed: reanchor.reanchorAt,
    propagate_reanchor_reasons: reanchor.reasons,
    // Reproducibility metadata (§6 #4).
    propagate_repro: {
      engine_mode: engine.mode,
      fal_model: engine.falModel ?? null,
      wardrobe_feature_id: body.wardrobeFeatureId,
      garment_description: garmentDescription,
      category,
      cadence_frames: body.cadenceFrames ?? null,
      keyframe_count: keyframeIndices.length,
      frame_total: frameCount,
      transfer_mode: "keyframe_propagation_lane_a",
    },
    propagate_error: null,
  });

  // Sign original frames (composite base / flow target) once.
  let frameUrls: string[];
  try {
    frameUrls = await signInOrder(admin, frameBucket, framePaths);
  } catch (err) {
    await patchMeta(admin, asset.id, { propagate_status: "failed", propagate_error: String(err).slice(0, 200) });
    return json(500, { error: "frame_sign_failed", detail: String(err).slice(0, 200) });
  }

  // Sign + fetch each keyframe image (source-of-truth garment pixels) once.
  const keyframeUrlByIndex = new Map<number, string>();
  for (const kf of keyframes) {
    const bucket = kf.bucket || "look-composites";
    const { data } = await admin.storage.from(bucket).createSignedUrl(kf.path, SIGN_TTL);
    if (data?.signedUrl) keyframeUrlByIndex.set(kf.index, data.signedUrl);
  }
  for (const idx of keyframeIndices) {
    if (!keyframeUrlByIndex.has(idx)) {
      await patchMeta(admin, asset.id, {
        propagate_status: "failed",
        propagate_error: `keyframe_sign_failed_index_${idx}`,
      });
      return json(500, { error: "keyframe_sign_failed", detail: `index ${idx}` });
    }
  }

  // Serialized status persist (avoids racy read-modify-write under concurrency).
  let flushChain: Promise<void> = Promise.resolve();
  const persistFrame = (i: number, state: FrameState): Promise<void> => {
    frameState[i] = state;
    flushChain = flushChain.then(() =>
      patchMeta(admin, asset.id, { propagate_frames: frameState }).catch(() => {})
    );
    return flushChain;
  };

  async function storeImageFromUrl(url: string, index: number): Promise<string> {
    const dl = await fetch(url, { headers: { Accept: "image/*" } });
    if (!dl.ok) throw new Error(`download_${dl.status} (frame ${index})`);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const ext = sniffExt(bytes);
    const outPath = `${prefix}${propagatedFrameName(index, ext)}`;
    const { error: upErr } = await admin.storage
      .from(OUT_BUCKET)
      .upload(outPath, bytes, { contentType: contentTypeFor(ext), cacheControl: "3600", upsert: true });
    if (upErr) throw new Error(`upload_failed (frame ${index}): ${upErr.message}`);
    return ext;
  }

  const finish = async () => {
    try {
      let nextIdx = 0;
      let fatal: Error | null = null;

      const processFrame = async (seg: FrameSegment): Promise<void> => {
        const i = seg.index;
        // Resume: skip frames already completed for this session.
        const prior = frameState[i];
        if (prior?.status === "done") return;

        // Keyframe → place the approved image directly (garment source of truth).
        if (seg.isKeyframe) {
          const kfUrl = keyframeUrlByIndex.get(i)!;
          const ext = await storeImageFromUrl(kfUrl, i);
          await persistFrame(i, { status: "done", kind: "keyframe", ext });
          return;
        }

        // Flow broke here and no keyframe covers it → BLOCK, do not fake.
        if (reanchorSet.has(i)) {
          await persistFrame(i, {
            status: "blocked_reanchor",
            reasons: reanchor.reasons[i] ?? ["flow_break"],
          });
          return;
        }

        // No usable engine → BLOCK with the precise reason. Never fabricate.
        if (!isEngineActive(engine)) {
          await persistFrame(i, {
            status: "blocked_no_engine",
            reasons: [engineBlockReason(engine) ?? "propagation_engine_unavailable"],
          });
          return;
        }

        // Diagnostic: copy the nearest approved keyframe (NO warp). Exercises the
        // plumbing end-to-end before a real flow model exists — it will visibly
        // pop at keyframe boundaries; that pop is the diagnostic signal.
        if (engine.mode === "nearest-keyframe") {
          const nearUrl = keyframeUrlByIndex.get(seg.nearestKeyframe)!;
          const ext = await storeImageFromUrl(nearUrl, i);
          await persistFrame(i, { status: "done", kind: "diagnostic", ext });
          return;
        }

        // Real propagation: warp bracketing keyframe garment onto original frame.
        const reqBody = buildPropagationBody({
          originalFrameUrl: frameUrls[i],
          prevKeyframeUrl: keyframeUrlByIndex.get(seg.prevKeyframe)!,
          nextKeyframeUrl: keyframeUrlByIndex.get(seg.nextKeyframe) ?? null,
          t: seg.t,
          garmentDescription,
          engine,
        });

        let lastErr: Error | null = null;
        let attempts = 0;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          attempts = attempt;
          try {
            const ctx: FalCallContext = {
              model: engine.falModel ?? null,
              requestId: `${asset.id}:${body.sessionId}`,
              label: `propagate:frame_${i}`,
              pollIntervalMs: POLL_INTERVAL_MS,
              pollTimeoutMs: PER_FRAME_TIMEOUT_MS,
              retryCount: attempt,
            };
            const outUrl = await propagateViaCc(cc, ctx, reqBody);
            const ext = await storeImageFromUrl(outUrl, i);
            await persistFrame(i, { status: "done", kind: "propagated", ext });
            return;
          } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
          }
        }
        // Per-frame failure does NOT kill the job (no fail-fast, §6 #1). Persist
        // the structured diagnostic (best-effort) so a Fal account-block /
        // provider error is visible even though the job continues.
        const diag = toFalDiagnostic(lastErr, {
          phase: "processing",
          ctx: {
            model: engine.falModel ?? null,
            requestId: `${asset.id}:${body.sessionId}`,
            label: `propagate:frame_${i}`,
            retryCount: attempts,
          },
        });
        await persistFalDiagnostic(admin, asset.id, "propagate", diag);
        await persistFrame(i, { status: "failed", error: diag.message });
      };

      const worker = async () => {
        while (!fatal) {
          const k = nextIdx++;
          if (k >= segments.length) return;
          try {
            await processFrame(segments[k]);
          } catch (err) {
            // Only infra-level errors (storage down) become fatal; per-frame
            // engine failures are captured inside processFrame.
            fatal ??= err instanceof Error ? err : new Error(String(err));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, segments.length) }, () => worker()));
      await flushChain;
      if (fatal) throw fatal;

      // Rollup.
      const states = segments.map((s) => frameState[s.index]?.status);
      const done = states.filter((s) => s === "done").length;
      const blocked = states.filter((s) => s === "blocked_no_engine" || s === "blocked_reanchor").length;
      const failed = states.filter((s) => s === "failed").length;
      const complete = done === frameCount;
      await patchMeta(admin, asset.id, {
        propagate_status: complete ? "ready" : "incomplete",
        propagate_prefix: prefix,
        propagate_bucket: OUT_BUCKET,
        propagate_done_count: done,
        propagate_blocked_count: blocked,
        propagate_failed_count: failed,
      });
    } catch (err) {
      const diag = toFalDiagnostic(err, {
        phase: "processing",
        ctx: { model: engine.falModel ?? null, requestId: `${asset.id}:${body.sessionId}`, label: "propagate" },
      });
      await persistFalDiagnostic(admin, asset.id, "propagate", diag, {
        propagate_status: "failed",
        propagate_error: diag.message,
      });
    }
  };

  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er && typeof er.waitUntil === "function") er.waitUntil(finish());
  else await finish();

  return json(200, {
    ok: true,
    status: "processing",
    assetId: asset.id,
    sessionId: body.sessionId,
    prefix,
    bucket: OUT_BUCKET,
    frameCount,
    keyframeIndices,
    reanchorNeeded: reanchor.reanchorAt,
    engine: engineLabel,
    engineActive: isEngineActive(engine),
    engineBlockReason: isEngineActive(engine) ? null : engineBlockReason(engine),
  });
});
