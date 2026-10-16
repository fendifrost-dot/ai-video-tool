// AVT edge — matte-video-proxy
//
// Step 6 of the workflow, first half: cut the performer out of a dressed take. The browser names one of the caller's
// own video assets; this function signs it for an hour, hands it to Fal's video background-removal model through
// Control Center (`switchx-restyle` action `fal-run` — AVT holds no Fal key, CC does) and returns the queue handle.
// The browser polls `fal-queue-poll-proxy` for the result, downloads the alpha video itself (Fal's CDN allows it),
// and makes the composite over the plate in the page. Nothing is written here: no job row, no asset — the matte is
// an input the browser files beside the composite it makes from it.
//
// What is spent: the model's list price per 30 frames of the source (_shared/matteRequest.ts), billed to CC's Fal
// account. A source longer than MATTE_MAX_SECONDS is refused before anything is sent.
//
// Env: COMPOSE_LOOK_CC_URL, SWITCHX_PROXY_SECRET (or COMPOSE_LOOK_PROXY_SECRET), SUPABASE_URL, SUPABASE_ANON_KEY,
//      SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signForCaller } from "../_shared/storageAccess.ts";
import {
  buildMatteInput,
  MATTE_MODEL,
  matteEstimateUsd,
  matteFrames,
  matteSourceCheck,
} from "../_shared/matteRequest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Long enough for the queue to pick the file up; the browser's own download is of the model's output, not this link. */
const SIGN_TTL = 3600;
const VIDEO_RE = /\.(mp4|mov|m4v)$/i;

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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return json(400, { error: "missing_asset_id" });

  // The asset is read as the caller (RLS): a row that is not theirs is simply not found.
  const { data: asset, error: assetErr } = await userClient
    .from("project_assets")
    .select("id, user_id, project_id, file_url, asset_type, metadata_json")
    .eq("id", assetId)
    .maybeSingle();
  if (assetErr) return json(500, { error: "asset_lookup_failed", detail: assetErr.message });
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

  // The service role bypasses bucket RLS: only the caller's own folder (or a legacy grant) may be signed here.
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const signed = await signForCaller(admin, userId, bucket, asset.file_url, SIGN_TTL);
  if (!signed.ok)
    return json(signed.status, {
      error: signed.error === "storage_object_not_found" ? "source_sign_failed" : signed.error,
    });

  const frames = matteFrames(seconds, typeof meta.fps === "number" ? meta.fps : null);
  const estimate = matteEstimateUsd(frames);
  const input = buildMatteInput(signed.url);

  let resp: Response;
  try {
    resp = await fetch(ccSwitchxUrl(composeCcUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
      body: JSON.stringify({ action: "fal-run", model: MATTE_MODEL, input }),
    });
  } catch (err) {
    return json(502, { error: "cc_unreachable", detail: String(err).slice(0, 300) });
  }
  const text = await resp.text();
  let cc: Record<string, unknown> = {};
  try {
    cc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* keep empty */
  }
  if (!resp.ok || typeof cc.status_url !== "string" || typeof cc.response_url !== "string") {
    console.error(
      `[matte-video-proxy] submit_failed http=${resp.status} asset=${assetId} body=${text.slice(0, 600)}`,
    );
    return json(502, {
      error: "matte_submit_failed",
      detail: (cc.error as string) ?? text.slice(0, 400),
      model: MATTE_MODEL,
    });
  }
  console.log(
    `[matte-video-proxy] submitted asset=${assetId} frames=${frames} model=${MATTE_MODEL}`,
  );
  return json(200, {
    ok: true,
    model: MATTE_MODEL,
    status_url: cc.status_url,
    response_url: cc.response_url,
    source: { assetId, seconds, frames, bucket, path: asset.file_url },
    estimate,
  });
});
