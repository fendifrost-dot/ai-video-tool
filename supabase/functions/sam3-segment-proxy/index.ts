// AVT edge — sam3-segment-proxy
//
// Masking only: SwitchX CC action `segment-image` → fal-ai/sam-3/image.
// Returns a storage path under look-composites for the masked RGB (prompted
// region visible, rest black). Used by the SAM-3 → Grok → restore primary lane.
//
// Secrets: COMPOSE_LOOK_CC_URL, SWITCHX_PROXY_SECRET (or COMPOSE_LOOK_PROXY_SECRET)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 2700;

type Body = {
  scenePath: string;
  sceneBucket?: string;
  /** Single-word SAM-3 prompts work best: "clothing", "jacket", "face". */
  prompt?: string;
  artistId?: string;
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
  if (!composeCcUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!body.scenePath?.trim()) return json(400, { error: "missing_scene_path" });

  const prompt = (body.prompt ?? "clothing").trim() || "clothing";
  const sceneBucket = body.sceneBucket ?? "project-references";
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: signed, error: signErr } = await admin.storage
    .from(sceneBucket)
    .createSignedUrl(body.scenePath, SIGN_TTL);
  if (signErr || !signed?.signedUrl) {
    return json(400, { error: "scene_sign_failed", detail: signErr?.message });
  }

  const switchxUrl = ccSwitchxUrl(composeCcUrl);
  const segResp = await fetch(switchxUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Secret": proxySecret,
    },
    body: JSON.stringify({
      action: "segment-image",
      image_url: signed.signedUrl,
      prompt,
    }),
  });
  const segText = await segResp.text();
  let segJson: Record<string, unknown> = {};
  try {
    segJson = JSON.parse(segText) as Record<string, unknown>;
  } catch {
    /* keep empty */
  }
  if (!segResp.ok) {
    return json(502, {
      error: "sam3_segment_failed",
      detail: (segJson.error as string) ?? segText.slice(0, 500),
    });
  }
  const imageUrl = segJson.image_url;
  if (typeof imageUrl !== "string" || !imageUrl) {
    return json(502, { error: "sam3_no_image", detail: segText.slice(0, 400) });
  }

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) {
    return json(502, { error: "sam3_download_failed", detail: String(imgResp.status) });
  }
  const bytes = new Uint8Array(await imgResp.arrayBuffer());
  const maskId = crypto.randomUUID();
  const artistPart = body.artistId?.trim() || "shared";
  const storagePath = `${userId}/${artistPart}/sam3/${maskId}_${prompt.replace(/\s+/g, "_")}.png`;
  const { error: upErr } = await admin.storage
    .from("look-composites")
    .upload(storagePath, bytes, { contentType: "image/png", upsert: true });
  if (upErr) {
    return json(502, { error: "sam3_upload_failed", detail: upErr.message });
  }

  return json(200, {
    maskPath: storagePath,
    prompt,
    pipeline: "sam3_segment",
  });
});
