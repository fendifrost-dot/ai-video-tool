// AVT — start personal style LoRA training (Fal flux-lora-fast-training via CC)
//
// Thin shim: client builds the training zip and uploads to `training-zips`.
// This handler validates input, guards duplicate runs, marks pending on the
// artist row, forwards zip_url to CC with callback_url, and persists Fal
// request_id when CC returns `{ status: 'queued', request_id }`.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MIN_IMAGES = 4;
const TRAINING_COOLDOWN_MS = 30 * 60 * 1000;

type Body = {
  artist_id?: string;
  zip_url?: string;
  trigger_word?: string;
  image_count?: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ccUrl = Deno.env.get("TRAIN_STYLE_LORA_CC_URL") ??
    Deno.env.get("COMPOSE_LOOK_CC_URL")?.replace(/compose-look$/, "train-style-lora") ?? "";
  const proxySecret = Deno.env.get("COMPOSE_LOOK_PROXY_SECRET") ?? "";

  if (!supabaseUrl || !serviceRoleKey || !ccUrl || !proxySecret) {
    return json(500, { error: "server_misconfigured" });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const artistId = body.artist_id ?? "";
  const zipUrl = body.zip_url ?? "";
  const triggerWord = body.trigger_word ?? "";
  const imageCount = body.image_count ?? 0;

  if (!artistId) return json(400, { error: "missing_artist_id" });
  if (!zipUrl) return json(400, { error: "missing_zip_url" });
  if (!triggerWord) return json(400, { error: "missing_trigger_word" });
  if (imageCount < MIN_IMAGES) {
    return json(400, {
      error: "not_enough_images",
      detail: `Need at least ${MIN_IMAGES} style reference photos`,
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: artist, error: artistErr } = await admin
    .from("artists")
    .select("id, identity_profile_json")
    .eq("id", artistId)
    .maybeSingle();
  if (artistErr) return json(500, { error: "artist_lookup_failed" });
  if (!artist) return json(404, { error: "artist_not_found" });

  const identity = (artist.identity_profile_json ?? {}) as Record<string, unknown>;
  const existingTraining = identity.style_lora_training as
    | { status?: string; started_at?: string }
    | undefined;
  if (
    existingTraining?.status === "pending" &&
    existingTraining.started_at &&
    Date.now() - Date.parse(existingTraining.started_at) < TRAINING_COOLDOWN_MS
  ) {
    return json(409, {
      error: "already_training",
      detail: "Style LoRA training is already in progress",
    });
  }

  const startedAt = new Date().toISOString();
  const callbackUrl =
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/train-style-lora-callback?artist_id=${artistId}`;

  const nextIdentity = {
    ...identity,
    style_lora_training: {
      status: "pending",
      started_at: startedAt,
      image_count: imageCount,
      trigger_word: triggerWord,
      zip_url: zipUrl,
      callback_url: callbackUrl,
    },
  };

  const { error: pendingErr } = await admin
    .from("artists")
    .update({ identity_profile_json: nextIdentity })
    .eq("id", artistId);
  if (pendingErr) return json(500, { error: "artist_update_failed" });

  const ccResp = await fetch(ccUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Secret": proxySecret,
    },
    body: JSON.stringify({
      images_data_url: zipUrl,
      trigger_word: triggerWord,
      is_style: true,
      callback_url: callbackUrl,
      artist_id: artistId,
    }),
  });

  if (!ccResp.ok) {
    const text = await ccResp.text().catch(() => "");
    const failIdentity = {
      ...nextIdentity,
      style_lora_training: {
        status: "failed",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        error: `cc_submit_${ccResp.status}: ${text.slice(0, 500)}`,
        image_count: imageCount,
        trigger_word: triggerWord,
        zip_url: zipUrl,
      },
    };
    await admin
      .from("artists")
      .update({ identity_profile_json: failIdentity })
      .eq("id", artistId);
    return json(502, {
      error: "cc_submit_failed",
      detail: text.slice(0, 300),
    });
  }

  let requestId: string | undefined;
  try {
    const ccJson = await ccResp.json();
    if (typeof ccJson?.request_id === "string") {
      requestId = ccJson.request_id;
    }
  } catch {
    // request_id is nice-to-have
  }

  const mergedIdentity = {
    ...nextIdentity,
    style_lora_training: {
      ...(nextIdentity.style_lora_training as Record<string, unknown>),
      request_id: requestId,
      submitted_at: new Date().toISOString(),
    },
  };

  await admin
    .from("artists")
    .update({ identity_profile_json: mergedIdentity })
    .eq("id", artistId);

  return json(200, {
    status: "training_started",
    image_count: imageCount,
    trigger_word: triggerWord,
    request_id: requestId,
  });
});
