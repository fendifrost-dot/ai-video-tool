/**
 * proxy-provider-call — thin AVT-side wrapper for Control Center video proxy.
 *
 * Validates the calling AVT user JWT (default verify_jwt = true), looks up
 * the AVT_PROXY_KEY secret, and forwards the request to Control Center's
 * matching edge function. Returns CC's response envelope verbatim.
 *
 * This keeps the shared secret out of the browser bundle. AVT pages call
 * THIS function; this function calls CC.
 *
 * Request:
 *   POST /functions/v1/proxy-provider-call
 *   Authorization: Bearer <user_jwt>
 *   Content-Type: application/json
 *   Body: {
 *     "endpoint": "video-providers-runway-generate" |
 *                 "video-providers-veo-generate" |
 *                 "video-providers-pika-generate" |
 *                 "video-providers-fal-generate" |
 *                 "video-providers-grok-generate" |
 *                 "video-providers-higgsfield-generate" |
 *                 "video-providers-job-status" |
 *                 "video-providers-job-result" |
 *                 "ai-draft-treatment",
 *     "method": "POST" | "GET",
 *     "query": { ...optional, used for status/result endpoints... },
 *     "body": { ...forwarded verbatim, generate endpoints... }
 *   }
 *
 * Response: { ok, ... } — whatever CC returned.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ALLOWED_ENDPOINTS = new Set([
  "video-providers-runway-generate",
  "video-providers-veo-generate",
  "video-providers-pika-generate",
  "video-providers-fal-generate",
  "video-providers-grok-generate",
  "video-providers-higgsfield-generate",
  "video-providers-job-status",
  "video-providers-job-result",
  "ai-draft-treatment",
]);

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, errorCode: "INVALID_INPUT", errorMessage: "Method must be POST" });

  // Verify user JWT (so only signed-in users can spend our API budget).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(401, { ok: false, errorCode: "UNAUTHORISED", errorMessage: "Missing bearer token" });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(401, { ok: false, errorCode: "UNAUTHORISED", errorMessage: "Invalid bearer token" });
  }

  const ccUrl = Deno.env.get("CONTROL_CENTER_URL")?.trim();
  const ccKey = Deno.env.get("AVT_PROXY_KEY")?.trim();
  if (!ccUrl || !ccKey) {
    return jsonResponse(503, {
      ok: false,
      errorCode: "PROVIDER_KEY_NOT_CONFIGURED",
      errorMessage:
        "AVT cannot reach Control Center. CONTROL_CENTER_URL and AVT_PROXY_KEY must be configured as Edge Function secrets on the AI Video Tool Supabase project.",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, errorCode: "INVALID_INPUT", errorMessage: "Body is not valid JSON" });
  }
  const endpoint = String(body.endpoint ?? "");
  const method = String(body.method ?? "POST").toUpperCase();
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return jsonResponse(400, { ok: false, errorCode: "INVALID_INPUT", errorMessage: `Unknown endpoint: ${endpoint}` });
  }
  if (method !== "POST" && method !== "GET") {
    return jsonResponse(400, { ok: false, errorCode: "INVALID_INPUT", errorMessage: `Invalid method: ${method}` });
  }

  // Inject the authenticated user id into the body so CC can stamp it on
  // its audit log without trusting the client-supplied value.
  const enrichedBody = {
    ...(body.body as Record<string, unknown> | undefined ?? {}),
    avt_user_id: userData.user.id,
  };

  const query = body.query as Record<string, string> | undefined;
  const qs = query
    ? "?" + new URLSearchParams(query).toString()
    : "";
  const targetUrl = `${ccUrl.replace(/\/$/, "")}/functions/v1/${endpoint}${qs}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const fetchInit: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ccKey,
      },
      signal: ctrl.signal,
    };
    if (method === "POST") fetchInit.body = JSON.stringify(enrichedBody);

    const resp = await fetch(targetUrl, fetchInit);
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonResponse(502, {
      ok: false,
      errorCode: "INTERNAL",
      errorMessage: `Control Center proxy failed: ${String(err)}`,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
});
