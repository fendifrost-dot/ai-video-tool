// AVT edge function — wardrobe-video-swap-proxy
//
// Phase 2b. Runs the per-frame garment swap across an extracted frame sequence,
// REFERENCE-LOCKED to one approved garment image so every frame gets the exact
// same outfit. Sits between Phase 2a's extract and reassemble:
//
//   extract (client WebCodecs) → [THIS] per-frame swap → reassemble (compose)
//
// Transport is the existing CC `switchx-restyle` endpoint. Each frame's swap runs
// either via the already-allowlisted `vton-frame` action (DEFAULT — no new CC
// allowlist) or, when FRAME_SWAP_FAL_MODEL is set, via `fal-run` on that model.
// Both are single-image (see _shared/frameSwap.ts): switchx-restyle holds no
// cross-frame state, so consistency comes from the LOCKED reference, not the
// engine. Frames are polled via CC `fal-queue-poll`, downloaded, and written to
// project-exports so the reassemble step consumes them exactly like raw frames.
//
// Pattern mirrors make-scrub-proxy-proxy / wardrobe-video-reassemble-proxy
// (dispatch → EdgeRuntime.waitUntil → poll → download → upload → patch row),
// batched over frames with bounded concurrency.
//
// Env:
//   COMPOSE_LOOK_CC_URL           — CC base (…/compose-look); we swap the tail
//   SWITCHX_PROXY_SECRET | COMPOSE_LOOK_PROXY_SECRET — CC proxy secret
//   FRAME_SWAP_FAL_MODEL          — OPTIONAL Fal model for the fal-run path
//                                    (must be in CC's fal-run allowlist). Unset
//                                    → the vton-frame action (IDM-VTON). Input is
//                                    shaped PER TRY-ON FAMILY by _shared/frameSwap
//                                    (Kolors / FASHN / IDM-generic) — this is the
//                                    LANE B keyframe-mapper path; those engines are
//                                    still-image (no temporal state), see
//                                    docs/LANE_B_VIDEO_VTON_BENCHMARK.md.
//   FRAME_SWAP_CONCURRENCY        — OPTIONAL parallel frames (default 6)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  pickFullLookGarmentPath,
  pickVtonGarmentPath,
  vtonCategoryForFeatureType,
} from "../_shared/garmentReference.ts";
import {
  buildFrameSwapBody,
  extractSwapImageUrl,
  swappedFrameName,
  swappedFramePrefix,
  type FrameSwapEngine,
} from "../_shared/frameSwap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 3000;
const POLL_INTERVAL_MS = 4000;
const PER_FRAME_TIMEOUT_MS = 5 * 60 * 1000;
const SIGN_CHUNK = 100;
const DEFAULT_CONCURRENCY = 6;
const SWAPPED_BUCKET = "project-exports";

type Body = {
  assetId?: string;
  sessionId?: string;
  framePaths?: string[];
  frameBucket?: string;
  artistId?: string;
  wardrobeFeatureId?: string;
  transferMode?: "full_look" | "jacket_only";
  vtonModel?: "idm-vton" | "cat-vton";
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

async function signInOrder(
  admin: ReturnType<typeof createClient>,
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

/** Submit one frame's swap to CC, poll to completion, return the swapped image URL. */
async function swapOneFrame(
  switchxUrl: string,
  pollUrl: string,
  proxySecret: string,
  humanUrl: string,
  garmentUrl: string,
  category: string,
  garmentDescription: string,
  engine: FrameSwapEngine,
): Promise<string> {
  const submit = await fetch(switchxUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
    body: JSON.stringify(
      buildFrameSwapBody({ humanImageUrl: humanUrl, garmentImageUrl: garmentUrl, category, garmentDescription, engine }),
    ),
  });
  const sub = await submit.json().catch(() => ({}));
  if (!submit.ok || !sub?.status_url || !sub?.response_url) {
    throw new Error(`swap_submit_${submit.status}: ${sub?.error ?? JSON.stringify(sub).slice(0, 160)}`);
  }
  const deadline = Date.now() + PER_FRAME_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(pollUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
      body: JSON.stringify({ status_url: sub.status_url, response_url: sub.response_url }),
    });
    const b = await resp.json().catch(() => ({}));
    const status = String(b?.status ?? "");
    if (status === "COMPLETED") {
      const url = extractSwapImageUrl((b?.result ?? b) as Record<string, unknown>);
      if (url) return url;
      throw new Error("swap_completed_without_image_url");
    }
    if (status === "FAILED" || b?.error) {
      throw new Error(`swap_failed: ${b?.error ?? b?.detail ?? status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("swap_poll_timeout");
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
  const falModel = Deno.env.get("FRAME_SWAP_FAL_MODEL")?.trim() || null;
  const concurrency = Math.max(1, Number(Deno.env.get("FRAME_SWAP_CONCURRENCY")) || DEFAULT_CONCURRENCY);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!composeCcUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }

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
  if (!body.assetId) return json(400, { error: "missing_asset_id" });
  if (!body.sessionId) return json(400, { error: "missing_session_id" });
  if (!body.artistId || !body.wardrobeFeatureId) return json(400, { error: "missing_artist_or_wardrobe" });
  if (framePaths.length === 0) return json(400, { error: "no_frames" });

  const { data: asset, error: aErr } = await admin
    .from("project_assets")
    .select("id, user_id")
    .eq("id", body.assetId)
    .maybeSingle();
  if (aErr) return json(500, { error: "asset_query_failed", detail: aErr.message });
  if (!asset) return json(404, { error: "asset_not_found" });
  if (asset.user_id !== userId) return json(403, { error: "not_owner" });

  const frameBucket = body.frameBucket || SWAPPED_BUCKET;
  if (framePaths.some((p) => !p.startsWith(`${userId}/`))) {
    return json(403, { error: "frame_path_not_owned" });
  }

  // Resolve + sign the garment reference ONCE — this is the reference-lock.
  const { data: wardrobe, error: wErr } = await admin
    .from("character_features")
    .select("id, artist_id, feature_type, label, file_url, storage_path, reference_images")
    .eq("id", body.wardrobeFeatureId)
    .maybeSingle();
  if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
  if (!wardrobe || wardrobe.artist_id !== body.artistId) return json(404, { error: "wardrobe_not_found" });

  const refImages = Array.isArray(wardrobe.reference_images) ? wardrobe.reference_images : [];
  const transferMode = body.transferMode ?? "jacket_only";
  const pick = transferMode === "full_look" ? pickFullLookGarmentPath : pickVtonGarmentPath;
  const garmentPath = pick(refImages, wardrobe.storage_path ?? wardrobe.file_url);
  if (!garmentPath) return json(404, { error: "wardrobe_no_image" });

  const { data: gSigned, error: gErr } = await admin.storage
    .from("wardrobe-refs")
    .createSignedUrl(garmentPath, SIGN_TTL);
  let garmentUrl = gSigned?.signedUrl ?? null;
  if (!garmentUrl && gErr) {
    const { data: alt } = await admin.storage.from("product-assets").createSignedUrl(garmentPath, SIGN_TTL);
    garmentUrl = alt?.signedUrl ?? null;
  }
  if (!garmentUrl) return json(500, { error: "garment_sign_failed" });

  const category = vtonCategoryForFeatureType(String(wardrobe.feature_type));
  const garmentDescription = String(wardrobe.label ?? "garment");
  const engine: FrameSwapEngine = { falModel, vtonModel: body.vtonModel ?? "idm-vton" };

  let frameUrls: string[];
  try {
    frameUrls = await signInOrder(admin, frameBucket, framePaths);
  } catch (err) {
    return json(500, { error: "frame_sign_failed", detail: String(err).slice(0, 200) });
  }

  const switchxUrl = ccSwitchxUrl(composeCcUrl);
  const pollUrl = ccFalPollUrl(composeCcUrl);
  const prefix = swappedFramePrefix(userId, asset.id, body.sessionId);

  await patchMeta(admin, asset.id, {
    swap_status: "processing",
    swap_session_id: body.sessionId,
    swap_swapped_prefix: prefix,
    swap_swapped_bucket: SWAPPED_BUCKET,
    swap_engine: falModel ? `fal-run:${falModel}` : `vton-frame:${engine.vtonModel}`,
    swap_transfer_mode: transferMode,
    swap_frame_total: framePaths.length,
    swap_error: null,
  });

  const finish = async () => {
    try {
      let nextIndex = 0;
      let failure: Error | null = null;
      const worker = async () => {
        while (!failure) {
          const i = nextIndex++;
          if (i >= frameUrls.length) return;
          const swappedUrl = await swapOneFrame(
            switchxUrl, pollUrl, proxySecret,
            frameUrls[i], garmentUrl!, category, garmentDescription, engine,
          );
          const dl = await fetch(swappedUrl, { headers: { Accept: "image/*" } });
          if (!dl.ok) throw new Error(`swapped_download_${dl.status} (frame ${i})`);
          const bytes = new Uint8Array(await dl.arrayBuffer());
          const ext = sniffExt(bytes);
          // Name is index-aligned + always .jpg so the reassemble step can
          // reconstruct the ordered path set from prefix + index alone.
          const outPath = `${prefix}${swappedFrameName(i)}`;
          const { error: upErr } = await admin.storage
            .from(SWAPPED_BUCKET)
            .upload(outPath, bytes, {
              contentType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
              cacheControl: "3600",
              upsert: true,
            });
          if (upErr) throw new Error(`swapped_upload_failed (frame ${i}): ${upErr.message}`);
        }
      };
      try {
        await Promise.all(
          Array.from({ length: Math.min(concurrency, frameUrls.length) }, () =>
            worker().catch((e) => {
              failure ??= e instanceof Error ? e : new Error(String(e));
            }),
          ),
        );
      } catch (e) {
        failure ??= e instanceof Error ? e : new Error(String(e));
      }
      if (failure) throw failure;

      await patchMeta(admin, asset.id, {
        swap_status: "ready",
        swap_swapped_prefix: prefix,
        swap_swapped_bucket: SWAPPED_BUCKET,
        swap_frame_count: framePaths.length,
      });
    } catch (err) {
      await patchMeta(admin, asset.id, {
        swap_status: "failed",
        swap_error: String(err).slice(0, 300),
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
    swappedPrefix: prefix,
    swappedBucket: SWAPPED_BUCKET,
    frameCount: framePaths.length,
    engine: falModel ? `fal-run:${falModel}` : `vton-frame:${engine.vtonModel}`,
  });
});
