// AVT edge function — faceswap-proxy (async submit-only)
//
// Refactored from the original synchronous flow because Fal's advanced
// face-swap job runs ~270s end-to-end — well beyond the Supabase edge
// function idle cap. Now mirrors compose-look-proxy + compose-look-callback:
//
//   1. Authenticates the calling user (Supabase JWT).
//   2. Resolves the artist's primary FACE reference (Character DNA) and the
//      target scene image (a project asset), signing short-lived URLs for both.
//   3. Inserts a provider_jobs row (status='queued') keyed to this submission
//      so the eventual webhook can find it by id.
//   4. Submits to CC's faceswap-generate in submit-only mode, passing the
//      callbackUrl that points at our sibling `faceswap-callback` function.
//   5. Returns { jobId } in < 5s. The frontend polls provider_jobs.
//
// The result download + project_assets insert now live in faceswap-callback.
//
// Env vars (AVT — same secrets compose-look-proxy uses):
//   - COMPOSE_LOOK_CC_URL        (https://<cc>.supabase.co/functions/v1/compose-look)
//   - COMPOSE_LOOK_PROXY_SECRET  (shared with CC; reused for the callback too)
//   - SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
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

type Body = {
  artistId: string;
  /** VLONE / project-asset flow */
  projectId?: string;
  scenePath?: string;
  sceneBucket?: string;
  sceneAssetId?: string;
  shotId?: string;
  /** Apply-my-identity on a look canvas (Grok stand-in → Fendi face graft) */
  parentLookId?: string;
  sourceImageUrl?: string;
  identityReferenceUrl?: string;
  name?: string;
  faceFeatureId?: string;
  gender?: "male" | "female" | "non-binary";
  workflowType?: "user_hair" | "target_hair";
  upscale?: boolean;
};

function isHttpsUrl(value: unknown): value is string {
  // Supabase signed URLs carry a JWT in ?token=… and routinely run 600–750+
  // chars, so the old 600 cap rejected valid signed canvas/face URLs (→ 400
  // missing_source_image_url). Raise to a safe 2048 ceiling; keep the https
  // check and an upper bound to guard against absurd payloads.
  return typeof value === "string" && value.trim().startsWith("https://") && value.trim().length < 2048;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  // Derive sibling endpoints from the compose-look URL.
  const ccFaceswapUrl = ccComposeUrl.replace(/\/compose-look\/?$/, "/faceswap-generate");
  // The callback URL CC/Fal will POST when the job finishes.
  const callbackBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/faceswap-callback`;

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

  // ---- Apply-my-identity on a look canvas (artist_looks child) -------
  if (body.parentLookId) {
    if (!isHttpsUrl(body.sourceImageUrl)) {
      return json(400, { error: "missing_source_image_url" });
    }

    const { data: parentLook, error: parentErr } = await admin
      .from("artist_looks")
      .select("id, artist_id, name")
      .eq("id", body.parentLookId)
      .maybeSingle();
    if (parentErr) return json(500, { error: "parent_look_query_failed", detail: parentErr.message });
    if (!parentLook || parentLook.artist_id !== body.artistId) {
      return json(404, { error: "parent_look_not_found" });
    }

    let faceImageUrl: string | null = isHttpsUrl(body.identityReferenceUrl)
      ? body.identityReferenceUrl.trim()
      : null;
    if (!faceImageUrl) {
      const { data: artistRow, error: artistErr } = await admin
        .from("artists")
        .select("identity_profile_json")
        .eq("id", body.artistId)
        .maybeSingle();
      if (artistErr) return json(500, { error: "artist_query_failed", detail: artistErr.message });
      const identity = (artistRow?.identity_profile_json ?? {}) as Record<string, unknown>;
      const canonical = identity.canonical_base_image_url;
      if (isHttpsUrl(canonical)) faceImageUrl = canonical.trim();
    }
    if (!faceImageUrl) {
      let faceQuery = admin
        .from("character_features")
        .select("id, file_url, storage_path, feature_type, is_primary, is_locked, uploaded_at")
        .eq("artist_id", body.artistId)
        .eq("feature_type", "face");
      if (body.faceFeatureId) faceQuery = faceQuery.eq("id", body.faceFeatureId);
      const { data: faceRows, error: faceErr } = await faceQuery;
      if (faceErr) return json(500, { error: "face_query_failed", detail: faceErr.message });
      if (!faceRows || faceRows.length === 0) {
        return json(404, { error: "no_face_reference", detail: "Set a canonical base photo or Character DNA face." });
      }
      const face =
        faceRows.find((f: any) => f.is_primary) ??
        faceRows.find((f: any) => f.is_locked) ??
        [...faceRows].sort((a: any, b: any) => (b.uploaded_at > a.uploaded_at ? 1 : -1))[0];
      const facePath = face.storage_path || face.file_url;
      if (!facePath) return json(404, { error: "face_reference_pathless" });
      const { data: faceSigned, error: faceSignErr } = await admin.storage
        .from("artist-assets")
        .createSignedUrl(facePath, SIGN_TTL_INPUT);
      if (faceSignErr || !faceSigned?.signedUrl) {
        return json(500, { error: "face_sign_failed", detail: faceSignErr?.message });
      }
      faceImageUrl = faceSigned.signedUrl;
    }

    const childLookId = crypto.randomUUID();
    const recipe = {
      pipeline_preference: "identity_faceswap",
      source_image_url: body.sourceImageUrl.trim(),
      identity_reference_url: faceImageUrl,
      parent_look_id: body.parentLookId,
      generation_metadata: null,
    };
    const { data: childLook, error: childInsErr } = await userClient
      .from("artist_looks")
      .insert({
        id: childLookId,
        artist_id: body.artistId,
        user_id: userId,
        name: body.name ?? `${String(parentLook.name ?? "Look").slice(0, 64)} · my identity`,
        description: "Identity face-swap: graft artist likeness onto the canvas.",
        status: "pending",
        generated_image_url: null,
        generated_storage_path: null,
        composition_recipe_json: recipe,
        pipeline_used: null,
        cost_cents: 0,
        iterations: 2,
        parent_look_id: body.parentLookId,
      })
      .select("*")
      .single();
    if (childInsErr || !childLook) {
      return json(500, { error: "look_insert_failed", detail: childInsErr?.message });
    }

    const callbackUrl = `${callbackBase}?look_id=${childLookId}`;
    try {
      const resp = await fetch(ccFaceswapUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
        body: JSON.stringify({
          mode: "submit",
          callbackUrl,
          callbackSecret: proxySecret,
          faceImageUrl,
          targetImageUrl: body.sourceImageUrl.trim(),
          gender: body.gender ?? "male",
          workflowType: body.workflowType ?? "user_hair",
          upscale: body.upscale ?? true,
        }),
      });
      const cc = await resp.json().catch(() => ({}));
      if (!resp.ok || !cc?.ok) {
        await admin
          .from("artist_looks")
          .update({
            status: "failed",
            error_message: `cc_submit_failed: ${cc?.errorMessage ?? JSON.stringify(cc).slice(0, 300)}`,
          })
          .eq("id", childLookId);
        return json(502, {
          error: "faceswap_submit_failed",
          errorCode: cc?.errorCode ?? `cc_${resp.status}`,
          detail: cc?.errorMessage ?? JSON.stringify(cc).slice(0, 400),
          lookId: childLookId,
        });
      }
    } catch (err) {
      await admin
        .from("artist_looks")
        .update({ status: "failed", error_message: `cc_unreachable: ${String(err).slice(0, 200)}` })
        .eq("id", childLookId);
      return json(502, { error: "cc_unreachable", detail: String(err).slice(0, 300), lookId: childLookId });
    }

    return json(200, { ok: true, lookId: childLookId, look: childLook });
  }

  // ---- VLONE / project-asset flow (existing) -------------------------
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

  // ---- insert provider_jobs row FIRST so we can hand its id to CC ----
  // request_payload_json carries everything the callback needs to insert
  // the final project_assets row (user_id is on the column itself).
  const requestPayload = {
    capability: "identity_apply",
    artistId: body.artistId,
    projectId: body.projectId,
    sceneAssetId: body.sceneAssetId ?? null,
    scenePath: body.scenePath,
    sceneBucket,
    shotId: body.shotId ?? null,
    faceFeatureId: face.id,
    gender: body.gender ?? "male",
    workflowType: body.workflowType ?? "user_hair",
    upscale: body.upscale ?? true,
  };
  const { data: jobRow, error: jobInsErr } = await admin
    .from("provider_jobs")
    .insert({
      user_id: userId,
      project_id: body.projectId,
      provider: "fal",
      status: "queued",
      request_payload_json: requestPayload,
      response_payload_json: {},
    })
    .select("id")
    .single();
  if (jobInsErr || !jobRow) {
    return json(500, { error: "job_insert_failed", detail: jobInsErr?.message });
  }
  const jobId = jobRow.id as string;
  const callbackUrl = `${callbackBase}?job_id=${jobId}`;

  // ---- submit to CC faceswap-generate (submit-only mode) -------------
  let cc: any;
  try {
    const resp = await fetch(ccFaceswapUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": proxySecret },
      body: JSON.stringify({
        mode: "submit",
        callbackUrl,
        callbackSecret: proxySecret,
        faceImageUrl: faceSigned.signedUrl,
        targetImageUrl: sceneSigned.signedUrl,
        gender: body.gender ?? "male",
        workflowType: body.workflowType ?? "user_hair",
        upscale: body.upscale ?? true,
      }),
    });
    cc = await resp.json().catch(() => ({}));
    if (!resp.ok || !cc?.ok) {
      await admin
        .from("provider_jobs")
        .update({
          status: "failed",
          error_text: `cc_submit_failed: ${cc?.errorMessage ?? JSON.stringify(cc).slice(0, 300)}`,
        })
        .eq("id", jobId);
      return json(502, {
        error: "faceswap_submit_failed",
        errorCode: cc?.errorCode ?? `cc_${resp.status}`,
        detail: cc?.errorMessage ?? JSON.stringify(cc).slice(0, 400),
        jobId,
      });
    }
  } catch (err) {
    await admin
      .from("provider_jobs")
      .update({ status: "failed", error_text: `cc_unreachable: ${String(err).slice(0, 200)}` })
      .eq("id", jobId);
    return json(502, { error: "cc_unreachable", detail: String(err).slice(0, 300), jobId });
  }

  // Record the Fal job id if CC returned one.
  if (cc.providerJobId) {
    await admin
      .from("provider_jobs")
      .update({ external_job_id: String(cc.providerJobId), status: "running" })
      .eq("id", jobId);
  } else {
    await admin
      .from("provider_jobs")
      .update({ status: "running" })
      .eq("id", jobId);
  }

  return json(200, {
    ok: true,
    jobId,
    externalJobId: cc.providerJobId ?? null,
  });
});
