// AVT edge function — wardrobe-video-lucy-proxy
//
// LANE C — Decart Lucy video-native video-to-video (BATCH) benchmark lane.
// docs/LANE_C_LUCY_VIDEO_VTON.md (authoritative) + docs/VIDEO_SWAP_ARCHITECTURE.md
// §5 (Lane B option b: "video-native VTON / video-to-video model").
//
// WHAT THIS IS. A whole-clip garment edit: one prerecorded mp4 in, one mp4 out,
// through Decart's `decart/lucy-edit/*` | `decart/lucy-restyle` on Fal — reached
// via CC `fal-run` submit + `fal-queue-poll`, the exact transport AVT already
// speaks (mirrors make-scrub-proxy-proxy: submit → EdgeRuntime.waitUntil poll →
// download → upload → patch row). Lucy is temporally native, so there is NO
// per-frame loop and NO "boiling" by construction — that is the whole reason to
// benchmark it against Lane A (keyframe+propagation) and Lane B (per-frame VTON).
//
// WHAT THIS IS NOT (read before using). The batch Lucy family is PROMPT-DRIVEN:
// the garment is described in TEXT, not supplied as the SL-bomber image. It
// therefore REGENERATES garment pixels and CANNOT satisfy the hard product rule
// "No AI-regeneration of garment imagery; pixel preservation is mandatory"
// (CLAUDE.md). It is EXPECTED to fail the construction+stripe half of the kill
// criterion (arch §7) while (uniquely) passing the temporal-consistency half.
// This lane is a BENCHMARK / DIAGNOSTIC, never the shippable product swap. The
// only Lucy endpoints that take a garment IMAGE (reference_image_url) are
// realtime WebRTC (decart/lucy2-vton/realtime, decart/lucy-2-5/realtime) and need
// a custom wrapper — see the doc; this function deliberately does NOT fake that.
//
// REVERSIBLE: with LUCY_V2V_FAL_MODEL unset this function fails loud (500) and is
// simply never invoked — it adds no behaviour to any existing lane.
//
// Env:
//   COMPOSE_LOOK_CC_URL           — CC base (…/compose-look); tail swapped
//   SWITCHX_PROXY_SECRET | COMPOSE_LOOK_PROXY_SECRET — CC proxy secret
//   LUCY_V2V_FAL_MODEL            — REQUIRED. A batch Lucy model id, allowlisted on
//                                   CC fal-run. e.g. decart/lucy-edit/fast (cheap),
//                                   decart/lucy-edit/pro, or decart/lucy-restyle
//                                   (≤10-min clips). A /realtime slug is REFUSED.
//   LUCY_V2V_RESOLUTION           — OPTIONAL "720p" (pro/restyle only).
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { vtonCategoryForFeatureType } from "../_shared/garmentReference.ts";
import {
  buildGarmentEditPrompt,
  buildLucyV2vBody,
  classifyLucyTransport,
  extractLucyVideoUrl,
} from "../_shared/lucyV2v.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 3000;
const POLL_INTERVAL_MS = 5000;
// Lucy v2v renders at ~video-length; a 2–4s benchmark clip is quick, but restyle
// allows ≤10-min clips. Stay under the edge background cap.
const POLL_TIMEOUT_MS = 12 * 60 * 1000;
const OUT_BUCKET = "project-exports";

type Body = {
  assetId?: string;
  artistId?: string;
  wardrobeFeatureId?: string;
  /** Override the auto-built garment-edit prompt (advanced / benchmark tuning). */
  prompt?: string;
  transferMode?: "full_look" | "jacket_only";
  /** Distinct session id so repeated benchmark runs don't collide. */
  sessionId?: string;
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

/** Storage bucket a project_assets row lives in (lockstep w/ client bucketForAssetType). */
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

async function pollFalViaCc(
  pollUrl: string,
  proxySecret: string,
  statusUrl: string,
  responseUrl: string,
): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(pollUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
      body: JSON.stringify({ status_url: statusUrl, response_url: responseUrl }),
    });
    const body = await resp.json().catch(() => ({}));
    const status = String(body?.status ?? "");
    if (status === "COMPLETED") {
      const url = extractLucyVideoUrl((body?.result ?? body) as Record<string, unknown>);
      if (url) return url;
      throw new Error("lucy_completed_without_video_url");
    }
    if (status === "FAILED" || body?.error) {
      throw new Error(`lucy_failed: ${body?.error ?? body?.detail ?? status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("lucy_poll_timeout");
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
  const falModel = Deno.env.get("LUCY_V2V_FAL_MODEL")?.trim() ?? "";
  const resolutionEnv = Deno.env.get("LUCY_V2V_RESOLUTION")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!composeCcUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }
  if (!falModel) {
    // Fail loud rather than guess a Fal model id (same posture as
    // make-scrub-proxy-proxy's SCRUB_PROXY_FAL_MODEL). Lane C is off until set.
    return json(500, { error: "server_misconfigured", detail: "missing_LUCY_V2V_FAL_MODEL" });
  }
  // A /realtime slug can never be driven by submit/poll — refuse at the door so a
  // misconfig can't hang or 422 on Fal. The reference-image VTON path is a
  // documented WebRTC wrapper, not this function.
  const transport = classifyLucyTransport(falModel);
  if (transport !== "batch") {
    return json(500, {
      error: "server_misconfigured",
      detail:
        transport === "realtime"
          ? `LUCY_V2V_FAL_MODEL=${falModel} is a realtime WebRTC endpoint; batch submit/poll ` +
            "cannot drive it. Use decart/lucy-edit/{pro,dev,fast} or decart/lucy-restyle. " +
            "See docs/LANE_C_LUCY_VIDEO_VTON.md."
          : `LUCY_V2V_FAL_MODEL=${falModel} is not a known batch Lucy model`,
    });
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
  if (!body?.assetId) return json(400, { error: "missing_asset_id" });
  if (!body?.artistId || !body?.wardrobeFeatureId) {
    return json(400, { error: "missing_artist_or_wardrobe" });
  }

  const { data: asset, error: aErr } = await admin
    .from("project_assets")
    .select("id, user_id, asset_type, file_url, metadata_json")
    .eq("id", body.assetId)
    .maybeSingle();
  if (aErr) return json(500, { error: "asset_query_failed", detail: aErr.message });
  if (!asset) return json(404, { error: "asset_not_found" });
  if (asset.user_id !== userId) return json(403, { error: "not_owner" });

  const assetMeta = (asset.metadata_json ?? {}) as Record<string, unknown>;
  const fileUrl = String(asset.file_url ?? "");
  if (!looksLikeVideo(fileUrl, assetMeta.mime_type)) return json(400, { error: "not_a_video" });

  // Resolve the wardrobe item — used ONLY to name the garment in the text prompt
  // (batch Lucy takes no image). We record the id for reproducibility/audit.
  const { data: wardrobe, error: wErr } = await admin
    .from("character_features")
    .select("id, artist_id, feature_type, label")
    .eq("id", body.wardrobeFeatureId)
    .maybeSingle();
  if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
  if (!wardrobe || wardrobe.artist_id !== body.artistId) return json(404, { error: "wardrobe_not_found" });

  const category = vtonCategoryForFeatureType(String(wardrobe.feature_type));
  const prompt =
    (typeof body.prompt === "string" && body.prompt.trim()) ||
    buildGarmentEditPrompt(String(wardrobe.label ?? "garment"), category);

  const masterBucket = bucketForAssetType(String(asset.asset_type));
  const { data: signed, error: signErr } = await admin.storage
    .from(masterBucket)
    .createSignedUrl(fileUrl, SIGN_TTL);
  if (signErr || !signed?.signedUrl) {
    return json(500, { error: "master_sign_failed", detail: signErr?.message });
  }

  const sessionId = body.sessionId || crypto.randomUUID();
  const outPath = `${userId}/${asset.id}/lucy/${sessionId}.mp4`;

  let reqBody: Record<string, unknown>;
  try {
    reqBody = buildLucyV2vBody(falModel, {
      videoUrl: signed.signedUrl,
      prompt,
      resolution: resolutionEnv === "720p" ? "720p" : undefined,
    });
  } catch (err) {
    return json(500, { error: "lucy_body_build_failed", detail: String(err).slice(0, 300) });
  }

  await patchMeta(admin, asset.id, {
    lucy_status: "processing",
    lucy_session_id: sessionId,
    lucy_out_path: outPath,
    lucy_out_bucket: OUT_BUCKET,
    lucy_engine: `fal-run:${falModel}`,
    // Reproducibility (arch §6 #4): model, prompt, garment source, transfer mode.
    lucy_repro: {
      fal_model: falModel,
      prompt,
      resolution: (reqBody.input as Record<string, unknown>)?.resolution ?? null,
      wardrobe_feature_id: wardrobe.id,
      garment_label: wardrobe.label,
      category,
      transfer_mode: body.transferMode ?? "jacket_only",
      lane: "lane_c_lucy_v2v",
      garment_source: "text_prompt", // NOT the SL-bomber image — see file header.
      pixel_preserving: false,
    },
    lucy_error: null,
  });

  const switchxUrl = ccSwitchxUrl(composeCcUrl);
  const pollUrl = ccFalPollUrl(composeCcUrl);

  let queue: { status_url: string; response_url: string };
  try {
    const resp = await fetch(switchxUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
      body: JSON.stringify(reqBody),
    });
    const cc = await resp.json().catch(() => ({}));
    if (!resp.ok || !cc?.status_url || !cc?.response_url) {
      await patchMeta(admin, asset.id, {
        lucy_status: "failed",
        lucy_error: `lucy_submit_failed: ${cc?.error ?? JSON.stringify(cc).slice(0, 200)}`,
      });
      return json(502, {
        error: "lucy_submit_failed",
        detail: cc?.error ?? cc?.detail,
        assetId: asset.id,
      });
    }
    queue = { status_url: cc.status_url, response_url: cc.response_url };
  } catch (err) {
    await patchMeta(admin, asset.id, {
      lucy_status: "failed",
      lucy_error: `cc_unreachable: ${String(err).slice(0, 200)}`,
    });
    return json(502, { error: "cc_unreachable", assetId: asset.id });
  }

  const finish = async () => {
    try {
      const videoUrl = await pollFalViaCc(pollUrl, proxySecret, queue.status_url, queue.response_url);
      const dl = await fetch(videoUrl, { headers: { Accept: "video/*" } });
      if (!dl.ok) throw new Error(`lucy_download_${dl.status}`);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from(OUT_BUCKET)
        .upload(outPath, bytes, { contentType: "video/mp4", cacheControl: "3600", upsert: true });
      if (upErr) throw new Error(`lucy_upload_failed: ${upErr.message}`);

      await patchMeta(admin, asset.id, {
        lucy_status: "ready",
        lucy_out_path: outPath,
        lucy_out_bucket: OUT_BUCKET,
      });
    } catch (err) {
      await patchMeta(admin, asset.id, {
        lucy_status: "failed",
        lucy_error: String(err).slice(0, 300),
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
    sessionId,
    outPath,
    outBucket: OUT_BUCKET,
    engine: `fal-run:${falModel}`,
    prompt,
  });
});
