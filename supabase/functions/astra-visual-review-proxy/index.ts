// AVT edge function — astra-visual-review-proxy (Astra visual QA, Phase 1)
//
// User-JWT-only bridge to OpenAI `gpt-6-astra` for reviewing COMPLETED DRAFTS
// against treatment / ShotSpec intent. The model accepts text + images only
// (no video input on the API), so the client sends dense, timestamped frame
// sequences (the documented way to do video understanding with Astra) plus
// reference images and a strict JSON schema; the model returns the structured
// review (src/lib/qa/astraVisualReview.ts). The browser never sees the key.
//
// Fail-closed cost gate (estimate from frame count) before the billed call.
// Result JSON is stored under project-exports/<user>/<project>/astra-reviews/.
//
// Two-step because the edge gateway kills requests at ~150 s and a 50–90-image
// Astra review takes longer: `mode: "submit"` creates the OpenAI response with
// `background: true` and returns its id at once; `mode: "poll"` fetches it, and
// when it is complete parses, prices and stores the review. (First live run,
// 2026-09-21: synchronous call hit 504 at 151 s — the OpenAI side still billed.)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-6-astra";
const KEY_ENV_NAMES = ["OPENAI_API_KEY", "FROST_OPENAI", "ASTRA_API_KEY"] as const;
// gpt-6-astra list price: $10 / 1M input, $50 / 1M output (developers.openai.com, 2026-09).
const USD_PER_INPUT_TOKEN = 10 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 50 / 1_000_000;
const EST_TOKENS_PER_IMAGE = 1600; // ~720x1280 JPEG, conservative
const EST_OUTPUT_TOKENS = 6000;
const DEFAULT_MAX_COST_USD = 2.0;
const MAX_IMAGES = 120;

type ImagePart = { label: string; dataUrl: string };
type Body = {
  projectId: string;
  draftId: string;
  partId?: string; // e.g. "shots-S01-S04", "transitions", "sequence"
  mode?: "submit" | "poll"; // default "submit"; "poll" needs responseId
  responseId?: string;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  instructions?: string; // the review brief for this part
  frames?: ImagePart[]; // timestamped frames, label like "draft t=12.500s (song 59.713s) shot S04"
  references?: ImagePart[]; // garment refs, identity anchors, source sheets
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  maxCostUsd?: number;
  dryRun?: boolean;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function resolveOpenAiKey(): string {
  for (const n of KEY_ENV_NAMES) {
    const v = Deno.env.get(n)?.trim();
    if (v) return v;
  }
  return "";
}

function isDataImage(u: string): boolean {
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const apiKey = resolveOpenAiKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { error: "server_misconfigured" });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "missing_bearer" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!body.projectId || !body.draftId) return json(400, { error: "missing_required_fields" });
  const mode = body.mode ?? "submit";
  if (mode === "poll") {
    if (!body.responseId || !/^resp_[A-Za-z0-9_-]+$/.test(body.responseId)) return json(400, { error: "invalid_response_id" });
  } else if (!body.instructions || !Array.isArray(body.frames) || !body.jsonSchema?.schema) {
    return json(400, { error: "missing_required_fields" });
  }
  const frames = (body.frames ?? []).filter((f) => f && isDataImage(f.dataUrl));
  const refs = (body.references ?? []).filter((f) => f && isDataImage(f.dataUrl));
  if (mode === "submit" && frames.length === 0) return json(400, { error: "no_frames" });
  if (frames.length + refs.length > MAX_IMAGES) return json(400, { error: "too_many_images", max: MAX_IMAGES });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: project, error: pErr } = await admin.from("video_projects").select("id, user_id").eq("id", body.projectId).maybeSingle();
  if (pErr) return json(500, { error: "project_query_failed", detail: pErr.message });
  if (!project || project.user_id !== userId) return json(403, { error: "project_forbidden" });

  const model = body.model ?? DEFAULT_MODEL;
  const storedPath = `${userId}/${body.projectId}/astra-reviews/${body.draftId}/${body.partId ?? "default"}.json`;

  if (mode === "poll") {
    if (!apiKey) return json(500, { error: "openai_api_key_missing" });
    const pr = await fetch(`${OPENAI_BASE_URL}/responses/${body.responseId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const rawP = await pr.text();
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(rawP); } catch { payload = { _raw: rawP.slice(0, 4000) }; }
    if (!pr.ok) return json(200, { mode, status: "error", httpStatus: pr.status, payload });
    const status = String(payload.status ?? "unknown");
    if (status !== "completed") {
      const err = payload.error ?? payload.incomplete_details ?? null;
      return json(200, { mode, status, responseId: body.responseId, error: status === "failed" || status === "cancelled" || status === "incomplete" ? "openai_" + status : undefined, detail: err });
    }
    const { review, outText } = extractReview(payload);
    const usage = (payload.usage as Record<string, number>) ?? {};
    const actualCostUsd = Number((((usage.input_tokens ?? 0) * USD_PER_INPUT_TOKEN) + ((usage.output_tokens ?? 0) * USD_PER_OUTPUT_TOKEN)).toFixed(4));
    const record = { draftId: body.draftId, partId: body.partId ?? "default", model: String(payload.model ?? model), responseId: body.responseId, reviewedAt: new Date().toISOString(), usage, actualCostUsd, review, rawText: review ? undefined : outText.slice(0, 8000) };
    const { error: upErr } = await admin.storage.from("project-exports").upload(storedPath, new TextEncoder().encode(JSON.stringify(record, null, 2)), { contentType: "application/json", upsert: true });
    return json(200, { mode, status: "completed", billed: true, responseId: body.responseId, actualCostUsd, usage, storedPath: upErr ? null : storedPath, storeError: upErr?.message ?? null, review, rawText: review ? undefined : outText.slice(0, 4000) });
  }

  const maxCostUsd = body.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  const textChars = (body.instructions ?? "").length + JSON.stringify(body.jsonSchema!.schema).length;
  const estInput = (frames.length + refs.length) * EST_TOKENS_PER_IMAGE + Math.ceil(textChars / 3.5);
  const estimatedCostUsd = Number((estInput * USD_PER_INPUT_TOKEN + EST_OUTPUT_TOKENS * USD_PER_OUTPUT_TOKEN).toFixed(4));
  const plan = { model, partId: body.partId ?? "default", frames: frames.length, references: refs.length, estimatedInputTokens: estInput, estimatedCostUsd, maxCostUsd };

  if (body.dryRun) return json(200, { dryRun: true, billed: false, keyConfigured: !!apiKey, ...plan });
  if (!apiKey) return json(500, { error: "openai_api_key_missing", detail: `Set Edge Function secret ${KEY_ENV_NAMES.join(" or ")}.` });
  if (estimatedCostUsd > maxCostUsd) return json(400, { error: "cost_ceiling_exceeded", ...plan });

  const content: Record<string, unknown>[] = [{ type: "input_text", text: body.instructions! }];
  if (refs.length) content.push({ type: "input_text", text: "REFERENCE IMAGES (intent / truth, not the draft):" });
  for (const r of refs) {
    content.push({ type: "input_text", text: `Reference: ${r.label}` });
    content.push({ type: "input_image", image_url: r.dataUrl, detail: "high" });
  }
  content.push({ type: "input_text", text: `DRAFT FRAMES in temporal order (${frames.length}). Treat consecutive frames as motion; judge stability across them.` });
  for (const f of frames) {
    content.push({ type: "input_text", text: f.label });
    content.push({ type: "input_image", image_url: f.dataUrl, detail: "high" });
  }

  const reqBody = {
    model,
    reasoning: { effort: body.reasoningEffort ?? "high" },
    input: [{ role: "user", content }],
    text: { format: { type: "json_schema", name: body.jsonSchema!.name, schema: body.jsonSchema!.schema, strict: true } },
    max_output_tokens: 16000,
    background: true,
    store: true,
  };
  const t0 = Date.now();
  const res = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(reqBody),
  });
  const raw = await res.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { _raw: raw.slice(0, 4000) };
  }
  if (!res.ok) return json(200, { billed: false, httpStatus: res.status, error: "openai_error", payload, ...plan });
  const responseId = typeof payload.id === "string" ? payload.id : null;
  if (!responseId) return json(200, { billed: false, error: "no_response_id", payload, ...plan });
  return json(200, { mode, submitted: true, responseId, status: String(payload.status ?? "queued"), submitMs: Date.now() - t0, ...plan });
});

/** Responses API: output[].content[].text holds the JSON text when text.format is json_schema. */
function extractReview(payload: Record<string, unknown>): { review: unknown; outText: string } {
  let outText = "";
  const output = (payload.output as Array<Record<string, unknown>>) ?? [];
  for (const item of output) {
    const parts = (item.content as Array<Record<string, unknown>>) ?? [];
    for (const p of parts) if (typeof p.text === "string") outText += p.text;
  }
  if (!outText && typeof payload.output_text === "string") outText = payload.output_text as string;
  let review: unknown = null;
  try { review = JSON.parse(outText); } catch { review = null; }
  return { review, outText };
}
