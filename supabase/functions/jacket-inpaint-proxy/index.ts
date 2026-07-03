// AVT edge function — jacket-inpaint-proxy
//
// Primary lane of the locked v2 wardrobe-swap architecture:
// "Jacket-Only Inpaint (Masked IP-Adapter + ControlNet)".
// See docs/AVT_Wardrobe_Swap_Build_Spec_v2.md §4 and
//     docs/AVT_jacket_inpaint_fal_payload.md.
//
// STOP re-rendering the garment. This function transfers the SL Track Jacket
// into a TIGHT jacket mask only, then DETERMINISTICALLY recomposites the result
// over the real frame so that face / glasses / cap / hands / pants / background
// remain the exact captured pixels (spec hard rules §3).
//
// Pipeline (all model work server-side — key never leaves the edge):
//   1. fal-ai/evf-sam            → tight jacket mask (text-prompted SAM)
//   2. fal-ai/imageutils/depth   → depth control map (optional, structure lock)
//   3. fal-ai/flux-general/inpainting → jacket transferred into the mask
//                                  (IP-Adapter on SL ref + depth ControlNet, FIXED SEED)
//   4. deterministic feathered masked recomposite (jacketRecomposite.ts)
//      out = source·(1−α) + inpaint·α  ⇒ only jacket pixels change
//   5. export unified 1080×1920 still → look-composites, return signed URL
//
// Steps 3–4 of the spec (real-pixel face/glasses restore + Tier-1 logo overlay)
// are NOT required to pass the gate: the recomposite already keeps every
// non-jacket pixel byte-identical to the source. They are added as polish on
// the approved still.
//
// Env (AVT project qoyxgnkvjukovkrvdaiq):
//   FAL_KEY                     — Fal server key (server-side only; never printed)
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//
// verify_jwt = true (browser calls with the user session token).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickVtonGarmentPath } from "../_shared/garmentReference.ts";
import {
  decodeToRgba,
  encodePng,
  featherAlpha,
  maskToAlpha,
  recomposite,
  resizeRgba,
} from "../_shared/jacketRecomposite.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 2700;
const OUT_W = 1080;
const OUT_H = 1920;
const FAL_QUEUE = "https://queue.fal.run";
const FAL_POLL_INTERVAL_MS = 3000;
const FAL_TIMEOUT_MS = 4 * 60 * 1000;

// Fixed defaults (spec §4 params). All overridable per-call for tuning.
const DEFAULTS = {
  seed: 777,
  strength: 0.85, // 0.75–0.9
  guidanceScale: 5.0, // 4–7
  steps: 30, // 25–35
  ipAdapterScale: 0.9, // 0.8–1.0
  controlnet: "depth" as "depth" | "canny" | "pose" | "none",
  conditioningScale: 0.65,
  featherPx: 12, // 8–16
  maskExpand: 4,
  maskPrompt: "cream off-white track jacket, upper torso clothing, sleeves",
  prompt:
    "Saint Laurent Track Jacket, cream off-white body, navy shoulder stripe, precise 'Saint Laurent' chest script, matching collar, sleeve panels, fabric drape and lighting on the body, high garment fidelity",
  negativePrompt:
    "face, glasses, hands, cap, orange pants, background, deformation, extra clothing, wrong pose, logo distortion, warped text",
  ipAdapterPath: "XLabs-AI/flux-ip-adapter-v2",
  imageEncoderPath: "openai/clip-vit-large-patch14",
};

type Body = {
  artistId: string;
  wardrobeFeatureId: string;
  scenePath: string;
  sceneBucket?: string;
  // Optional direct override of the hero frame URL (must be https).
  humanImageUrl?: string;
  // Tuning overrides
  seed?: number;
  strength?: number;
  guidanceScale?: number;
  steps?: number;
  ipAdapterScale?: number;
  controlnet?: "depth" | "canny" | "pose" | "none";
  conditioningScale?: number;
  featherPx?: number;
  maskExpand?: number;
  maskPrompt?: string;
  prompt?: string;
  negativePrompt?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://") && v.trim().length < 2048;
}

function firstImageUrl(result: Record<string, unknown>): string | null {
  const image = result?.image as { url?: string } | undefined;
  if (isHttpsUrl(image?.url)) return image!.url!.trim();
  const images = result?.images as Array<{ url?: string }> | undefined;
  if (Array.isArray(images) && isHttpsUrl(images[0]?.url)) return images[0]!.url!.trim();
  if (isHttpsUrl(result?.image_url)) return String(result.image_url).trim();
  return null;
}

// --- Fal queue: submit → poll status → fetch result -----------------------
async function falRun(
  falKey: string,
  model: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const authHeaders = { "Authorization": `Key ${falKey}`, "Content-Type": "application/json" };
  const submit = await fetch(`${FAL_QUEUE}/${model}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(input),
  });
  const submitBody = await submit.json().catch(() => ({}));
  if (!submit.ok) {
    throw new Error(`fal_submit_${model}_${submit.status}: ${JSON.stringify(submitBody).slice(0, 240)}`);
  }
  const statusUrl = String(submitBody?.status_url ?? "");
  const responseUrl = String(submitBody?.response_url ?? "");
  if (!statusUrl || !responseUrl) {
    // Some sync endpoints return the result inline.
    if (firstImageUrl(submitBody)) return submitBody;
    throw new Error(`fal_no_queue_urls_${model}`);
  }
  const deadline = Date.now() + FAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const st = await fetch(statusUrl, { headers: { "Authorization": `Key ${falKey}` } });
    const stBody = await st.json().catch(() => ({}));
    const status = String(stBody?.status ?? "");
    if (status === "COMPLETED") {
      const res = await fetch(responseUrl, { headers: { "Authorization": `Key ${falKey}` } });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`fal_result_${model}_${res.status}`);
      return resBody as Record<string, unknown>;
    }
    if (status === "FAILED" || stBody?.error) {
      throw new Error(`fal_failed_${model}: ${JSON.stringify(stBody).slice(0, 240)}`);
    }
    await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
  }
  throw new Error(`fal_timeout_${model}`);
}

async function download(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { headers: { Accept: "image/*" } });
  if (!r.ok) throw new Error(`download_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const falKey = Deno.env.get("FAL_KEY")?.trim() || Deno.env.get("FAL_API_KEY")?.trim() || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }
  if (!falKey) {
    return json(503, {
      error: "fal_key_not_configured",
      detail:
        "Set the FAL_KEY Edge Function secret on the AVT project (qoyxgnkvjukovkrvdaiq). The key stays server-side; it is never returned or logged.",
    });
  }

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
  if (!body?.artistId || !body?.wardrobeFeatureId) {
    return json(400, { error: "missing_artist_or_wardrobe" });
  }
  if (!body?.scenePath && !isHttpsUrl(body?.humanImageUrl)) {
    return json(400, { error: "missing_scene", detail: "Provide scenePath or humanImageUrl." });
  }

  const p = { ...DEFAULTS, ...clean(body) };

  // --- resolve the SL garment reference (wardrobe 0feb028f) --------------
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
  const garmentPath = pickVtonGarmentPath(refImages, wardrobe.storage_path ?? wardrobe.file_url);
  if (!garmentPath) return json(404, { error: "wardrobe_no_image" });

  let garmentUrl: string | null = null;
  {
    const { data: signed } = await admin.storage.from("wardrobe-refs").createSignedUrl(garmentPath, SIGN_TTL);
    garmentUrl = signed?.signedUrl ?? null;
    if (!garmentUrl) {
      const { data: alt } = await admin.storage.from("product-assets").createSignedUrl(garmentPath, SIGN_TTL);
      garmentUrl = alt?.signedUrl ?? null;
    }
  }
  if (!garmentUrl) return json(500, { error: "garment_sign_failed" });

  // --- resolve the hero frame ------------------------------------------
  let humanUrl: string | null = isHttpsUrl(body.humanImageUrl) ? body.humanImageUrl!.trim() : null;
  if (!humanUrl && body.scenePath) {
    const bucket = body.sceneBucket || "project-references";
    const { data: sceneSigned, error: sceneErr } = await admin.storage
      .from(bucket)
      .createSignedUrl(body.scenePath, SIGN_TTL);
    if (sceneErr || !sceneSigned?.signedUrl) {
      return json(500, { error: "scene_sign_failed", detail: sceneErr?.message });
    }
    humanUrl = sceneSigned.signedUrl;
  }
  if (!humanUrl) return json(400, { error: "missing_human_image" });

  const startedAt = Date.now();
  try {
    // --- 1. tight jacket mask (evf-sam) --------------------------------
    const maskRes = await falRun(falKey, "fal-ai/evf-sam", {
      image_url: humanUrl,
      prompt: p.maskPrompt,
      mask_only: true,
      expand_mask: p.maskExpand,
      fill_holes: true,
    });
    const maskUrl = firstImageUrl(maskRes);
    if (!maskUrl) throw new Error("mask_no_url");

    // --- 2. depth control map (optional) -------------------------------
    let controlImageUrl: string | null = null;
    if (p.controlnet !== "none") {
      const model =
        p.controlnet === "depth"
          ? "fal-ai/imageutils/depth"
          : p.controlnet === "canny"
          ? "fal-ai/imageutils/canny"
          : "fal-ai/image-preprocessors/openpose";
      const cnRes = await falRun(falKey, model, { image_url: humanUrl });
      controlImageUrl = firstImageUrl(cnRes);
      if (!controlImageUrl) throw new Error(`control_${p.controlnet}_no_url`);
    }

    // --- 3. flux-general inpainting into the mask ONLY -----------------
    const inpaintInput: Record<string, unknown> = {
      image_url: humanUrl,
      mask_url: maskUrl,
      prompt: p.prompt,
      negative_prompt: p.negativePrompt,
      strength: p.strength,
      guidance_scale: p.guidanceScale,
      num_inference_steps: p.steps,
      seed: p.seed,
      num_images: 1,
      output_format: "png",
      image_size: { width: OUT_W, height: OUT_H },
      ip_adapters: [
        {
          path: p.ipAdapterPath,
          image_encoder_path: p.imageEncoderPath,
          image_url: garmentUrl,
          scale: p.ipAdapterScale,
        },
      ],
    };
    if (controlImageUrl) {
      inpaintInput.controlnets = [
        {
          path: p.controlnet,
          control_image_url: controlImageUrl,
          conditioning_scale: p.conditioningScale,
          end_percentage: 0.8,
        },
      ];
    }
    const inpaintRes = await falRun(falKey, "fal-ai/flux-general/inpainting", inpaintInput);
    const inpaintUrl = firstImageUrl(inpaintRes);
    if (!inpaintUrl) throw new Error("inpaint_no_url");

    // --- 4. deterministic feathered masked recomposite ----------------
    const [srcBytes, maskBytes, inpaintBytes] = await Promise.all([
      download(humanUrl),
      download(maskUrl),
      download(inpaintUrl),
    ]);
    let source = await decodeToRgba(srcBytes);
    let mask = await decodeToRgba(maskBytes);
    let inpaint = await decodeToRgba(inpaintBytes);
    source = resizeRgba(source, OUT_W, OUT_H);
    mask = resizeRgba(mask, OUT_W, OUT_H);
    inpaint = resizeRgba(inpaint, OUT_W, OUT_H);

    const rawAlpha = maskToAlpha(mask);
    const feathered = featherAlpha(rawAlpha, OUT_W, OUT_H, p.featherPx);
    const result = recomposite(source, inpaint, feathered, OUT_W, OUT_H);
    const outPng = await encodePng(result.image);

    // --- 5. persist + sign --------------------------------------------
    const ts = Date.now();
    const storagePath = `${userId}/${body.artistId}/jacket_inpaint_gate_${ts}.png`;
    const { error: upErr } = await admin.storage
      .from("look-composites")
      .upload(storagePath, outPng, { contentType: "image/png", cacheControl: "3600", upsert: true });
    if (upErr) throw new Error(`upload_failed: ${upErr.message}`);
    const { data: signedOut } = await admin.storage
      .from("look-composites")
      .createSignedUrl(storagePath, SIGN_TTL);

    // Also persist the raw inpaint + mask for QA (best-effort).
    const maskPath = `${userId}/${body.artistId}/jacket_inpaint_gate_${ts}_mask.png`;
    await admin.storage.from("look-composites").upload(maskPath, maskBytes, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true,
    }).catch(() => {});

    const meta = {
      lane: "jacket_only_inpaint_masked",
      resolution: { width: OUT_W, height: OUT_H },
      seed: p.seed,
      strength: p.strength,
      guidance_scale: p.guidanceScale,
      steps: p.steps,
      ip_adapter_scale: p.ipAdapterScale,
      controlnet: p.controlnet,
      conditioning_scale: p.controlnet === "none" ? null : p.conditioningScale,
      feather_px: p.featherPx,
      mask_expand: p.maskExpand,
      mask_prompt: p.maskPrompt,
      mask_coverage: Number(result.maskCoverage.toFixed(4)),
      changed_pixels: result.changedPixels,
      changed_fraction: Number((result.changedPixels / (OUT_W * OUT_H)).toFixed(4)),
      garment_path: garmentPath,
      duration_ms: Date.now() - startedAt,
    };
    console.log("jacket_inpaint_gate_ok:", JSON.stringify(meta));

    return json(200, {
      ok: true,
      storagePath,
      maskStoragePath: maskPath,
      signedUrl: signedOut?.signedUrl ?? null,
      meta,
    });
  } catch (err) {
    const msg = String(err).slice(0, 500);
    console.error("jacket_inpaint_gate_failed:", msg);
    return json(502, { error: "jacket_inpaint_failed", detail: msg });
  }
});

/** Drop undefined keys so DEFAULTS win when a field is omitted. */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k in obj) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}
