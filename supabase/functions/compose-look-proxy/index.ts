// AVT edge function — compose-look-proxy
//
// Thin pass-through to CC's compose-look function. Why a proxy at all?
//   1. Hide CC's URL + shared secret from the browser.
//   2. Authenticate the caller via AVT's Supabase JWT before charging Fal.
//   3. Give us a single place to add rate-limiting, audit-logging, or A/B
//      pipeline routing without redeploying CC.
//
// Env vars required:
//   - COMPOSE_LOOK_CC_URL          (e.g. https://wkzwcfmvnwolgrdpnygc.supabase.co/functions/v1/compose-look)
//   - COMPOSE_LOOK_PROXY_SECRET    (shared secret with CC)
//   - SUPABASE_URL                 (provided by Lovable)
//   - SUPABASE_ANON_KEY            (provided by Lovable)
//
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  const ccUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret = Deno.env.get("COMPOSE_LOOK_PROXY_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!ccUrl || !proxySecret || !supabaseUrl || !anonKey) {
    return json(500, { error: "server_misconfigured" });
  }

  // Auth: caller must be a signed-in AVT user.
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "missing_bearer" });
  }
  const jwt = authHeader.slice(7).trim();

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: "unauthenticated" });
  }

  // Pass-through body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  // Forward to CC with the internal proxy secret + user JWT
  const ccResp = await fetch(ccUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Proxy-Secret": proxySecret,
      "X-User-JWT": jwt,
    },
    body: JSON.stringify(body),
  });

  const text = await ccResp.text();
  return new Response(text, {
    status: ccResp.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
