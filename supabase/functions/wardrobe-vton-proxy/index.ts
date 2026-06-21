// AVT edge function — wardrobe-vton-proxy
//
// Photoreal garment swap via CC switchx-restyle action `vton-frame`
// (Fal IDM-VTON). Creates a child artist_looks row, submits the VTON job,
// polls Fal in the background, uploads the result to look-composites.
//
// Use cases:
//   - Apply a wardrobe item onto an existing look canvas (MV costume swap still)
//   - Apply garment onto a signed project reference frame
//
// Env:
//   COMPOSE_LOOK_CC_URL, SWITCHX_PROXY_SECRET (or COMPOSE_LOOK_PROXY_SECRET)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  pickFullLookGarmentPath,
  pickVtonGarmentPath,
  vtonCategoryForFeatureType,
} from "../_shared/garmentReference.ts";
import {
  logoCompositeMetaCore,
  resolveLogoAssets,
} from "../_shared/logoComposite.ts";
import { compositeLogoOntoVton } from "../_shared/placementEngine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 2700;
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

type Body = {
  artistId: string;
  wardrobeFeatureId: string;
  /** Existing look canvas — human frame source */
  parentLookId?: string;
  /** Direct https URL for human frame (overrides parentLookId resolution) */
  humanImageUrl?: string;
  /** Optional project asset path when swapping onto a MV frame still */
  scenePath?: string;
  sceneBucket?: string;
  name?: string;
  vtonModel?: "idm-vton" | "cat-vton";
  /** Hero-frame pivot: full-look uses on-model garment ref; jacket_only uses flat front. */
  transferMode?: "full_look" | "jacket_only";
  /** When true, skip post-VTON logo composite (Phase 1 hero judging). */
  heroFrameCandidate?: boolean;
  heroFrameSessionId?: string;
  candidateIndex?: number;
  projectId?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ccSwitchxUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/switchx-restyle");
}

function ccFalPollUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/fal-queue-poll");
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://");
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

function extractVtonImageUrl(result: Record<string, unknown>): string | null {
  const image = result?.image as { url?: string } | undefined;
  if (isHttpsUrl(image?.url)) return image!.url!.trim();
  if (isHttpsUrl(result?.image_url)) return String(result.image_url).trim();
  const images = result?.images as Array<{ url?: string }> | undefined;
  if (Array.isArray(images) && isHttpsUrl(images[0]?.url)) {
    return images[0]!.url!.trim();
  }
  return null;
}

async function pollFalViaCc(
  pollUrl: string,
  proxySecret: string,
  statusUrl: string,
  responseUrl: string,
): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(pollUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Proxy-Secret": proxySecret,
      },
      body: JSON.stringify({ status_url: statusUrl, response_url: responseUrl }),
    });
    const body = await resp.json().catch(() => ({}));
    const status = String(body?.status ?? "");
    if (status === "COMPLETED") {
      const url = extractVtonImageUrl((body?.result ?? body) as Record<string, unknown>);
      if (url) return url;
      throw new Error("vton_completed_without_image_url");
    }
    if (status === "FAILED" || body?.error) {
      throw new Error(`vton_failed: ${body?.error ?? body?.detail ?? status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("vton_poll_timeout");
}

async function completeLookFromFalUrl(
  admin: ReturnType<typeof createClient>,
  lookId: string,
  userId: string,
  artistId: string,
  falImageUrl: string,
  wardrobeFeatureId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const dl = await fetch(falImageUrl, { headers: { Accept: "image/*" } });
  if (!dl.ok) throw new Error(`fal_download_${dl.status}`);
  const vtonBuf = new Uint8Array(await dl.arrayBuffer());
  const mime = sniffMime(vtonBuf);
  if (!mime) throw new Error("unknown_mime");

  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const vtonRawPath = `${userId}/${artistId}/${lookId}_vton_raw.${ext}`;
  const { error: rawUploadErr } = await admin.storage
    .from("look-composites")
    .upload(vtonRawPath, vtonBuf, { contentType: mime, cacheControl: "3600", upsert: true });
  if (rawUploadErr) throw new Error(`raw_upload_failed: ${rawUploadErr.message}`);

  let finalBuf = vtonBuf;
  let pipeline = "idm_vton_frame";
  let finalMime = mime;
  let finalExt = ext;
  let logoCompositeMeta: Record<string, unknown> | null = null;
  let compositeRan = false;

  const skipLogoComposite = Boolean(
    (meta as Record<string, unknown>)?.hero_frame_candidate === true,
  );

  try {
    const resolved = skipLogoComposite ? null : await resolveLogoAssets(admin, wardrobeFeatureId);
    if (resolved) {
      const composite = await compositeLogoOntoVton(
        vtonBuf,
        resolved.logoBytes,
        resolved.placement,
        resolved.logoSource,
        resolved.productTruthRaw,
      );
      finalBuf = composite.bytes;
      pipeline = "idm_vton_frame+logo_composite";
      finalMime = "image/png";
      finalExt = "png";
      compositeRan = true;
      logoCompositeMeta = {
        ...logoCompositeMetaCore(composite),
        logo_asset_id: resolved.placement.logo_asset_id ?? null,
        placement: resolved.placement,
      };
      // Debug overlay (detected region drawn on the frame) for QA — best-effort.
      if (composite.debug_overlay_bytes) {
        const overlayPath = `${userId}/${artistId}/${lookId}_detail_debug.png`;
        const { error: ovErr } = await admin.storage
          .from("look-composites")
          .upload(overlayPath, composite.debug_overlay_bytes, {
            contentType: "image/png",
            cacheControl: "3600",
            upsert: true,
          });
        if (!ovErr) logoCompositeMeta.debug_overlay_storage_path = overlayPath;
      }
      if (composite.quality.quality_warning) {
        console.warn(
          "logo_composite_quality_warning:",
          JSON.stringify({ quality: composite.quality, fallback_reason: composite.fallback_reason }),
        );
      }
    }
  } catch (logoErr) {
    console.warn("logo_composite_skipped:", String(logoErr).slice(0, 200));
  }

  const storagePath = compositeRan
    ? `${userId}/${artistId}/${lookId}_logo_composite.png`
    : `${userId}/${artistId}/${lookId}.${finalExt}`;
  const { error: uploadErr } = await admin.storage
    .from("look-composites")
    .upload(storagePath, finalBuf, { contentType: finalMime, cacheControl: "3600", upsert: true });
  if (uploadErr) throw new Error(`upload_failed: ${uploadErr.message}`);

  const { data: existing } = await admin
    .from("artist_looks")
    .select("composition_recipe_json")
    .eq("id", lookId)
    .maybeSingle();
  const recipe = (existing?.composition_recipe_json ?? {}) as Record<string, unknown>;
  recipe.generation_metadata = meta;
  recipe.vton_raw_storage_path = vtonRawPath;
  if (logoCompositeMeta) {
    recipe.logo_composite = logoCompositeMeta;
    recipe.vton_composite_storage_path = storagePath;
  }

  const { error: updateErr } = await admin
    .from("artist_looks")
    .update({
      status: "complete",
      generated_image_url: storagePath,
      generated_storage_path: storagePath,
      pipeline_used: pipeline,
      cost_cents: 9,
      composition_recipe_json: recipe,
      error_message: null,
    })
    .eq("id", lookId);
  if (updateErr) throw new Error(`update_failed: ${updateErr.message}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const composeCcUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret =
    Deno.env.get("SWITCHX_PROXY_SECRET")?.trim() ||
    Deno.env.get("COMPOSE_LOOK_PROXY_SECRET")?.trim() ||
    "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!composeCcUrl || !proxySecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
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
  if (!body?.artistId || !body?.wardrobeFeatureId) {
    return json(400, { error: "missing_artist_or_wardrobe" });
  }

  const { data: wardrobe, error: wErr } = await admin
    .from("character_features")
    .select(
      "id, artist_id, feature_type, label, file_url, storage_path, reference_images",
    )
    .eq("id", body.wardrobeFeatureId)
    .maybeSingle();
  if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
  if (!wardrobe || wardrobe.artist_id !== body.artistId) {
    return json(404, { error: "wardrobe_not_found" });
  }

  const refImages = Array.isArray(wardrobe.reference_images)
    ? wardrobe.reference_images
    : [];
  const transferMode = body.transferMode ?? "jacket_only";
  const pickGarment =
    transferMode === "full_look" ? pickFullLookGarmentPath : pickVtonGarmentPath;
  const garmentPath = pickGarment(
    refImages,
    wardrobe.storage_path ?? wardrobe.file_url,
  );
  if (!garmentPath) return json(404, { error: "wardrobe_no_image" });

  const { data: garmentSigned, error: gSignErr } = await admin.storage
    .from("wardrobe-refs")
    .createSignedUrl(garmentPath, SIGN_TTL);
  let garmentUrl = garmentSigned?.signedUrl ?? null;
  if (!garmentUrl && gSignErr) {
    const { data: altSigned } = await admin.storage
      .from("product-assets")
      .createSignedUrl(garmentPath, SIGN_TTL);
    garmentUrl = altSigned?.signedUrl ?? null;
  }
  if (!garmentUrl) return json(500, { error: "garment_sign_failed" });

  let humanUrl: string | null = isHttpsUrl(body.humanImageUrl)
    ? body.humanImageUrl.trim()
    : null;

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

  let parentName = "Look";
  if (!humanUrl && body.parentLookId) {
    const { data: parentLook, error: pErr } = await admin
      .from("artist_looks")
      .select("id, artist_id, name, generated_image_url, generated_storage_path")
      .eq("id", body.parentLookId)
      .maybeSingle();
    if (pErr) return json(500, { error: "parent_look_query_failed" });
    if (!parentLook || parentLook.artist_id !== body.artistId) {
      return json(404, { error: "parent_look_not_found" });
    }
    parentName = String(parentLook.name ?? "Look");
    const path = parentLook.generated_storage_path ?? parentLook.generated_image_url;
    if (path && !path.startsWith("http")) {
      const { data: signed } = await admin.storage
        .from("look-composites")
        .createSignedUrl(path, SIGN_TTL);
      humanUrl = signed?.signedUrl ?? null;
    } else if (isHttpsUrl(path)) {
      humanUrl = path;
    }
  }

  if (!humanUrl) {
    return json(400, {
      error: "missing_human_image",
      detail: "Provide parentLookId, humanImageUrl, or scenePath.",
    });
  }

  const childLookId = crypto.randomUUID();
  const category = vtonCategoryForFeatureType(String(wardrobe.feature_type));
  const recipe = {
    pipeline_preference: transferMode === "full_look" ? "hero_full_look_vton" : "idm_vton_frame",
    parent_look_id: body.parentLookId ?? null,
    wardrobe_feature_id: wardrobe.id,
    garment_path_used: garmentPath,
    transfer_mode: transferMode,
    vton_category: category,
    human_image_url: humanUrl,
    hero_frame_session_id: body.heroFrameSessionId ?? null,
    hero_frame_candidate_index: body.candidateIndex ?? null,
    hero_frame_project_id: body.projectId ?? null,
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
        `${parentName.slice(0, 48)} · ${String(wardrobe.label).slice(0, 32)} VTON`,
      description:
        transferMode === "full_look"
          ? "Hero full-look garment transfer onto source frame."
          : "IDM-VTON garment swap onto canvas.",
      status: "pending",
      generated_image_url: null,
      generated_storage_path: null,
      composition_recipe_json: recipe,
      pipeline_used: null,
      cost_cents: 0,
      iterations: 1,
      parent_look_id: body.parentLookId ?? null,
    })
    .select("*")
    .single();
  if (insErr || !childLook) {
    return json(500, { error: "look_insert_failed", detail: insErr?.message });
  }

  const switchxUrl = ccSwitchxUrl(composeCcUrl);
  const pollUrl = ccFalPollUrl(composeCcUrl);

  let queue: { status_url: string; response_url: string; model?: string };
  try {
    const resp = await fetch(switchxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Proxy-Secret": proxySecret,
      },
      body: JSON.stringify({
        action: "vton-frame",
        human_image_url: humanUrl,
        garment_image_url: garmentUrl,
        category,
        garment_description: String(wardrobe.label),
        model: body.vtonModel ?? "idm-vton",
      }),
    });
    const cc = await resp.json().catch(() => ({}));
    if (!resp.ok || !cc?.status_url || !cc?.response_url) {
      await admin
        .from("artist_looks")
        .update({
          status: "failed",
          error_message: `vton_submit_failed: ${cc?.error ?? JSON.stringify(cc).slice(0, 200)}`,
        })
        .eq("id", childLookId);
      return json(502, {
        error: "vton_submit_failed",
        detail: cc?.error ?? cc?.detail,
        lookId: childLookId,
      });
    }
    queue = {
      status_url: cc.status_url,
      response_url: cc.response_url,
      model: cc.model,
    };
  } catch (err) {
    await admin
      .from("artist_looks")
      .update({
        status: "failed",
        error_message: `cc_unreachable: ${String(err).slice(0, 200)}`,
      })
      .eq("id", childLookId);
    return json(502, { error: "cc_unreachable", lookId: childLookId });
  }

  const finish = async () => {
    try {
      const falUrl = await pollFalViaCc(
        pollUrl,
        proxySecret,
        queue.status_url,
        queue.response_url,
      );
      await completeLookFromFalUrl(admin, childLookId, userId, body.artistId, falUrl, wardrobe.id, {
        vton_model: queue.model ?? "idm-vton",
        garment_path: garmentPath,
        wardrobe_feature_id: wardrobe.id,
        transfer_mode: transferMode,
        fal_image_url: falUrl,
        hero_frame_candidate: Boolean(body.heroFrameCandidate),
        hero_frame_session_id: body.heroFrameSessionId ?? null,
        candidate_index: body.candidateIndex ?? null,
      });
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
