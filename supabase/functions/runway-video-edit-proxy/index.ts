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
// PROVIDER EXECUTION IS NOT AVT'S. This function never holds a Runway credential and never calls
// Runway. It resolves the request and hands it to Control Center, which owns RUNWAY_API_KEY, the
// upstream call, provider retries, audit logging and the break-glass:
//
//   browser → runway-video-edit-proxy → CC video-providers-runway-video-edit → Runway
//
// The call goes DIRECTLY to Control Center (a separate Supabase project) via
// _shared/controlCenterClient.ts. It deliberately does not hop through AVT's own
// proxy-provider-call: that is the BROWSER's entry point, and routing an edge function through it
// is a synchronous same-project edge→edge invocation. PR #161 did exactly that and every valid
// request died with a bare 503 and no CORS headers — the gateway answering for a killed worker,
// which the caller's try/catch cannot intercept. See controlCenterClient.ts for the full note.
//
// This function verifies the user's JWT itself, so it stamps avt_user_id on the Control Center
// request from its own verified session rather than trusting anything the client sent.
//
// Secrets: none for the provider. CONTROL_CENTER_URL + AVT_PROXY_KEY (AVT's own shared secret
// with Control Center, not a provider credential) are read via controlCenterClient.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { composeConstraintsFirst, lookSpecificationText, orderLookReferences, resolveReferencePolicy, type ReferencePolicy } from "../_shared/lookReferences.ts";
import { getProviderCapability } from "../_shared/providerCapabilities.ts";
import { callControlCenter, controlCenterConfig, type ControlCenterConfig } from "../_shared/controlCenterClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
/** Control Center function that owns the Runway credential and the upstream call. */
const CC_VIDEO_EDIT_ENDPOINT = "video-providers-runway-video-edit";
const CC_JOB_STATUS_ENDPOINT = "video-providers-job-status";
const CC_JOB_RESULT_ENDPOINT = "video-providers-job-result";
const SIGN_TTL = 3600;
const OUTPUT_SIGN_TTL = 604800;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_MAX_COST_USD = 1.0;
const POLL_INTERVAL_MS = 5000;
// The AVT gateway cuts a synchronous edge function at ~150 s (observed 504 on 2026-09-23 while
// Runway was still rendering). A submit therefore waits at most MAX_WAIT_MS for the result and
// otherwise returns the recorded provider_jobs row; the caller finishes it with
// `{ finalizeProviderJobRowId }` (same function, same persistence path), any number of times.
const MAX_WAIT_MS = 100_000;
const FINALIZE_WAIT_MS = 60_000;
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
    creditsPerOutputSecond: 12, creditsPerInputSecond: 0, minCredits: 0,
    source: "video_to_video mode=edit with up to 5 image references; input ≤ 10 s. Runway's own task estimate for a 6.71 s edit was 81 credits (2026-09-23/24, two tasks) — 12 credits/s, above the pricing page's 10 credits/s for t2v/i2v; the estimate here uses 12 so the cost gate stays conservative until a billed task fixes it. Edit mode rejects `ratio` (orientation follows the input video, 720p) and `contentModeration`. Both S08 tasks (4 refs, 6.71 s, 3115-char prompt) reached 98 % within ~2 min then failed at ~40 min with THIRD_PARTY.TIMEOUT, 0 credits charged",
  },
  seedance2_5: {
    contract: "mode_edit", maxReferences: 30, maxKeyframes: 0, maxInputSeconds: 10, maxPromptChars: 15000,
    creditsPerOutputSecond: 30, creditsPerInputSecond: 15, minCredits: 0,
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
  /** finalize mode: settle a previously accepted job (poll → persist) instead of submitting one */
  finalizeProviderJobRowId?: string;
  /** submit mode: how long to wait for the result before returning the recorded job (s, ≤ 120) */
  maxWaitSeconds?: number;
};

/** Everything the persistence step needs; stored in provider_jobs.request_payload_json so a
 *  finalize call can rebuild it without re-resolving the Look. */
type JobContext = {
  rowId: string; taskId: string; userId: string; projectId: string; shotId: string | null; videoAssetId: string; wardrobeFeatureId: string;
  lookId: string | null; modelId: string; promptVersion: string; referencePlan: unknown; keyframeCount: number; estimatedCostUsd: number;
  providerCapability: unknown; controlCenterJobId: string | null; avtAuthorizedMaxCents: number; providerEstimateCentsFromControlCenter: number | null; submitPayload: unknown;
};
// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>;

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
// Redact signed-URL tokens on VALUES, never on serialised JSON: a `token=[^&]+` run over a
// JSON string eats the closing quote and everything up to the next "&", and the re-parse
// throws "Unterminated string in JSON" on every request that carries a signed URL.
const redactUrl = (u: string) => u.replace(/([?&]token=)[^&]+/g, "$1REDACTED");
const redactDeep = (v: unknown): unknown =>
  typeof v === "string" ? redactUrl(v)
  : Array.isArray(v) ? v.map(redactDeep)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, redactDeep(x)]))
  : v;

/** Dollars (AVT's authorization unit) → whole cents (Control Center's). Rounds UP so the
 *  authorization sent is never smaller than the amount AVT actually approved. */
const usdToCents = (usd: number) => Math.ceil(usd * 100);


/** Poll Control Center for the job until it settles or `deadlineMs` passes; on success download
 *  the output (an unauthenticated, time-limited Runway URL) into project-clips and insert the
 *  project_assets row; always bring provider_jobs up to date. Idempotent: a row that already
 *  has result_asset_id is returned as is. */
async function settleJob(cc: ControlCenterConfig, admin: Admin, ctx: JobContext, deadlineMs: number) {
  const { data: existing } = await admin.from("provider_jobs").select("id, status, result_asset_id, response_payload_json").eq("id", ctx.rowId).maybeSingle();
  if (existing?.result_asset_id) {
    const { data: asset } = await admin.from("project_assets").select("id, file_url").eq("id", existing.result_asset_id).maybeSingle();
    let previewUrl: string | null = null;
    if (asset?.file_url) { const { data: signed } = await admin.storage.from("project-clips").createSignedUrl(String(asset.file_url), OUTPUT_SIGN_TTL); previewUrl = signed?.signedUrl ?? null; }
    return { finalStatus: "succeeded", providerStatus: "SUCCEEDED", failure: null, assetId: String(existing.result_asset_id), persistError: null, alreadyFinalized: true,
      output: { storedBucket: "project-clips", storedPath: asset?.file_url ?? null, previewUrl, byteLength: null } };
  }
  const t0 = Date.now(); let finalPayload: Record<string, unknown> = {}; let finalStatus = "unknown"; let statusResultUrl: string | null = null;
  while (true) {
    const poll = await callControlCenter(cc, { endpoint: CC_JOB_STATUS_ENDPOINT, method: "GET", query: { provider: "runway", id: ctx.taskId } });
    if (poll.payload?.ok === true) {
      finalStatus = String(poll.payload.status ?? "unknown");   // normalised: queued|running|succeeded|failed
      finalPayload = (poll.payload.providerMetadata as Record<string, unknown>) ?? {};
      statusResultUrl = typeof poll.payload.resultUrl === "string" ? poll.payload.resultUrl : null;
      if (finalStatus === "succeeded" || finalStatus === "failed") break;
    }
    if (Date.now() - t0 + POLL_INTERVAL_MS > deadlineMs) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  // The status envelope normally carries the URL; job-result is the documented fallback.
  let outputUrl: string | null = finalStatus === "succeeded" ? statusResultUrl : null;
  if (finalStatus === "succeeded" && !outputUrl) {
    const res = await callControlCenter(cc, { endpoint: CC_JOB_RESULT_ENDPOINT, method: "GET", query: { provider: "runway", id: ctx.taskId } });
    if (res.payload?.ok === true && typeof res.payload.resultUrl === "string") outputUrl = res.payload.resultUrl;
  }
  let storedPath: string | null = null; let assetId: string | null = null; let byteLength: number | null = null; let persistError: string | null = null;
  if (outputUrl) {
    const dl = await fetch(outputUrl);
    if (!dl.ok) persistError = `download: http ${dl.status}`;
    else {
      const bytes = new Uint8Array(await dl.arrayBuffer()); byteLength = bytes.length;
      storedPath = `${ctx.userId}/${ctx.projectId}/runway-video-edit/${ctx.taskId}.mp4`;
      const { error: upErr } = await admin.storage.from("project-clips").upload(storedPath, bytes, { contentType: "video/mp4", upsert: true });
      if (upErr) persistError = `storage_upload: ${upErr.message}`;
      else {
        const { data: assetRow, error: assetErr } = await admin.from("project_assets").insert({
          user_id: ctx.userId, project_id: ctx.projectId, shot_id: ctx.shotId, parent_asset_id: ctx.videoAssetId, asset_type: "edited_clip", file_url: storedPath, approval_status: "pending",
          metadata_json: { bucket: "project-clips", mime_type: "video/mp4", file_size_bytes: byteLength, architecture_lane: "canonical_look_runway", provider: "runway", model: ctx.modelId, runway_task_id: ctx.taskId,
            source_video_asset_id: ctx.videoAssetId, wardrobe_feature_id: ctx.wardrobeFeatureId, look_id: ctx.lookId, prompt_version: ctx.promptVersion, reference_plan: ctx.referencePlan, keyframe_count: ctx.keyframeCount,
            estimated_cost_usd: ctx.estimatedCostUsd, final_status: finalStatus, provider_capability: ctx.providerCapability,
            // Provenance across the boundary: control_center_job_id is CC's
            // tool_execution_logs.request_id, so an AVT artifact joins to CC's audit row.
            credential_location: "control_center", control_center_job_id: ctx.controlCenterJobId,
            avt_authorized_max_cents: ctx.avtAuthorizedMaxCents, cc_provider_estimate_cents: ctx.providerEstimateCentsFromControlCenter, provider_jobs_row_id: ctx.rowId },
        }).select("id").single();
        if (!assetErr && assetRow) assetId = assetRow.id as string; else persistError = `project_assets_insert: ${assetErr?.message ?? "no_row"}`;
      }
    }
  }
  let previewUrl: string | null = null;
  if (storedPath && !persistError) { const { data: signed } = await admin.storage.from("project-clips").createSignedUrl(storedPath, OUTPUT_SIGN_TTL); previewUrl = signed?.signedUrl ?? null; }
  await admin.from("provider_jobs").update({
    status: finalStatus === "succeeded" || finalStatus === "failed" ? finalStatus : "running",
    response_payload_json: { submit: ctx.submitPayload, final: finalPayload, resultUrl: outputUrl ? redactUrl(outputUrl) : null },
    result_asset_id: assetId, error_text: persistError ?? (finalStatus === "failed" ? String(finalPayload?.failure ?? finalPayload?.failureCode ?? "provider_failed") : null),
  }).eq("id", ctx.rowId);
  return { finalStatus, providerStatus: finalPayload?.status ?? null, failure: finalPayload?.failure ?? finalPayload?.failureCode ?? null, assetId, persistError, alreadyFinalized: false,
    output: { storedBucket: storedPath ? "project-clips" : null, storedPath, previewUrl, byteLength } };
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""; const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""; const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // null when unconfigured; the dry run still resolves locally, a billed call fails closed.
  const cc: ControlCenterConfig | null = controlCenterConfig();
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "missing_bearer" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

  // ---- finalize mode: settle a job this function accepted earlier -------------------------
  if (body.finalizeProviderJobRowId) {
    if (!UUID_RE.test(body.finalizeProviderJobRowId)) return json(400, { error: "invalid_provider_job_row_id" });
    if (!cc) return json(503, { error: "control_center_not_configured" });
    const adminF = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: row, error: rowErr } = await adminF.from("provider_jobs").select("id, user_id, project_id, provider, external_job_id, status, result_asset_id, request_payload_json, response_payload_json").eq("id", body.finalizeProviderJobRowId).maybeSingle();
    if (rowErr) return json(500, { error: "job_query_failed", detail: rowErr.message });
    if (!row || row.user_id !== userId) return json(404, { error: "job_not_found" });
    if (row.provider !== "runway" || !row.external_job_id) return json(400, { error: "not_a_runway_video_edit_job" });
    const rp = (row.request_payload_json ?? {}) as Record<string, unknown>;
    if (rp.lane !== "canonical_look_runway_video_edit") return json(400, { error: "not_a_runway_video_edit_job" });
    const ctx: JobContext = {
      rowId: row.id as string, taskId: String(row.external_job_id), userId, projectId: String(row.project_id), shotId: (rp.shotId as string | null) ?? null,
      videoAssetId: String(rp.videoAssetId ?? ""), wardrobeFeatureId: String(rp.wardrobeFeatureId ?? ""), lookId: (rp.lookId as string | null) ?? null, modelId: String(rp.model ?? "aleph2"),
      promptVersion: String(rp.promptVersion ?? "unspecified"), referencePlan: rp.referencePlan ?? [], keyframeCount: Number(rp.keyframeCount ?? 0), estimatedCostUsd: Number(rp.estimatedCostUsd ?? 0),
      providerCapability: rp.providerCapability ?? null, controlCenterJobId: (rp.controlCenterJobId as string | null) ?? null, avtAuthorizedMaxCents: Number(rp.avtAuthorizedMaxCents ?? 0),
      providerEstimateCentsFromControlCenter: typeof rp.ccProviderEstimateCents === "number" ? rp.ccProviderEstimateCents : null, submitPayload: (row.response_payload_json as Record<string, unknown>)?.submit ?? row.response_payload_json,
    };
    const settled = await settleJob(cc, adminF, ctx, Math.min(FINALIZE_WAIT_MS, Math.max(0, (body.maxWaitSeconds ?? 60) * 1000)));
    return json(200, { finalize: true, providerJobRowId: ctx.rowId, submit: { accepted: true, taskId: ctx.taskId }, controlCenterJobId: ctx.controlCenterJobId, model: ctx.modelId,
      billed: settled.finalStatus === "succeeded" || settled.finalStatus === "failed", ...settled });
  }

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
  let lookConstraints: string[] = []; let lookSpec = ""; let policyUsed: Required<ReferencePolicy> | null = null;
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
    : { model: modelId, videoUri: videoUrl, mode: "edit", promptText: composedPrompt, duration: "auto", ...(referenceUrls.length ? { references: referenceUrls.map((uri) => ({ uri })) } : {}) };
  const promptVersion = body.promptVersion?.trim() || "unspecified";
  const estimatedCostUsd = estimateCostUsd(spec, inputSeconds);
  // AVT owns spend AUTHORIZATION; Control Center forms its own provider estimate and
  // refuses if that exceeds this number. Two numbers, two owners — neither is the other's.
  const avtAuthorizedMaxCents = usdToCents(maxCostUsd);

  // Normalised fields, not Runway's wire shape: Control Center re-derives the provider
  // request from its own model table, so the contract between AVT and CC stays stable if
  // Runway changes a field name.
  const ccRequestBody: Record<string, unknown> = {
    model: modelId,
    videoUri: videoUrl,
    promptText: composedPrompt,
    ...(keyframes.length ? { keyframes } : {}),
    ...(referenceUrls.length ? { references: referenceUrls.map((uri) => ({ uri })) } : {}),
    // no `ratio` in edit mode: Runway rejects it ("output orientation follows the input video and
    // resolution is 720p", observed 2026-09-23, unbilled); `ratio` belongs to reference mode only.
    // Runway accepts contentModeration on the aleph2 contract only; mode=edit models reject it
    // with 400 unrecognized_keys (observed on gemini_omni_flash_1.1, 2026-09-23, unbilled).
    ...(spec.contract === "aleph2" ? { contentModeration: { publicFigureThreshold: "low" } } : {}),
    inputSeconds,
    avtAuthorizedMaxCents,
    avt_project_id: body.projectId,
    avt_shot_id: body.shotId ?? null,
    // Stamped from the JWT this function verified itself, never from the client's body.
    avt_user_id: userId,
  };

  const plan = {
    lane: "canonical_look_runway_video_edit", provider: "runway", model: modelId,
    endpoint: `controlCenter/${CC_VIDEO_EDIT_ENDPOINT}`, providerEndpoint: "runway POST /v1/video_to_video (executed by Control Center)",
    credentialLocation: "control_center", contract: spec.contract,
    videoAssetId: body.videoAssetId, wardrobeFeatureId: body.wardrobeFeatureId, lookId, referencePlan, referenceCount: referenceUrls.length, keyframeCount: keyframes.length,
    referencePolicy: policyUsed, providerCapability: { key: "runway:video_to_video", model: modelId, ...capability, maxKeyframes: spec.maxKeyframes, maxInputSeconds: spec.maxInputSeconds },
    promptComposition: { constraintsFirst: lookConstraints, specLast: withSpec ? lookSpec : "" }, prompt: composedPrompt, promptVersion,
    inputSeconds, estimatedCostUsd, maxCostUsd, avtAuthorizedMaxCents,
    runwayRequestBody: redactDeep(runwayBody),
    controlCenterRequestBody: redactDeep(ccRequestBody),
    controlCenterConfigured: cc !== null,
  };

  // ---- $0 dry run --------------------------------------------------------
  // The local plan is resolved without touching anything. Control Center's own dry run is
  // then attempted for the authoritative provider envelope, but a failure there must not
  // cost the caller the local plan — inspection has to work before CC is even deployed.
  if (body.dryRun) {
    let controlCenterDryRun: unknown = null;
    let controlCenterError: string | null = null;
    if (!cc) {
      controlCenterError = "control_center_not_configured: set CONTROL_CENTER_URL and AVT_PROXY_KEY as AVT edge-function secrets";
    } else try {
      const ccDry = await callControlCenter(cc, {
        endpoint: CC_VIDEO_EDIT_ENDPOINT,
        body: { ...ccRequestBody, dryRun: true },
      });
      if (ccDry.payload?.ok === true) controlCenterDryRun = ccDry.payload;
      else controlCenterError = `control_center_http_${ccDry.httpStatus}: ${JSON.stringify(ccDry.payload).slice(0, 600)}`;
    } catch (e) {
      controlCenterError = `control_center_unreachable: ${String(e)}`;
    }
    return json(200, { dryRun: true, billed: false, ...plan, controlCenterDryRun, controlCenterError });
  }

  // Past this point a provider call is possible, so an unreachable Control Center is fatal:
  // AVT has no credential of its own to fall back on, and must not pretend otherwise.
  if (!cc) return json(503, { error: "control_center_not_configured", detail: "CONTROL_CENTER_URL and AVT_PROXY_KEY must be set as AVT edge-function secrets — nothing was billed", ...plan });

  if (estimatedCostUsd > maxCostUsd) return json(400, { error: "cost_ceiling_exceeded", detail: `Estimated $${estimatedCostUsd} exceeds maxCostUsd $${maxCostUsd}`, ...plan });

  // ---- submit through Control Center -------------------------------------
  const submit = await callControlCenter(cc, { endpoint: CC_VIDEO_EDIT_ENDPOINT, body: ccRequestBody });
  const submitOk = submit.payload?.ok === true;
  const taskId = typeof submit.payload?.providerJobId === "string" && submit.payload.providerJobId ? submit.payload.providerJobId : null;
  // Control Center's refusals (PROVIDER_KEY_NOT_CONFIGURED, PROVIDER_NOT_AVAILABLE,
  // COST_LIMIT_EXCEEDED) come back verbatim so the caller sees which boundary said no.
  if (!submitOk || !taskId) {
    return json(200, { ...plan, billed: false, submit: { httpStatus: submit.httpStatus, accepted: false, payload: submit.payload } });
  }
  const controlCenterJobId = typeof submit.payload?.jobId === "string" ? submit.payload.jobId : null;
  const ccProviderEstimateCents = typeof submit.payload?.ccProviderEstimateCents === "number" ? submit.payload.ccProviderEstimateCents : null;

  // Record the accepted (billable) job BEFORE the long poll. If this function is cut off by
  // the gateway while Runway is still rendering, the task id survives in provider_jobs and
  // the existing pollJobStatus / ingest-provider-job path can finish it — no orphaned spend.
  let providerJobRowId: string | null = null;
  {
    const { data: jobRow, error: jobErr } = await admin.from("provider_jobs").insert({
      user_id: userId, project_id: body.projectId, prompt_id: null, provider: "runway", status: "queued", external_job_id: taskId,
      request_payload_json: { lane: plan.lane, model: modelId, contract: spec.contract, videoAssetId: body.videoAssetId, wardrobeFeatureId: body.wardrobeFeatureId, lookId, shotId: body.shotId ?? null,
        promptVersion, promptText: composedPrompt, referencePlan, keyframeCount: keyframes.length, inputSeconds, estimatedCostUsd, avtAuthorizedMaxCents, controlCenterJobId, ccProviderEstimateCents, providerCapability: plan.providerCapability },
      response_payload_json: submit.payload,
    }).select("id").single();
    if (!jobErr && jobRow) providerJobRowId = jobRow.id as string; else console.error("runway-video-edit-proxy: provider_jobs insert failed", jobErr?.message);
  }

  // ---- bounded wait, then settle (persist) — a still-running job is returned as such and
  // finished later through `finalizeProviderJobRowId` ---------------------------------------
  if (!providerJobRowId) return json(200, { ...plan, billed: true, submit: { httpStatus: submit.httpStatus, accepted: true, taskId }, controlCenterJobId, providerJobRowId: null,
    finalStatus: "unknown", persistError: "provider_jobs_insert_failed: the job ran but cannot be finalized by row id; use the task id", output: null });
  const ctx: JobContext = { rowId: providerJobRowId, taskId, userId, projectId: body.projectId, shotId: body.shotId ?? null, videoAssetId: body.videoAssetId, wardrobeFeatureId: body.wardrobeFeatureId, lookId, modelId,
    promptVersion, referencePlan, keyframeCount: keyframes.length, estimatedCostUsd, providerCapability: plan.providerCapability, controlCenterJobId, avtAuthorizedMaxCents, providerEstimateCentsFromControlCenter: ccProviderEstimateCents, submitPayload: submit.payload };
  const waitMs = Math.min(MAX_WAIT_MS, Math.max(0, (body.maxWaitSeconds ?? MAX_WAIT_MS / 1000) * 1000));
  const settled = await settleJob(cc, admin, ctx, waitMs);
  return json(200, { ...plan, billed: settled.finalStatus === "succeeded" || settled.finalStatus === "failed",
    submit: { httpStatus: submit.httpStatus, accepted: true, taskId }, controlCenterJobId, providerJobRowId,
    estimatedCostUsd: plan.estimatedCostUsd, ccProviderEstimateCents, ...settled });
}

// A throw anywhere above would otherwise surface as a bare gateway 503 with no CORS headers,
// which the browser reports only as "Failed to fetch" — the caller cannot see what broke, and
// neither can we. Converting it to a CORS-bearing JSON error makes the next failure legible.
serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("runway-video-edit-proxy unhandled", e);
    return json(500, { error: "unhandled_exception", detail: String((e as Error)?.stack ?? e).slice(0, 2000) });
  }
});
