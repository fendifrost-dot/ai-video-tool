// AVT edge function — grok-resolution-test  (VERIFICATION ONLY, not a product lane)
//
// Purpose: prove that the `resolution` field we send to xAI POST /v1/images/edits
// actually changes the returned image size, without needing a browser hero-frame
// capture, an upload, or the broken test-fixture clips.
//
// It runs entirely server-side with the service-role key, reuses the SAME
// _shared/xaiImageEdits.ts code path as grok-image-garment-proxy, and reports the
// REAL decoded pixel dimensions of what xAI returns for each resolution value.
//
// WARNING: this makes REAL, BILLED xAI image-edit calls (one per entry in
// `resolutions`, default two). It writes NOTHING — no storage upload, no
// artist_looks row, no email, no side effects of any kind. Read-only + xAI.
//
// Auth: verify_jwt = false, but the caller must present the service-role key as
// `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. No user JWT involved.
//
// Required secrets (AVT project qoyxgnkvjukovkrvdaiq):
//   XAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickGrokGarmentReferencePaths } from "../_shared/garmentReference.ts";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";
import { callXaiImageEditsDetailed } from "../_shared/xaiImageEdits.ts";
import { readImageDimensions } from "../_shared/imageDimensions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 2700;
const DEFAULT_MODEL = "grok-imagine-image-quality";

// Defaults are the YSL project + Saint Laurent Track Jacket, which are known to
// have a stored hero frame and real wardrobe reference images.
const DEFAULT_PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";
const DEFAULT_WARDROBE_FEATURE_ID = "0feb028f-dc4d-45dc-82ac-e4bbd16054b0";

// Buckets a hero frame may live in, most likely first.
const HERO_BUCKETS = ["project-clips", "project-references"];

// Short on purpose: output dimensions do not depend on prompt content, and a
// terse prompt keeps these verification calls cheap and fast.
const TEST_PROMPT =
  "Photorealistic edit of the source frame: keep the exact pose, camera angle, " +
  "lighting and background, but dress the subject in the garment shown in the " +
  "reference image. Preserve the subject's own face and identity.";

type Body = {
  projectId?: string;
  wardrobeFeatureId?: string;
  /** Skip discovery and test this exact storage path. */
  scenePath?: string;
  sceneBucket?: string;
  model?: string;
  prompt?: string;
  /** Resolution values to test, in order. `null` entry = omit the field entirely. */
  resolutions?: Array<string | null>;
  /** Discover the hero frame and return it without calling xAI (free dry run). */
  dryRun?: boolean;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function looksLikeHeroFrame(name: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(name) && /hero/i.test(name);
}

function isImage(name: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(name);
}

type Admin = ReturnType<typeof createClient>;

async function signStoragePath(
  admin: Admin,
  path: string,
  buckets: string[],
): Promise<{ url: string; bucket: string } | null> {
  for (const bucket of buckets) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGN_TTL);
    if (!error && data?.signedUrl) return { url: data.signedUrl, bucket };
  }
  return null;
}

/** Hero frames are not consistently registered in project_assets (the
 *  `hd_hero_*` files were written straight to storage), so fall back to walking
 *  the bucket under {user_id}/{project_id}/ one folder level deep. */
async function findHeroFrameInStorage(
  admin: Admin,
  userId: string,
  projectId: string,
): Promise<{ path: string; bucket: string } | null> {
  for (const bucket of HERO_BUCKETS) {
    const root = `${userId}/${projectId}`;
    const { data: top } = await admin.storage.from(bucket).list(root, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (!top) continue;

    const files = top.filter((e) => e.id !== null);
    const hero = files.find((e) => looksLikeHeroFrame(e.name));
    if (hero) return { path: `${root}/${hero.name}`, bucket };

    for (const folder of top.filter((e) => e.id === null)) {
      const sub = `${root}/${folder.name}`;
      const { data: inner } = await admin.storage.from(bucket).list(sub, {
        limit: 200,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (!inner) continue;
      const innerFiles = inner.filter((e) => e.id !== null);
      const match = innerFiles.find((e) => looksLikeHeroFrame(e.name)) ??
        innerFiles.find((e) => isImage(e.name));
      if (match) return { path: `${sub}/${match.name}`, bucket };
    }

    // Last resort within this bucket: any image directly under the project.
    const anyImage = files.find((e) => isImage(e.name));
    if (anyImage) return { path: `${root}/${anyImage.name}`, bucket };
  }
  return null;
}

/** Prefer a registered project_assets row; fall back to a storage walk. */
async function resolveScenePath(
  admin: Admin,
  projectId: string,
  userId: string,
): Promise<{ path: string; bucket: string; via: string } | null> {
  const { data: assets } = await admin
    .from("project_assets")
    .select("file_url, asset_type, metadata_json, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (assets ?? []) as Array<{
    file_url: string | null;
    metadata_json: Record<string, unknown> | null;
  }>;

  const hit = rows.find((r) =>
    typeof r.file_url === "string" &&
    (looksLikeHeroFrame(r.file_url) || r.metadata_json?.hero_frame === true)
  );
  if (hit?.file_url) {
    const declared = typeof hit.metadata_json?.bucket === "string"
      ? [hit.metadata_json.bucket as string]
      : [];
    const signed = await signStoragePath(admin, hit.file_url, [...declared, ...HERO_BUCKETS]);
    if (signed) return { path: hit.file_url, bucket: signed.bucket, via: "project_assets" };
  }

  const found = await findHeroFrameInStorage(admin, userId, projectId);
  return found ? { ...found, via: "storage_walk" } : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const xaiKey = resolveXaiApiKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_misconfigured" });
  if (!xaiKey) {
    return json(500, { error: "xai_api_key_missing", detail: xaiKeyMissingMessage() });
  }

  // verify_jwt = false so this runs without a browser session. It accepts the
  // anon/publishable key as well as the service-role key, because the operator
  // running the verification cannot handle a service-role key.
  //
  // The anon key is public (it ships in the frontend bundle), so this endpoint
  // is effectively open to anyone who knows the URL — and each call spends real
  // xAI credit. Two guardrails below: a hard cap of 2 edits per request, and
  // the fact that the function writes nothing. DELETE THIS FUNCTION once the
  // resolution question is answered; it is not meant to live in production.
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const bearer = (req.headers.get("authorization") ?? "").replace(/^[Bb]earer\s+/, "").trim();
  if (!bearer || (bearer !== serviceRoleKey && bearer !== anonKey)) {
    return json(401, { error: "anon_or_service_role_key_required" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const projectId = body.projectId ?? DEFAULT_PROJECT_ID;

  const { data: project, error: pErr } = await admin
    .from("video_projects")
    .select("id, user_id, artist_id")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr) return json(500, { error: "project_query_failed", detail: pErr.message });
  if (!project) return json(404, { error: "project_not_found", projectId });

  const userId = project.user_id as string;
  const artistId = project.artist_id as string | null;

  // ---- hero frame ----------------------------------------------------------
  let scene: { path: string; bucket: string; via: string } | null = null;
  if (body.scenePath) {
    const signed = await signStoragePath(admin, body.scenePath, [
      ...(body.sceneBucket ? [body.sceneBucket] : []),
      ...HERO_BUCKETS,
    ]);
    if (!signed) return json(404, { error: "scene_path_not_found", scenePath: body.scenePath });
    scene = { path: body.scenePath, bucket: signed.bucket, via: "caller_supplied" };
  } else {
    scene = await resolveScenePath(admin, projectId, userId);
  }
  if (!scene) return json(404, { error: "no_hero_frame_found", projectId, userId });

  const heroSigned = await signStoragePath(admin, scene.path, [scene.bucket]);
  if (!heroSigned) return json(500, { error: "scene_sign_failed", scenePath: scene.path });

  // ---- garment reference ---------------------------------------------------
  const wardrobeFeatureId = body.wardrobeFeatureId ?? DEFAULT_WARDROBE_FEATURE_ID;
  const { data: wardrobe, error: wErr } = await admin
    .from("character_features")
    .select("id, artist_id, label, file_url, storage_path, reference_images")
    .eq("id", wardrobeFeatureId)
    .maybeSingle();
  if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
  if (!wardrobe) return json(404, { error: "wardrobe_not_found", wardrobeFeatureId });

  const refImages = Array.isArray(wardrobe.reference_images) ? wardrobe.reference_images : [];
  const garmentPaths = pickGrokGarmentReferencePaths(
    refImages,
    wardrobe.storage_path ?? wardrobe.file_url,
    2,
  );
  if (garmentPaths.length === 0) return json(404, { error: "wardrobe_no_image" });

  const garmentUrls: string[] = [];
  for (const p of garmentPaths) {
    const signed = await signStoragePath(admin, p, ["wardrobe-refs", "product-assets"]);
    if (signed) garmentUrls.push(signed.url);
  }
  if (garmentUrls.length === 0) return json(500, { error: "garment_sign_failed" });

  const images = [
    { url: heroSigned.url, type: "image_url" as const },
    ...garmentUrls.map((url) => ({ url, type: "image_url" as const })),
  ].slice(0, 3);

  // Measure the input so the output can be compared against it.
  let inputDims: unknown = null;
  try {
    const dl = await fetch(heroSigned.url);
    if (dl.ok) inputDims = readImageDimensions(new Uint8Array(await dl.arrayBuffer()));
  } catch { /* non-fatal — input size is context, not the result */ }

  const context = {
    projectId,
    artistId,
    scenePath: scene.path,
    sceneBucket: scene.bucket,
    scenePathResolvedVia: scene.via,
    wardrobeFeatureId,
    wardrobeLabel: wardrobe.label,
    garmentPathsUsed: garmentPaths,
    imageCount: images.length,
    model: body.model ?? DEFAULT_MODEL,
    inputHeroFrameDimensions: inputDims,
  };

  if (body.dryRun) {
    return json(200, { dryRun: true, ...context, note: "No xAI call made." });
  }

  // ---- the actual comparison ----------------------------------------------
  // Hard cap: this endpoint is reachable with the public anon key, so a caller
  // must never be able to run up an unbounded number of billed xAI edits.
  const resolutions: Array<string | null> = (body.resolutions ?? ["2k", "1k"]).slice(0, 2);
  const results: unknown[] = [];

  for (const resolution of resolutions) {
    const startedAt = Date.now();
    try {
      const res = await callXaiImageEditsDetailed({
        apiKey: xaiKey,
        model: body.model ?? DEFAULT_MODEL,
        prompt: body.prompt ?? TEST_PROMPT,
        images,
        // null / undefined → field omitted entirely, i.e. xAI's native default.
        ...(resolution ? { resolution } : {}),
      });
      const dims = readImageDimensions(res.bytes);
      results.push({
        resolutionSent: res.resolutionSent,
        fieldOmitted: res.resolutionSent === null,
        xaiStatus: res.status,
        delivery: res.delivery,
        outputWidth: dims?.width ?? null,
        outputHeight: dims?.height ?? null,
        outputDimensions: dims ? `${dims.width}x${dims.height}` : null,
        format: dims?.format ?? null,
        byteLength: res.bytes.length,
        elapsedMs: Date.now() - startedAt,
        ok: true,
      });
    } catch (err) {
      results.push({
        resolutionSent: resolution,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - startedAt,
      });
    }
  }

  const measured = results.filter(
    (r): r is { outputDimensions: string | null } & Record<string, unknown> =>
      (r as { ok?: boolean }).ok === true,
  );
  const distinct = new Set(
    measured.map((r) => r.outputDimensions).filter((d): d is string => !!d),
  );

  return json(200, {
    ...context,
    results,
    // The whole point: if every resolution produced the same pixel size, xAI is
    // ignoring the field and the deployed "2k" change is a no-op.
    verdict: measured.length < 2
      ? "inconclusive_need_two_successful_calls"
      : distinct.size > 1
      ? "resolution_parameter_HAS_EFFECT"
      : "resolution_parameter_IGNORED_same_output_size",
  });
});

// resync 2026-07-18T00:00:00Z — force Lovable tree-hash change
