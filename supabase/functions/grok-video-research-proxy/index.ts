// AVT edge function — grok-video-research-proxy  (RESEARCH ONLY, not a product lane)
//
// Purpose: answer the Grok 2026 Capability Re-Benchmark question —
//   "can current Grok take the ACTUAL source footage, preserve the actual person,
//    performance, pose, motion, camera, lighting and environment, and replace only
//    the clothing with an accurate reproduction of the real branded garment?"
//
// Research experiment: grok-recap-2026-08 v1.0.0
// Spec: docs/research/GROK_RECAP_2026-08_PHASE0_PHASE1.md
//
// This function is REFERENCED BY NOTHING. No UI, no provider registry entry, no
// production lane calls it. It exists so Phase 2 can be run at all — there is no
// existing AVT or Control Center path to POST /v1/videos/edits.
//
// It deliberately does NOT touch, fix or route around:
//   - the verified reference-to-video defect in CC video-providers-grok-generate
//     (sends one reference image, never `reference_images`) — PRESERVED as-is,
//   - any locked wardrobe-swap lane,
//   - Benchmark v2.0 assets.
//
// WARNING: modes other than `probe`/`dryRun` make REAL, BILLED xAI video calls.
// Guardrails: exactly ONE xAI submit per request (no loops), a hard per-request
// cost ceiling (`maxCostUsd`, default $0.50), and a duration clamp. Sequential
// execution and the overall $6.00 experiment ceiling are the caller's discipline.
//
// Auth: verify_jwt = false; caller presents the anon/publishable key or the
// service-role key as bearer. Same posture as grok-resolution-test.
//
// Required secrets (AVT project qoyxgnkvjukovkrvdaiq):
//   XAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//
// DELETE THIS FUNCTION once the re-benchmark verdict is recorded.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";
import { pickGrokGarmentReferencePaths } from "../_shared/garmentReference.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const XAI_BASE_URL = "https://api.x.ai/v1";
const SIGN_TTL = 3600;
const OUTPUT_SIGN_TTL = 604800; // 7 days

/** xAI docs snapshot 2026-08-12 — output priced per second of generated video. */
const PRICE_USD_PER_SECOND: Record<string, number> = {
  "grok-imagine-video": 0.05,
  "grok-imagine-video-1.5": 0.08,
};

/** Per-request ceiling. The experiment-wide ceiling ($6.00) is enforced by the operator. */
const DEFAULT_MAX_COST_USD = 0.5;

/** xAI caps generation at 15s; video edit inherits input duration (capped 8.7s upstream). */
const MAX_DURATION_SECONDS = 15;

const POLL_INTERVAL_MS = 4000;
const DEFAULT_POLL_TIMEOUT_MS = 600_000; // xAI's own documented default

/** Buckets a benchmark input may live in, most likely first. */
const VIDEO_BUCKETS = ["project-clips", "project-exports", "project-references"];
const IMAGE_BUCKETS = [
  "project-references",
  "look-composites",
  "project-exports",
  "project-clips",
  "wardrobe-refs",
  "product-assets",
];

const RESEARCH_PREFIX = "research/grok-recap-2026-08";

type Mode = "probe" | "edit_video" | "reference_to_video" | "image_to_video";

type StorageRef = {
  /** Storage object path. */
  path: string;
  /** Optional bucket hint; otherwise the default list is tried in order. */
  bucket?: string;
};

type Body = {
  mode?: Mode;
  label?: string;

  model?: string;
  prompt?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;

  /** Source video for edit_video — storage ref, project_assets id, or literal URL. */
  video?: StorageRef;
  videoAssetId?: string;
  videoUrl?: string;

  /** First frame for image_to_video. */
  image?: StorageRef;
  imageUrl?: string;

  /** Up to 3 reference images for reference_to_video (xAI documented cap). */
  references?: StorageRef[];
  referenceUrls?: string[];
  /**
   * Convenience: append garment references straight from a character_features
   * row (e.g. the Saint Laurent track jacket) so a caller never has to know the
   * storage paths. Appended AFTER `references`, capped at 3 total.
   */
  wardrobeFeatureId?: string;
  maxWardrobeReferences?: number;

  /**
   * probe mode only — POST this body verbatim to `probePath` and report the raw
   * response. Used for the $0 schema probes (a rejected request is not billed).
   * Signed URLs can be interpolated with the tokens {{VIDEO_URL}}, {{IMAGE_URL}},
   * {{REFERENCE_URLS}} so a probe never has to hardcode a credential.
   */
  probePath?: string;
  probeBody?: Record<string, unknown>;

  /** Resolve + sign every input and return the exact xAI body without calling. $0. */
  dryRun?: boolean;
  /** Submit but do not poll/download (returns request_id). Still BILLED. */
  submitOnly?: boolean;
  /** Per-request USD ceiling. Request is refused if the estimate exceeds it. */
  maxCostUsd?: number;
  pollTimeoutMs?: number;
  /** Skip persisting the output video to storage. Default false (we persist). */
  saveResult?: boolean;
};

/** Derive the client type from the exact construction below so the generics match. */
const makeAdmin = (url: string, key: string) =>
  createClient(url, key, { auth: { persistSession: false } });
type Admin = ReturnType<typeof makeAdmin>;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function signStorage(
  admin: Admin,
  ref: StorageRef,
  defaultBuckets: string[],
): Promise<{ url: string; bucket: string; path: string } | null> {
  const buckets = ref.bucket ? [ref.bucket, ...defaultBuckets] : defaultBuckets;
  for (const bucket of buckets) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(ref.path, SIGN_TTL);
    if (!error && data?.signedUrl) return { url: data.signedUrl, bucket, path: ref.path };
  }
  return null;
}

/**
 * Storage bucket a project_assets row lives in — kept in lockstep with
 * make-scrub-proxy-proxy's resolver and the client `bucketForAssetType`
 * (src/lib/queries/projectAssets.ts). `project_assets` has NO bucket column.
 */
function bucketForAssetType(assetType: string): string {
  switch (assetType) {
    case "reference_image":
    case "reference_video":
    case "lyrics_doc":
      return "project-references";
    case "ae_asset":
    case "premiere_export":
      return "project-exports";
    default:
      return "project-clips";
  }
}

/**
 * Resolve a project_assets row to a signed URL. The row stores only `file_url`,
 * which is a storage object path (occasionally already an absolute https URL).
 */
async function signAsset(
  admin: Admin,
  assetId: string,
): Promise<{ url: string; bucket: string; path: string } | null> {
  const { data, error } = await admin
    .from("project_assets")
    .select("id, file_url, asset_type")
    .eq("id", assetId)
    .maybeSingle();
  if (error || !data) return null;
  const path = data.file_url as string | null;
  if (!path) return null;
  if (path.startsWith("https://")) {
    return { url: path, bucket: "(absolute-url)", path };
  }
  const bucket = bucketForAssetType(String(data.asset_type ?? ""));
  return signStorage(admin, { path, bucket }, VIDEO_BUCKETS);
}

function estimateCostUsd(model: string, durationSeconds: number): number {
  const rate = PRICE_USD_PER_SECOND[model];
  // Unknown model → price at the most expensive known rate so the guard fails safe.
  const effective = rate ?? Math.max(...Object.values(PRICE_USD_PER_SECOND));
  return Number((effective * durationSeconds).toFixed(4));
}

/** Substitute signed-URL tokens into a caller-supplied probe body. */
function interpolate(
  value: unknown,
  vars: { videoUrl?: string; imageUrl?: string; referenceUrls?: string[] },
): unknown {
  if (typeof value === "string") {
    if (value === "{{REFERENCE_URLS}}") return vars.referenceUrls ?? [];
    return value
      .replace("{{VIDEO_URL}}", vars.videoUrl ?? "")
      .replace("{{IMAGE_URL}}", vars.imageUrl ?? "");
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, vars));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolate(v, vars);
    }
    return out;
  }
  return value;
}

/** Strip signed-URL query strings so nothing credential-bearing lands in a report. */
function redactUrls(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("http") ? value.split("?")[0] + (value.includes("?") ? "?<signed>" : "") : value;
  }
  if (Array.isArray(value)) return value.map(redactUrls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactUrls(v);
    return out;
  }
  return value;
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 4000) };
  }
}

function extractRequestId(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null;
  if (!p) return null;
  for (const key of ["request_id", "id", "requestId"]) {
    const v = p[key];
    if (typeof v === "string" && v) return v;
  }
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const xaiKey = resolveXaiApiKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_misconfigured" });

  const bearer = (req.headers.get("authorization") ?? "").replace(/^[Bb]earer\s+/, "").trim();
  if (!bearer || (bearer !== serviceRoleKey && bearer !== anonKey)) {
    return json(401, { error: "anon_or_service_role_key_required" });
  }

  if (!xaiKey) {
    return json(500, { error: "xai_api_key_missing", detail: xaiKeyMissingMessage() });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const admin = makeAdmin(supabaseUrl, serviceRoleKey);

  const mode: Mode = body.mode ?? "probe";
  const model = body.model ?? "grok-imagine-video";
  const label = body.label ?? mode;
  const maxCostUsd = typeof body.maxCostUsd === "number" ? body.maxCostUsd : DEFAULT_MAX_COST_USD;

  // ---- resolve + sign inputs (free) ----------------------------------------
  const resolved: Record<string, unknown> = {};
  let videoUrl: string | null = body.videoUrl ?? null;
  let imageUrl: string | null = body.imageUrl ?? null;
  const referenceUrls: string[] = [...(body.referenceUrls ?? [])];

  if (!videoUrl && body.videoAssetId) {
    const signed = await signAsset(admin, body.videoAssetId);
    if (!signed) return json(404, { error: "video_asset_not_resolvable", videoAssetId: body.videoAssetId });
    videoUrl = signed.url;
    resolved.video = { via: "project_assets", assetId: body.videoAssetId, bucket: signed.bucket, path: signed.path };
  } else if (!videoUrl && body.video) {
    const signed = await signStorage(admin, body.video, VIDEO_BUCKETS);
    if (!signed) return json(404, { error: "video_path_not_found", path: body.video.path });
    videoUrl = signed.url;
    resolved.video = { via: "storage", bucket: signed.bucket, path: signed.path };
  }

  if (!imageUrl && body.image) {
    const signed = await signStorage(admin, body.image, IMAGE_BUCKETS);
    if (!signed) return json(404, { error: "image_path_not_found", path: body.image.path });
    imageUrl = signed.url;
    resolved.image = { via: "storage", bucket: signed.bucket, path: signed.path };
  }

  if (body.references?.length) {
    // xAI documents a hard cap of 3 reference images.
    for (const ref of body.references.slice(0, 3)) {
      const signed = await signStorage(admin, ref, IMAGE_BUCKETS);
      if (!signed) return json(404, { error: "reference_path_not_found", path: ref.path });
      referenceUrls.push(signed.url);
    }
    resolved.references = body.references.slice(0, 3);
  }

  if (body.wardrobeFeatureId && referenceUrls.length < 3) {
    const { data: wardrobe, error: wErr } = await admin
      .from("character_features")
      .select("id, label, file_url, storage_path, reference_images")
      .eq("id", body.wardrobeFeatureId)
      .maybeSingle();
    if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
    if (!wardrobe) return json(404, { error: "wardrobe_not_found", wardrobeFeatureId: body.wardrobeFeatureId });

    const refImages = Array.isArray(wardrobe.reference_images) ? wardrobe.reference_images : [];
    const want = Math.min(body.maxWardrobeReferences ?? 2, 3 - referenceUrls.length);
    const garmentPaths = pickGrokGarmentReferencePaths(
      refImages as Parameters<typeof pickGrokGarmentReferencePaths>[0],
      (wardrobe.storage_path as string | null) ?? (wardrobe.file_url as string | null),
      want,
    );
    const usedPaths: string[] = [];
    for (const p of garmentPaths) {
      const signed = await signStorage(admin, { path: p }, IMAGE_BUCKETS);
      if (signed) {
        referenceUrls.push(signed.url);
        usedPaths.push(p);
      }
    }
    if (usedPaths.length === 0) return json(404, { error: "wardrobe_no_signable_image" });
    resolved.wardrobe = {
      wardrobeFeatureId: body.wardrobeFeatureId,
      label: wardrobe.label,
      garmentPathsUsed: usedPaths,
    };
  }

  // ---- build the exact xAI request -----------------------------------------
  let endpoint: string;
  let xaiBody: Record<string, unknown>;
  let billable = true;
  let durationForCost = 0;

  if (mode === "probe") {
    if (!body.probePath || !body.probeBody) {
      return json(400, { error: "probe_requires_probePath_and_probeBody" });
    }
    endpoint = `${XAI_BASE_URL}/${body.probePath.replace(/^\//, "")}`;
    xaiBody = interpolate(body.probeBody, {
      videoUrl: videoUrl ?? undefined,
      imageUrl: imageUrl ?? undefined,
      referenceUrls,
    }) as Record<string, unknown>;
    // A probe is only billed if xAI ACCEPTS it. We report acceptance loudly.
    billable = false;
    durationForCost = Number(xaiBody.duration ?? 0) || 0;
  } else if (mode === "edit_video") {
    if (!videoUrl) return json(400, { error: "edit_video_requires_video" });
    endpoint = `${XAI_BASE_URL}/videos/edits`;
    xaiBody = { model, prompt: body.prompt ?? "", video_url: videoUrl };
    if (body.resolution) xaiBody.resolution = body.resolution;
    // Edits inherit input duration; xAI truncates at 8.7s. Price the worst case.
    durationForCost = Math.min(body.duration ?? 8.7, 8.7);
  } else if (mode === "reference_to_video") {
    if (referenceUrls.length === 0) return json(400, { error: "reference_to_video_requires_references" });
    endpoint = `${XAI_BASE_URL}/videos/generations`;
    durationForCost = Math.min(body.duration ?? 5, MAX_DURATION_SECONDS);
    xaiBody = {
      model,
      prompt: body.prompt ?? "",
      duration: durationForCost,
      aspect_ratio: body.aspectRatio ?? "9:16",
      resolution: body.resolution ?? "720p",
      reference_images: referenceUrls.slice(0, 3),
    };
  } else if (mode === "image_to_video") {
    if (!imageUrl) return json(400, { error: "image_to_video_requires_image" });
    endpoint = `${XAI_BASE_URL}/videos/generations`;
    durationForCost = Math.min(body.duration ?? 5, MAX_DURATION_SECONDS);
    xaiBody = {
      model,
      prompt: body.prompt ?? "",
      image: imageUrl,
      duration: durationForCost,
      aspect_ratio: body.aspectRatio ?? "9:16",
      resolution: body.resolution ?? "720p",
    };
  } else {
    return json(400, { error: "unknown_mode", mode });
  }

  const estimatedCostUsd = estimateCostUsd(model, durationForCost);

  const plan = {
    experiment: "grok-recap-2026-08",
    experimentVersion: "1.0.0",
    label,
    mode,
    model,
    endpoint,
    estimatedCostUsd,
    maxCostUsd,
    resolvedInputs: resolved,
    xaiRequestBody: redactUrls(xaiBody),
  };

  if (body.dryRun) {
    return json(200, { dryRun: true, billed: false, ...plan });
  }

  if (billable && estimatedCostUsd > maxCostUsd) {
    return json(400, {
      error: "cost_ceiling_exceeded",
      detail: `Estimated $${estimatedCostUsd} exceeds maxCostUsd $${maxCostUsd}.`,
      ...plan,
    });
  }

  // ---- submit (ONE call, no loop) ------------------------------------------
  const submittedAt = Date.now();
  let submitRes: Response;
  try {
    submitRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
      body: JSON.stringify(xaiBody),
    });
  } catch (err) {
    return json(502, {
      ...plan,
      billed: false,
      error: "xai_request_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const submitPayload = await readJsonSafe(submitRes);
  const requestId = extractRequestId(submitPayload);
  const accepted = submitRes.ok && !!requestId;

  const submitReport = {
    ...plan,
    submit: {
      httpStatus: submitRes.status,
      accepted,
      requestId,
      payload: redactUrls(submitPayload),
      elapsedMs: Date.now() - submittedAt,
    },
    // For a probe: rejection is the $0 answer; acceptance means we were charged.
    billed: accepted,
    billedNote: accepted
      ? `ACCEPTED — this call is billed. Count $${estimatedCostUsd} against the experiment ceiling.`
      : "REJECTED by xAI before generation — not billed.",
  };

  if (!accepted) return json(200, submitReport);
  if (body.submitOnly) return json(200, { ...submitReport, polled: false });

  // ---- poll ----------------------------------------------------------------
  const pollTimeoutMs = Math.min(body.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS, DEFAULT_POLL_TIMEOUT_MS);
  const pollStart = Date.now();
  let finalPayload: unknown = null;
  let finalStatus = "unknown";
  let pollCount = 0;

  while (Date.now() - pollStart < pollTimeoutMs) {
    pollCount += 1;
    let pollRes: Response;
    try {
      pollRes = await fetch(`${XAI_BASE_URL}/videos/${requestId}`, {
        headers: { Authorization: `Bearer ${xaiKey}` },
      });
    } catch {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    finalPayload = await readJsonSafe(pollRes);
    finalStatus = String((finalPayload as Record<string, unknown>)?.status ?? "unknown");
    if (finalStatus === "done" || finalStatus === "failed" || finalStatus === "expired") break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const outputUrl = finalStatus === "done" ? extractVideoUrl(finalPayload) : null;

  // ---- persist the output so the evidence outlives the xAI CDN TTL ---------
  let storedPath: string | null = null;
  let storedUrl: string | null = null;
  let byteLength: number | null = null;

  if (outputUrl && body.saveResult !== false) {
    try {
      const dl = await fetch(outputUrl);
      if (dl.ok) {
        const bytes = new Uint8Array(await dl.arrayBuffer());
        byteLength = bytes.length;
        const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        const path = `${RESEARCH_PREFIX}/${safeLabel}-${requestId}.mp4`;
        const { error: upErr } = await admin.storage
          .from("project-exports")
          .upload(path, bytes, { contentType: "video/mp4", upsert: true });
        if (!upErr) {
          storedPath = path;
          const { data: signed } = await admin.storage
            .from("project-exports")
            .createSignedUrl(path, OUTPUT_SIGN_TTL);
          storedUrl = signed?.signedUrl ?? null;
        }
      }
    } catch {
      /* non-fatal — the xAI URL is still reported */
    }
  }

  return json(200, {
    ...submitReport,
    polled: true,
    pollCount,
    finalStatus,
    finalPayload: redactUrls(finalPayload),
    output: {
      xaiUrl: outputUrl ? outputUrl.split("?")[0] + "?<signed>" : null,
      storedBucket: storedPath ? "project-exports" : null,
      storedPath,
      storedSignedUrl: storedUrl,
      byteLength,
    },
    totalElapsedMs: Date.now() - submittedAt,
  });
});
