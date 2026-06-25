// AVT edge function — grok-image-garment-proxy
//
// Full-outfit garment-truth hero frame via xAI POST /v1/images/edits.
// Multi-image: hero frame (IMAGE_0) + on-model garment refs (IMAGE_1+).
//
// Auth: user JWT (verify_jwt = true in supabase/config.toml).
//
// Required Edge Function secrets (AVT project qoyxgnkvjukovkrvdaiq):
//   XAI_API_KEY — same xAI key as Control Center Frost_Grok (one key for image + video)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (runtime defaults)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickGrokGarmentReferencePaths } from "../_shared/garmentReference.ts";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";
import { callXaiImageEdits } from "../_shared/xaiImageEdits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 2700;
const DEFAULT_MODEL = "grok-imagine-image-quality";

const GROK_GARMENT_TRUTH_PROMPT = `Photorealistic edit of the source frame: keep the exact pose, camera angle, lighting, and background, but dress Fendi Frost in the COMPLETE OUTFIT worn by the model in the reference — jacket, shirt, tie, pants, and every worn piece, as one full look. EXCLUDE the model's glasses/eyewear.

Priorities, in order:
1. Full-outfit construction fidelity — exact collar shape/stand, exact stripe width/position/angle, exact zipper/hardware/buttons/pockets/seams, exact shirt + tie, exact trouser cut, exact fabric wash and drape across the whole outfit. Do not invent or simplify any element.
2. Preserve Fendi's OWN identity — his face, beard, skin tone, head shape, body proportions, and his own glasses. Do NOT copy the model's face or eyewear onto him.
3. Preserve the original pose, background, and lighting.

<IMAGE_0> is Fendi's real video frame (pose, lighting, background). <IMAGE_1> is the on-model full-look product reference for garment construction. Use the supplied references for construction detail.`;

type Body = {
  artistId: string;
  wardrobeFeatureId: string;
  scenePath: string;
  sceneBucket?: string;
  name?: string;
  heroFrameSessionId?: string;
  candidateIndex?: number;
  projectId?: string;
  prompt?: string;
  model?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sniffMime(buf: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) return "image/png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

async function signStoragePath(
  admin: ReturnType<typeof createClient>,
  path: string,
  buckets: string[],
): Promise<string | null> {
  for (const bucket of buckets) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGN_TTL);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const xaiKey = resolveXaiApiKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!xaiKey) {
    return json(500, { error: "xai_api_key_missing", detail: xaiKeyMissingMessage() });
  }
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
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
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!body?.artistId || !body?.wardrobeFeatureId || !body?.scenePath) {
    return json(400, { error: "missing_required_fields" });
  }

  const { data: wardrobe, error: wErr } = await admin
    .from("character_features")
    .select("id, artist_id, feature_type, label, file_url, storage_path, reference_images")
    .eq("id", body.wardrobeFeatureId)
    .maybeSingle();
  if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
  if (!wardrobe || wardrobe.artist_id !== body.artistId) {
    return json(404, { error: "wardrobe_not_found" });
  }

  const refImages = Array.isArray(wardrobe.reference_images) ? wardrobe.reference_images : [];
  const fallback = wardrobe.storage_path ?? wardrobe.file_url;
  const garmentPaths = pickGrokGarmentReferencePaths(refImages, fallback, 2);
  if (garmentPaths.length === 0) {
    return json(404, { error: "wardrobe_no_image" });
  }

  const sceneBucket = body.sceneBucket || "project-references";
  const heroUrl = await signStoragePath(admin, body.scenePath, [sceneBucket]);
  if (!heroUrl) return json(500, { error: "scene_sign_failed" });

  const garmentUrls: string[] = [];
  for (const p of garmentPaths) {
    const url = await signStoragePath(admin, p, ["wardrobe-refs", "product-assets"]);
    if (url) garmentUrls.push(url);
  }
  if (garmentUrls.length === 0) {
    return json(500, { error: "garment_sign_failed" });
  }

  const imageInputs = [
    { url: heroUrl, type: "image_url" as const },
    ...garmentUrls.map((url) => ({ url, type: "image_url" as const })),
  ].slice(0, 3);

  const childLookId = crypto.randomUUID();
  const recipe = {
    pipeline_preference: "grok_image_edit_garment_truth",
    wardrobe_feature_id: wardrobe.id,
    garment_paths_used: garmentPaths,
    scene_path: body.scenePath,
    scene_bucket: sceneBucket,
    hero_frame_session_id: body.heroFrameSessionId ?? null,
    hero_frame_candidate_index: body.candidateIndex ?? null,
    hero_frame_project_id: body.projectId ?? null,
    candidate_type: "hero_frame",
    garment_truth_lane: true,
    identity_restored: false,
    generation_metadata: null,
  };

  const { data: childLook, error: insErr } = await userClient
    .from("artist_looks")
    .insert({
      id: childLookId,
      artist_id: body.artistId,
      user_id: userId,
      name:
        body.name ??
        `Hero · ${String(wardrobe.label).slice(0, 40)} · Grok garment-truth`,
      description: "Grok Image-Edit full-outfit garment transfer onto hero frame.",
      status: "pending",
      generated_image_url: null,
      generated_storage_path: null,
      composition_recipe_json: recipe,
      pipeline_used: null,
      cost_cents: 0,
      iterations: 1,
      parent_look_id: null,
    })
    .select("*")
    .single();
  if (insErr || !childLook) {
    return json(500, { error: "look_insert_failed", detail: insErr?.message });
  }

  const finish = async () => {
    try {
      const imageBuf = await callXaiImageEdits({
        apiKey: xaiKey,
        model: body.model ?? DEFAULT_MODEL,
        prompt: body.prompt ?? GROK_GARMENT_TRUTH_PROMPT,
        images: imageInputs,
      });

      const mime = sniffMime(imageBuf);
      if (!mime) throw new Error("unknown_mime");
      const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
      const storagePath = `${userId}/${body.artistId}/${childLookId}.${ext}`;

      const { error: uploadErr } = await admin.storage
        .from("look-composites")
        .upload(storagePath, imageBuf, { contentType: mime, cacheControl: "3600", upsert: true });
      if (uploadErr) throw new Error(`upload_failed: ${uploadErr.message}`);

      const meta = {
        model: body.model ?? DEFAULT_MODEL,
        garment_paths: garmentPaths,
        wardrobe_feature_id: wardrobe.id,
        scene_path: body.scenePath,
        hero_frame_candidate: true,
        hero_frame_session_id: body.heroFrameSessionId ?? null,
        candidate_index: body.candidateIndex ?? null,
        candidate_type: "hero_frame",
        garment_truth_lane: true,
        identity_restored: false,
        xai_image_count: imageInputs.length,
      };

      const { data: existing } = await admin
        .from("artist_looks")
        .select("composition_recipe_json")
        .eq("id", childLookId)
        .maybeSingle();
      const existingRecipe = (existing?.composition_recipe_json ?? {}) as Record<string, unknown>;
      existingRecipe.generation_metadata = meta;
      existingRecipe.identity_restored = false;

      const { error: updateErr } = await admin
        .from("artist_looks")
        .update({
          status: "complete",
          generated_image_url: storagePath,
          generated_storage_path: storagePath,
          pipeline_used: "grok_image_edit_garment_truth",
          cost_cents: 12,
          composition_recipe_json: existingRecipe,
          error_message: null,
        })
        .eq("id", childLookId);
      if (updateErr) throw new Error(`update_failed: ${updateErr.message}`);
    } catch (err) {
      await admin
        .from("artist_looks")
        .update({
          status: "failed",
          error_message: String(err).slice(0, 500),
        })
        .eq("id", childLookId);
    }
  };

  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (er && typeof er.waitUntil === "function") {
    er.waitUntil(finish());
  } else {
    await finish();
  }

  return json(200, { ok: true, lookId: childLookId, look: childLook, status: "pending" });
});
