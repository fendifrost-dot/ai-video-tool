// AVT edge function — edit-render-worker-api
//
// The narrow door for the durable edit-render worker (workers/edit-render). The worker host holds only a
// worker secret, never the service-role key. Actions:
//   claim    → `kinds` (default ["edit"]) says which job kinds this worker can run. For the edit queue alone the
//              claim is exactly as before. A PUT-BACK job (job_kind "putback": scripts/edit/body_only_swap.py run
//              unchanged by the worker, _shared/putback.ts) is handed only when (1) its settings are a known preset
//              and nothing else, (2) its user is the owner of the worker that asks, and (3) its two input assets
//              belong to that same user and project; the two files are signed here. Anything else fails the row.
//              The edit queue:
//   claim    → claims the oldest queued edit_renders row (SKIP LOCKED, reaps stale rows first), re-signs every
//              plan input from its bucket/path (the URLs stored in the plan may have expired), and hands back a
//              signed upload URL for project-exports/{user_id}/{project_id}/renders/{render_id}.mp4
//   complete → checks the uploaded MP4 exists, files it as a project asset, marks the row complete. A put-back is
//              filed only with its proof record, checked again here: max |out-original| on face/hair/skin must be 0.
//              It is filed unselected and unapproved: only the director's words approve a result.
//   fail     → marks the row failed with a reason
// No provider is ever called; cost stays 0. Auth: x-worker-secret (SHA-256 matched against edit_render_workers).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  EDIT_MEDIA_BUCKETS,
  SIGN_TTL_SECONDS,
  alignSigned,
  bucketOfStoredAsset,
  signAssets,
} from "../_shared/editMedia.ts";
import { acceptPutbackRecord, claimKinds, planPutback, putbackInputItems } from "../_shared/putback.ts";

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

  const failRow = async (id: string, why: string) => {
    await db.from("edit_renders").update({ status: "failed", error: why.slice(0, 2000), finished_at: new Date().toISOString() }).eq("id", id);
  };

  if (body.action === "claim") {
    // the edit queue alone is claimed by the function it always was; other kinds need the by-kind claim (SQL
    // 20261120100000_putback_job_kind.sql), so a worker that asks only for edits works before that SQL is applied
    const kinds = claimKinds(body.kinds);
    const { data: rows, error } = kinds.length === 1 && kinds[0] === "edit"
      ? await db.rpc("claim_edit_render", { p_worker: workerId })
      : await db.rpc("claim_edit_render_kinds", { p_worker: workerId, p_kinds: kinds });
    if (error) return json(500, { ok: false, error: "claim_failed", message: error.message });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return json(200, { ok: true, render: null });

    if (row.job_kind === "putback") {
      const jobProject = typeof row.project_id === "string" ? row.project_id : "";
      const planned = planPutback(row.settings, row.input_asset_ids);
      if (!planned.ok) {
        await failRow(row.id, planned.error);
        return json(200, { ok: true, render: null, skipped: row.id });
      }
      // a put-back runs on the worker's own machine: it is handed only to a worker its job's user registered
      const { data: owner } = await db.from("edit_render_workers").select("owner_user_id").eq("id", worker.id).maybeSingle();
      if (!owner?.owner_user_id || owner.owner_user_id !== row.user_id || !UUID.test(jobProject)) {
        await failRow(row.id, "a put-back runs only on a worker registered by the job's own user, for a project of theirs");
        return json(200, { ok: true, render: null, skipped: row.id });
      }
      const { data: assets } = await db
        .from("project_assets")
        .select("id, user_id, project_id, asset_type, file_url, metadata_json")
        .in("id", [planned.value.originalAssetId, planned.value.swapAssetId])
        .eq("user_id", row.user_id)
        .eq("project_id", jobProject);
      const items = putbackInputItems(planned.value, (assets ?? []) as Record<string, unknown>[], { userId: row.user_id, projectId: jobProject }, (r) => bucketOfStoredAsset(r as { asset_type: string | null; metadata_json: unknown }), EDIT_MEDIA_BUCKETS);
      if (!items.ok) {
        await failRow(row.id, items.error);
        return json(200, { ok: true, render: null, skipped: row.id });
      }
      const signedInputs = await signAssets([items.value.original, items.value.swap], async (bucket, paths) => {
        const { data } = await db.storage.from(bucket).createSignedUrls(paths, SIGN_TTL_SECONDS);
        return alignSigned(paths, data ?? null);
      });
      const originalUrl = signedInputs[items.value.original.assetId];
      const swapUrl = signedInputs[items.value.swap.assetId];
      const outPath = `${row.user_id}/${jobProject}/renders/${row.id}.mp4`;
      const { data: up, error: upErr } = await db.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(outPath, { upsert: true });
      if (!originalUrl || !swapUrl || upErr || !up) {
        await failRow(row.id, "the put-back's files could not be signed");
        return json(200, { ok: true, render: null, skipped: row.id });
      }
      return json(200, {
        ok: true,
        render: row,
        inputs: { original: { assetId: items.value.original.assetId, signedUrl: originalUrl }, swap: { assetId: items.value.swap.assetId, signedUrl: swapUrl } },
        upload: { path: outPath, signedUrl: up.signedUrl, token: up.token },
      });
    }

    const plan = (row.plan ?? {}) as {
      inputs?: { items?: Item[] };
      sequence?: { projectId?: string };
    };
    const projectId = plan.sequence?.projectId || (row.project_id as string) || "";
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
    const sha256 = typeof body.sha256 === "string" ? body.sha256 : "";
    if (!/^[0-9a-f]{64}$/.test(sha256)) return json(400, { ok: false, error: "sha256_required" });
    const projectId =
      (row.plan as { sequence?: { projectId?: string } })?.sequence?.projectId ||
      (row.project_id as string) ||
      "";
    const path = `${row.user_id}/${projectId}/renders/${row.id}.mp4`;
    const { data: check, error: checkErr } = await db.storage
      .from(OUTPUT_BUCKET)
      .createSignedUrl(path, 60);
    if (checkErr || !check) return json(400, { ok: false, error: "upload_missing" });
    const head = await fetch(check.signedUrl, { headers: { Range: "bytes=0-0" } });
    if (!head.ok) return json(400, { ok: false, error: "upload_missing", status: head.status });
    const duration = Number(body.durationSeconds);
    // a put-back is filed only with its proof, checked again here; without it the row fails and no asset is made
    let putback: Record<string, unknown> | null = null;
    if (row.job_kind === "putback") {
      const planned = planPutback(row.settings, row.input_asset_ids);
      const record = planned.ok ? acceptPutbackRecord(body.putback, planned.value) : planned;
      if (!record.ok) {
        await failRow(renderId, record.error);
        return json(400, { ok: false, error: "putback_not_proven", message: record.error });
      }
      putback = record.value;
    }
    const { data: asset, error: assetErr } = await db
      .from("project_assets")
      .insert({
        project_id: projectId,
        user_id: row.user_id,
        asset_type: "edited_clip",
        file_url: path,
        notes: putback
          ? `Put-back (free, worker): clothes from the swap, his face his own pixels; proof 0; preset ${String(putback.preset)}. Not approved: the director judges it`
          : `Timeline ${row.kind} render (free, ffmpeg worker)`,
        metadata_json: {
          bucket: OUTPUT_BUCKET,
          edit_render_id: row.id,
          sequence_id: row.sequence_id,
          duration_seconds: Number.isFinite(duration) ? duration : null,
          bytes: Number(body.bytes) || null,
          sha256,
          // a put-back's probe would repeat its record; the record is kept once, checked
          probe: putback ? null : (body.probe ?? null),
          cost_usd: 0,
          ...(putback ? { putback } : {}),
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
    return json(error ? 500 : 200, { ok: !error, assetId: asset.id, path, sha256_match: true, sha256 });
  }
  return json(400, { ok: false, error: "unknown_action" });
});
