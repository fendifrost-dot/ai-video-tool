// AVT edge function — temporal-propagate-proxy
//
// Isolated luma-frame temporal propagate. User JWT required (same pattern as
// architecture-c-still-repair-proxy). Does NOT:
//   - call Grok / Fal / Control Center
//   - widen proxy auth / X-Proxy-Secret
//   - touch chest logoComposite or sleevePanel paint
//   - flip Hero Frame temporalTrackingEnabled
//
// authorizeTemporalEdgeRequest → propagateRepair only.
// Parent redeploys THIS function only via Lovable → Edge Functions → redeploy.
// Publish ≠ edge redeploy. Do not redeploy architecture-c-still-repair-proxy.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { dispatchTemporalPropagate } from "./lib/edgeDispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const result = dispatchTemporalPropagate(body);
  return json(result.status, result.body);
});
