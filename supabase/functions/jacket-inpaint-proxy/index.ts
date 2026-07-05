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
// Transport (mirrors wardrobe-vton-proxy EXACTLY): every Fal model runs on the
// Control Center (CC) project. This AVT proxy POSTs to CC's switchx-restyle with
// the shared X-Proxy-Secret (read from AVT env — never handled/printed here) and
// polls the generic, model-agnostic CC fal-queue-poll. The Fal key stays in CC.
//
// Pipeline:
//   1. fal-ai/evf-sam            → tight jacket mask (text-prompted SAM)   [via CC]
//   2. fal-ai/imageutils/depth   → depth control map (optional)           [via CC]
//   3. fal-ai/flux-general/inpainting → jacket transferred into the mask  [via CC]
//                                  (IP-Adapter on SL ref + depth ControlNet, FIXED SEED)
//   4. deterministic feathered masked recomposite (jacketRecomposite.ts)  [AVT-side,
//      out = source·(1−α) + inpaint·α  ⇒ only jacket pixels change          like the
//   5. export unified 1080×1920 still → look-composites, return signed URL  logo composite]
//
// Steps 3–4 of the spec (real-pixel face/glasses restore + Tier-1 logo overlay)
// are NOT required to pass the gate: the recomposite already keeps every
// non-jacket pixel byte-identical to the source. They are added as polish on
// the approved still.
//
// CC contract required (see docs/AVT_jacket_inpaint_fal_payload.md §7):
//   switchx-restyle  { action:"fal-run", model:<fal model id>, input:<fal input> }
//                    → { status_url, response_url }   (submit-only; same shape as
//                      the vton-frame action already returns)
//   fal-queue-poll   { status_url, response_url } → { status, result }  (already
//                      generic — polls any Fal job; no per-model change needed)
//
// Env (AVT project qoyxgnkvjukovkrvdaiq — same secrets wardrobe-vton-proxy uses):
//   COMPOSE_LOOK_CC_URL
//   SWITCHX_PROXY_SECRET  (or COMPOSE_LOOK_PROXY_SECRET)
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//
// verify_jwt = true (browser calls with the user session token).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickVtonGarmentPath } from "../_shared/garmentReference.ts";
import {
  ceilTo,
  cropRgba,
  decodeToRgba,
  encodePng,
  featherAlpha,
  maskToAlpha,
  padRgba,
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
const FAL_POLL_INTERVAL_MS = 4000;
const FAL_TIMEOUT_MS = 4 * 60 * 1000;

// Fixed defaults (spec §4 params). All overridable per-call for tuning.
const DEFAULTS = {
  seed: 777,
  strength: 0.85, // 0.75–0.9
  guidanceScale: 5.0, // 4–7
  steps: 30, // 25–35
  ipAdapterScale: 0.9, // 0.8–1.0
  // Default OFF: flux-general treats controlnets[].path as a HF repo id, NOT a
  // shorthand ("depth" fails: "not a valid model identifier"). The correct
  // repo is wired in CONTROLNET_REPOS below and can be enabled per-call once we
  // have a passing IP-Adapter-only baseline.
  controlnet: "none" as "depth" | "canny" | "pose" | "none",
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

// flux-general/inpainting loads a ControlNet via diffusers
// FluxControlNetModel.from_pretrained(path) — so `path` MUST be a
// diffusers-format HF repo id (config.json + diffusion_pytorch_model.safetensors),
// NOT a shorthand keyword. Verified repos per control type:
//   depth — jasperai/Flux.1-dev-Controlnet-Depth  (VERIFIED diffusers repo;
//           consumes Midas/Leres depth maps, matching fal-ai/imageutils/depth;
//           recommended conditioning_scale 0.3–0.7). Alt: Shakker-Labs/FLUX.1-dev-ControlNet-Depth.
//   canny — Shakker-Labs/FLUX.1-dev-ControlNet-Canny (diffusers repo; NOT yet
//           run-verified in this pipeline).
// A type with no entry here => ControlNet is skipped (never sends an invalid path).
const CONTROLNET_REPOS: Record<string, string> = {
  depth: "jasperai/Flux.1-dev-Controlnet-Depth",
  canny: "Shakker-Labs/FLUX.1-dev-ControlNet-Canny",
};

type Body = {
  artistId: string;
  wardrobeFeatureId: string;
  scenePath: string;
  sceneBucket?: string;
  // Optional direct override of the hero frame URL (must be https).
  humanImageUrl?: string;
  // Look metadata / hero-frame session wiring (mirrors wardrobe-vton-proxy).
  name?: string;
  projectId?: string;
  heroFrameSessionId?: string;
  candidateIndex?: number;
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

// --- Fal via Control Center: submit through switchx-restyle, poll fal-queue-poll
//     (identical mechanism/headers to wardrobe-vton-proxy). The X-Proxy-Secret is
//     read from AVT env by the caller and passed in; it is never logged.
function ccSwitchxUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/switchx-restyle");
}
function ccFalPollUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/fal-queue-poll");
}

type CcCtx = { switchxUrl: string; pollUrl: string; proxySecret: string };

async function falViaCc(
  cc: CcCtx,
  model: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // 1. submit-only via CC switchx-restyle (mirrors the vton-frame action shape).
  const submit = await fetch(cc.switchxUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.proxySecret },
    body: JSON.stringify({ action: "fal-run", model, input }),
  });
  const sub = await submit.json().catch(() => ({}));
  const statusUrl = String(sub?.status_url ?? "");
  const responseUrl = String(sub?.response_url ?? "");
  if (!submit.ok || !statusUrl || !responseUrl) {
    throw new Error(
      `cc_submit_${model}_${submit.status}: ${sub?.error ?? sub?.detail ?? JSON.stringify(sub).slice(0, 200)}`,
    );
  }
  // 2. poll the generic, model-agnostic CC fal-queue-poll until COMPLETED.
  const deadline = Date.now() + FAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(cc.pollUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.proxySecret },
      body: JSON.stringify({ status_url: statusUrl, response_url: responseUrl }),
    });
    const body = await resp.json().catch(() => ({}));
    const status = String(body?.status ?? "");
    if (status === "COMPLETED") {
      return (body?.result ?? body) as Record<string, unknown>;
    }
    if (status === "FAILED" || body?.error) {
      // Surface Fal's REAL validation message, not just CC's "fal_response_failed"
      // wrapper: capture the entire poll body so the failure is diagnosable.
      const raw = JSON.stringify(body).slice(0, 1800);
      throw new Error(`fal_failed_${model}: ${raw}`);
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

// deno-lint-ignore no-explicit-any
async function uploadTempSigned(admin: any, path: string, bytes: Uint8Array): Promise<string> {
  const { error } = await admin.storage
    .from("look-composites")
    .upload(path, bytes, { contentType: "image/png", cacheControl: "3600", upsert: true });
  if (error) throw new Error(`temp_upload_failed(${path}): ${error.message}`);
  const { data } = await admin.storage.from("look-composites").createSignedUrl(path, SIGN_TTL);
  if (!data?.signedUrl) throw new Error(`temp_sign_failed(${path})`);
  return data.signedUrl as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const composeCcUrl = Deno.env.get("COMPOSE_LOOK_CC_URL")?.trim() ?? "";
  const proxySecret =
    Deno.env.get("SWITCHX_PROXY_SECRET")?.trim() ||
    Deno.env.get("COMPOSE_LOOK_PROXY_SECRET")?.trim() ||
    "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }
  if (!composeCcUrl || !proxySecret) {
    return json(503, {
      error: "cc_not_configured",
      detail:
        "Set COMPOSE_LOOK_CC_URL and SWITCHX_PROXY_SECRET (or COMPOSE_LOOK_PROXY_SECRET) on the AVT project — the same secrets wardrobe-vton-proxy uses. Fal runs on CC; no key is handled here.",
    });
  }
  const cc: CcCtx = {
    switchxUrl: ccSwitchxUrl(composeCcUrl),
    pollUrl: ccFalPollUrl(composeCcUrl),
    proxySecret,
  };

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

  // --- insert pending look row (async pattern, mirrors wardrobe-vton-proxy) ---
  const lookId = crypto.randomUUID();
  const recipe = {
    pipeline_preference: "jacket_only_inpaint_masked",
    wardrobe_feature_id: wardrobe.id,
    garment_path_used: garmentPath,
    scene_path: body.scenePath ?? null,
    scene_bucket: body.sceneBucket ?? "project-references",
    hero_frame_session_id: body.heroFrameSessionId ?? null,
    hero_frame_candidate_index: body.candidateIndex ?? null,
    hero_frame_project_id: body.projectId ?? null,
    params: {
      seed: p.seed,
      strength: p.strength,
      guidance_scale: p.guidanceScale,
      steps: p.steps,
      ip_adapter_scale: p.ipAdapterScale,
      controlnet: p.controlnet,
      conditioning_scale: p.conditioningScale,
      feather_px: p.featherPx,
      mask_expand: p.maskExpand,
      mask_prompt: p.maskPrompt,
    },
    generation_metadata: null as Record<string, unknown> | null,
  };
  const { data: childLook, error: insErr } = await userClient
    .from("artist_looks")
    .insert({
      id: lookId,
      artist_id: body.artistId,
      user_id: userId,
      name: body.name ?? `Jacket-Only Inpaint · ${String(wardrobe.label).slice(0, 40)}`,
      description:
        "Jacket-only masked inpaint (IP-Adapter + ControlNet) with deterministic real-pixel recomposite.",
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

  const startedAt = Date.now();
  const finish = async () => {
   let failedStep = "init";
   try {
    // Flux latents are 16-aligned. 1080 is not a multiple of 16 (→ 1088); an
    // unaligned width makes flux-general/inpainting FAIL at execution. We run at
    // a padded 16-aligned size, then crop back to exactly OUT_W×OUT_H so the
    // deterministic recomposite stays pixel-aligned to the real source.
    const PAD_W = ceilTo(OUT_W, 16); // 1080 → 1088
    const PAD_H = ceilTo(OUT_H, 16); // 1920 → 1920 (already aligned)

    // Resolve the ControlNet repo. Only run preprocess + attach a controlnet
    // when we have a VERIFIED repo id for the requested type — never send an
    // invalid path again.
    const cnRepo = p.controlnet !== "none" ? (CONTROLNET_REPOS[p.controlnet] ?? null) : null;
    if (p.controlnet !== "none" && !cnRepo) {
      console.warn(`controlnet_skipped: no verified repo for '${p.controlnet}'`);
    }

    // --- 1. tight jacket mask (evf-sam) --------------------------------
    failedStep = "evf-sam";
    const maskRes = await falViaCc(cc, "fal-ai/evf-sam", {
      image_url: humanUrl,
      prompt: p.maskPrompt,
      mask_only: true,
      expand_mask: p.maskExpand,
      fill_holes: true,
    });
    const maskUrl = firstImageUrl(maskRes);
    if (!maskUrl) throw new Error("mask_no_url");

    // --- 2. control map (optional; only when a verified repo exists) ---
    let depthUrl: string | null = null;
    if (cnRepo) {
      failedStep = `preprocess-${p.controlnet}`;
      const model =
        p.controlnet === "canny" ? "fal-ai/imageutils/canny" : "fal-ai/imageutils/depth";
      const cnRes = await falViaCc(cc, model, { image_url: humanUrl });
      depthUrl = firstImageUrl(cnRes);
      if (!depthUrl) throw new Error(`control_${p.controlnet}_no_url`);
    }

    // --- 3. pad scene/mask/(depth) to the 16-aligned size --------------
    // Keep the ORIGINAL OUT_W×OUT_H scene + mask for the recomposite.
    failedStep = "pad-upload";
    const source1080 = resizeRgba(await decodeToRgba(await download(humanUrl)), OUT_W, OUT_H);
    const mask1080 = resizeRgba(await decodeToRgba(await download(maskUrl)), OUT_W, OUT_H);
    const srcPadUrl = await uploadTempSigned(
      admin,
      `${userId}/${body.artistId}/${lookId}_pad_src.png`,
      await encodePng(padRgba(source1080, PAD_W, PAD_H, "edge")),
    );
    const maskPadUrl = await uploadTempSigned(
      admin,
      `${userId}/${body.artistId}/${lookId}_pad_mask.png`,
      await encodePng(padRgba(mask1080, PAD_W, PAD_H, "black")),
    );
    let depthPadUrl: string | null = null;
    if (depthUrl) {
      const depth1080 = resizeRgba(await decodeToRgba(await download(depthUrl)), OUT_W, OUT_H);
      depthPadUrl = await uploadTempSigned(
        admin,
        `${userId}/${body.artistId}/${lookId}_pad_depth.png`,
        await encodePng(padRgba(depth1080, PAD_W, PAD_H, "edge")),
      );
    }

    // --- 4. flux-general inpainting into the mask ONLY (padded dims) ---
    failedStep = "flux-inpaint";
    const inpaintInput: Record<string, unknown> = {
      image_url: srcPadUrl,
      mask_url: maskPadUrl,
      prompt: p.prompt,
      negative_prompt: p.negativePrompt,
      strength: p.strength,
      guidance_scale: p.guidanceScale,
      num_inference_steps: p.steps,
      seed: p.seed,
      num_images: 1,
      output_format: "png",
      image_size: { width: PAD_W, height: PAD_H },
      ip_adapters: [
        {
          path: p.ipAdapterPath,
          image_encoder_path: p.imageEncoderPath,
          image_url: garmentUrl,
          scale: p.ipAdapterScale,
        },
      ],
    };
    if (depthPadUrl && cnRepo) {
      inpaintInput.controlnets = [
        {
          path: cnRepo,
          control_image_url: depthPadUrl,
          conditioning_scale: p.conditioningScale,
          end_percentage: 0.8,
        },
      ];
    }
    const inpaintRes = await falViaCc(cc, "fal-ai/flux-general/inpainting", inpaintInput);
    const inpaintUrl = firstImageUrl(inpaintRes);
    if (!inpaintUrl) throw new Error("inpaint_no_url");

    // --- 5. crop back to OUT_W×OUT_H + deterministic recomposite ------
    failedStep = "recomposite";
    const inpaintPad = resizeRgba(await decodeToRgba(await download(inpaintUrl)), PAD_W, PAD_H);
    const inpaint1080 = cropRgba(inpaintPad, OUT_W, OUT_H);
    const feathered = featherAlpha(maskToAlpha(mask1080), OUT_W, OUT_H, p.featherPx);
    const result = recomposite(source1080, inpaint1080, feathered, OUT_W, OUT_H);
    const outPng = await encodePng(result.image);

    // --- 6. persist to the look row -----------------------------------
    failedStep = "persist";
    const storagePath = `${userId}/${body.artistId}/${lookId}.png`;
    const { error: upErr } = await admin.storage
      .from("look-composites")
      .upload(storagePath, outPng, { contentType: "image/png", cacheControl: "3600", upsert: true });
    if (upErr) throw new Error(`upload_failed: ${upErr.message}`);

    // Persist the mask alongside for QA (best-effort).
    const maskPath = `${userId}/${body.artistId}/${lookId}_mask.png`;
    await admin.storage.from("look-composites").upload(maskPath, await encodePng(mask1080), {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true,
    }).catch(() => {});

    const meta = {
      lane: "jacket_only_inpaint_masked",
      resolution: { width: OUT_W, height: OUT_H },
      inpaint_resolution: { width: PAD_W, height: PAD_H },
      seed: p.seed,
      strength: p.strength,
      guidance_scale: p.guidanceScale,
      steps: p.steps,
      ip_adapter_scale: p.ipAdapterScale,
      controlnet: cnRepo ? p.controlnet : "none",
      controlnet_repo: cnRepo,
      conditioning_scale: cnRepo ? p.conditioningScale : null,
      feather_px: p.featherPx,
      mask_expand: p.maskExpand,
      mask_prompt: p.maskPrompt,
      mask_coverage: Number(result.maskCoverage.toFixed(4)),
      changed_pixels: result.changedPixels,
      changed_fraction: Number((result.changedPixels / (OUT_W * OUT_H)).toFixed(4)),
      mask_storage_path: maskPath,
      garment_path: garmentPath,
      duration_ms: Date.now() - startedAt,
    };
    console.log("jacket_inpaint_gate_ok:", JSON.stringify(meta));

    const updatedRecipe = { ...recipe, generation_metadata: meta };
    const { error: updErr } = await admin
      .from("artist_looks")
      .update({
        status: "complete",
        generated_image_url: storagePath,
        generated_storage_path: storagePath,
        pipeline_used: "jacket_only_inpaint_masked",
        cost_cents: 12,
        composition_recipe_json: updatedRecipe,
        error_message: null,
      })
      .eq("id", lookId);
    if (updErr) throw new Error(`look_update_failed: ${updErr.message}`);
   } catch (err) {
    // Preserve the FULL raw error (falViaCc embeds Fal's real validation body)
    // and which step failed — into both error_message and the recipe metadata,
    // so failures are diagnosable without re-running.
    const raw = String(err instanceof Error ? err.message : err);
    console.error(`jacket_inpaint_gate_failed[${failedStep}]:`, raw.slice(0, 1000));
    await admin
      .from("artist_looks")
      .update({
        status: "failed",
        error_message: `[${failedStep}] ${raw}`.slice(0, 1000),
        composition_recipe_json: {
          ...recipe,
          generation_metadata: { failed: true, failed_step: failedStep, fal_error_raw: raw.slice(0, 1800) },
        },
      })
      .eq("id", lookId);
   }
  };

  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (er && typeof er.waitUntil === "function") {
    er.waitUntil(finish());
  } else {
    await finish();
  }

  return json(200, { ok: true, lookId, look: childLook, status: "pending" });
});

/** Drop undefined keys so DEFAULTS win when a field is omitted. */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k in obj) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}
