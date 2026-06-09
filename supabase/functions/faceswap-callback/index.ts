// AVT edge function — faceswap-callback
//
// Webhook counterpart to faceswap-proxy. CC (which subscribed to Fal's
// webhook for the submitted face-swap job) POSTs here when the job finishes.
// This function:
//
//   1. Authenticates via the shared COMPOSE_LOOK_PROXY_SECRET header
//      (reused — no new env var) using a constant-time compare.
//   2. Looks up the pending provider_jobs row by `job_id` (query param).
//   3. On failure: marks the row failed with error_text.
//   4. On success: downloads the rendered image from Fal, uploads it to the
//      project-clips bucket (service-role), inserts a project_assets row
//
// When `look_id` is present (Apply-my-identity / identity_faceswap path), the
// look callback applies a full film-treatment post-process before uploading to
// look-composites. The job_id (VLONE) path is unchanged.
//      (asset_type='generated_still', source_tool='fal', approval_status
//      ='pending', parent_asset_id = scene asset), and updates the
//      provider_jobs row to status='succeeded' with result_asset_id.
//
// Idempotent: a retried callback for an already-succeeded row returns 200
// without re-uploading or re-inserting.
//
// Env vars (AVT):
//   - COMPOSE_LOOK_PROXY_SECRET    (shared with CC)
//   - SUPABASE_URL                 (provided by Lovable)
//   - SUPABASE_SERVICE_ROLE_KEY    (provided by Lovable)
//
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

type Body = {
  status?: "succeeded" | "completed" | "failed";
  fal_image_url?: string;
  content_type?: string;
  width?: number;
  height?: number;
  model?: string;
  provider_job_id?: string;
  cost_cents?: number;
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

  const proxySecret = Deno.env.get("COMPOSE_LOOK_PROXY_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!proxySecret || !supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }

  const headerSecret = req.headers.get("x-proxy-secret") ?? "";
  if (!headerSecret) return json(401, { error: "missing_proxy_secret" });
  if (!constantTimeEqual(headerSecret, proxySecret)) {
    return json(401, { error: "bad_proxy_secret" });
  }

  const url = new URL(req.url);
  const lookId = url.searchParams.get("look_id") ?? "";
  const jobId = url.searchParams.get("job_id") ?? "";
  if (!lookId && !jobId) return json(400, { error: "missing_job_or_look_id" });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (lookId) {
    return await handleLookCallback(admin, lookId, body);
  }

  // ---- look up the job row -------------------------------------------
  const { data: jobRow, error: lookupErr } = await admin
    .from("provider_jobs")
    .select("id, user_id, project_id, status, request_payload_json, result_asset_id")
    .eq("id", jobId)
    .maybeSingle();
  if (lookupErr) return json(500, { error: "lookup_failed", detail: lookupErr.message });
  if (!jobRow) return json(404, { error: "job_not_found" });

  // Idempotent ack — a redelivered webhook for an already-finished row.
  if (jobRow.status === "succeeded" || jobRow.status === "failed") {
    return json(200, { ok: true, already: jobRow.status });
  }

  const req_payload = (jobRow.request_payload_json ?? {}) as Record<string, any>;
  const userId = jobRow.user_id as string;
  const projectId = jobRow.project_id as string;

  // ---- failure path --------------------------------------------------
  if (body.status === "failed" || body.error) {
    const errMsg = String(body.error ?? "cc_reported_failure").slice(0, 500);
    await admin
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: errMsg,
        response_payload_json: body as any,
        external_job_id: body.provider_job_id ?? null,
      })
      .eq("id", jobId);
    return json(200, { ok: true, marked: "failed" });
  }

  const falImageUrl = body.fal_image_url;
  if (!falImageUrl) {
    await admin
      .from("provider_jobs")
      .update({ status: "failed", error_text: "callback_missing_fal_url" })
      .eq("id", jobId);
    return json(400, { error: "missing_fal_url" });
  }

  // ---- download bytes from Fal ---------------------------------------
  let bytes: Uint8Array;
  let mime: "image/png" | "image/jpeg" | "image/webp";
  try {
    const dl = await fetch(falImageUrl, {
      headers: { Accept: "image/png, image/jpeg, image/webp" },
    });
    if (!dl.ok) throw new Error(`download_${dl.status}`);
    const buf = new Uint8Array(await dl.arrayBuffer());
    const sniffed = sniffMime(buf) ??
      (body.content_type?.includes("png") ? "image/png" :
       body.content_type?.includes("webp") ? "image/webp" : "image/jpeg");
    bytes = buf;
    mime = sniffed;
  } catch (err) {
    await admin
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: `fal_download_failed: ${String(err).slice(0, 300)}`,
      })
      .eq("id", jobId);
    return json(502, { error: "fal_download_failed" });
  }

  // ---- upload to project-clips (service-role) ------------------------
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const filename = `faceswap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const outPath = `${userId}/${projectId}/faceswap/${filename}`;
  const { error: uploadErr } = await admin.storage
    .from("project-clips")
    .upload(outPath, bytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    await admin
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: `upload_failed: ${uploadErr.message.slice(0, 300)}`,
      })
      .eq("id", jobId);
    return json(500, { error: "upload_failed", detail: uploadErr.message });
  }

  // ---- insert project_assets row -------------------------------------
  const { data: assetRow, error: insErr } = await admin
    .from("project_assets")
    .insert({
      user_id: userId,
      project_id: projectId,
      shot_id: req_payload.shotId ?? null,
      asset_type: "generated_still",
      file_url: outPath,
      source_tool: "fal",
      approval_status: "pending",
      parent_asset_id: req_payload.sceneAssetId ?? null,
      metadata_json: {
        capability: "identity_apply",
        bucket: "project-clips",
        model: body.model ?? "easel-ai/advanced-face-swap",
        provider_job_id: body.provider_job_id ?? null,
        cost_cents: body.cost_cents ?? null,
        face_feature_id: req_payload.faceFeatureId ?? null,
        source_scene_path: req_payload.scenePath ?? null,
        source_scene_bucket: req_payload.sceneBucket ?? null,
        width: body.width ?? null,
        height: body.height ?? null,
        content_type: body.content_type ?? mime,
      },
    })
    .select("*")
    .single();
  if (insErr || !assetRow) {
    await admin
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: `asset_insert_failed: ${insErr?.message?.slice(0, 300) ?? "unknown"}`,
      })
      .eq("id", jobId);
    return json(500, { error: "asset_insert_failed", detail: insErr?.message });
  }

  // ---- finalize provider_jobs row ------------------------------------
  const { error: jobUpdErr } = await admin
    .from("provider_jobs")
    .update({
      status: "succeeded",
      result_asset_id: assetRow.id,
      external_job_id: body.provider_job_id ?? null,
      response_payload_json: body as any,
      error_text: null,
    })
    .eq("id", jobId);
  if (jobUpdErr) {
    return json(500, { error: "job_update_failed", detail: jobUpdErr.message });
  }

  return json(200, { ok: true, assetId: assetRow.id });
});

async function handleLookCallback(
  admin: ReturnType<typeof createClient>,
  lookId: string,
  body: Body,
): Promise<Response> {
  const { data: existing, error: lookupErr } = await admin
    .from("artist_looks")
    .select("id, user_id, artist_id, status, composition_recipe_json")
    .eq("id", lookId)
    .maybeSingle();
  if (lookupErr) return json(500, { error: "lookup_failed", detail: lookupErr.message });
  if (!existing) return json(404, { error: "look_not_found" });
  if (existing.status === "complete" || existing.status === "failed") {
    return json(200, { ok: true, already: existing.status });
  }

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

  let bytes: Uint8Array;
  let mime: "image/png" | "image/jpeg" | "image/webp";
  try {
    const dl = await fetch(falImageUrl, {
      headers: { Accept: "image/png, image/jpeg, image/webp" },
    });
    if (!dl.ok) throw new Error(`download_${dl.status}`);
    const buf = new Uint8Array(await dl.arrayBuffer());
    const sniffed = sniffMime(buf) ??
      (body.content_type?.includes("png") ? "image/png" :
       body.content_type?.includes("webp") ? "image/webp" : "image/jpeg");
    bytes = buf;
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

  try {
    bytes = await applyFilmTreatment(bytes, "medium");
    mime = "image/jpeg";
  } catch (err) {
    await admin
      .from("artist_looks")
      .update({
        status: "failed",
        error_message: `film_treatment_failed: ${String(err).slice(0, 300)}`,
      })
      .eq("id", lookId);
    return json(500, { error: "film_treatment_failed" });
  }

  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const storagePath = `${existing.user_id}/${existing.artist_id}/${lookId}.${ext}`;
  const { error: uploadErr } = await admin.storage
    .from("look-composites")
    .upload(storagePath, bytes, {
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

  const recipe = (existing.composition_recipe_json ?? {}) as Record<string, unknown>;
  recipe.generation_metadata = {
    model: body.model ?? "easel-ai/advanced-face-swap",
    provider_job_id: body.provider_job_id ?? null,
    cost_cents: body.cost_cents ?? null,
    width: body.width ?? null,
    height: body.height ?? null,
    content_type: body.content_type ?? mime,
  };

  const { error: updateErr } = await admin
    .from("artist_looks")
    .update({
      status: "complete",
      generated_image_url: storagePath,
      generated_storage_path: storagePath,
      pipeline_used: "identity_faceswap",
      cost_cents: Number(body.cost_cents ?? 0),
      composition_recipe_json: recipe,
      error_message: null,
    })
    .eq("id", lookId);
  if (updateErr) {
    return json(500, { error: "update_failed", detail: updateErr.message });
  }

  return json(200, { ok: true, lookId });
}

// ---------------------------------------------------------------------------
// Helpers (inlined — Supabase edge functions deploy independently).
// ---------------------------------------------------------------------------
type FilmStrength = "light" | "medium" | "heavy";

async function applyFilmTreatment(
  bytes: Uint8Array,
  strength: FilmStrength = "medium",
): Promise<Uint8Array> {
  const img = await Image.decode(bytes);
  const w = img.width;
  const h = img.height;
  const bitmap = img.bitmap;

  const params = {
    light: {
      blur: 0.4, grainSigma: 6, grainDesat: 0.03, haloIntensity: 0.25, haloSigma: 6,
      caShift: 1, vignette: 0.05, tonalBlend: 0.6,
    },
    medium: {
      blur: 0.6, grainSigma: 10, grainDesat: 0.05, haloIntensity: 0.40, haloSigma: 8,
      caShift: 1, vignette: 0.08, tonalBlend: 1.0,
    },
    heavy: {
      blur: 0.9, grainSigma: 14, grainDesat: 0.07, haloIntensity: 0.55, haloSigma: 11,
      caShift: 2, vignette: 0.12, tonalBlend: 1.0,
    },
  }[strength];

  applyGaussianBlur(bitmap, w, h, params.blur);
  applyGrain(bitmap, params.grainSigma, params.grainDesat);
  applyHalation(bitmap, w, h, 200, params.haloSigma, params.haloIntensity);

  if (params.tonalBlend < 1.0) {
    const before = new Uint8ClampedArray(bitmap);
    applyTonalCurve(bitmap);
    for (let i = 0; i < bitmap.length; i += 4) {
      bitmap[i] = Math.round(before[i] * (1 - params.tonalBlend) + bitmap[i] * params.tonalBlend);
      bitmap[i + 1] = Math.round(before[i + 1] * (1 - params.tonalBlend) + bitmap[i + 1] * params.tonalBlend);
      bitmap[i + 2] = Math.round(before[i + 2] * (1 - params.tonalBlend) + bitmap[i + 2] * params.tonalBlend);
    }
  } else {
    applyTonalCurve(bitmap);
  }

  applyPortraColorShift(bitmap);
  applyChromaticAberration(bitmap, w, h, params.caShift);
  applyWarmCast(bitmap, 1.02, 0.98);
  applyVignette(bitmap, w, h, params.vignette);

  return await img.encodeJPEG(95);
}

function applyGaussianBlur(
  bitmap: Uint8ClampedArray,
  w: number,
  h: number,
  sigma = 0.6,
): void {
  const radius = Math.max(1, Math.round(sigma * 2));
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;

  const tmp = new Float32Array(bitmap.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < size; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k - radius));
        const idx = (y * w + xx) * 4;
        r += bitmap[idx] * kernel[k];
        g += bitmap[idx + 1] * kernel[k];
        b += bitmap[idx + 2] * kernel[k];
      }
      const o = (y * w + x) * 4;
      tmp[o] = r;
      tmp[o + 1] = g;
      tmp[o + 2] = b;
      tmp[o + 3] = bitmap[o + 3];
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < size; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k - radius));
        const idx = (yy * w + x) * 4;
        r += tmp[idx] * kernel[k];
        g += tmp[idx + 1] * kernel[k];
        b += tmp[idx + 2] * kernel[k];
      }
      const o = (y * w + x) * 4;
      bitmap[o] = Math.max(0, Math.min(255, Math.round(r)));
      bitmap[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      bitmap[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
}

function applyGrain(bitmap: Uint8ClampedArray, sigma: number, desatPct: number): void {
  for (let i = 0; i < bitmap.length; i += 4) {
    const noise = gaussianRandom(0, sigma);
    const gray = (bitmap[i] + bitmap[i + 1] + bitmap[i + 2]) / 3;
    for (let c = 0; c < 3; c++) {
      let v = bitmap[i + c] + noise;
      v = v * (1 - desatPct) + gray * desatPct;
      bitmap[i + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
}

function applyHalation(
  bitmap: Uint8ClampedArray,
  w: number,
  h: number,
  threshold = 200,
  glowSigma = 8,
  intensity = 0.4,
): void {
  const glowBuffer = new Uint8ClampedArray(bitmap.length);
  for (let i = 0; i < bitmap.length; i += 4) {
    const luma = bitmap[i] * 0.299 + bitmap[i + 1] * 0.587 + bitmap[i + 2] * 0.114;
    const factor = Math.max(0, (luma - threshold) / (255 - threshold));
    glowBuffer[i] = Math.min(255, factor * 255 * 1.0);
    glowBuffer[i + 1] = Math.min(255, factor * 255 * 0.55);
    glowBuffer[i + 2] = Math.min(255, factor * 255 * 0.2);
    glowBuffer[i + 3] = 255;
  }
  applyGaussianBlur(glowBuffer, w, h, glowSigma);
  for (let i = 0; i < bitmap.length; i += 4) {
    bitmap[i] = Math.min(255, Math.round(bitmap[i] + glowBuffer[i] * intensity));
    bitmap[i + 1] = Math.min(255, Math.round(bitmap[i + 1] + glowBuffer[i + 1] * intensity));
    bitmap[i + 2] = Math.min(255, Math.round(bitmap[i + 2] + glowBuffer[i + 2] * intensity));
  }
}

function applyTonalCurve(bitmap: Uint8ClampedArray): void {
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    let out: number;
    if (v < 40) {
      out = v + 6 * Math.sin((v / 40) * (Math.PI / 2));
    } else if (v < 180) {
      out = 40 + (v - 40) * 1.12;
    } else {
      const t = (v - 180) / 75;
      out = 40 + 140 * 1.12 + (245 - (40 + 140 * 1.12)) * (1 - Math.pow(1 - t, 2));
    }
    lut[v] = Math.max(0, Math.min(255, Math.round(out)));
  }
  for (let i = 0; i < bitmap.length; i += 4) {
    bitmap[i] = lut[bitmap[i]];
    bitmap[i + 1] = lut[bitmap[i + 1]];
    bitmap[i + 2] = lut[bitmap[i + 2]];
  }
}

function applyPortraColorShift(bitmap: Uint8ClampedArray): void {
  for (let i = 0; i < bitmap.length; i += 4) {
    let r = bitmap[i], g = bitmap[i + 1], b = bitmap[i + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    const shadowWeight = Math.max(0, 1 - luma / 80);
    r = r * (1 - 0.04 * shadowWeight);
    g = g * (1 - 0.02 * shadowWeight) + 4 * shadowWeight;
    b = b * (1 - 0.02 * shadowWeight) + 8 * shadowWeight;
    const midWeight = Math.max(0, 1 - Math.abs(luma - 128) / 80);
    r += 6 * midWeight;
    b -= 4 * midWeight;
    const grey = r * 0.299 + g * 0.587 + b * 0.114;
    r = grey + (r - grey) * 0.96;
    g = grey + (g - grey) * 0.96;
    b = grey + (b - grey) * 0.96;
    bitmap[i] = Math.max(0, Math.min(255, Math.round(r)));
    bitmap[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    bitmap[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }
}

function applyChromaticAberration(
  bitmap: Uint8ClampedArray,
  w: number,
  h: number,
  shiftPx = 1,
): void {
  const original = new Uint8ClampedArray(bitmap);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const rx = Math.min(w - 1, x + shiftPx);
      bitmap[idx] = original[(y * w + rx) * 4];
      const bx = Math.max(0, x - shiftPx);
      bitmap[idx + 2] = original[(y * w + bx) * 4 + 2];
    }
  }
}

function applyWarmCast(bitmap: Uint8ClampedArray, rGain = 1.02, bGain = 0.98): void {
  for (let i = 0; i < bitmap.length; i += 4) {
    bitmap[i] = Math.min(255, Math.round(bitmap[i] * rGain));
    bitmap[i + 2] = Math.max(0, Math.round(bitmap[i + 2] * bGain));
  }
}

function applyVignette(bitmap: Uint8ClampedArray, w: number, h: number, strength = 0.08): void {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy) / maxR;
      const factor = 1 - strength * r * r;
      const idx = (y * w + x) * 4;
      bitmap[idx] = Math.max(0, Math.min(255, Math.round(bitmap[idx] * factor)));
      bitmap[idx + 1] = Math.max(0, Math.min(255, Math.round(bitmap[idx + 1] * factor)));
      bitmap[idx + 2] = Math.max(0, Math.min(255, Math.round(bitmap[idx + 2] * factor)));
    }
  }
}

function gaussianRandom(mean = 0, stdDev = 1): number {
  const u1 = Math.max(Math.random(), Number.EPSILON);
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

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
