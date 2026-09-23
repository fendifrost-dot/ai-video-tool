// AVT edge function — runway-video-edit-proxy (canonical-Look lane, provider B)
//
// User-JWT-only Runway POST /v1/video_to_video: edit an EXISTING performance video in place,
// conditioned on the Look's references (image references) and/or timed keyframes (an approved
// Look-on-artist frame of THIS video). Same contract as grok-video-edit-proxy: the Look truth
// hierarchy orders the references, constraints go first in the prompt, cost is gated before any
// billed call, the output is stored in project-clips and recorded as a reviewable edited_clip.
//
// Models are DATA (MODELS below): which endpoint fields a model takes, its input/prompt limits and
// its credit price. Adding a Runway model is a table row, not a code path.
//
// Secrets: RUNWAY_API_KEY (Lovable Cloud). Fails closed with runway_key_missing when absent.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { composeConstraintsFirst, lookSpecificationText, orderLookReferences, resolveReferencePolicy, type ReferencePolicy } from "../_shared/lookReferences.ts";
import { getProviderCapability } from "../_shared/providerCapabilities.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const RUNWAY_BASE_URL = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";
const SIGN_TTL = 3600;
const OUTPUT_SIGN_TTL = 604800;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_MAX_COST_USD = 1.0;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 900_000;
const USD_PER_CREDIT = 0.01;
const VIDEO_BUCKETS = ["project-clips", "project-exports", "project-references"];
const IMAGE_BUCKETS = ["project-references", "look-composites", "project-exports", "project-clips", "wardrobe-refs", "product-assets"];

/** Runway video_to_video models that EDIT an existing video (docs.dev.runwayml.com OpenAPI, 2026-09-23). */
type RunwayModel = {
  /** how the input video is passed and how the edit is requested */
  contract: "aleph2" | "mode_edit";
  /** image references accepted (0 = none: aleph2 takes timed keyframes instead) */
  maxReferences: number;
  /** timed keyframes accepted */
  maxKeyframes: number;
  maxInputSeconds: number;
  maxPromptChars: number;
  /** credits per second of output (+ per second of input where the provider bills it) */
  creditsPerOutputSecond: number;
  creditsPerInputSecond: number;
  minCredits: number;
  /** field values the contract needs */
  ratio?: string;
  source: string;
};
const MODELS: Record<string, RunwayModel> = {
  aleph2: {
    contract: "aleph2", maxReferences: 0, maxKeyframes: 5, maxInputSeconds: 30, maxPromptChars: 1000,
    creditsPerOutputSecond: 28, creditsPerInputSecond: 0, minCredits: 56,
    source: "Aleph 2.0: 'Edit one frame and Aleph 2.0 modifies the rest of your video to match'; keyframes = edited frames of THIS video at timestamps (up to 5); input ≤ 30 s; 28 credits/s, 56 minimum (pricing page 2026-09-23)",
  },
  "gemini_omni_flash_1.1": {
    contract: "mode_edit", maxReferences: 5, maxKeyframes: 0, maxInputSeconds: 10, maxPromptChars: 4000,
    creditsPerOutputSecond: 10, creditsPerInputSecond: 0, minCredits: 0, ratio: "720:1280",
    source: "video_to_video mode=edit with up to 5 image references; input ≤ 10 s; ratios up to 2160:3840; 10 credits/s (pricing page lists t2v/i2v; edit assumed the same until billed)",
  },
  seedance2_5: {
    contract: "mode_edit", maxReferences: 30, maxKeyframes: 0, maxInputSeconds: 10, maxPromptChars: 15000,
    creditsPerOutputSecond: 30, creditsPerInputSecond: 15, minCredits: 0, ratio: "720:1280",
    source: "Seedance 2.5 video_to_video mode=edit (duration auto) with up to 30 image references; 720p: 30 credits/s output + 15 credits/s input",
  },
};

type Body = {
  projectId: string; artistId: string; videoAssetId: string; wardrobeFeatureId: string;
  model?: string; prompt?: string; promptVersion?: string; maxCostUsd?: number; shotId?: string; dryRun?: boolean;
  lookId?: string; referencePolicy?: ReferencePolicy;
  /** aleph2: edited frames of THIS video, placed at absolute seconds; paths are storage paths */
  keyframes?: Array<{ path: string; bucket?: string; seconds: number }>;
  /** the input video's duration (seconds) for the cost estimate; probed by the caller */
  inputSeconds?: number;
};
type Admin = ReturnType<typeof createClient>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function signStorage(admin: Admin, path: string, buckets: string[]): Promise<string | null> {
  for (const bucket of buckets) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGN_TTL);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}
function estimateCostUsd(m: RunwayModel, seconds: number): number {
  const credits = Math.max(m.minCredits, Math.ceil(seconds) * (m.creditsPerOutputSecond + m.creditsPerInputSecond));
  return Number((credits * USD_PER_CREDIT).toFixed(4));
}
async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 4000) }; }
}
const redact = (u: string) => u.replace(/token=[^&]+/g, "token=REDACTED");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""; const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""; const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const runwayKey = Deno.env.get("RUNWAY_API_KEY")?.trim() ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "missing_bearer" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (!body.projectId || !body.artistId || !body.videoAssetId || !body.wardrobeFeatureId) return json(400, { error: "missing_required_fields" });
  if (body.lookId != null && body.lookId !== "" && !UUID_RE.test(body.lookId)) return json(400, { error: "invalid_look_id" });
  if (body.shotId != null && body.shotId !== "" && !UUID_RE.test(body.shotId)) return json(400, { error: "invalid_shot_id" });
  const modelId = body.model ?? "aleph2";
  const spec = MODELS[modelId];
  if (!spec) return json(400, { error: "unknown_model", detail: `model must be one of ${Object.keys(MODELS).join(", ")}` });
  const capability = getProviderCapability("runway:video_to_video", undefined, modelId);
  const maxCostUsd = body.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  const prompt = body.prompt?.trim() ?? "";
  if (!prompt && !body.dryRun) return json(400, { error: "prompt_required" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: project, error: pErr } = await admin.from("video_projects").select("id, artist_id, user_id, treatment_json").eq("id", body.projectId).maybeSingle();
  if (pErr) return json(500, { error: "project_query_failed", detail: pErr.message });
  if (!project || project.user_id !== userId || project.artist_id !== body.artistId) return json(403, { error: "project_forbidden" });
  const { data: artistRow } = await admin.from("artists").select("id, identity_profile_json").eq("id", body.artistId).maybeSingle();
  const artistPolicy = ((artistRow?.identity_profile_json ?? {}) as { reference_policy?: ReferencePolicy }).reference_policy ?? null;
  const projectPolicy = ((project.treatment_json ?? {}) as { reference_policy?: ReferencePolicy }).reference_policy ?? null;

  const { data: videoAsset, error: vErr } = await admin.from("project_assets").select("id, user_id, project_id, file_url, asset_type").eq("id", body.videoAssetId).maybeSingle();
  if (vErr) return json(500, { error: "video_asset_query_failed", detail: vErr.message });
  if (!videoAsset || videoAsset.user_id !== userId || videoAsset.project_id !== body.projectId) return json(403, { error: "not_owner" });
  const videoPath = String(videoAsset.file_url ?? "");
  const videoUrl = videoPath.startsWith("https://") ? videoPath : await signStorage(admin, videoPath, VIDEO_BUCKETS);
  if (!videoUrl) return json(404, { error: "video_asset_not_resolvable" });

  const { data: wardrobe, error: wErr } = await admin.from("character_features").select("id, artist_id, label, reference_images, storage_path, file_url").eq("id", body.wardrobeFeatureId).maybeSingle();
  if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
  if (!wardrobe || wardrobe.artist_id !== body.artistId) return json(404, { error: "wardrobe_not_found" });

  // ---- Look truth hierarchy (same as the xAI lane) ----
  let garmentPaths: string[] = []; let referencePlan: Array<{ role: string; featureId: string | null; file: string }> = [];
  let lookConstraints: string[] = []; let lookSpec = ""; let policyUsed: ReferencePolicy | null = null;
  const lookId = body.lookId?.trim() || null;
  const refCap = Math.min(spec.maxReferences, capability.maxReferenceImages);
  if (lookId && refCap > 0) {
    const { data: look, error: lErr } = await admin.from("artist_looks").select("id, artist_id, name, composition_recipe_json, generated_storage_path").eq("id", lookId).maybeSingle();
    if (lErr) return json(500, { error: "look_query_failed", detail: lErr.message });
    if (!look || look.artist_id !== body.artistId) return json(404, { error: "look_not_found" });
    const recipe = (look.composition_recipe_json ?? {}) as { wardrobe_feature_ids?: unknown; hero_feature_id?: unknown; outfit_sheet_path?: unknown; reference_policy?: ReferencePolicy; constraints?: unknown; spec?: unknown };
    policyUsed = resolveReferencePolicy(refCap, artistPolicy, projectPolicy, recipe.reference_policy, body.referencePolicy);
    const featureIds = Array.isArray(recipe.wardrobe_feature_ids) ? recipe.wardrobe_feature_ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
    if (!featureIds.includes(body.wardrobeFeatureId)) return json(400, { error: "wardrobe_not_in_look" });
    const heroFeatureId = typeof recipe.hero_feature_id === "string" && featureIds.includes(recipe.hero_feature_id) ? recipe.hero_feature_id : featureIds[0];
    const { data: pieces, error: pErr2 } = await admin.from("character_features").select("id, artist_id, label, feature_type, file_url, storage_path, reference_images").in("id", featureIds);
    if (pErr2) return json(500, { error: "wardrobe_query_failed", detail: pErr2.message });
    const byId = new Map((pieces ?? []).map((f) => [f.id as string, f]));
    const pieceInputs = featureIds.flatMap((fid) => { const f = byId.get(fid); if (!f || f.artist_id !== body.artistId) return []; return [{ featureId: fid, label: String(f.label ?? ""), featureType: String(f.feature_type ?? ""), refs: Array.isArray(f.reference_images) ? f.reference_images : [], fallbackPath: f.storage_path ?? f.file_url }]; });
    const outfitSheetPath = typeof recipe.outfit_sheet_path === "string" && recipe.outfit_sheet_path ? recipe.outfit_sheet_path : (look.generated_storage_path ?? null);
    const ordered = orderLookReferences({ mode: "full_look", outfitSheetPath, heroFeatureId, pieces: pieceInputs, policy: policyUsed });
    garmentPaths = ordered.paths; referencePlan = ordered.plan.map((p) => ({ role: p.role, featureId: p.featureId, file: p.path.split("/").pop() ?? p.path }));
    lookSpec = lookSpecificationText({ spec: recipe.spec, name: look.name }, pieceInputs);
    lookConstraints = Array.isArray(recipe.constraints) ? recipe.constraints.filter((c): c is string => typeof c === "string" && c.trim().length > 0) : [];
  } else if (lookId) {
    // the model takes no image references (aleph2): the Look still supplies constraints + spec
    const { data: look } = await admin.from("artist_looks").select("id, artist_id, name, composition_recipe_json").eq("id", lookId).maybeSingle();
    if (look && look.artist_id === body.artistId) {
      const recipe = (look.composition_recipe_json ?? {}) as { constraints?: unknown; spec?: unknown };
      lookConstraints = Array.isArray(recipe.constraints) ? recipe.constraints.filter((c): c is string => typeof c === "string" && c.trim().length > 0) : [];
      lookSpec = lookSpecificationText({ spec: recipe.spec, name: look.name }, []);
    }
  }
  const effectivePrompt = prompt || "(dry-run — prompt not configured)";
  const withSpec = lookSpec && spec.maxPromptChars >= 3000;   // short-prompt models get constraints + body only
  const composedPrompt = withSpec ? `${composeConstraintsFirst(lookConstraints, effectivePrompt)} ${lookSpec}` : composeConstraintsFirst(lookConstraints, effectivePrompt);
  if (composedPrompt.length > spec.maxPromptChars) {
    return json(400, { error: "prompt_too_long", composedPromptChars: composedPrompt.length, maxPromptChars: spec.maxPromptChars, lookConstraintsChars: composeConstraintsFirst(lookConstraints, "").length, lookSpecChars: withSpec ? lookSpec.length : 0, clientPromptChars: effectivePrompt.length });
  }

  // ---- references / keyframes → signed URLs ----
  const referenceUrls: string[] = [];
  for (const p of garmentPaths) { const u = await signStorage(admin, p, IMAGE_BUCKETS); if (u) referenceUrls.push(u); }
  const keyframes: Array<{ uri: string; seconds: number }> = [];
  for (const k of (body.keyframes ?? []).slice(0, spec.maxKeyframes)) {
    if (typeof k.seconds !== "number" || k.seconds < 0) continue;
    const u = await signStorage(admin, k.path, k.bucket ? [k.bucket, ...IMAGE_BUCKETS] : IMAGE_BUCKETS);
    if (u) keyframes.push({ uri: u, seconds: k.seconds });
  }
  if (spec.contract === "aleph2" && keyframes.length === 0 && (body.keyframes ?? []).length > 0) return json(404, { error: "keyframes_not_resolvable" });

  const inputSeconds = typeof body.inputSeconds === "number" && body.inputSeconds > 0 ? body.inputSeconds : 8;
  if (inputSeconds > spec.maxInputSeconds) return json(400, { error: "input_too_long", inputSeconds, maxInputSeconds: spec.maxInputSeconds });
  const runwayBody: Record<string, unknown> = spec.contract === "aleph2"
    ? { model: "aleph2", videoUri: videoUrl, promptText: composedPrompt, ...(keyframes.length ? { keyframes } : {}), contentModeration: { publicFigureThreshold: "low" } }
    : { model: modelId, videoUri: videoUrl, mode: "edit", promptText: composedPrompt, duration: "auto", ...(referenceUrls.length ? { references: referenceUrls.map((uri) => ({ uri })) } : {}), ...(modelId === "seedance2_5" ? {} : { ratio: spec.ratio }) };
  const promptVersion = body.promptVersion?.trim() || "unspecified";
  const plan = {
    lane: "canonical_look_runway_video_edit", provider: "runway", model: modelId, endpoint: `${RUNWAY_BASE_URL}/video_to_video`, contract: spec.contract,
    videoAssetId: body.videoAssetId, wardrobeFeatureId: body.wardrobeFeatureId, lookId, referencePlan, referenceCount: referenceUrls.length, keyframeCount: keyframes.length,
    referencePolicy: policyUsed, providerCapability: { key: "runway:video_to_video", model: modelId, ...capability, maxKeyframes: spec.maxKeyframes, maxInputSeconds: spec.maxInputSeconds },
    promptComposition: { constraintsFirst: lookConstraints, specLast: withSpec ? lookSpec : "" }, prompt: composedPrompt, promptVersion,
    inputSeconds, estimatedCostUsd: estimateCostUsd(spec, inputSeconds), maxCostUsd, keyConfigured: !!runwayKey,
    runwayRequestBody: JSON.parse(redact(JSON.stringify(runwayBody))),
  };
  if (body.dryRun) return json(200, { dryRun: true, billed: false, ...plan });
  if (!runwayKey) return json(503, { error: "runway_key_missing", detail: "Add RUNWAY_API_KEY to the project's edge-function secrets (Lovable Cloud) — nothing was billed", ...plan });
  if (plan.estimatedCostUsd > maxCostUsd) return json(400, { error: "cost_ceiling_exceeded", detail: `Estimated $${plan.estimatedCostUsd} exceeds maxCostUsd $${maxCostUsd}`, ...plan });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${runwayKey}`, "X-Runway-Version": RUNWAY_VERSION };
  const submitRes = await fetch(`${RUNWAY_BASE_URL}/video_to_video`, { method: "POST", headers, body: JSON.stringify(runwayBody) });
  const submitPayload = await readJsonSafe(submitRes) as Record<string, unknown>;
  const taskId = typeof submitPayload?.id === "string" ? submitPayload.id : null;
  if (!submitRes.ok || !taskId) return json(200, { ...plan, billed: false, submit: { httpStatus: submitRes.status, accepted: false, payload: submitPayload } });

  const t0 = Date.now(); let finalPayload: Record<string, unknown> = {}; let finalStatus = "unknown";
  while (Date.now() - t0 < POLL_TIMEOUT_MS) {
    const pollRes = await fetch(`${RUNWAY_BASE_URL}/tasks/${taskId}`, { headers });
    finalPayload = await readJsonSafe(pollRes) as Record<string, unknown>;
    finalStatus = String(finalPayload?.status ?? "unknown");
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(finalStatus)) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  const outputs = Array.isArray(finalPayload?.output) ? (finalPayload.output as unknown[]) : [];
  const outputUrl = finalStatus === "SUCCEEDED" && typeof outputs[0] === "string" ? (outputs[0] as string) : null;
  let storedPath: string | null = null; let assetId: string | null = null; let byteLength: number | null = null; let persistError: string | null = null;
  if (outputUrl) {
    const dl = await fetch(outputUrl);
    if (dl.ok) {
      const bytes = new Uint8Array(await dl.arrayBuffer()); byteLength = bytes.length;
      storedPath = `${userId}/${body.projectId}/runway-video-edit/${taskId}.mp4`;
      const { error: upErr } = await admin.storage.from("project-clips").upload(storedPath, bytes, { contentType: "video/mp4", upsert: true });
      if (upErr) persistError = `storage_upload: ${upErr.message}`;
      else {
        const { data: assetRow, error: assetErr } = await admin.from("project_assets").insert({
          user_id: userId, project_id: body.projectId, shot_id: body.shotId ?? null, parent_asset_id: body.videoAssetId, asset_type: "edited_clip", file_url: storedPath, approval_status: "pending",
          metadata_json: { bucket: "project-clips", mime_type: "video/mp4", file_size_bytes: byteLength, architecture_lane: "canonical_look_runway", provider: "runway", model: modelId, runway_task_id: taskId,
            source_video_asset_id: body.videoAssetId, wardrobe_feature_id: body.wardrobeFeatureId, look_id: lookId, prompt_version: promptVersion, reference_plan: referencePlan, keyframe_count: keyframes.length,
            estimated_cost_usd: plan.estimatedCostUsd, final_status: finalStatus, provider_capability: plan.providerCapability },
        }).select("id").single();
        if (!assetErr && assetRow) assetId = assetRow.id as string; else persistError = `project_assets_insert: ${assetErr?.message ?? "no_row"}`;
      }
    }
  }
  let previewUrl: string | null = null;
  if (storedPath) { const { data: signed } = await admin.storage.from("project-clips").createSignedUrl(storedPath, OUTPUT_SIGN_TTL); previewUrl = signed?.signedUrl ?? null; }
  return json(200, { ...plan, billed: finalStatus === "SUCCEEDED" || finalStatus === "FAILED", submit: { httpStatus: submitRes.status, accepted: true, taskId }, finalStatus, failure: finalPayload?.failure ?? finalPayload?.failureCode ?? null,
    estimatedCostUsd: plan.estimatedCostUsd, assetId, persistError, output: { storedBucket: storedPath ? "project-clips" : null, storedPath, previewUrl, byteLength } });
});
