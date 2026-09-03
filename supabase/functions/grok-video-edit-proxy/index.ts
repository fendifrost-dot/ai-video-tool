// AVT edge function — grok-video-edit-proxy (Architecture C product lane)
//
// User-JWT-only Grok /v1/videos/edits with source video + garment reference_images.
// Inserts a reviewable project_assets edited_clip row. Does NOT composite onto master
// (that is a follow-on SAM-3 / deterministic-brand step in the product workflow).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickGrokVideoEditReferencePaths } from "../_shared/garmentReference.ts";
import {
  buildGrokVideoEditAssetInsert,
  buildGrokVideoEditXaiBody,
} from "../_shared/grokVideoEditRequest.ts";
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
const DEFAULT_MAX_COST_USD = 0.5;
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 600_000;
const PRICE_USD_PER_SECOND: Record<string, number> = {
  "grok-imagine-video": 0.05,
  "grok-imagine-video-1.5": 0.08,
};

const VIDEO_BUCKETS = ["project-clips", "project-exports", "project-references"];
const IMAGE_BUCKETS = [
  "project-references",
  "look-composites",
  "project-exports",
  "project-clips",
  "wardrobe-refs",
  "product-assets",
];

type Body = {
  projectId: string;
  artistId: string;
  videoAssetId: string;
  wardrobeFeatureId: string;
  prompt?: string;
  model?: string;
  maxCostUsd?: number;
  shotId?: string;
  dryRun?: boolean;
  promptVersion?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const makeAdmin = (url: string, key: string) =>
  createClient(url, key, { auth: { persistSession: false } });
type Admin = ReturnType<typeof makeAdmin>;

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

async function signStorage(
  admin: Admin,
  path: string,
  buckets: string[],
): Promise<string | null> {
  for (const bucket of buckets) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGN_TTL);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

function estimateCostUsd(model: string, durationSeconds: number): number {
  const rate = PRICE_USD_PER_SECOND[model] ?? 0.08;
  return Number((rate * durationSeconds).toFixed(4));
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
  return null;
}

function costFromTicks(payload: unknown): number | null {
  const usage = (payload as Record<string, unknown> | null)?.usage as
    | Record<string, unknown>
    | undefined;
  const ticks = usage?.cost_in_usd_ticks;
  if (typeof ticks === "number") return ticks / 10_000_000_000;
  if (typeof ticks === "string") return Number(ticks) / 10_000_000_000;
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
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!body.projectId || !body.artistId || !body.videoAssetId || !body.wardrobeFeatureId) {
    return json(400, { error: "missing_required_fields" });
  }

  const admin = makeAdmin(supabaseUrl, serviceRoleKey);
  const model = body.model ?? DEFAULT_MODEL;
  const prompt = body.prompt?.trim() ?? "";
  const maxCostUsd = body.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  if (!prompt && !body.dryRun) {
    return json(400, {
      error: "prompt_required",
      detail:
        "Grok video edit prompt is not configured. Await Fendi confirmation of the frozen benchmark prompt before billed runs.",
    });
  }
  const effectivePrompt = prompt || "(dry-run — prompt not configured)";

  const { data: project, error: pErr } = await admin
    .from("video_projects")
    .select("id, artist_id, user_id")
    .eq("id", body.projectId)
    .maybeSingle();
  if (pErr) return json(500, { error: "project_query_failed", detail: pErr.message });
  if (!project || project.user_id !== userId || project.artist_id !== body.artistId) {
    return json(403, { error: "project_forbidden" });
  }

  const { data: videoAsset, error: vErr } = await admin
    .from("project_assets")
    .select("id, user_id, project_id, file_url, asset_type")
    .eq("id", body.videoAssetId)
    .maybeSingle();
  if (vErr) return json(500, { error: "video_asset_query_failed", detail: vErr.message });
  if (!videoAsset || videoAsset.user_id !== userId || videoAsset.project_id !== body.projectId) {
    return json(403, { error: "not_owner" });
  }
  if (!videoAsset.file_url) return json(404, { error: "video_asset_not_resolvable" });

  const videoPath = videoAsset.file_url as string;
  const videoUrl = videoPath.startsWith("https://")
    ? videoPath
    : await signStorage(
        admin,
        videoPath,
        [bucketForAssetType(String(videoAsset.asset_type ?? "")), ...VIDEO_BUCKETS],
      );
  if (!videoUrl) return json(404, { error: "video_asset_not_resolvable" });

  const { data: wardrobe, error: wErr } = await admin
    .from("character_features")
    .select("id, artist_id, label, file_url, storage_path, reference_images")
    .eq("id", body.wardrobeFeatureId)
    .maybeSingle();
  if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
  if (!wardrobe || wardrobe.artist_id !== body.artistId) {
    return json(404, { error: "wardrobe_not_found" });
  }

  const refImages = Array.isArray(wardrobe.reference_images) ? wardrobe.reference_images : [];
  const fallback = wardrobe.storage_path ?? wardrobe.file_url;
  const garmentPaths = pickGrokVideoEditReferencePaths(refImages, fallback, 1);
  const referenceUrls: string[] = [];
  for (const p of garmentPaths) {
    const signed = await signStorage(admin, p, IMAGE_BUCKETS);
    if (signed) referenceUrls.push(signed);
  }
  if (referenceUrls.length === 0) return json(404, { error: "wardrobe_no_signable_image" });

  const xaiBody = buildGrokVideoEditXaiBody({
    model,
    prompt: effectivePrompt,
    videoUrl,
    referenceUrls,
  });

  const promptVersion = body.promptVersion?.trim() || "unspecified";
  const plan = {
    lane: "architecture_c_grok_video_edit",
    model,
    endpoint: `${XAI_BASE_URL}/videos/edits`,
    videoAssetId: body.videoAssetId,
    wardrobeFeatureId: body.wardrobeFeatureId,
    garmentPathsUsed: garmentPaths,
    garmentFilenames: garmentPaths.map((p) => p.split("/").pop() ?? p),
    estimatedCostUsd: estimateCostUsd(model, 4.5),
    maxCostUsd,
    promptVersion,
  };

  if (body.dryRun) return json(200, { dryRun: true, billed: false, ...plan });

  if (plan.estimatedCostUsd > maxCostUsd) {
    return json(400, {
      error: "cost_ceiling_exceeded",
      detail: `Estimated $${plan.estimatedCostUsd} exceeds maxCostUsd $${maxCostUsd}`,
      ...plan,
    });
  }

  const submitRes = await fetch(`${XAI_BASE_URL}/videos/edits`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
    body: JSON.stringify(xaiBody),
  });
  const submitPayload = await readJsonSafe(submitRes);
  const requestId = extractRequestId(submitPayload);
  const accepted = submitRes.ok && !!requestId;
  if (!accepted) {
    return json(200, {
      ...plan,
      billed: false,
      submit: { httpStatus: submitRes.status, accepted: false, payload: submitPayload },
    });
  }

  const pollStart = Date.now();
  let finalPayload: unknown = null;
  let finalStatus = "unknown";
  while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
    const pollRes = await fetch(`${XAI_BASE_URL}/videos/${requestId}`, {
      headers: { Authorization: `Bearer ${xaiKey}` },
    });
    finalPayload = await readJsonSafe(pollRes);
    finalStatus = String((finalPayload as Record<string, unknown>)?.status ?? "unknown");
    if (finalStatus === "done" || finalStatus === "failed" || finalStatus === "expired") break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const outputUrl = finalStatus === "done" ? extractVideoUrl(finalPayload) : null;
  const actualCostUsd = costFromTicks(finalPayload);

  let storedPath: string | null = null;
  let assetId: string | null = null;
  let byteLength: number | null = null;
  let persistError: string | null = null;

  if (outputUrl) {
    const dl = await fetch(outputUrl);
    if (dl.ok) {
      const bytes = new Uint8Array(await dl.arrayBuffer());
      byteLength = bytes.length;
      storedPath = `${userId}/${body.projectId}/grok-video-edit/${requestId}.mp4`;
      const { error: upErr } = await admin.storage
        .from("project-clips")
        .upload(storedPath, bytes, { contentType: "video/mp4", upsert: true });
      if (upErr) {
        persistError = `storage_upload: ${upErr.message}`;
      } else {
        const insertRow = buildGrokVideoEditAssetInsert({
          userId,
          projectId: body.projectId,
          videoAssetId: body.videoAssetId,
          wardrobeFeatureId: body.wardrobeFeatureId,
          storedPath,
          shotId: body.shotId,
          requestId,
          model,
          actualCostUsd,
          finalStatus,
          byteLength,
          promptVersion,
        });
        const { data: assetRow, error: assetErr } = await admin
          .from("project_assets")
          .insert(insertRow)
          .select("id")
          .single();
        if (!assetErr && assetRow) assetId = assetRow.id as string;
        else persistError = `project_assets_insert: ${assetErr?.message ?? "no_row"}`;
      }
    }
  }

  let previewUrl: string | null = null;
  if (storedPath) {
    const { data: signed } = await admin.storage
      .from("project-clips")
      .createSignedUrl(storedPath, OUTPUT_SIGN_TTL);
    previewUrl = signed?.signedUrl ?? null;
  }

  return json(200, {
    ...plan,
    billed: true,
    submit: { httpStatus: submitRes.status, accepted: true, requestId },
    finalStatus,
    actualCostUsd,
    assetId,
    persistError,
    output: {
      storedBucket: storedPath ? "project-clips" : null,
      storedPath,
      previewUrl,
      byteLength,
    },
  });
});
