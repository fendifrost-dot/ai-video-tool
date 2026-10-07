// AVT edge function — world-still-proxy (still-first world building)
//
// User-JWT-only xAI POST /v1/images/generations: a photoreal STILL of a scene from the
// treatment — a world the artist is absent from, or a performance plate with the centre
// foreground left clear — stored under project-references/<user>/<project>/worlds/ so an
// image-to-video animator (Higgsfield DoP through Control Center, or Grok) can give it a
// camera move. Still-first because the frame can be approved (and gated) before any
// motion is paid for, and because the image model renders creatures, fur, ice and metal
// far more photographically than the same vendor's video model does from text.
//
// Modes: generate (billed; n ≤ 4 variants), dryRun (plan only). Every creative input is
// data on the request; nothing here knows a song, a shot or a project.
//
// REFERENCE PICTURES (2026-10-07): a request may name up to the endpoint's limit of reference pictures — project
// assets and the artist's wardrobe/identity pictures, BY RECORD ID, never by path or URL. Each is held to the caller
// (_shared/stillReferences.ts), signed only from the bucket its record lives in, and sent to xAI POST
// /v1/images/edits in the order given (the prompt names them <IMAGE_0>, <IMAGE_1>, …). Any reference that fails is
// refused by name and nothing is generated; more than the limit is refused, never trimmed. A dry run answers
// `referencesAccepted: true` and the limit, which is how the app knows it may send pictures at all. The answer says
// how many pictures went with the request (`referencesSent`).
//
// Required secrets: XAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";
import { getProviderCapability } from "../_shared/providerCapabilities.ts";
import { callXaiImageEditsDetailed } from "../_shared/xaiImageEdits.ts";
import { boundedInt, parseReferenceRequest, redactSigned, resolveReferences, type ResolvedReference } from "../_shared/stillReferences.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const XAI_URL = "https://api.x.ai/v1/images/generations";
const DEFAULT_MODEL = "grok-imagine-image-quality";
/** The edit model a request with reference pictures is drawn on (its limit: providerCapabilities xai:images/edits). */
const REFERENCE_MODEL = "grok-imagine-image-quality";
// xAI list price per generated image (2026-09); unknown models price at the dearest known rate so the gate fails safe
const PRICE_USD_PER_IMAGE: Record<string, number> = { "grok-imagine-image-quality": 0.07, "grok-imagine-image": 0.02, "grok-imagine-image-2.0": 0.07 };
const DEFAULT_MAX_COST_USD = 0.5;
const MAX_N = 4;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_TTL = 86400;

type Body = {
  projectId: string;
  prompt: string;
  model?: string;
  n?: number;
  aspectRatio?: string;      // "9:16" default
  resolution?: string;       // "1k" | "2k" (default "2k")
  shotLabel?: string;
  sceneTitle?: string;
  promptVersion?: string;
  maxCostUsd?: number;
  dryRun?: boolean;
  /**
   * The provider_jobs row this request belongs to (the caller's own, in this project). When given, the pictures are
   * written on that row the moment they are filed — so the paid result is on record even if the page that asked is
   * gone before the answer arrives, and the server can finish the job (provider-jobs-tick).
   */
  jobRowId?: string;
  /** Reference pictures, by record (see the header). Absent or empty = drawn from the prompt alone, as before. */
  references?: unknown;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function b64ToBytes(b64: string): Uint8Array {
  const raw = b64.includes(",") ? b64.split(",")[1]! : b64;
  const bin = atob(raw); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const xaiKey = resolveXaiApiKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""; const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""; const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!xaiKey) return json(500, { error: "xai_api_key_missing", detail: xaiKeyMissingMessage() });
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { error: "server_misconfigured" });
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "missing_bearer" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (!body.projectId || !UUID_RE.test(body.projectId)) return json(400, { error: "missing_project_id" });
  if (!(body.prompt ?? "").trim()) return json(400, { error: "prompt_required" });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: project, error: pErr } = await admin.from("video_projects").select("id, user_id").eq("id", body.projectId).maybeSingle();
  if (pErr) return json(500, { error: "project_query_failed", detail: pErr.message });
  if (!project || project.user_id !== userId) return json(403, { error: "project_forbidden" });

  const parsedRefs = parseReferenceRequest(body.references);
  if (parsedRefs.error) return json(400, { error: "invalid_references", detail: parsedRefs.error });
  const refCap = getProviderCapability("xai:images/edits", Deno.env, REFERENCE_MODEL).maxReferenceImages;
  const withRefs = parsedRefs.refs.length > 0;
  if (parsedRefs.refs.length > refCap) {
    return json(400, { error: "references_over_capability", detail: `${parsedRefs.refs.length} reference pictures were sent; ${REFERENCE_MODEL} takes ${refCap}. Nothing was generated.`, maxReferences: refCap });
  }
  const model = withRefs ? REFERENCE_MODEL : (body.model ?? DEFAULT_MODEL); const n = boundedInt(body.n, 1, 1, MAX_N);
  const aspect = body.aspectRatio ?? "9:16"; const resolution = body.resolution ?? "2k";
  const rate = PRICE_USD_PER_IMAGE[model] ?? Math.max(...Object.values(PRICE_USD_PER_IMAGE));
  const estimatedCostUsd = Number((rate * n).toFixed(4)); const maxCostUsd = Number.isFinite(Number(body.maxCostUsd)) ? Number(body.maxCostUsd) : DEFAULT_MAX_COST_USD;
  const plan = {
    model, n, aspectRatio: aspect, resolution, estimatedCostUsd, maxCostUsd, promptChars: body.prompt.length, promptVersion: body.promptVersion ?? null,
    // what the app asks before it sends any picture
    referencesAccepted: true, maxReferences: refCap, referenceModel: REFERENCE_MODEL,
  };
  if (estimatedCostUsd > maxCostUsd) return json(200, { ok: false, error: "cost_gate", ...plan });

  // every reference is held to the caller before anything is signed — and before a dry run says yes
  let resolvedRefs: ResolvedReference[] = [];
  if (withRefs) {
    const assetIds = parsedRefs.refs.filter((r) => r.source === "project_asset").map((r) => r.id);
    const featureIds = parsedRefs.refs.filter((r) => r.source === "character_feature").map((r) => r.id);
    const [assetsRes, featuresRes, artistsRes] = await Promise.all([
      assetIds.length ? admin.from("project_assets").select("id, project_id, file_url, asset_type, metadata_json").in("id", assetIds) : Promise.resolve({ data: [], error: null }),
      featureIds.length ? admin.from("character_features").select("id, artist_id, storage_path, file_url, feature_type").in("id", featureIds) : Promise.resolve({ data: [], error: null }),
      featureIds.length ? admin.from("artists").select("id").eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
    ]);
    const lookupErr = assetsRes.error ?? featuresRes.error ?? artistsRes.error;
    if (lookupErr) return json(500, { error: "reference_lookup_failed" });
    const r = resolveReferences(parsedRefs.refs, {
      projectId: body.projectId,
      assets: (assetsRes.data ?? []) as never,
      features: (featuresRes.data ?? []) as never,
      ownArtists: new Set(((artistsRes.data ?? []) as { id: string }[]).map((a) => a.id)),
    });
    if (r.refused.length > 0) {
      return json(403, { error: "reference_refused", detail: "Nothing was generated.", refused: r.refused.map((x) => ({ source: x.ref.source, id: x.ref.id, label: x.ref.label, why: x.why })) });
    }
    resolvedRefs = r.resolved;
  }
  if (body.dryRun) return json(200, { ok: true, dryRun: true, billed: false, ...plan, referencesSent: 0, referencesChecked: resolvedRefs.length });

  if (withRefs) {
    const images: { url: string; type: "image_url" }[] = [];
    for (const ref of resolvedRefs) {
      let url: string | null = null;
      for (const bucket of ref.buckets) {
        const { data, error } = await admin.storage.from(bucket).createSignedUrl(ref.path, 600);
        if (!error && data?.signedUrl) { url = data.signedUrl; break; }
      }
      // only files inside the caller's own project / artist folders get here (stillReferences.ts inFolderOf)
      if (!url) return json(200, { ok: false, billed: false, error: "reference_sign_failed", detail: `${ref.ref.label || ref.ref.id}: its file could not be read. Nothing was generated.`, ...plan });
      images.push({ url, type: "image_url" });
    }
    // one edit call per candidate (the edits endpoint answers one picture); they run side by side
    const results = await Promise.allSettled(
      Array.from({ length: n }, () => callXaiImageEditsDetailed({ apiKey: xaiKey, model, prompt: body.prompt, images, resolution, aspectRatio: aspect, timeoutMs: 120_000 })),
    );
    const sentRefs = resolvedRefs.map((r) => ({ source: r.ref.source, id: r.ref.id, role: r.ref.role, label: r.ref.label }));
    const stills: Array<{ path: string; previewUrl: string | null; bytes: number; assetId: string | null }> = [];
    const stamp = Date.now().toString(36);
    const failures: string[] = [];
    // what xAI drew is paid for whether or not it is filed: counted apart from what was stored
    let drawn = 0;
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status !== "fulfilled") {
        const why = redactSigned(res.reason instanceof Error ? res.reason.message : String(res.reason));
        // a picture xAI made but could not be fetched was still made (and charged)
        if (/^xai_download|^xai_no_image/.test(why)) drawn++;
        failures.push(why);
        continue;
      }
      drawn++;
      const bytes = res.value.bytes;
      const path = `${userId}/${body.projectId}/worlds/${(body.shotLabel ?? "scene").replace(/[^A-Za-z0-9_-]/g, "_")}_${stamp}_${i + 1}.png`;
      const { error: upErr } = await admin.storage.from("project-references").upload(path, bytes, { contentType: "image/png", upsert: true });
      if (upErr) { failures.push(`storage_upload: ${upErr.message}`); continue; }
      const { data: signed } = await admin.storage.from("project-references").createSignedUrl(path, SIGN_TTL);
      const { data: filed } = await admin.from("project_assets").insert({
        user_id: userId, project_id: body.projectId, asset_type: "reference_image", file_url: path, source_tool: "grok", approval_status: "pending", notes: body.sceneTitle ?? body.shotLabel ?? null,
        metadata_json: { bucket: "project-references", mime_type: "image/png", file_size_bytes: bytes.length, lane: "world_still", route: "images/edits", model, resolution, aspect_ratio: aspect, prompt_version: body.promptVersion ?? null, shot_label: body.shotLabel ?? null, scene_title: body.sceneTitle ?? null, actual_cost_usd: rate, references: sentRefs },
      }).select("id").maybeSingle();
      stills.push({ path, previewUrl: signed?.signedUrl ?? null, bytes: bytes.length, assetId: (filed?.id as string | undefined) ?? null });
    }
    const actualCostUsd = Number((rate * drawn).toFixed(4));
    if (body.jobRowId && UUID_RE.test(body.jobRowId) && drawn > 0) {
      await admin
        .from("provider_jobs")
        .update({ response_payload_json: { stills: stills.map((x) => ({ path: x.path, assetId: x.assetId })), actualCostUsd, references: sentRefs, failures, recordedAt: new Date().toISOString() } })
        .eq("id", body.jobRowId)
        .eq("user_id", userId)
        .eq("project_id", body.projectId)
        .in("status", ["queued", "running"]);
    }
    if (stills.length === 0) return json(200, { ok: false, billed: drawn > 0, actualCostUsd, error: "xai_error", detail: failures[0] ?? "no picture returned", ...plan, referencesSent: images.length });
    return json(200, { ok: true, billed: true, actualCostUsd, stills, ...plan, referencesSent: images.length, references: sentRefs, failedCandidates: failures.length, failures });
  }

  const res = await fetch(XAI_URL, {
    method: "POST", headers: { Authorization: `Bearer ${xaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: body.prompt, n, aspect_ratio: aspect, resolution, response_format: "b64_json" }),
  });
  const text = await res.text(); let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text); } catch { payload = { _raw: text.slice(0, 1500) }; }
  if (!res.ok) return json(200, { ok: false, billed: false, error: "xai_error", httpStatus: res.status, detail: payload, ...plan });
  const data = (payload.data as Array<{ b64_json?: string; url?: string }> | undefined) ?? [];
  const stills: Array<{ path: string; previewUrl: string | null; bytes: number; assetId: string | null }> = [];
  const stamp = Date.now().toString(36);
  for (let i = 0; i < data.length; i++) {
    let bytes: Uint8Array | null = null;
    if (data[i].b64_json) bytes = b64ToBytes(data[i].b64_json!);
    else if (data[i].url) { const r = await fetch(data[i].url!); if (r.ok) bytes = new Uint8Array(await r.arrayBuffer()); }
    if (!bytes) continue;
    const path = `${userId}/${body.projectId}/worlds/${(body.shotLabel ?? "scene").replace(/[^A-Za-z0-9_-]/g, "_")}_${stamp}_${i + 1}.png`;
    const { error: upErr } = await admin.storage.from("project-references").upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) return json(200, { ok: false, billed: true, error: "storage_upload", detail: upErr.message, ...plan });
    const { data: signed } = await admin.storage.from("project-references").createSignedUrl(path, SIGN_TTL);
    const { data: filed } = await admin.from("project_assets").insert({
      user_id: userId, project_id: body.projectId, asset_type: "reference_image", file_url: path, source_tool: "grok", approval_status: "pending", notes: body.sceneTitle ?? body.shotLabel ?? null,
      metadata_json: { bucket: "project-references", mime_type: "image/png", file_size_bytes: bytes.length, lane: "world_still", model, resolution, aspect_ratio: aspect, prompt_version: body.promptVersion ?? null, shot_label: body.shotLabel ?? null, scene_title: body.sceneTitle ?? null, actual_cost_usd: rate },
    }).select("id").maybeSingle();
    stills.push({ path, previewUrl: signed?.signedUrl ?? null, bytes: bytes.length, assetId: (filed?.id as string | undefined) ?? null });
  }
  const actualCostUsd = Number((rate * stills.length).toFixed(4));
  // Write the pictures on the job they belong to. The row's status is left alone: the page that asked checks the
  // pictures and finishes the job; if it is gone, the server does (provider-jobs-tick), from exactly this record.
  if (body.jobRowId && UUID_RE.test(body.jobRowId) && stills.length > 0) {
    await admin
      .from("provider_jobs")
      .update({ response_payload_json: { stills: stills.map((x) => ({ path: x.path, assetId: x.assetId })), actualCostUsd, recordedAt: new Date().toISOString() } })
      .eq("id", body.jobRowId)
      .eq("user_id", userId)
      .eq("project_id", body.projectId)
      .in("status", ["queued", "running"]);
  }
  return json(200, { ok: stills.length > 0, billed: true, actualCostUsd, stills, ...plan });
});
