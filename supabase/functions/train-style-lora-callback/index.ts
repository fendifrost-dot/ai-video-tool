// AVT — completion callback for style LoRA training
//
// Two branches, distinguished by payload shape:
//
// 1. Fal webhook (direct from queue.fal.run): no X-Proxy-Secret, body has
//    `gateway_request_id`, `status`, `payload`, `error`. We trust Fal because
//    only Fal knows the artist_id we encoded into the webhook URL on submit.
//
// 2. Legacy CC proxy (old polling path): requires X-Proxy-Secret, body has
//    `status`, `lora_url`, `trigger_word`. Kept for back-compat.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type LegacyBody = {
  status?: "complete" | "failed";
  lora_url?: string;
  trigger_word?: string;
  error?: string;
};

type FalWebhookBody = {
  request_id?: string;
  gateway_request_id?: string;
  status?: "OK" | "ERROR";
  payload?: {
    diffusers_lora_file?: { url?: string };
    [k: string]: unknown;
  };
  error?: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-proxy-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const proxySecret = Deno.env.get("COMPOSE_LOOK_PROXY_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!proxySecret || !supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }

  const url = new URL(req.url);
  const artistId = url.searchParams.get("artist_id") ?? "";
  if (!artistId) return json(400, { error: "missing_artist_id" });

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const isFalWebhook =
    typeof rawBody.gateway_request_id === "string" ||
    rawBody.status === "OK" ||
    rawBody.status === "ERROR";

  // Legacy branch: enforce X-Proxy-Secret.
  if (!isFalWebhook) {
    const headerSecret = req.headers.get("x-proxy-secret") ?? "";
    if (!headerSecret || !constantTimeEqual(headerSecret, proxySecret)) {
      return json(401, { error: "bad_proxy_secret" });
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: artist, error: lookupErr } = await admin
    .from("artists")
    .select("id, identity_profile_json")
    .eq("id", artistId)
    .maybeSingle();
  if (lookupErr) return json(500, { error: "lookup_failed" });
  if (!artist) return json(404, { error: "artist_not_found" });

  const identity = (artist.identity_profile_json ?? {}) as Record<string, unknown>;
  const existingTraining = (identity.style_lora_training ?? {}) as Record<string, unknown>;

  // Normalise to: { ok: boolean, loraUrl?, trigger?, errorMsg? }
  let ok = false;
  let loraUrl: string | undefined;
  let trigger = "FENDIFITS";
  let errorMsg: string | undefined;

  if (isFalWebhook) {
    const fb = rawBody as FalWebhookBody;
    if (fb.status === "OK") {
      loraUrl = fb.payload?.diffusers_lora_file?.url;
      if (!loraUrl) {
        ok = false;
        errorMsg = "fal_webhook_missing_lora_url";
      } else {
        ok = true;
      }
    } else {
      ok = false;
      errorMsg = String(fb.error ?? "fal_webhook_error").slice(0, 500);
    }
    // preserve trigger from existing training record if present
    const existingTrigger = existingTraining.trigger_word;
    if (typeof existingTrigger === "string" && existingTrigger) {
      trigger = existingTrigger;
    }
  } else {
    const lb = rawBody as LegacyBody;
    if (lb.status === "failed" || lb.error) {
      ok = false;
      errorMsg = String(lb.error ?? "training_failed").slice(0, 500);
    } else if (!lb.lora_url) {
      ok = false;
      errorMsg = "missing_lora_url";
    } else {
      ok = true;
      loraUrl = lb.lora_url;
      trigger = lb.trigger_word ?? trigger;
    }
  }

  if (!ok) {
    const next = {
      ...identity,
      style_lora_training: {
        ...existingTraining,
        status: "failed",
        completed_at: new Date().toISOString(),
        error: errorMsg ?? "training_failed",
      },
    };
    await admin.from("artists").update({ identity_profile_json: next }).eq("id", artistId);
    return json(200, { ok: true, marked: "failed" });
  }

  const legacy = identity.lora && typeof identity.lora === "object"
    ? identity.lora
    : null;

  const next = {
    ...identity,
    lora_legacy_face: legacy ?? identity.lora_legacy_face,
    lora: {
      url: loraUrl,
      trigger_word: trigger,
      trigger,
      provider: "fal-ai/flux-lora-fast-training",
      trained_at: new Date().toISOString(),
    },
    style_lora_training: {
      ...existingTraining,
      status: "complete",
      completed_at: new Date().toISOString(),
      lora_url: loraUrl,
      trigger_word: trigger,
      provider: "fal-ai/flux-lora-fast-training",
    },
  };

  await admin.from("artists").update({ identity_profile_json: next }).eq("id", artistId);
  return json(200, { ok: true, marked: "complete" });
});
