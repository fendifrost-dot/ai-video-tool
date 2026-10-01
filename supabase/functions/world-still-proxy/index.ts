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
// Required secrets: XAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const XAI_URL = "https://api.x.ai/v1/images/generations";
const DEFAULT_MODEL = "grok-imagine-image-quality";
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

  const model = body.model ?? DEFAULT_MODEL; const n = Math.max(1, Math.min(MAX_N, Number(body.n ?? 1)));
  const aspect = body.aspectRatio ?? "9:16"; const resolution = body.resolution ?? "2k";
  const rate = PRICE_USD_PER_IMAGE[model] ?? Math.max(...Object.values(PRICE_USD_PER_IMAGE));
  const estimatedCostUsd = Number((rate * n).toFixed(4)); const maxCostUsd = Number(body.maxCostUsd ?? DEFAULT_MAX_COST_USD);
  const plan = { model, n, aspectRatio: aspect, resolution, estimatedCostUsd, maxCostUsd, promptChars: body.prompt.length, promptVersion: body.promptVersion ?? null };
  if (estimatedCostUsd > maxCostUsd) return json(200, { ok: false, error: "cost_gate", ...plan });
  if (body.dryRun) return json(200, { ok: true, dryRun: true, billed: false, ...plan });

  const res = await fetch(XAI_URL, {
    method: "POST", headers: { Authorization: `Bearer ${xaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: body.prompt, n, aspect_ratio: aspect, resolution, response_format: "b64_json" }),
  });
  const text = await res.text(); let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text); } catch { payload = { _raw: text.slice(0, 1500) }; }
  if (!res.ok) return json(200, { ok: false, billed: false, error: "xai_error", httpStatus: res.status, detail: payload, ...plan });
  const data = (payload.data as Array<{ b64_json?: string; url?: string }> | undefined) ?? [];
  const stills: Array<{ path: string; previewUrl: string | null; bytes: number }> = [];
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
    stills.push({ path, previewUrl: signed?.signedUrl ?? null, bytes: bytes.length });
    await admin.from("project_assets").insert({
      user_id: userId, project_id: body.projectId, asset_type: "reference_image", file_url: path, source_tool: "grok", approval_status: "pending", notes: body.sceneTitle ?? body.shotLabel ?? null,
      metadata_json: { bucket: "project-references", mime_type: "image/png", file_size_bytes: bytes.length, lane: "world_still", model, resolution, aspect_ratio: aspect, prompt_version: body.promptVersion ?? null, shot_label: body.shotLabel ?? null, scene_title: body.sceneTitle ?? null, actual_cost_usd: rate },
    });
  }
  return json(200, { ok: stills.length > 0, billed: true, actualCostUsd: Number((rate * stills.length).toFixed(4)), stills, ...plan });
});
