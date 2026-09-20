// AVT edge function — grok-image-look-composite
//
// GENERATIVE look-composite hero frame via xAI POST /v1/images/edits.
// Distinct from grok-image-garment-proxy (garment-truth): there is NO garment
// photograph. The caller supplies identity reference image(s) that anchor WHO
// the person is, plus a text prompt (and optional negative) describing the look,
// wardrobe and scene. Grok generates a new photoreal 9:16 hero image of the same
// person in that look. This is the "Look B — White Ice" shape from
// docs/treatments/ysl-ice-on.looks.json (dependencyRole: "look_composite").
//
// Auth: user JWT (verify_jwt = true in supabase/config.toml).
//
// Required Edge Function secrets (AVT project qoyxgnkvjukovkrvdaiq):
//   XAI_API_KEY — same xAI key as Control Center Frost_Grok (one key for image + video)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (runtime defaults)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";
import { callXaiImageEditsDetailed } from "../_shared/xaiImageEdits.ts";
import { validateLookCompositeInput } from "../_shared/lookCompositePrompt.ts";
import {
  composeLookGeneration,
  DEFAULT_ASPECT,
  DEFAULT_FRAMING,
  type LookFraming,
} from "../_shared/lookGenerationContract.ts";
import { evaluateLookQa } from "../_shared/lookQaGate.ts";
import { readImageDimensions } from "../_shared/imageDimensions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 2700;
const DEFAULT_MODEL = "grok-imagine-image-quality";
const MAX_IDENTITY_IMAGES = 3;
// Buckets an identity reference path may live in. project-references holds
// captured hero frames; look-composites holds prior generated looks (useful as
// a same-person anchor); wardrobe-refs / product-assets are last-resort.
const IDENTITY_BUCKET_FALLBACKS = [
  "project-references",
  "look-composites",
  "wardrobe-refs",
  "product-assets",
];

type Body = {
  artistId: string;
  /** Identity anchor storage path (single). At least one of identityPath /
   *  identityPaths[0] is required. */
  identityPath?: string;
  /** Multiple identity anchors (same person, different frames) — up to 3. */
  identityPaths?: string[];
  identityBucket?: string;
  /** Optional garment/look reference still (part of the shared contract; the
   *  generative look_composite lane records it but does not require it). */
  garmentPath?: string;
  prompt?: string;
  negativePrompt?: string;
  /** Look-generation contract framing. Defaults to full_body (head-to-toe). */
  framing?: LookFraming;
  /** Target aspect "W:H". Defaults to 9:16. */
  aspect?: string;
  name?: string;
  heroFrameSessionId?: string;
  candidateIndex?: number;
  projectId?: string;
  model?: string;
  /** Optional xAI output resolution ("1k" | "2k"). Forwarded verbatim to
   *  /v1/images/edits only when set; absent → native-default behaviour. */
  resolution?: string;
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
  admin: any,
  path: string,
  buckets: string[],
): Promise<string | null> {
  // An http(s) path is already a URL — pass it through untouched.
  if (/^https?:\/\//i.test(path)) return path;
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

  const identityPaths = [
    ...(body.identityPath ? [body.identityPath] : []),
    ...(Array.isArray(body.identityPaths) ? body.identityPaths : []),
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .slice(0, MAX_IDENTITY_IMAGES);

  if (!body?.artistId) return json(400, { error: "missing_required_fields" });
  if (identityPaths.length === 0) return json(400, { error: "identity_path_required" });

  const validated = validateLookCompositeInput({
    prompt: body.prompt,
    negativePrompt: body.negativePrompt,
  });
  if (!validated.ok) return json(400, { error: validated.error });

  // Ownership check — the caller must own this artist. Prevents generating a
  // look row against someone else's artist id.
  const { data: artist, error: aErr } = await admin
    .from("artists")
    .select("id, user_id")
    .eq("id", body.artistId)
    .maybeSingle();
  if (aErr) return json(500, { error: "artist_query_failed", detail: aErr.message });
  if (!artist || artist.user_id !== userId) {
    return json(404, { error: "artist_not_found" });
  }

  const identityBuckets = body.identityBucket
    ? [body.identityBucket, ...IDENTITY_BUCKET_FALLBACKS]
    : IDENTITY_BUCKET_FALLBACKS;

  const identityUrls: string[] = [];
  for (const p of identityPaths) {
    const url = await signStoragePath(admin, p, identityBuckets);
    if (url) identityUrls.push(url);
  }
  if (identityUrls.length === 0) return json(500, { error: "identity_sign_failed" });

  const imageInputs = identityUrls
    .map((url) => ({ url, type: "image_url" as const }))
    .slice(0, MAX_IDENTITY_IMAGES);

  // [look-composite-debug] Which identity images the proxy is about to send —
  // storage paths + URL lengths only, query string (signed-URL token) stripped.
  const dbgId = (u: string): string => {
    const q = u.indexOf("?");
    const path = q >= 0 ? u.slice(0, q) : u;
    return `${path} (len=${u.length})`;
  };
  console.log(
    `[look-composite-debug] identityInputs.length=${imageInputs.length} ` +
      `identityPaths=${identityPaths.length} identityUrlsSigned=${identityUrls.length}`,
  );
  identityUrls.forEach((url, i) =>
    console.log(`[look-composite-debug] IDENTITY_${i} : ${dbgId(url)}`)
  );

  // Look-generation contract: mechanically inject framing constraints + the
  // protective negatives (bare legs, cropped face, warped logo, close-up …) so
  // this lane cannot silently ship a close-up wardrobe look. Default framing is
  // full_body (head-to-toe) at 9:16 unless the caller opts into hero/broll.
  const framing = body.framing ?? DEFAULT_FRAMING;
  const aspect = (body.aspect ?? "").trim() || DEFAULT_ASPECT;
  const composed = composeLookGeneration({
    identityPaths,
    garmentPath: body.garmentPath ?? null,
    prompt: validated.prompt,
    negativePrompt: validated.negativePrompt,
    aspect,
    framing,
  });
  const promptSent = composed.promptSent;

  const childLookId = crypto.randomUUID();
  const recipe = {
    pipeline_preference: "grok_image_look_composite",
    generative_look_composite: true,
    identity_paths_used: identityPaths,
    identity_bucket: body.identityBucket ?? null,
    garment_path: body.garmentPath ?? null,
    scene_path: identityPaths[0],
    hero_frame_session_id: body.heroFrameSessionId ?? null,
    hero_frame_candidate_index: body.candidateIndex ?? null,
    hero_frame_project_id: body.projectId ?? null,
    candidate_type: "hero_frame",
    garment_truth_lane: false,
    identity_restored: false,
    negative_prompt: composed.negativePrompt,
    framing,
    aspect,
    generation_metadata: null,
  };

  const { data: childLook, error: insErr } = await userClient
    .from("artist_looks")
    .insert({
      id: childLookId,
      artist_id: body.artistId,
      user_id: userId,
      name: body.name ?? "Hero · generative look composite · Grok",
      description: "Grok generative look-composite from identity anchor + prompt.",
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
    const grokDebug: Record<string, unknown> = {
      lane: "grok_image_look_composite",
      identityInputsLength: imageInputs.length,
      identityPaths,
      promptPreview: promptSent.slice(0, 160),
      hasNegative: Boolean(validated.negativePrompt),
      xaiModel: body.model ?? DEFAULT_MODEL,
      xaiImagesSent: imageInputs.length,
      xaiStatus: null as number | null,
      xaiBodyPreview: null as string | null,
    };
    try {
      console.log(
        `[look-composite-debug] prompt len=${promptSent.length} ` +
          `hasNegative=${Boolean(validated.negativePrompt)} ` +
          `preview="${promptSent.slice(0, 120)}"`,
      );
      const xaiResult = await callXaiImageEditsDetailed({
        apiKey: xaiKey,
        model: body.model ?? DEFAULT_MODEL,
        prompt: promptSent,
        images: imageInputs,
        resolution: body.resolution,
        debugLabel: "look-composite-debug",
      });
      const imageBuf = xaiResult.bytes;
      grokDebug.xaiStatus = xaiResult.status;
      grokDebug.xaiBodyPreview = xaiResult.bodyPreview ?? null;

      const mime = sniffMime(imageBuf);
      if (!mime) throw new Error("unknown_mime");
      const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
      const storagePath = `${userId}/${body.artistId}/${childLookId}.${ext}`;

      const { error: uploadErr } = await admin.storage
        .from("look-composites")
        .upload(storagePath, imageBuf, { contentType: mime, cacheControl: "3600", upsert: true });
      if (uploadErr) throw new Error(`upload_failed: ${uploadErr.message}`);

      // Output QA gate — deterministic, fail closed. Runs the aspect check on
      // real pixel dimensions before the look can be marked complete. The
      // face-coverage / feet checks activate automatically when a detector
      // supplies faceBox / feetNearBottomScore (see lookQaGate.ts); this lane
      // has no in-edge face detector, so those are left null and skipped.
      const dims = readImageDimensions(imageBuf);
      const qa = evaluateLookQa({
        width: dims?.width ?? 0,
        height: dims?.height ?? 0,
        framing,
        expectedAspect: aspect,
        faceBox: null,
        feetNearBottomScore: null,
      });
      grokDebug.qa = qa;
      grokDebug.imageDimensions = dims;
      console.log(
        `[look-composite-debug] qa ok=${qa.ok} ` +
          `dims=${dims?.width ?? "?"}x${dims?.height ?? "?"} ` +
          `reasons=${qa.ok ? "" : (qa as { reasons: string[] }).reasons.join(",")}`,
      );

      const meta = {
        model: body.model ?? DEFAULT_MODEL,
        identity_paths: identityPaths,
        garment_path: body.garmentPath ?? null,
        hero_frame_candidate: true,
        hero_frame_session_id: body.heroFrameSessionId ?? null,
        candidate_index: body.candidateIndex ?? null,
        candidate_type: "hero_frame",
        garment_truth_lane: false,
        generative_look_composite: true,
        identity_restored: false,
        negative_prompt: composed.negativePrompt,
        framing,
        aspect,
        xai_image_count: imageInputs.length,
        qa,
        qa_artifact_path: storagePath,
        grok_debug: grokDebug,
      };

      const { data: existing } = await admin
        .from("artist_looks")
        .select("composition_recipe_json")
        .eq("id", childLookId)
        .maybeSingle();
      const existingRecipe = (existing?.composition_recipe_json ?? {}) as Record<string, unknown>;
      existingRecipe.generation_metadata = meta;

      // Fail closed: a QA failure is NOT a success. Keep the uploaded artifact
      // for human inspection (qa_artifact_path in the recipe) but mark the look
      // `failed` with a machine-readable reason and leave generated_* null so no
      // downstream UI presents it as a completed, downloadable look.
      const update = qa.ok
        ? {
            status: "complete",
            generated_image_url: storagePath,
            generated_storage_path: storagePath,
            pipeline_used: "grok_image_look_composite",
            cost_cents: 12,
            composition_recipe_json: existingRecipe,
            error_message: null,
          }
        : {
            status: "failed",
            generated_image_url: null,
            generated_storage_path: null,
            pipeline_used: "grok_image_look_composite",
            cost_cents: 12,
            composition_recipe_json: existingRecipe,
            error_message: `qa_failed: ${(qa as { reasons: string[] }).reasons.join(",")}`,
          };

      const { error: updateErr } = await admin
        .from("artist_looks")
        .update(update)
        .eq("id", childLookId);
      if (updateErr) throw new Error(`update_failed: ${updateErr.message}`);
    } catch (err) {
      if (grokDebug.xaiBodyPreview == null) {
        grokDebug.xaiBodyPreview = String(err).slice(0, 300);
      }
      const { data: existing } = await admin
        .from("artist_looks")
        .select("composition_recipe_json")
        .eq("id", childLookId)
        .maybeSingle();
      const existingRecipe = (existing?.composition_recipe_json ?? {}) as Record<string, unknown>;
      const genMeta = (existingRecipe.generation_metadata ?? {}) as Record<string, unknown>;
      genMeta.grok_debug = grokDebug;
      existingRecipe.generation_metadata = genMeta;
      await admin
        .from("artist_looks")
        .update({
          status: "failed",
          error_message: String(err).slice(0, 500),
          composition_recipe_json: existingRecipe,
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
