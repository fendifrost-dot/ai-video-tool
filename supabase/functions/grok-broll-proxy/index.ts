// AVT edge function — grok-broll-proxy (B-roll product lane)
//
// User-JWT-only xAI /v1/videos/generations IMAGE-TO-VIDEO: animate an approved still of the
// artist (a Look realisation, a hero frame, any image asset the user owns) with a prompted
// camera move, scenery and FX, and persist the clip as a reviewable project_assets
// generated_clip row. No rapping, no lip-sync: this is the "artist in the garments" B-roll
// lane the treatment uses between real performance shots while the garment-swap lane is parked.
//
// Modes (the xAI job outlives the gateway's request window, so the proxy is two-phase):
//   submit — price, gate on maxCostUsd, submit ONE generation, return { requestId, plan }
//   poll   — one status read; when done: download, store in project-clips, insert the asset
//            row (idempotent on grok_request_id), return the row + a signed preview URL
//   dryRun — the plan only (no xAI call, not billed)
//
// Every creative input is data on the request (prompt, duration, aspect, resolution, model);
// nothing here knows a project, a Look or a song.
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

const XAI_BASE_URL = "https://api.x.ai/v1";
const SIGN_TTL = 3600;
const OUTPUT_SIGN_TTL = 604800;
const DEFAULT_MODEL = "grok-imagine-video";
const DEFAULT_MAX_COST_USD = 1.0;
const MAX_DURATION_SECONDS = 15;
// Price per generated second used by the maxCostUsd gate. The list rate for grok-imagine-video is $0.05/s, but the
// first live 6 s 720p 9:16 image-to-video billed $0.422 (usage ticks, 2026-10-01) = $0.0703/s, so the gate prices at
// the measured rate; unknown models price at the dearest known rate so the gate fails safe. The ledger uses billed ticks.
const PRICE_USD_PER_SECOND: Record<string, number> = {
  "grok-imagine-video": 0.0703,
  "grok-imagine-video-1.5": 0.08,
};
const IMAGE_BUCKETS = ["project-references", "look-composites", "project-exports", "project-clips", "wardrobe-refs", "product-assets", "artist-assets"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = {
  mode?: "submit" | "poll";
  projectId: string;
  /** the still to animate: a storage path (bucket searched in IMAGE_BUCKETS order) or an https URL */
  imagePath?: string;
  imageBucket?: string;
  imageUrl?: string;
  prompt?: string;
  model?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  maxCostUsd?: number;
  shotId?: string;        // shots.id uuid (optional)
  shotLabel?: string;     // treatment label such as the shot code; kept in metadata, never in shot_id
  promptVersion?: string;
  /** free-text label stored with the asset (e.g. the treatment's camera_direction) */
  label?: string;
  dryRun?: boolean;
  /** poll mode */
  requestId?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 2000) }; }
}

function extractRequestId(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null;
  if (!p) return null;
  for (const key of ["request_id", "id", "requestId"]) { const v = p[key]; if (typeof v === "string" && v) return v; }
  return null;
}

function extractVideoUrl(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null;
  if (!p) return null;
  const video = p.video as Record<string, unknown> | undefined;
  if (video && typeof video.url === "string") return video.url;
  if (typeof p.url === "string") return p.url;
  const data = p.data as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (typeof first?.url === "string") return first.url;
    const inner = first?.video as Record<string, unknown> | undefined;
    if (inner && typeof inner.url === "string") return inner.url;
  }
  return null;
}

function costFromTicks(payload: unknown): number | null {
  const usage = (payload as Record<string, unknown> | null)?.usage as Record<string, unknown> | undefined;
  const ticks = usage?.cost_in_usd_ticks;
  if (typeof ticks === "number") return ticks / 10_000_000_000;
  if (typeof ticks === "string") return Number(ticks) / 10_000_000_000;
  return null;
}

// NOTE: `ReturnType<typeof createClient>` resolves the schema param to `never` under
// Deno check, while instantiated clients carry `<any, "public", any>` — use the bare
// `SupabaseClient` default generics, same pattern as `_shared/jacketInpaintPipeline.ts`.
async function signImage(admin: import("https://esm.sh/@supabase/supabase-js@2.45.0").SupabaseClient, path: string, preferred?: string): Promise<{ url: string; bucket: string } | null> {
  const buckets = preferred ? [preferred, ...IMAGE_BUCKETS.filter((b) => b !== preferred)] : IMAGE_BUCKETS;
  for (const bucket of buckets) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGN_TTL);
    if (!error && data?.signedUrl) return { url: data.signedUrl, bucket };
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const xaiKey = resolveXaiApiKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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
  const mode = body.mode ?? "submit";

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: project, error: pErr } = await admin.from("video_projects").select("id, user_id").eq("id", body.projectId).maybeSingle();
  if (pErr) return json(500, { error: "project_query_failed", detail: pErr.message });
  if (!project || project.user_id !== userId) return json(403, { error: "project_forbidden" });

  const model = body.model ?? DEFAULT_MODEL;

  // ------------------------------------------------------------------ poll
  if (mode === "poll") {
    const requestId = body.requestId ?? "";
    if (!requestId) return json(400, { error: "missing_request_id" });
    const pollRes = await fetch(`${XAI_BASE_URL}/videos/${requestId}`, { headers: { Authorization: `Bearer ${xaiKey}` } });
    const payload = await readJsonSafe(pollRes);
    const status = String((payload as Record<string, unknown>)?.status ?? "unknown");
    if (!pollRes.ok) return json(200, { mode, status: "error", httpStatus: pollRes.status, payload });
    if (status !== "done") return json(200, { mode, status, requestId, failed: status === "failed" || status === "expired", payload: status === "failed" ? payload : undefined });

    // idempotent persistence: a second poll after completion returns the same asset
    const { data: existing } = await admin.from("project_assets").select("id, file_url").eq("project_id", body.projectId).contains("metadata_json", { grok_request_id: requestId }).maybeSingle();
    let storedPath = existing?.file_url as string | undefined; let assetId = existing?.id as string | undefined; let byteLength: number | null = null; let persistError: string | null = null;
    const actualCostUsd = costFromTicks(payload);
    // shot_id is a uuid column: a treatment label passed as shotId is kept as metadata.shot_label instead of losing the row
    const shotUuid = body.shotId && UUID_RE.test(body.shotId) ? body.shotId : null; const shotLabel = body.shotLabel ?? (shotUuid ? null : (body.shotId ?? null));
    if (!storedPath) {
      const outputUrl = extractVideoUrl(payload);
      if (!outputUrl) return json(200, { mode, status, requestId, error: "no_output_url", payload });
      const dl = await fetch(outputUrl);
      if (!dl.ok) return json(200, { mode, status, requestId, error: "download_failed", httpStatus: dl.status });
      const bytes = new Uint8Array(await dl.arrayBuffer()); byteLength = bytes.length;
      storedPath = `${userId}/${body.projectId}/grok-broll/${requestId}.mp4`;
      const { error: upErr } = await admin.storage.from("project-clips").upload(storedPath, bytes, { contentType: "video/mp4", upsert: true });
      if (upErr) persistError = `storage_upload: ${upErr.message}`;
      else {
        const { data: row, error: aErr } = await admin.from("project_assets").insert({
          user_id: userId, project_id: body.projectId, shot_id: shotUuid, asset_type: "generated_clip", file_url: storedPath, source_tool: "grok", approval_status: "pending",
          notes: body.label ?? null,
          metadata_json: {
            bucket: "project-clips", mime_type: "video/mp4", file_size_bytes: byteLength, lane: "grok_broll_image_to_video", model, grok_request_id: requestId, shot_label: shotLabel,
            prompt_version: body.promptVersion ?? null, source_image_path: body.imagePath ?? body.imageUrl ?? null, actual_cost_usd: actualCostUsd, final_status: status,
            duration_seconds: body.duration ?? null, aspect_ratio: body.aspectRatio ?? null, resolution: body.resolution ?? null,
          },
        }).select("id").single();
        if (aErr || !row) persistError = `project_assets_insert: ${aErr?.message ?? "no_row"}`; else assetId = row.id as string;
      }
    }
    let previewUrl: string | null = null;
    if (storedPath) { const { data: signed } = await admin.storage.from("project-clips").createSignedUrl(storedPath, OUTPUT_SIGN_TTL); previewUrl = signed?.signedUrl ?? null; }
    return json(200, { mode, status, requestId, billed: true, actualCostUsd, assetId, persistError, output: { storedBucket: "project-clips", storedPath, previewUrl, byteLength } });
  }

  // ------------------------------------------------------------------ submit
  let imageUrl: string | null = body.imageUrl ?? null; let imageBucket: string | null = null;
  if (!imageUrl && body.imagePath) {
    // the still must be the user's own: every image bucket is owner-foldered by user id
    if (!body.imagePath.startsWith(`${userId}/`) && !body.imagePath.includes(`/${userId}/`)) return json(403, { error: "image_not_owned" });
    const signed = await signImage(admin, body.imagePath, body.imageBucket);
    if (!signed) return json(404, { error: "image_not_resolvable", imagePath: body.imagePath });
    imageUrl = signed.url; imageBucket = signed.bucket;
  }
  if (!imageUrl) return json(400, { error: "image_required" });
  const duration = Math.min(Math.max(1, Number(body.duration ?? 5)), MAX_DURATION_SECONDS);
  const rate = PRICE_USD_PER_SECOND[model] ?? Math.max(...Object.values(PRICE_USD_PER_SECOND));
  const estimatedCostUsd = Number((rate * duration).toFixed(4));
  const maxCostUsd = body.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  const xaiBody = { model, prompt: body.prompt ?? "", image: { url: imageUrl }, duration, aspect_ratio: body.aspectRatio ?? "9:16", resolution: body.resolution ?? "720p" }; // image is an ImageUrl struct: a bare string is a 422 at xAI
  const plan = { mode, model, duration, aspectRatio: xaiBody.aspect_ratio, resolution: xaiBody.resolution, imageBucket, estimatedCostUsd, maxCostUsd, promptVersion: body.promptVersion ?? null, promptChars: (body.prompt ?? "").length };
  if (body.dryRun) return json(200, { dryRun: true, billed: false, ...plan });
  if (estimatedCostUsd > maxCostUsd) return json(400, { error: "cost_ceiling_exceeded", ...plan });

  const submitRes = await fetch(`${XAI_BASE_URL}/videos/generations`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` }, body: JSON.stringify(xaiBody) });
  const submitPayload = await readJsonSafe(submitRes);
  const requestId = extractRequestId(submitPayload);
  const accepted = submitRes.ok && !!requestId;
  if (!accepted) return json(200, { ...plan, billed: false, submit: { httpStatus: submitRes.status, accepted: false, payload: submitPayload } });
  return json(200, { ...plan, billed: true, submitted: true, requestId, submit: { httpStatus: submitRes.status, accepted: true } });
});
