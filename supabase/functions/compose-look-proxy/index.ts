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
import {
  buildIdentityPreamble,
  buildJewelryPolishPrompt,
  defaultLookName,
  sortWardrobeForVtonChain,
  type PipelineMode,
  sniffMime,
} from "./helpers.ts";

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
  /** Layered Look Builder: lock this image as the inpaint canvas (overrides
   *  the artist's canonical base). Must be an https image URL — typically the
   *  parent look's generated image. */
  canvasImageUrl?: string;
};

// ---------------------------------------------------------------------------
// reference_images jsonb column (Phase 4 — multi-angle galleries)
// ---------------------------------------------------------------------------
// Each library row optionally carries an array of reference images. The
// proxy reads them, signs each storage_path, and feeds the URLs into the
// 4-URL cap allocator below. Items that predate the migration have NULL and
// fall back to the legacy single `file_url`/`storage_path` pair.
type ReferenceImage = {
  id: string;
  url: string | null;
  storage_path: string | null;
  angle: string | null;
};

type ResolvedFeature = {
  id: string;
  feature_type: string;
  label: string;
  storage_path: string | null;
  file_url: string | null;
  bucket: string;
  dimensions_description: string | null;
  reference_images: ReferenceImage[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL_INPUT = 2700; // 45 min — Fal pulls quickly
const SIGN_TTL_RESULT = 3600;

// ---------------------------------------------------------------------------
// 4-URL cap allocation (Phase 4)
// ---------------------------------------------------------------------------
// Seedream's image-to-image input cap is 4 URLs. With multi-angle galleries
// the proxy can now hand it many more candidates per item, so we have to
// pick which angles to forward. The rough split, mirroring the priority the
// prompt actually uses:
//
//     face       : 1 URL  (identity anchor — locked face from the artist)
//     wardrobe   : up to 2 URLs (silhouette / fit refs — distributed across picks)
//     jewelry    : up to 1 URL  (detail closeup — first picked)
//     location   : up to 1 URL  (backdrop frame)
//     props      : 0 URLs by default (room only if categories above don't fill)
//
// Default signed-URL cap for Seedream / Kontext compose passes.
const HARD_CAP_DEFAULT = 4;
// lora_seedream spike: Seedream v4 edit accepts up to 10 refs; use 8 so
// multi-garment looks can pass one ref per picked item (+ LoRA base in CC).
const HARD_CAP_LORA_SEEDREAM = 8;

function inputSignedUrlCap(pipelinePreference?: PipelineMode): number {
  if (
    pipelinePreference === "lora_seedream" ||
    pipelinePreference === "lora_segmented_inpaint"
  ) {
    return HARD_CAP_LORA_SEEDREAM;
  }
  return HARD_CAP_DEFAULT;
}

/**
 * Pick up to `budget` storage paths from a set of resolved features. Round-
 * robin across items so each picked item contributes its front view before
 * any one item contributes a second angle. Falls back to `file_url`/
 * `storage_path` for items that have no `reference_images` populated.
 */
function pickPathsForCategory(
  features: ResolvedFeature[],
  budget: number,
): string[] {
  if (budget <= 0 || features.length === 0) return [];
  // Each feature's candidate list, in priority order.
  const queues: string[][] = features.map((f) => {
    const fromArray = f.reference_images
      .map((r) => r.storage_path ?? r.url)
      .filter((p): p is string => !!p);
    if (fromArray.length > 0) return fromArray;
    const fallback = f.storage_path ?? f.file_url;
    return fallback ? [fallback] : [];
  });

  const out: string[] = [];
  const seen = new Set<string>();
  let progress = true;
  while (out.length < budget && progress) {
    progress = false;
    for (const q of queues) {
      if (out.length >= budget) break;
      const p = q.shift();
      if (!p) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
      progress = true;
    }
  }
  return out;
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
    .select("id, user_id, name, identity_profile_json, continuity_rules")
    .eq("id", body.artistId)
    .maybeSingle();
  if (artistErr) return json(500, { error: "artist_query_failed", detail: artistErr.message });
  if (!artist) return json(404, { error: "artist_not_found" });
  // Single-user / open-access mode while in development: anon sessions get a
  // fresh user_id on every page reload, so the prior user_id ownership check
  // would lock out the only artist. RLS is open (see Lovable schema migration)
  // so re-imposing the same gate here just blocks the legitimate user too.
  // if (artist.user_id !== userId) return json(403, { error: "artist_forbidden" });

  const identity = (artist.identity_profile_json ?? {}) as Record<string, any>;
  const loraInfo = identity.lora ?? null;
  const loraUrl: string | null = typeof loraInfo?.url === "string" ? loraInfo.url : null;
  // Accept both `trigger` and `trigger_word` keys — the LoRA trainer writes
  // `trigger_word` into identity_profile_json.lora, while older code paths
  // expected `trigger`. Without this fallback the trigger arrives at CC as
  // undefined, hasLora collapses to false, and explicit "lora_seedream"
  // requests silently fall back to seedream_only (decidePipeline in CC).
  const triggerRaw = loraInfo?.trigger ?? loraInfo?.trigger_word;
  const triggerWord: string = typeof triggerRaw === "string" ? triggerRaw : "";

  // ---- compile identity preamble -----------------------------------
  // Prepends the artist's identity fields + continuity rules to every
  // prompt. CC's buildBasePhotoPrompt and buildComposePrompt both consume
  // the same `base` param, so prepending here lands the preamble in BOTH
  // Stage 1 (FLUX_LoRA) and Stage 2 (Seedream). See helpers.ts for the
  // intentionally-excluded fields.
  // Single preamble — Stage 1 and Stage 2 now consume the same identity
  // text. The prior dual-preamble (tattoo-stripped variant for Stage 2)
  // was retired: tattoo language is no longer emitted anywhere because
  // every Fendi outfit covers the body and naming tattoos was causing
  // shirtless Stage 1 renders + wordmark bleed onto clothing in Stage 2.
  const identityPreamble = buildIdentityPreamble(
    artist.name,
    identity,
    (artist as any).continuity_rules ?? null,
  );
  const userBasePrompt = body.basePrompt;
  // compiledBasePrompt is finalized after wardrobe features resolve below —
  // we insert a "Wearing: full-length ... " cue between the identity preamble
  // and the user prompt so Stage 1 (FLUX_LoRA) generates a body with garment
  // proportions roughly correct *before* Stage 2 (Seedream) overlays the
  // jacket. Without this, Stage 1 tends toward bare torso / default fashion
  // crop and Stage 2 inherits the crop.
  // composeWithFitDetails is then compiledBasePrompt + fit-details block.

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

  // Wardrobe-length cue. Appended to the identity preamble so Stage 1 emits
  // a body with the right garment proportions (full-length jacket covering
  // torso + sleeves to wrist) before Stage 2 overlays the jacket image. The
  // cue is intentionally generic — concrete measurements live in the
  // dimensions_description block below.
  //
  // Filter to clothing only — exclude accessories (e.g. glasses) so the
  // "full-length ... covering torso to hip and sleeves to wrist" phrasing
  // doesn't get mis-applied to non-garment picks. Without this filter the
  // line was reading e.g. "full-length Glasses — Cazal..., YSL cotton
  // jacket..." and the internal contradiction was pushing Seedream off the
  // YSL reference (color drift to brown, jacket opening in front).
  const WEARING_CLOTHING_TYPES = new Set([
    "wardrobe_outerwear",
    "wardrobe_top",
    "wardrobe_bottom",
    "wardrobe_footwear",
  ]);
  const wearingClothingFeatures = wardrobeFeatures.filter((w) =>
    WEARING_CLOTHING_TYPES.has(w.feature_type),
  );
  const wardrobeLengthCue = wearingClothingFeatures.length > 0
    ? `Wearing: full-length ${wearingClothingFeatures.map((w) => w.label).join(", ")} covering torso to hip and sleeves to wrist.`
    : "";
  const preambleWithWearing = [identityPreamble, wardrobeLengthCue]
    .filter((s) => s && s.length > 0)
    .join("\n\n");
  const compiledBasePrompt = preambleWithWearing
    ? `${preambleWithWearing}\n\n${userBasePrompt}`
    : userBasePrompt;

  // Build a "Garment fit details:" block from each wardrobe item's
  // dimensions_description. Items without a description are skipped. The
  // block is appended to compiledBasePrompt to form composeWithFitDetails,
  // which is what we actually send to CC and persist as
  // composition_recipe_json.compose_prompt for audit.
  const fitLines = wardrobeFeatures
    .map((w) => {
      const desc = (w.dimensions_description ?? "").trim();
      return desc ? `- ${w.label}: ${desc}` : null;
    })
    .filter((s): s is string => !!s);
  const fitDetailsBlock = fitLines.length > 0
    ? `Garment fit details:\n${fitLines.join("\n")}`
    : "";
  // Anti-hallucination cue appended to compose_prompt. Targets stray
  // logos / text / graphic prints that Seedream sometimes invents on
  // clothing. Tattoo language is intentionally absent from this cue —
  // mentioning tattoos (even as a negative) was re-introducing the word
  // and triggering shirtless renders / wordmark bleed.
  const antiHallucinationCue =
    "Do not add any logos, text, or graphic prints to clothing. " +
    "Render the wardrobe items exactly as the reference photos show, without graphic additions.";
  // Anti-crop cue — only when an outerwear/top with fit dimensions is picked.
  // Omit for pants-only / footwear-only runs so Seedream isn't pushed to
  // reinterpret non-jacket garments.
  const hasOuterTopWithDimensions = wearingClothingFeatures.some((w) =>
    (w.feature_type === "wardrobe_outerwear" || w.feature_type === "wardrobe_top") &&
    (w.dimensions_description ?? "").trim().length > 0
  );
  const antiCropCue = hasOuterTopWithDimensions
    ? "CRITICAL: Render this jacket extending fully to the natural waist line at minimum, " +
      "with the hem clearly visible AT OR BELOW the navel and FULLY COVERING the waistband of any pants. " +
      "Do NOT crop the hem above the navel. Do NOT render a short-bodied or crop-style version. " +
      "The reference photo's apparent length is not the target length — render the full intended silhouette."
    : "";
  // Clear-lens cue — Round 5. Repeated at the very tail of compose_prompt
  // because Seedream regressed to tinted/sunglasses in the top-only and
  // bottom-only smoke tests, even with the eyewear LOCK in LOCKED ATTRIBUTES.
  // Tail position gives this cue maximum weight against the visual prior that
  // gold-frame aviators imply dark lenses.
  const clearLensCue =
    "CRITICAL: glasses must have CLEAR prescription lenses, not tinted, not sunglasses, not mirrored, not dark. " +
    "The wearer's eyes must be fully visible through transparent lenses. " +
    "If sunglasses or tinted lenses appear in the output, this is a generation error.";
  const composeWithFitDetails = [
    compiledBasePrompt,
    fitDetailsBlock,
    antiCropCue,
    antiHallucinationCue,
    clearLensCue,
  ]
    .filter((s) => s && s.length > 0)
    .join("\n\n");

  const hardCap = inputSignedUrlCap(body.pipelinePreference);

  const locationFeature = body.locationId
    ? await resolveLibraryItem(admin, "location_library", body.locationId, userId, "location-refs")
    : null;
  const propsFeatures: ResolvedFeature[] = [];
  for (const pid of body.propIds ?? []) {
    const p = await resolveLibraryItem(admin, "prop_library", pid, userId, "prop-refs");
    if (p) propsFeatures.push(p);
  }

  // ---- 4-URL cap allocation ----------------------------------------
  // Per the doc comment near HARD_CAP, distribute up to 4 signed URLs
  // across categories. Strategy: reserve 1 slot each for face / jewelry /
  // location when they're present, then give *all remaining slots* to
  // wardrobe — that lets a multi-angle wardrobe item (e.g. the Cazal
  // octagonal frames with 5 angles) actually use more than one angle when
  // there's headroom. Props pick up any leftover at the very end (rare —
  // usually wardrobe will have soaked up everything).
  const faceBudget = faceFeature ? 1 : 0;
  const jewelryBudget = jewelryFeatures.length > 0 ? 1 : 0;
  const locationBudget = locationFeature ? 1 : 0;
  let wardrobeBudget = Math.max(
    0,
    hardCap - faceBudget - jewelryBudget - locationBudget,
  );
  // Wardrobe still needs a floor of 1 if there are wardrobe picks at all.
  // Without this, a face+jewelry+location+1-wardrobe pick set would zero out
  // wardrobe — but wardrobe is required by the body schema.
  if (wardrobeFeatures.length > 0 && wardrobeBudget < 1) {
    wardrobeBudget = 1;
  }
  // Don't allocate more wardrobe URLs than the picks can supply across all
  // their angles — keeps the recipe honest about what was actually signed.
  wardrobeBudget = Math.min(wardrobeBudget, sumAvailable(wardrobeFeatures));

  // Props grab whatever headroom remains under the cap.
  const used =
    faceBudget +
    wardrobeBudget +
    jewelryBudget +
    locationBudget;
  const propsBudget = Math.max(
    0,
    Math.min(hardCap - used, sumAvailable(propsFeatures)),
  );

  // ---- pick storage paths per category, then sign ------------------
  const facePath = faceFeature
    ? faceFeature.storage_path ?? faceFeature.file_url
    : null;
  const faceUrl = facePath && faceBudget > 0
    ? await signUrl(admin, faceFeature!.bucket, facePath, SIGN_TTL_INPUT)
    : null;

  const wardrobePaths = pickPathsForCategory(wardrobeFeatures, wardrobeBudget);
  const wardrobeUrls: string[] = [];
  for (const p of wardrobePaths) {
    const u = await signUrl(admin, "wardrobe-refs", p, SIGN_TTL_INPUT);
    if (u) wardrobeUrls.push(u);
  }

  const jewelryPaths = pickPathsForCategory(jewelryFeatures, jewelryBudget);
  const jewelryUrls: string[] = [];
  for (const p of jewelryPaths) {
    // Jewelry features live in artist-assets (see resolveFeatures).
    const u = await signUrl(admin, "artist-assets", p, SIGN_TTL_INPUT);
    if (u) jewelryUrls.push(u);
  }

  const locationPath = locationFeature
    ? locationFeature.storage_path ?? locationFeature.file_url
    : null;
  const locationUrl = locationPath && locationBudget > 0
    ? await signUrl(admin, locationFeature!.bucket, locationPath, SIGN_TTL_INPUT)
    : null;

  const propPaths = pickPathsForCategory(propsFeatures, propsBudget);
  const propUrls: string[] = [];
  for (const p of propPaths) {
    const u = await signUrl(admin, "prop-refs", p, SIGN_TTL_INPUT);
    if (u) propUrls.push(u);
  }

  // Final guard: defensively cap the total signed URLs in case the math
  // above missed an edge case. Drop in priority order: props → wardrobe
  // extras → jewelry extras → location → face (face is the most important
  // to preserve when present).
  capSignedUrlsInPlace({
    face: { current: faceUrl ? 1 : 0 },
    wardrobeUrls,
    jewelryUrls,
    location: { current: locationUrl ? 1 : 0 },
    propUrls,
    hardCap,
  });

  // ---- wardrobeItems passthrough for lora_idm_vton ------------------
  // The IDM-VTON pipeline overlays ONE garment per VTON call and chains
  // them. The flat signedUrls.wardrobe array (capped at 4 across all
  // categories) doesn't carry per-item feature_type, which IDM-VTON
  // needs to map outerwear/top → upper_body and bottom → lower_body. So
  // we build a parallel per-pick list here: one entry per wardrobe item,
  // each carrying the FRONT-most signed reference URL + feature_type +
  // label. CC ignores this field for the seedream/kontext pipelines and
  // reads it only when pipeline === 'lora_idm_vton'.
  //
  // Signing is independent of the HARD_CAP cap above — these URLs feed
  // a separate Fal endpoint (queue.fal.run/fal-ai/idm-vton) that takes
  // ONE garment per call. The 4-URL cap is irrelevant.
  const wardrobeItemsPayload: Array<{
    feature_type: string;
    label: string;
    signed_url: string;
    dimensions_description?: string | null;
  }> = [];
  const jewelryPolishPrompt = jewelryFeatures.length > 0
    ? buildJewelryPolishPrompt(
      jewelryFeatures.map((j) => j.label),
      typeof identity.eyewear === "string" ? identity.eyewear : null,
    )
    : null;
  for (const w of sortWardrobeForVtonChain(wardrobeFeatures)) {
    // Pick the front-most reference image: first entry in reference_images,
    // fallback to the legacy storage_path / file_url pair.
    let frontPath: string | null = null;
    if (w.reference_images.length > 0) {
      const first = w.reference_images[0];
      frontPath = first.storage_path ?? first.url ?? null;
    }
    if (!frontPath) frontPath = w.storage_path ?? w.file_url ?? null;
    if (!frontPath) continue;
    const signed = await signUrl(admin, w.bucket, frontPath, SIGN_TTL_INPUT);
    if (!signed) continue;
    wardrobeItemsPayload.push({
      feature_type: w.feature_type,
      label: w.label,
      signed_url: signed,
      dimensions_description: w.dimensions_description ?? null,
    });
  }

  // ---- INSERT pending look row IMMEDIATELY (async refactor) ----------
  //
  // Async architecture:
  //   1. Pre-allocate a look_id, insert artist_looks with status='pending'.
  //   2. Build CC payload including a callback_url that points back to AVT's
  //      compose-look-callback edge function.
  //   3. Fire CC in the background via EdgeRuntime.waitUntil — do NOT await.
  //   4. Return { look_id, status: 'pending' } to the UI in <1s.
  //   5. UI polls artist_looks by id until status flips to 'complete' or
  //      'failed'. CC eventually POSTs the rendered result to the callback,
  //      which downloads + uploads + updates the row.
  //
  // The composition_recipe_json snapshot is persisted on this initial insert
  // so the callback can do its work without re-resolving anything.
  const lookId = crypto.randomUUID();
  const recipe = {
    face_feature_id: faceFeature?.id ?? null,
    wardrobe_feature_ids: wardrobeFeatures.map((f) => f.id),
    jewelry_feature_ids: jewelryFeatures.map((f) => f.id),
    location_id: locationFeature?.id ?? null,
    prop_ids: propsFeatures.map((p) => p.id),
    base_prompt: compiledBasePrompt,
    base_prompt_user: userBasePrompt,
    identity_preamble: identityPreamble || null,
    compose_prompt: composeWithFitDetails,
    jewelry_polish_prompt: jewelryPolishPrompt,
    fit_details_block: fitDetailsBlock || null,
    styling_notes: body.stylingNotes ?? null,
    lora_url: loraUrl,
    lora_trigger: triggerWord,
    // Persisted on the pending row so the UI can show the chosen pipeline
    // label immediately, before the callback fills in pipeline_used.
    pipeline_preference: body.pipelinePreference ?? "auto",
    generation_metadata: null as any,
    signedUrls: {
      face: faceUrl,
      wardrobe: wardrobeUrls,
      jewelry: jewelryUrls,
      location: locationUrl,
      props: propUrls,
    },
    signedUrlsAllocation: {
      face: faceBudget,
      wardrobe: wardrobeBudget,
      jewelry: jewelryBudget,
      location: locationBudget,
      props: propsBudget,
      hardCap,
    },
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: looksToday } = await userClient
    .from("artist_looks")
    .select("*", { count: "exact", head: true })
    .eq("artist_id", body.artistId)
    .gte("created_at", todayStart.toISOString());

  const { data: lookRow, error: insertErr } = await userClient
    .from("artist_looks")
    .insert({
      id: lookId,
      artist_id: body.artistId,
      user_id: userId,
      name:
        body.name ??
        defaultLookName(wearingClothingFeatures.map((f) => f.label), {
          dailyIndex: (looksToday ?? 0) + 1,
        }),
      description: body.basePrompt,
      // Pre-Phase-1-refactor this was 'draft' (review workflow). The async
      // refactor adds a generation lifecycle that lives on the same `status`
      // column: pending → complete | failed. The CHECK constraint was
      // extended in Phase 1 to allow these values.
      status: "pending",
      generated_image_url: null,
      generated_storage_path: null,
      composition_recipe_json: recipe,
      pipeline_used: null,
      cost_cents: 0,
      iterations: body.parentLookId ? 2 : 1,
      parent_look_id: body.parentLookId ?? null,
    })
    .select("*")
    .single();
  if (insertErr) {
    return json(500, { error: "insert_failed", detail: insertErr.message });
  }

  // ---- build CC payload with callback_url -----------------------------
  // The callback_url is an AVT edge function (compose-look-callback) that CC
  // POSTs the final result to once the pipeline completes. The look_id is in
  // the query string so the callback knows which row to update. The
  // X-Proxy-Secret check on the callback side prevents arbitrary callers from
  // writing into artist_looks.
  const callbackUrl =
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/compose-look-callback?look_id=${lookId}`;

  // Canonical-base architecture: when the artist has a locked identity image
  // saved at identity_profile_json.canonical_base_image_url, forward it to
  // CC. CC's lora_segmented_inpaint pipeline will skip the probabilistic
  // Stage 1 FLUX_LoRA call and use this image directly as the canvas. The
  // wardrobe inpaint stages then operate on a stable identity, eliminating
  // per-look face/body drift.
  const canonicalBaseImageUrl =
    typeof (identity as Record<string, unknown>).canonical_base_image_url === "string"
      ? ((identity as Record<string, unknown>).canonical_base_image_url as string).trim() || null
      : null;

  // Layered Look Builder: a per-request canvas override wins over the
  // artist-level canonical base. This is how "lock the previous layer and
  // add one garment" works — the client passes the parent look's image.
  const canvasOverride =
    typeof body.canvasImageUrl === "string" &&
    body.canvasImageUrl.trim().startsWith("https://") &&
    body.canvasImageUrl.trim().length < 600
      ? body.canvasImageUrl.trim()
      : null;
  const effectiveCanvasUrl = canvasOverride ?? canonicalBaseImageUrl;

  const ccPayload = {
    recipe: {
      artistId: body.artistId,
      faceFeatureId: body.faceFeatureId ?? undefined,
      wardrobeFeatureIds: body.wardrobeFeatureIds ?? [],
      jewelryFeatureIds: body.jewelryFeatureIds ?? [],
      locationId: body.locationId ?? undefined,
      propIds: body.propIds ?? [],
      // Stage 1 (FLUX LoRA): identity preamble + wearing-line.
      basePrompt: compiledBasePrompt,
      // Stage 2 (Seedream / polish): same preamble + fit details + cues.
      composePrompt: composeWithFitDetails,
      jewelryPolishPrompt: jewelryPolishPrompt ?? undefined,
      stylingNotes: body.stylingNotes ?? null,
      pipelinePreference: body.pipelinePreference ?? "auto",
      wardrobeLabels: wardrobeFeatures.map((f) => f.label),
      wardrobeItems: wardrobeItemsPayload,
      jewelryLabels: jewelryFeatures.map((f) => f.label),
      hasLocation: !!locationFeature,
      hasFace: !!faceFeature,
      propCount: propsFeatures.length,
      canonicalBaseImageUrl: effectiveCanvasUrl ?? undefined,
    },
    signedUrls: {
      face: faceUrl,
      wardrobe: wardrobeUrls,
      jewelry: jewelryUrls,
      location: locationUrl,
      props: propUrls,
    },
    loraUrl: loraUrl ?? undefined,
    triggerWord: triggerWord || undefined,
    callback_url: callbackUrl,
  };

  // ---- fire CC in the BACKGROUND (no await) ---------------------------
  // EdgeRuntime.waitUntil lets the function return to the UI while the
  // background fetch keeps running for up to the platform's idle timeout
  // (Supabase edge functions can sustain ~150–400s of background work
  // depending on the plan; this is the key bit that removes the 150s
  // synchronous wall we kept hitting with the chained VTON pipeline).
  //
  // Failure semantics: if the fetch itself rejects synchronously (network
  // error before CC accepts the request), mark the row failed. Failures
  // that happen DURING the pipeline are reported by CC posting to the
  // callback with status='failed', so they're handled over there.
  const fireCc = (async () => {
    try {
      const resp = await fetch(ccUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Proxy-Secret": proxySecret,
        },
        body: JSON.stringify(ccPayload),
      });
      if (!resp.ok) {
        // CC rejected the submission before queueing the background work.
        // Mark the row failed so the UI's poll resolves with the error.
        const text = await resp.text().catch(() => "");
        await admin
          .from("artist_looks")
          .update({ status: "failed", error_message: `cc_submit_${resp.status}: ${text.slice(0, 500)}` })
          .eq("id", lookId);
      }
    } catch (err) {
      await admin
        .from("artist_looks")
        .update({ status: "failed", error_message: `cc_unreachable: ${String(err).slice(0, 500)}` })
        .eq("id", lookId);
    }
  })();
  // EdgeRuntime is the Supabase Edge Functions global; waitUntil keeps the
  // function alive after we return the response so the background promise
  // can finish. Fall back to a no-op if the global isn't present (Deno test
  // runs, local dev).
  try {
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") {
      er.waitUntil(fireCc);
    } else {
      // Best-effort fallback — don't block the response on it. The browser
      // may close the connection but Deno will usually still run the promise
      // to completion in-process.
      fireCc.catch(() => {});
    }
  } catch {
    fireCc.catch(() => {});
  }

  // ---- return immediately with look_id --------------------------------
  return json(200, {
    look: lookRow,
    look_id: lookId,
    status: "pending",
    // Kept for backwards compat with older UI codepaths that read these
    // fields directly off the proxy response (e.g. toast/cost display).
    signed_url: null,
    pipeline_used: null,
    cost_cents: 0,
    generation_metadata: null,
  });
});

// ---------------------------------------------------------------------------
// reference_images helpers
// ---------------------------------------------------------------------------
function normaliseRefImages(raw: unknown): ReferenceImage[] {
  if (!Array.isArray(raw)) return [];
  const out: ReferenceImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string") continue;
    const url = typeof r.url === "string" ? r.url : null;
    const sp = typeof r.storage_path === "string" ? r.storage_path : null;
    if (!url && !sp) continue;
    out.push({
      id: r.id,
      url,
      storage_path: sp,
      angle: typeof r.angle === "string" ? r.angle : null,
    });
  }
  return out;
}

function sumAvailable(features: ResolvedFeature[]): number {
  let s = 0;
  for (const f of features) {
    if (f.reference_images.length > 0) s += f.reference_images.length;
    else if (f.storage_path || f.file_url) s += 1;
  }
  return s;
}

/**
 * Defensive final cap. Trims URL arrays in priority order until the total
 * fits under `hardCap`. Mutates wardrobeUrls / jewelryUrls / propUrls in
 * place.
 */
function capSignedUrlsInPlace(args: {
  face: { current: number };
  wardrobeUrls: string[];
  jewelryUrls: string[];
  location: { current: number };
  propUrls: string[];
  hardCap: number;
}) {
  const total = () =>
    args.face.current +
    args.wardrobeUrls.length +
    args.jewelryUrls.length +
    args.location.current +
    args.propUrls.length;

  // Drop props first.
  while (total() > args.hardCap && args.propUrls.length > 0) args.propUrls.pop();
  // Then wardrobe extras (keep at least 1).
  while (total() > args.hardCap && args.wardrobeUrls.length > 1) args.wardrobeUrls.pop();
  // Then jewelry extras (keep at least 1).
  while (total() > args.hardCap && args.jewelryUrls.length > 1) args.jewelryUrls.pop();
  // Final fallbacks — drop the rest if still over (unlikely).
  while (total() > args.hardCap && args.wardrobeUrls.length > 0) args.wardrobeUrls.pop();
  while (total() > args.hardCap && args.jewelryUrls.length > 0) args.jewelryUrls.pop();
}

// ---------------------------------------------------------------------------
async function resolveFeatures(
  client: any,
  ids: string[],
  artistId: string,
): Promise<ResolvedFeature[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from("character_features")
    .select("id, feature_type, label, storage_path, file_url, dimensions_description, reference_images")
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
    dimensions_description: r.dimensions_description ?? null,
    reference_images: normaliseRefImages(r.reference_images),
  }));
}

async function defaultFaceFeature(
  client: any,
  artistId: string,
): Promise<ResolvedFeature | null> {
  const { data, error } = await client
    .from("character_features")
    .select("id, feature_type, label, storage_path, file_url, is_locked, is_primary, uploaded_at, reference_images")
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
    dimensions_description: null,
    reference_images: normaliseRefImages(r.reference_images),
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
    .select("id, name, storage_path, file_url, reference_images")
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
    dimensions_description: null,
    reference_images: normaliseRefImages(data.reference_images),
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


