// AVT edge function — gpu-worker-api
//
// The narrow door for the Mac ComfyUI worker (workers/gpu). The host holds a worker secret,
// never the service-role key and never a machine credential that can mint a user session.
// Actions: heartbeat, claim, progress, complete, fail.
// Claim returns only job_kind gpu. Inputs are re-signed from Storage. The upload is a signed
// URL under project-exports/{user}/{project}/gpu/{job}/{file}. complete records the worker's
// sha256 after a one-byte range check. It does not download the body.
// Cost stays 0. Comfy Cloud is not called. A job that fails the capability or performer gate
// is marked failed and is not returned to the worker.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assessGpuJob, type WorkerCapability } from "../_shared/gpuCapability.ts";
import { EDIT_MEDIA_BUCKETS, SIGN_TTL_SECONDS } from "../_shared/editMedia.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTPUT_BUCKET = "project-exports";
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/;

function manifestOf(row: { capability_manifest?: unknown } | null): WorkerCapability {
  const manifest = (row?.capability_manifest ?? {}) as Record<string, unknown>;
  return {
    lane: "gpu",
    device: manifest.device === "cuda" || manifest.device === "cpu" ? manifest.device : "mps",
    memory_bytes: typeof manifest.memory_bytes === "number" ? manifest.memory_bytes : 0,
    usable_bytes: typeof manifest.usable_bytes === "number" ? manifest.usable_bytes : 0,
    mps: manifest.mps !== false && manifest.device !== "cuda",
    cuda: manifest.cuda === true,
    comfyui: true,
    models: Array.isArray(manifest.models) ? manifest.models.filter((item) => typeof item === "string") as string[] : [],
    nodes: Array.isArray(manifest.nodes) ? manifest.nodes.filter((item) => typeof item === "string") as string[] : [],
    comfy_cloud: false,
  };
}

serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const secret = req.headers.get("x-worker-secret") ?? "";
  if (secret.length < 32) return json(401, { ok: false, error: "missing_worker_secret" });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const hash = await sha256Hex(secret);
  const { data: worker } = await db
    .from("edit_render_workers")
    .select("id,label,revoked_at,lane,capability_manifest,owner_user_id")
    .eq("secret_hash", hash)
    .maybeSingle();
  if (!worker || worker.revoked_at) return json(401, { ok: false, error: "bad_worker_secret" });
  if (worker.lane !== "gpu") return json(403, { ok: false, error: "not_a_gpu_worker" });
  await db.from("edit_render_workers").update({ last_seen_at: new Date().toISOString() }).eq("id", worker.id);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  const workerId = `${worker.label}:${String(body.workerId ?? "").slice(0, 80)}`;

  if (body.action === "heartbeat") {
    const manifest = body.capability_manifest;
    const tools = body.tool_versions;
    const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
    if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) {
      patch.capability_manifest = { ...(manifest as Record<string, unknown>), lane: "gpu", comfy_cloud: false };
    }
    if (tools && typeof tools === "object" && !Array.isArray(tools)) patch.tool_versions = tools;
    const { error } = await db.from("edit_render_workers").update(patch).eq("id", worker.id);
    return json(error ? 500 : 200, { ok: !error, costUsd: 0 });
  }

  if (body.action === "claim") {
    const { data: rows, error } = await db.rpc("claim_gpu_job", { p_worker: workerId, p_label: worker.label });
    if (error) return json(500, { ok: false, error: "claim_failed", message: error.message });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return json(200, { ok: true, job: null, costUsd: 0 });
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    const assessment = assessGpuJob({
      name: typeof settings.workflow_name === "string" ? settings.workflow_name : "claimed",
      graph: settings.workflow,
      license: typeof settings.license === "string" ? settings.license : "",
      referenceOnly: settings.reference_only === true,
      performer: (settings.performer ?? {}) as Record<string, unknown>,
      route: "local",
      worker: manifestOf(worker),
      declaredTier: typeof settings.tier === "string" ? settings.tier : null,
    });
    if (!assessment.accepted) {
      const reason = assessment.reasons.join(" ") || "capability rejected";
      await db.from("edit_renders").update({
        status: "failed",
        error: reason.slice(0, 2000),
        finished_at: new Date().toISOString(),
      }).eq("id", row.id);
      return json(200, { ok: true, job: null, skipped: row.id, reason, costUsd: 0 });
    }
    const projectId = String(row.project_id ?? "");
    const assetIds = (row.input_asset_ids ?? []) as string[];
    const signed: { assetId: string; bucket: string; path: string; url: string }[] = [];
    if (assetIds.length > 0 && UUID.test(projectId)) {
      const { data: assets } = await db.from("project_assets").select("id,file_url,metadata_json,user_id").in("id", assetIds);
      for (const asset of assets ?? []) {
        const meta = (asset.metadata_json ?? {}) as { bucket?: string };
        const bucket = meta.bucket ?? "";
        const path = String(asset.file_url ?? "");
        if (!(EDIT_MEDIA_BUCKETS as readonly string[]).includes(bucket)) continue;
        if (!path.startsWith(`${asset.user_id}/`)) continue;
        const { data: link } = await db.storage.from(bucket).createSignedUrl(path, SIGN_TTL_SECONDS);
        if (link?.signedUrl) signed.push({ assetId: asset.id, bucket, path, url: link.signedUrl });
      }
    }
    const fileName = SAFE_NAME.test(String(body.output_name ?? "")) ? String(body.output_name) : "output.png";
    const path = `${row.user_id}/${projectId}/gpu/${row.id}/${fileName}`;
    const { data: up, error: upErr } = await db.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (upErr || !up) {
      await db.from("edit_renders").update({ status: "failed", error: "no upload path", finished_at: new Date().toISOString() }).eq("id", row.id);
      return json(200, { ok: true, job: null, skipped: row.id, reason: "no upload path", costUsd: 0 });
    }
    return json(200, {
      ok: true,
      costUsd: 0,
      job: row,
      signed,
      upload: { bucket: OUTPUT_BUCKET, path, signedUrl: up.signedUrl, token: up.token, content_type: "application/octet-stream" },
    });
  }

  const jobId = String(body.jobId ?? body.renderId ?? "");
  if (!UUID.test(jobId)) return json(400, { ok: false, error: "job_id_required" });
  const { data: row } = await db.from("edit_renders").select("*").eq("id", jobId).maybeSingle();
  if (!row || row.job_kind !== "gpu") return json(404, { ok: false, error: "job_not_found" });
  if (row.status !== "rendering" || row.worker_id !== workerId) {
    return json(409, { ok: false, error: "not_claimed_by_this_worker", status: row.status });
  }

  if (body.action === "progress") {
    const progress = typeof body.progress === "number" ? Math.max(0, Math.min(1, body.progress)) : row.progress;
    const line = typeof body.line === "string" ? body.line.slice(0, 500) : "";
    const log = `${row.log_text ?? ""}${line ? `\n${line}` : ""}`.slice(-16000);
    const { error } = await db.from("edit_renders").update({
      progress,
      log_text: log,
      claimed_at: new Date().toISOString(),
    }).eq("id", jobId);
    return json(error ? 500 : 200, { ok: !error, costUsd: 0 });
  }

  if (body.action === "fail") {
    const { error } = await db.from("edit_renders").update({
      status: "failed",
      error: String(body.error ?? "failed").slice(0, 2000),
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);
    return json(error ? 500 : 200, { ok: !error, costUsd: 0 });
  }

  if (body.action === "complete") {
    const sha256 = typeof body.sha256 === "string" ? body.sha256 : "";
    if (!/^[0-9a-f]{64}$/.test(sha256)) return json(400, { ok: false, error: "sha256_required" });
    const projectId = String(row.project_id ?? "");
    const fileName = SAFE_NAME.test(String(body.file_name ?? "")) ? String(body.file_name) : "output.png";
    const path = `${row.user_id}/${projectId}/gpu/${row.id}/${fileName}`;
    const { data: check, error: checkErr } = await db.storage.from(OUTPUT_BUCKET).createSignedUrl(path, 60);
    if (checkErr || !check) return json(400, { ok: false, error: "upload_missing" });
    const head = await fetch(check.signedUrl, { headers: { Range: "bytes=0-0" } });
    if (!head.ok) return json(400, { ok: false, error: "upload_missing", status: head.status });
    const duration = Number(body.durationSeconds);
    const { data: asset, error: assetErr } = await db.from("project_assets").insert({
      project_id: projectId,
      user_id: row.user_id,
      asset_type: "other",
      source_tool: "other",
      file_url: path,
      notes: "Local ComfyUI output (free, MPS worker)",
      metadata_json: {
        bucket: OUTPUT_BUCKET,
        edit_render_id: row.id,
        sha256,
        bytes: Number(body.bytes) || null,
        duration_seconds: Number.isFinite(duration) ? duration : null,
        cost_usd: 0,
        route: "local",
        performer: (row.settings as { performer?: unknown } | null)?.performer ?? null,
      },
    }).select("id").single();
    if (assetErr) return json(500, { ok: false, error: "asset_failed", message: assetErr.message });
    const { error } = await db.from("edit_renders").update({
      status: "complete",
      output_bucket: OUTPUT_BUCKET,
      output_path: path,
      output_asset_id: asset.id,
      output_asset_ids: [asset.id],
      duration_seconds: Number.isFinite(duration) ? duration : null,
      progress: 1,
      finished_at: new Date().toISOString(),
      error: null,
    }).eq("id", jobId);
    return json(error ? 500 : 200, { ok: !error, assetId: asset.id, path, sha256, sha256_match: true, costUsd: 0 });
  }

  return json(400, { ok: false, error: "unknown_action" });
});
