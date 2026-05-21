// AVT edge function — compose-look-callback
//
// Async pipeline counterpart to compose-look-proxy. When CC finishes the
// lora_idm_vton (Stage 1 LoRA → Leffa-VTON → Seedream polish) pipeline, it
// POSTs the result here. This function:
//
//   1. Authenticates via the shared COMPOSE_LOOK_PROXY_SECRET header.
//   2. Looks up the pending artist_looks row by `look_id` (query param).
//   3. Downloads the rendered image from Fal.
//   4. Uploads it to the look-composites bucket (service-role, so RLS
//      doesn't apply — the look row already records which user owns it).
//   5. Updates the row: status='complete', generated_image_url/storage_path,
//      pipeline_used, cost_cents, generation_metadata.
//
// On any failure path, the row is updated to status='failed' with an
// error_message so the UI's poll resolves cleanly instead of hanging.
//
// Env vars required (AVT):
//   - COMPOSE_LOOK_PROXY_SECRET    (shared with CC + compose-look-proxy)
//   - SUPABASE_URL                 (provided by Lovable)
//   - SUPABASE_SERVICE_ROLE_KEY    (provided by Lovable — needed to upload
//                                   into look-composites without a user JWT
//                                   and to update the look row.)
//
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Body = {
  status?: "complete" | "failed";
  fal_image_url?: string;
  pipeline_used?: string;
  cost_cents?: number;
  generation_metadata?: any;
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // ---- env --------------------------------------------------------------
  const proxySecret = Deno.env.get("COMPOSE_LOOK_PROXY_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!proxySecret || !supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }

  // ---- proxy-secret auth ------------------------------------------------
  const headerSecret = req.headers.get("x-proxy-secret") ?? "";
  if (!headerSecret) return json(401, { error: "missing_proxy_secret" });
  if (!constantTimeEqual(headerSecret, proxySecret)) {
    return json(401, { error: "bad_proxy_secret" });
  }

  // ---- look_id (query param) -------------------------------------------
  const url = new URL(req.url);
  const lookId = url.searchParams.get("look_id") ?? "";
  if (!lookId) return json(400, { error: "missing_look_id" });

  // ---- body -------------------------------------------------------------
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ---- look up the pending row ------------------------------------------
  const { data: existing, error: lookupErr } = await admin
    .from("artist_looks")
    .select("id, user_id, artist_id, composition_recipe_json")
    .eq("id", lookId)
    .maybeSingle();
  if (lookupErr) {
    return json(500, { error: "lookup_failed", detail: lookupErr.message });
  }
  if (!existing) return json(404, { error: "look_not_found" });

  // ---- failure path: CC reported it couldn't finish ---------------------
  // CC posts { status: 'failed', error: '...' } when the pipeline throws
  // before producing an image. We surface that into the row's
  // error_message so the UI's poll resolves with a usable message.
  if (body.status === "failed" || body.error) {
    const errMsg = String(body.error ?? "cc_reported_failure").slice(0, 500);
    await admin
      .from("artist_looks")
      .update({ status: "failed", error_message: errMsg })
      .eq("id", lookId);
    return json(200, { ok: true, marked: "failed" });
  }

  const falImageUrl = body.fal_image_url;
  if (!falImageUrl) {
    await admin
      .from("artist_looks")
      .update({ status: "failed", error_message: "callback_missing_fal_url" })
      .eq("id", lookId);
    return json(400, { error: "missing_fal_url" });
  }

  // ---- download bytes from Fal -----------------------------------------
  let composedBytes: Uint8Array;
  let mime: "image/png" | "image/jpeg" | "image/webp";
  try {
    const dl = await fetch(falImageUrl, {
      headers: { Accept: "image/png, image/jpeg, image/webp" },
    });
    if (!dl.ok) throw new Error(`download_${dl.status}`);
    const buf = new Uint8Array(await dl.arrayBuffer());
    const sniffed = sniffMime(buf);
    if (!sniffed) throw new Error("unknown_mime");
    composedBytes = buf;
    mime = sniffed;
  } catch (err) {
    await admin
      .from("artist_looks")
      .update({
        status: "failed",
        error_message: `fal_download_failed: ${String(err).slice(0, 300)}`,
      })
      .eq("id", lookId);
    return json(502, { error: "fal_download_failed" });
  }

  // ---- upload to look-composites (service-role) -------------------------
  // Pre-async we uploaded as the user (via their JWT) so RLS scoped the
  // path. The callback can't see the user's JWT, so we use service-role
  // and trust the path convention `${user_id}/${artist_id}/${look_id}.ext`.
  // upsert: true so a retried callback overwrites a partially-uploaded file
  // rather than failing.
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const storagePath = `${existing.user_id}/${existing.artist_id}/${lookId}.${ext}`;
  const { error: uploadErr } = await admin.storage
    .from("look-composites")
    .upload(storagePath, composedBytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: true,
    });
  if (uploadErr) {
    await admin
      .from("artist_looks")
      .update({
        status: "failed",
        error_message: `upload_failed: ${uploadErr.message.slice(0, 300)}`,
      })
      .eq("id", lookId);
    return json(500, { error: "upload_failed", detail: uploadErr.message });
  }

  // ---- update the row to complete --------------------------------------
  // Fold generation_metadata into the existing recipe snapshot so audit
  // queries can still see what the pipeline did.
  const recipe = (existing.composition_recipe_json ?? {}) as Record<string, any>;
  recipe.generation_metadata = body.generation_metadata ?? null;
  const { error: updateErr } = await admin
    .from("artist_looks")
    .update({
      status: "complete",
      generated_image_url: storagePath,
      generated_storage_path: storagePath,
      pipeline_used: body.pipeline_used ?? null,
      cost_cents: Number(body.cost_cents ?? 0),
      composition_recipe_json: recipe,
      error_message: null,
    })
    .eq("id", lookId);
  if (updateErr) {
    return json(500, { error: "update_failed", detail: updateErr.message });
  }

  return json(200, { ok: true });
});

// ---------------------------------------------------------------------------
// Helpers (inlined — each Supabase edge function deploys independently, so
// we don't share with compose-look-proxy/helpers.ts).
// ---------------------------------------------------------------------------
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sniffMime(
  buf: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
