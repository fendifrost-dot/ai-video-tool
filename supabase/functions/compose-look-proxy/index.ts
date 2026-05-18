// AVT edge function — compose-look-proxy
//
// Owns ALL AVT-side data access for look composition:
//   1. Authenticates the calling user (Supabase JWT).
//   2. Resolves all picked feature/library refs against AVT tables.
//   3. Signs short-lived URLs for each reference image.
//   4. Forwards the signed URLs + LoRA info + prompt fragments to CC's
//      compose-look, which is now pure Fal orchestration (no AVT creds).
//   5. Downloads the rendered image from Fal, uploads it to AVT's
//      look-composites bucket as the user (RLS-scoped), inserts the
//      artist_looks row as the user, and signs a preview URL.
//
// CC therefore no longer needs AVT URL / anon / service-role secrets. The
// only shared secret across the boundary is COMPOSE_LOOK_PROXY_SECRET.
//
// Env vars required (AVT):
//   - COMPOSE_LOOK_CC_URL          (https://wkzwcfmvnwolgrdpnygc.supabase.co/functions/v1/compose-look)
//   - COMPOSE_LOOK_PROXY_SECRET    (shared with CC)
//   - SUPABASE_URL                 (provided by Lovable)
//   - SUPABASE_ANON_KEY            (provided by Lovable)
//   - SUPABASE_SERVICE_ROLE_KEY    (provided by Lovable — used only for
//                                   feature-resolution reads and signed-URL
//                                   creation; never forwarded to CC)
//
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { defaultLookName, type PipelineMode, sniffMime } from "./helpers.ts";

type Body = {
  artistId: string;
  faceFeatureId?: string;
  wardrobeFeatureIds: string[];
  jewelryFeatureIds?: string[];
  locationId?: string;
  propIds?: string[];
  basePrompt: string;
  stylingNotes?: string;
  pipelinePreference?: PipelineMode;
  parentLookId?: string;
  name?: string;
};

type ResolvedFeature = {
  id: string;
  feature_type: string;
  label: string;
  storage_path: string | null;
  file_url: string | null;
  bucket: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL_INPUT = 2700; // 45 min — Fal pulls quickly
const SIGN_TTL_RESULT = 3600;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // ---- env ------------------------------------------------------------
  const ccUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret = Deno.env.get("COMPOSE_LOOK_PROXY_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!ccUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }

  // ---- auth: user JWT ------------------------------------------------
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

  // Admin client used ONLY for feature-resolution reads + signing.
  // Never forwarded to CC and never used for writes.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ---- body ----------------------------------------------------------
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!body?.artistId) return json(400, { error: "missing_artist_id" });
  if (!Array.isArray(body.wardrobeFeatureIds) || body.wardrobeFeatureIds.length === 0) {
    return json(400, { error: "wardrobe_required" });
  }
  if (!body.basePrompt || body.basePrompt.trim().length < 4) {
    return json(400, { error: "basePrompt_too_short" });
  }

  // ---- artist + LoRA info -------------------------------------------
  const { data: artist, error: artistErr } = await admin
    .from("artists")
    .select("id, user_id, name, identity_profile_json")
    .eq("id", body.artistId)
    .maybeSingle();
  if (artistErr) return json(500, { error: "artist_query_failed", detail: artistErr.message });
  if (!artist) return json(404, { error: "artist_not_found" });
  if (artist.user_id !== userId) return json(403, { error: "artist_forbidden" });

  const identity = (artist.identity_profile_json ?? {}) as Record<string, any>;
  const loraInfo = identity.lora ?? null;
  const loraUrl: string | null = typeof loraInfo?.url === "string" ? loraInfo.url : null;
  const triggerWord: string = typeof loraInfo?.trigger === "string" ? loraInfo.trigger : "";

  // ---- resolve features --------------------------------------------
  const allFeatureIds = [
    body.faceFeatureId,
    ...body.wardrobeFeatureIds,
    ...(body.jewelryFeatureIds ?? []),
  ].filter(Boolean) as string[];

  const features = await resolveFeatures(admin, allFeatureIds, body.artistId);
  const faceFeature = body.faceFeatureId
    ? features.find((f) => f.id === body.faceFeatureId) ?? null
    : await defaultFaceFeature(admin, body.artistId);
  const wardrobeFeatures = body.wardrobeFeatureIds
    .map((id) => features.find((f) => f.id === id))
    .filter((f): f is ResolvedFeature => !!f);
  const jewelryFeatures = (body.jewelryFeatureIds ?? [])
    .map((id) => features.find((f) => f.id === id))
    .filter((f): f is ResolvedFeature => !!f);

  const locationFeature = body.locationId
    ? await resolveLibraryItem(admin, "location_library", body.locationId, userId, "location-refs")
    : null;
  const propsFeatures: ResolvedFeature[] = [];
  for (const pid of body.propIds ?? []) {
    const p = await resolveLibraryItem(admin, "prop_library", pid, userId, "prop-refs");
    if (p) propsFeatures.push(p);
  }

  // ---- sign URLs (for CC to feed into Fal) -------------------------
  const faceUrl = faceFeature
    ? await signUrl(admin, faceFeature.bucket, faceFeature.storage_path ?? faceFeature.file_url, SIGN_TTL_INPUT)
    : null;
  const wardrobeUrls: string[] = [];
  for (const w of wardrobeFeatures) {
    const u = await signUrl(admin, w.bucket, w.storage_path ?? w.file_url, SIGN_TTL_INPUT);
    if (u) wardrobeUrls.push(u);
  }
  const jewelryUrls: string[] = [];
  for (const j of jewelryFeatures) {
    const u = await signUrl(admin, j.bucket, j.storage_path ?? j.file_url, SIGN_TTL_INPUT);
    if (u) jewelryUrls.push(u);
  }
  const locationUrl = locationFeature
    ? await signUrl(admin, locationFeature.bucket, locationFeature.storage_path ?? locationFeature.file_url, SIGN_TTL_INPUT)
    : null;
  const propUrls: string[] = [];
  for (const p of propsFeatures) {
    const u = await signUrl(admin, p.bucket, p.storage_path ?? p.file_url, SIGN_TTL_INPUT);
    if (u) propUrls.push(u);
  }

  // ---- forward to CC ------------------------------------------------
  const ccPayload = {
    signed_urls: {
      face: faceUrl,
      wardrobe: wardrobeUrls,
      jewelry: jewelryUrls,
      location: locationUrl,
      props: propUrls,
    },
    recipe: {
      wardrobe_labels: wardrobeFeatures.map((f) => f.label),
      jewelry_labels: jewelryFeatures.map((f) => f.label),
      has_location: !!locationFeature,
    },
    lora_url: loraUrl,
    trigger_word: triggerWord,
    base_prompt: body.basePrompt,
    styling_notes: body.stylingNotes ?? null,
    pipeline_preference: body.pipelinePreference ?? "auto",
  };

  let ccResp: Response;
  try {
    ccResp = await fetch(ccUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Proxy-Secret": proxySecret,
      },
      body: JSON.stringify(ccPayload),
    });
  } catch (err) {
    return json(502, { error: "cc_unreachable", detail: String(err) });
  }
  const ccText = await ccResp.text();
  if (!ccResp.ok) {
    return new Response(ccText, {
      status: ccResp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let ccJson: any;
  try {
    ccJson = JSON.parse(ccText);
  } catch {
    return json(502, { error: "cc_bad_response" });
  }

  const falImageUrl: string | undefined = ccJson?.fal_image_url;
  const pipelineUsed: string = ccJson?.pipeline_used ?? "unknown";
  const costCents: number = Number(ccJson?.cost_cents ?? 0);
  const stages: any[] = Array.isArray(ccJson?.stages) ? ccJson.stages : [];
  const generationMetadata = ccJson?.generation_metadata ?? null;
  if (!falImageUrl) return json(502, { error: "cc_missing_fal_url" });

  // ---- download bytes from Fal -------------------------------------
  let composedBytes: Uint8Array;
  let mime: "image/png" | "image/jpeg" | "image/webp";
  try {
    const dlResp = await fetch(falImageUrl, {
      headers: { Accept: "image/png, image/jpeg, image/webp" },
    });
    if (!dlResp.ok) throw new Error(`download_${dlResp.status}`);
    const buf = new Uint8Array(await dlResp.arrayBuffer());
    const sniffed = sniffMime(buf);
    if (!sniffed) throw new Error("unknown_mime");
    composedBytes = buf;
    mime = sniffed;
  } catch (err) {
    return json(502, { error: "fal_download_failed", detail: String(err) });
  }

  // ---- upload to look-composites as the user (RLS-scoped) ----------
  const lookId = crypto.randomUUID();
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const storagePath = `${userId}/${body.artistId}/${lookId}.${ext}`;
  const { error: uploadErr } = await userClient.storage
    .from("look-composites")
    .upload(storagePath, composedBytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    return json(500, { error: "upload_failed", detail: uploadErr.message });
  }

  // ---- insert artist_looks as the user -----------------------------
  const recipe = {
    face_feature_id: faceFeature?.id ?? null,
    wardrobe_feature_ids: wardrobeFeatures.map((f) => f.id),
    jewelry_feature_ids: jewelryFeatures.map((f) => f.id),
    location_id: locationFeature?.id ?? null,
    prop_ids: propsFeatures.map((p) => p.id),
    base_prompt: body.basePrompt,
    styling_notes: body.stylingNotes ?? null,
    lora_url: loraUrl,
    lora_trigger: triggerWord,
    stages,
    generation_metadata: generationMetadata,
  };

  const { data: lookRow, error: insertErr } = await userClient
    .from("artist_looks")
    .insert({
      id: lookId,
      artist_id: body.artistId,
      user_id: userId,
      name: body.name ?? defaultLookName(wardrobeFeatures.map((f) => f.label)),
      description: body.basePrompt,
      status: "draft",
      generated_image_url: storagePath,
      generated_storage_path: storagePath,
      composition_recipe_json: recipe,
      pipeline_used: pipelineUsed,
      cost_cents: costCents,
      iterations: body.parentLookId ? 2 : 1,
      parent_look_id: body.parentLookId ?? null,
    })
    .select("*")
    .single();
  if (insertErr) {
    return json(500, { error: "insert_failed", detail: insertErr.message });
  }

  // ---- sign preview URL --------------------------------------------
  const signedResult = await signUrl(userClient as any, "look-composites", storagePath, SIGN_TTL_RESULT);

  return json(200, {
    look: lookRow,
    signed_url: signedResult,
    pipeline_used: pipelineUsed,
    cost_cents: costCents,
    stages,
    generation_metadata: generationMetadata,
  });
});

// ---------------------------------------------------------------------------
async function resolveFeatures(
  client: any,
  ids: string[],
  artistId: string,
): Promise<ResolvedFeature[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from("character_features")
    .select("id, feature_type, label, storage_path, file_url")
    .in("id", ids)
    .eq("artist_id", artistId);
  if (error) throw new Error(`features_query_failed: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    feature_type: r.feature_type,
    label: r.label,
    storage_path: r.storage_path ?? null,
    file_url: r.file_url ?? null,
    bucket: r.feature_type?.startsWith?.("wardrobe_") ? "wardrobe-refs" : "artist-assets",
  }));
}

async function defaultFaceFeature(
  client: any,
  artistId: string,
): Promise<ResolvedFeature | null> {
  const { data, error } = await client
    .from("character_features")
    .select("id, feature_type, label, storage_path, file_url, is_locked, is_primary, uploaded_at")
    .eq("artist_id", artistId)
    .eq("feature_type", "face")
    .order("is_locked", { ascending: false })
    .order("is_primary", { ascending: false })
    .order("uploaded_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const r = data[0];
  return {
    id: r.id,
    feature_type: r.feature_type,
    label: r.label,
    storage_path: r.storage_path ?? null,
    file_url: r.file_url ?? null,
    bucket: "artist-assets",
  };
}

async function resolveLibraryItem(
  client: any,
  table: "location_library" | "prop_library",
  id: string,
  userId: string,
  bucket: string,
): Promise<ResolvedFeature | null> {
  const { data, error } = await client
    .from(table)
    .select("id, name, storage_path, file_url")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    feature_type: table === "location_library" ? "location" : "prop",
    label: data.name,
    storage_path: data.storage_path ?? null,
    file_url: data.file_url ?? null,
    bucket,
  };
}

async function signUrl(
  client: any,
  bucket: string,
  pathOrFileUrl: string | null,
  expiresIn: number,
): Promise<string | null> {
  if (!pathOrFileUrl) return null;
  const { data, error } = await client.storage.from(bucket).createSignedUrl(pathOrFileUrl, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}
