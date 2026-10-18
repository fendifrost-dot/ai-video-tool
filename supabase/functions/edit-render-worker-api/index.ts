// AVT edge function — edit-render-worker-api
//
// The narrow door for the durable edit-render worker (workers/edit-render). The worker host holds only a
// worker secret, never the service-role key. Actions:
//   claim    → claims the oldest queued edit_renders row (SKIP LOCKED, reaps stale rows first), re-signs every
//              plan input from its bucket/path (the URLs stored in the plan may have expired), and hands back a
//              signed upload URL for project-exports/{user_id}/{project_id}/renders/{render_id}.mp4
//   complete → checks the uploaded MP4 exists, files it as a project asset, marks the row complete
//   fail     → marks the row failed with a reason
// No provider is ever called; cost stays 0. Auth: x-worker-secret (SHA-256 matched against edit_render_workers).
import { serve } from "[REDACTED]deno.land/std@0.224.0/http/server.ts";
import { createClient } from "[REDACTED]esm.sh/@supabase/supabase-js@2.45.0";
import {
  EDIT_MEDIA_BUCKETS,
  SIGN_TTL_SECONDS,
  alignSigned,
  signAssets,
} from "../_shared/editMedia.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTPUT_BUCKET = "project-exports";

type Item = { assetId: string; bucket: string; path: string };

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
    .select("id,label,revoked_at")
    .eq("secret_hash", hash)
    .maybeSingle();
  if (!worker || worker.revoked_at) return json(401, { ok: false, error: "bad_worker_secret" });
  await db
    .from("edit_render_workers")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", worker.id);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  const workerId = `${worker.label}:${String(body.workerId ?? "").slice(0, 80)}`;

  if (body.action === "claim") {
    const { data: rows, error } = await db.rpc("claim_edit_render", { p_worker: workerId });
    if (error) return json(500, { ok: false, error: "claim_failed", message: error.message });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return json(200, { ok: true, render: null });
    const plan = (row.plan ?? {}) as {
      inputs?: { items?: Item[] };
      sequence?: { projectId?: string };
    };
    const projectId = plan.sequence?.projectId ?? "";
    const items = (plan.inputs?.items ?? []).filter(
      (i) =>
        (EDIT_MEDIA_BUCKETS as readonly string[]).includes(i.bucket) &&
        typeof i.path === "string" &&
        i.path.split("/")[1] === projectId,
    );
    const signed = await signAssets(items, async (bucket, paths) => {
      const { data } = await db.storage.from(bucket).createSignedUrls(paths, SIGN_TTL_SECONDS);
      return alignSigned(paths, data ?? null);
    });
    let upload: { path: string; signedUrl: string; token: string } | null = null;
    if (UUID.test(projectId)) {
      const path = `${row.user_id}/${projectId}/renders/${row.id}.mp4`;
      const { data: up, error: upErr } = await db.storage
        .from(OUTPUT_BUCKET)
        .createSignedUploadUrl(path, { upsert: true });
      if (!upErr && up) upload = { path, signedUrl: up.signedUrl, token: up.token };
    }
    if (!upload) {
      await db
        .from("edit_renders")
        .update({
          status: "failed",
          error: "no upload path (plan has no project)",
          finished_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      return json(200, { ok: true, render: null, skipped: row.id });
    }
    return json(200, { ok: true, render: row, signed, upload });
  }

  const renderId = String(body.renderId ?? "");
  if (!UUID.test(renderId)) return json(400, { ok: false, error: "render_id_required" });
  const { data: row } = await db.from("edit_renders").select("*").eq("id", renderId).maybeSingle();
  if (!row) return json(404, { ok: false, error: "render_not_found" });
  if (row.status !== "rendering" || row.worker_id !== workerId)
    return json(409, { ok: false, error: "not_claimed_by_this_worker", status: row.status });

  if (body.action === "fail") {
    const { error } = await db
      .from("edit_renders")
      .update({
        status: "failed",
        error: String(body.error ?? "failed").slice(0, 2000),
        finished_at: new Date().toISOString(),
      })
      .eq("id", renderId);
    return json(error ? 500 : 200, { ok: !error });
  }

  if (body.action === "complete") {
    const projectId =
      (row.plan as { sequence?: { projectId?: string } })?.sequence?.projectId ?? "";
    const path = `${row.user_id}/${projectId}/renders/${row.id}.mp4`;
    const { data: check, error: checkErr } = await db.storage
      .from(OUTPUT_BUCKET)
      .createSignedUrl(path, 60);
    if (checkErr || !check) return json(400, { ok: false, error: "upload_missing" });
    const head = await fetch(check.signedUrl, { headers: { Range: "bytes=0-0" } });
    if (!head.ok) return json(400, { ok: false, error: "upload_missing", status: head.status });
    const duration = Number(body.durationSeconds);
    const { data: asset, error: assetErr } = await db
      .from("project_assets")
      .insert({
        project_id: projectId,
        user_id: row.user_id,
        asset_type: "edited_clip",
        file_url: path,
        notes: `Timeline ${row.kind} render (free, ffmpeg worker)`,
        metadata_json: {
          bucket: OUTPUT_BUCKET,
          edit_render_id: row.id,
          sequence_id: row.sequence_id,
          duration_seconds: Number.isFinite(duration) ? duration : null,
          bytes: Number(body.bytes) || null,
          probe: body.probe ?? null,
          cost_usd: 0,
        },
      })
      .select("id")
      .single();
    if (assetErr) return json(500, { ok: false, error: "asset_failed", message: assetErr.message });
    const { error } = await db
      .from("edit_renders")
      .update({
        status: "complete",
        output_bucket: OUTPUT_BUCKET,
        output_path: path,
        output_asset_id: asset.id,
        duration_seconds: Number.isFinite(duration) ? duration : null,
        finished_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", renderId);
    return json(error ? 500 : 200, { ok: !error, assetId: asset.id, path });
  }
  return json(400, { ok: false, error: "unknown_action" });
});
