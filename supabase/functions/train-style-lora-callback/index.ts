// AVT — CC reports completed style LoRA training

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Body = {
  status?: "complete" | "failed";
  lora_url?: string;
  trigger_word?: string;
  error?: string;
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

  const headerSecret = req.headers.get("x-proxy-secret") ?? "";
  if (!headerSecret || !constantTimeEqual(headerSecret, proxySecret)) {
    return json(401, { error: "bad_proxy_secret" });
  }

  const url = new URL(req.url);
  const artistId = url.searchParams.get("artist_id") ?? "";
  if (!artistId) return json(400, { error: "missing_artist_id" });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
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

  if (body.status === "failed" || body.error) {
    const next = {
      ...identity,
      style_lora_training: {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: String(body.error ?? "training_failed").slice(0, 500),
      },
    };
    await admin.from("artists").update({ identity_profile_json: next }).eq("id", artistId);
    return json(200, { ok: true, marked: "failed" });
  }

  const loraUrl = body.lora_url;
  if (!loraUrl) {
    const next = {
      ...identity,
      style_lora_training: {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "missing_lora_url",
      },
    };
    await admin.from("artists").update({ identity_profile_json: next }).eq("id", artistId);
    return json(400, { error: "missing_lora_url" });
  }

  const trigger = body.trigger_word ?? "FENDIFITS";
  const legacy = identity.lora && typeof identity.lora === "object"
    ? identity.lora
    : null;

  const next = {
    ...identity,
    lora_legacy_face: legacy ?? identity.lora_legacy_face,
    lora: { url: loraUrl, trigger_word: trigger, trigger },
    style_lora_training: {
      status: "complete",
      completed_at: new Date().toISOString(),
      lora_url: loraUrl,
      trigger_word: trigger,
    },
  };

  await admin.from("artists").update({ identity_profile_json: next }).eq("id", artistId);
  return json(200, { ok: true, marked: "complete" });
});
