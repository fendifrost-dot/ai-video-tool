// AVT edge function — faceswap-proxy
//
// Owns all AVT-side data access for identity face-swap ("put my face on this
// scene image"):
//   1. Authenticates the calling user (Supabase JWT).
//   2. Resolves the artist's primary FACE reference (Character DNA) and the
//      target scene image (a project asset), signing short-lived URLs for both.
//   3. Forwards the two signed URLs to CC's faceswap-generate (pure Fal
//      orchestration — no AVT creds cross the boundary; shared secret only).
//   4. Downloads the rendered image from Fal, uploads it to the user's
//      project-references bucket (RLS-scoped), inserts a project_assets row
//      (asset_type 'generated_still', source_tool 'fal') with full provenance,
//      and signs a preview URL.
//
// Synchronous: face-swap is a single fast Fal call, so unlike compose-look we
// await the whole pipeline and return the persisted asset in one response.
//
// Env vars (AVT — same secrets compose-look-proxy already uses):
//   - COMPOSE_LOOK_CC_URL        (https://<cc>.supabase.co/functions/v1/compose-look)
//                                 CC base is derived from this; no new env needed.
//   - COMPOSE_LOOK_PROXY_SECRET  (shared with CC)
//   - SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (Lovable-provided)
//
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL_INPUT = 2700; // 45 min — Fal pulls quickly
const SIGN_TTL_RESULT = 3600;

type Body = {
  artistId: string;
  projectId: string;
  // Target scene image — pass the project asset's storage path + bucket.
  scenePath: string;
  sceneBucket?: string; // default 'project-references'
  sceneAssetId?: string; // optional, for provenance (parent_asset_id)
  shotId?: string;
  // Face source override; defaults to the artist's primary face DNA slot.
  faceFeatureId?: string;
  gender?: "male" | "female" | "non-binary";
  workflowType?: "user_hair" | "target_hair";
  upscale?: boolean;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sniffExt(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const ccComposeUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret = Deno.env.get("COMPOSE_LOOK_PROXY_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!ccComposeUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }
  // Derive the faceswap-generate endpoint from the compose-look URL so we don't
  // need a separate env var. Both live under the same CC functions root.
  const ccFaceswapUrl = ccComposeUrl.replace(/\/compose-look\/?$/, "/faceswap-generate");

  // ---- auth: user JWT -------------------------------------------------
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
  if (!body?.artistId) return json(400, { error: "missing_artist_id" });
  if (!body?.projectId) return json(400, { error: "missing_project_id" });
  if (!body?.scenePath) return json(400, { error: "missing_scene_path" });
  const sceneBucket = body.sceneBucket || "project-references";

  // ---- resolve the artist's primary face DNA slot --------------------
  let faceQuery = admin
    .from("character_features")
    .select("id, file_url, storage_path, feature_type, is_primary, is_locked, uploaded_at")
    .eq("artist_id", body.artistId)
    .eq("feature_type", "face");
  if (body.faceFeatureId) faceQuery = faceQuery.eq("id", body.faceFeatureId);
  const { data: faceRows, error: faceErr } = await faceQuery;
  if (faceErr) return json(500, { error: "face_query_failed", detail: faceErr.message });
  if (!faceRows || faceRows.length === 0) {
    return json(404, { error: "no_face_reference", detail: "Artist has no Character DNA face reference." });
  }
  // Prefer primary, then locked, then most recent.
  const face =
    faceRows.find((f: any) => f.is_primary) ??
    faceRows.find((f: any) => f.is_locked) ??
    [...faceRows].sort((a: any, b: any) => (b.uploaded_at > a.uploaded_at ? 1 : -1))[0];
  const facePath = face.storage_path || face.file_url;
  if (!facePath) return json(404, { error: "face_reference_pathless" });

  // ---- sign both input URLs ------------------------------------------
  const { data: faceSigned, error: faceSignErr } = await admin.storage
    .from("artist-assets")
    .createSignedUrl(facePath, SIGN_TTL_INPUT);
  if (faceSignErr || !faceSigned?.signedUrl) {
    return json(500, { error: "face_sign_failed", detail: faceSignErr?.message });
  }
  const { data: sceneSigned, error: sceneSignErr } = await admin.storage
    .from(sceneBucket)
    .createSignedUrl(body.scenePath, SIGN_TTL_INPUT);
  if (sceneSignErr || !sceneSigned?.signedUrl) {
    return json(500, { error: "scene_sign_failed", detail: sceneSignErr?.message });
  }

  // ---- call CC faceswap-generate (synchronous) -----------------------
  let cc: any;
  try {
    const resp = await fetch(ccFaceswapUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
      body: JSON.stringify({
        faceImageUrl: faceSigned.signedUrl,
        targetImageUrl: sceneSigned.signedUrl,
        gender: body.gender ?? "male",
        workflowType: body.workflowType ?? "user_hair",
        upscale: body.upscale ?? true,
      }),
    });
    cc = await resp.json().catch(() => ({}));
    if (!resp.ok || !cc?.ok) {
      return json(502, {
        error: "faceswap_failed",
        errorCode: cc?.errorCode ?? `cc_${resp.status}`,
        detail: cc?.errorMessage ?? JSON.stringify(cc).slice(0, 400),
      });
    }
  } catch (err) {
    return json(502, { error: "cc_unreachable", detail: String(err).slice(0, 300) });
  }

  const falImageUrl: string = cc.imageUrl;

  // ---- download Fal result + upload as the user ----------------------
  let bytes: ArrayBuffer;
  let contentType = cc.contentType || "image/png";
  try {
    const img = await fetch(falImageUrl);
    if (!img.ok) return json(502, { error: "result_download_failed", detail: `status ${img.status}` });
    contentType = img.headers.get("content-type") || contentType;
    bytes = await img.arrayBuffer();
  } catch (err) {
    return json(502, { error: "result_download_error", detail: String(err).slice(0, 300) });
  }

  const ext = sniffExt(contentType);
  const filename = `faceswap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const outPath = `${userId}/${body.projectId}/faceswap/${filename}`;
  const { error: upErr } = await admin.storage
    .from("project-references")
    .upload(outPath, new Uint8Array(bytes), { contentType, upsert: false });
  if (upErr) return json(500, { error: "upload_failed", detail: upErr.message });

  // ---- insert project_assets row with provenance ---------------------
  const { data: assetRow, error: insErr } = await admin
    .from("project_assets")
    .insert({
      user_id: userId,
      project_id: body.projectId,
      shot_id: body.shotId ?? null,
      asset_type: "generated_still",
      file_url: outPath,
      source_tool: "fal",
      approval_status: "pending",
      parent_asset_id: body.sceneAssetId ?? null,
      metadata_json: {
        capability: "identity_apply",
        model: cc.model ?? "easel-ai/advanced-face-swap",
        provider_job_id: cc.providerJobId ?? null,
        cost_cents: cc.costEstimateCents ?? null,
        face_feature_id: face.id,
        source_scene_path: body.scenePath,
        source_scene_bucket: sceneBucket,
        width: cc.width ?? null,
        height: cc.height ?? null,
        content_type: contentType,
      },
    })
    .select("*")
    .single();
  if (insErr) return json(500, { error: "insert_failed", detail: insErr.message });

  const { data: preview } = await admin.storage
    .from("project-references")
    .createSignedUrl(outPath, SIGN_TTL_RESULT);

  return json(200, {
    ok: true,
    asset: assetRow,
    signed_url: preview?.signedUrl ?? null,
    cost_cents: cc.costEstimateCents ?? null,
    model: cc.model ?? "easel-ai/advanced-face-swap",
  });
});
