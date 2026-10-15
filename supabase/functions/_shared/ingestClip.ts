// Saving a finished provider job's clip into the project — the one implementation.
//
// Used by ingest-provider-job (a signed-in caller asks for one job, or a backfill) and by provider-jobs-tick (the
// server moves a job to its end by itself). It: asks Control Center for the result URL, streams the bytes from the
// provider's CDN, stores them in project-clips, inserts the project_assets row and links it to the job.
//
// Idempotent: a job that already points at its asset returns it; a job whose asset was stored but never linked
// (an earlier attempt died between the two writes) is linked to that asset rather than downloaded again.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { DRESSED_ROUTE } from "./jobProgress.ts";
import { acceptDownloadHeaders, DOWNLOAD_MAX_BYTES, readBounded } from "./dressConform.ts";

export type IngestRow = {
  id: string;
  user_id: string;
  project_id: string;
  prompt_id: string | null;
  provider: string;
  external_job_id: string | null;
  request_payload_json: Record<string, unknown> | null;
  result_asset_id: string | null;
};

/**
 * Optional handling for one kind of job (a dressed take): where its result is (a URL its own row carries, already
 * checked by the caller — Control Center is not asked then), and what is done to the bytes before they are stored,
 * with what it measured written on the asset.
 */
export type IngestOptions = {
  resultUrl?: string | null;
  transform?: (bytes: Uint8Array) => { bytes: Uint8Array; meta: Record<string, unknown> };
};

export async function ingestOne(
  row: IngestRow,
  ccUrl: string,
  ccKey: string,
  admin: ReturnType<typeof createClient>,
  opts: IngestOptions = {},
): Promise<{ jobId: string; assetId: string; sizeBytes: number }> {
  // 1. Already ingested? Bail idempotently.
  if (row.result_asset_id) {
    return { jobId: row.id, assetId: row.result_asset_id, sizeBytes: 0 };
  }
  if (!row.external_job_id) {
    throw new Error("no external_job_id on row — nothing to fetch upstream");
  }
  // A dressed take must be conformed to its source's length before it is stored; only provider-jobs-tick does that.
  // Any other caller (a backfill sweep, a manual trigger) leaves it alone rather than store a clip that drifts.
  const settings = (row.request_payload_json?.settings ?? null) as Record<string, unknown> | null;
  if (settings?.route === DRESSED_ROUTE && !opts.transform) {
    throw new Error("a dressed take is saved by provider-jobs-tick, which conforms it to its source first");
  }

  // 1b. Stored by an earlier attempt that never linked it? Link that asset; do not download a second copy.
  {
    const { data: prior } = await (admin as any)
      .from("project_assets")
      .select("id")
      .eq("project_id", row.project_id)
      .eq("metadata_json->>provider_job_id", row.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (prior && prior.length) {
      await (admin as any).from("provider_jobs").update({ result_asset_id: prior[0].id }).eq("id", row.id);
      return { jobId: row.id, assetId: prior[0].id as string, sizeBytes: 0 };
    }
  }

  // 2. Resolve the upstream resultUrl via CC. We prefer this over the
  //    legacy inline=1 path because Supabase Edge functions cap responses
  //    near 6 MB — clips >~4 MB raw exceed that once base64-encoded,
  //    causing the upstream "CC job-result returned 546: unknown" failure
  //    that Higgsfield (~11 MB) and Veo (~6-10 MB) routinely trip. By
  //    asking CC only for the URL and then streaming bytes from the CDN
  //    directly to this function, we sidestep the response-size ceiling.
  const modelVariant =
    (row.request_payload_json?.modelVariant as string | undefined) ?? "";
  const shotId = (row.request_payload_json?.shotId as string | undefined) ?? null;

  const urlParams = new URLSearchParams({
    provider: row.provider,
    id: row.external_job_id,
  });
  if ((row.provider === "fal" || row.provider === "pika") && modelVariant) {
    urlParams.set("modelPath", modelVariant);
  }

  // 3. Fetch resultUrl (small JSON envelope, never hits the size ceiling) — unless the caller already has it.
  let resultUrl: string;
  if (opts.resultUrl) resultUrl = opts.resultUrl;
  else {
  const ctrlMeta = new AbortController();
  const metaTimer = setTimeout(() => ctrlMeta.abort(), 30_000);
  try {
    const metaResp = await fetch(
      `${ccUrl.replace(/\/$/, "")}/functions/v1/video-providers-job-result?${urlParams.toString()}`,
      { method: "GET", headers: { "x-api-key": ccKey }, signal: ctrlMeta.signal },
    );
    const metaText = await metaResp.text();
    let metaBody: { ok?: boolean; resultUrl?: string; errorMessage?: string };
    try { metaBody = metaText ? JSON.parse(metaText) : {}; }
    catch { throw new Error(`CC job-result returned non-JSON: ${metaText.slice(0, 200)}`); }
    if (!metaResp.ok || metaBody.ok === false || !metaBody.resultUrl) {
      throw new Error(`CC job-result returned ${metaResp.status}: ${metaBody.errorMessage ?? "no_result_url"}`);
    }
    resultUrl = metaBody.resultUrl;
  } finally { clearTimeout(metaTimer); }
  }

  // 4. Stream bytes. Most providers serve unauthenticated CDN URLs
  //    (Runway → CloudFront, Fal → fal.media, Higgsfield → higgsfield CDN,
  //    Grok → x.ai CDN, Pika → fal.media) and AVT can hit them directly.
  //    Veo's :download URL is the exception — it needs the Gemini API key.
  //    For Veo we fall back to the legacy CC inline path; size is usually
  //    under the ceiling for 5s/720p clips. Larger Veo outputs will still
  //    need a follow-up (CC-side direct-to-storage upload).
  const veoNeedsAuth =
    row.provider === "veo" && resultUrl.includes("generativelanguage.googleapis.com");

  let bytes: Uint8Array;
  let contentType = "video/mp4";

  if (veoNeedsAuth) {
    // Legacy path: ask CC to base64 the bytes for us (key stays server-side
    // on CC). Will fail for clips that exceed Supabase's response limit.
    const inlineParams = new URLSearchParams(urlParams);
    inlineParams.set("inline", "1");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const ccResp = await fetch(
        `${ccUrl.replace(/\/$/, "")}/functions/v1/video-providers-job-result?${inlineParams.toString()}`,
        { method: "GET", headers: { "x-api-key": ccKey }, signal: ctrl.signal },
      );
      const ccText = await ccResp.text();
      let ccBody: { ok?: boolean; bytes_base64?: string; contentType?: string; sizeBytes?: number; errorMessage?: string };
      try { ccBody = ccText ? JSON.parse(ccText) : {}; }
      catch { throw new Error(`CC job-result returned non-JSON: ${ccText.slice(0, 200)}`); }
      if (!ccResp.ok || ccBody.ok === false || !ccBody.bytes_base64) {
        throw new Error(
          `CC job-result (inline) returned ${ccResp.status}: ${ccBody.errorMessage ?? "no_bytes"}` +
            ` — Veo clip likely exceeds Supabase 6MB response limit; ` +
            `needs CC-side direct-to-storage upload (tracked).`,
        );
      }
      bytes = decodeBase64(ccBody.bytes_base64);
      contentType = ccBody.contentType || contentType;
    } finally { clearTimeout(timer); }
  } else {
    const dlCtrl = new AbortController();
    const dlTimer = setTimeout(() => dlCtrl.abort(), 90_000);
    try {
      // a URL handed in by the caller came from the job's own row: it is fetched as checked, never redirected elsewhere
      const dl = await fetch(resultUrl, { signal: dlCtrl.signal, ...(opts.resultUrl ? { redirect: "error" as const } : {}) });
      if (!dl.ok) {
        throw new Error(`direct download from ${row.provider} CDN returned ${dl.status}`);
      }
      // bounded: a declared length over the cap is refused unread, the body is counted as it streams and dropped
      // past the cap, and a dressed result (fetched from a row-carried URL) must be served as a video
      const headers = acceptDownloadHeaders({ contentLength: dl.headers.get("content-length"), contentType: dl.headers.get("content-type"), strictType: !!(opts.resultUrl || opts.transform) });
      if (!headers.ok) {
        dlCtrl.abort();
        throw new Error(`download from ${row.provider} refused: ${headers.why}`);
      }
      if (!dl.body) throw new Error(`download from ${row.provider} had no body`);
      bytes = await readBounded(dl.body, DOWNLOAD_MAX_BYTES, () => dlCtrl.abort());
      contentType = dl.headers.get("content-type") ?? contentType;
    } finally { clearTimeout(dlTimer); }
  }

  // 4a. The caller's own step on the bytes (a dressed take is conformed to its source's length here). When it
  //     refuses, the RAW bytes are stored anyway with the reason — a paid result is never stranded on a CDN — and
  //     the reason stops the take from being placed on the song (jobProgress fileDressedClip).
  let transformed: Record<string, unknown> = {};
  if (opts.transform) {
    try {
      const t = opts.transform(bytes);
      bytes = t.bytes;
      transformed = t.meta;
      contentType = "video/mp4";
    } catch (e) {
      transformed = { conform_error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
    }
  }

  // 4b. Upload to project-clips. The provider's id is made safe for a storage key (a dressed job's id was already
  //     held to plain characters before the download; other providers' ids may carry slashes).
  const safeId = row.external_job_id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 12) || "job";
  const filename = `generated_${row.provider}_${safeId}.mp4`;
  const path = `${row.user_id}/${row.project_id}/${row.id}/${filename}`;

  const { error: uploadErr } = await (admin as any).storage
    .from("project-clips")
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadErr) {
    throw new Error(`upload failed: ${uploadErr.message}`);
  }

  // 5. Insert project_assets row.
  const { data: assetRow, error: assetErr } = await (admin as any)
    .from("project_assets")
    .insert({
      user_id: row.user_id,
      project_id: row.project_id,
      shot_id: shotId,
      prompt_id: row.prompt_id,
      asset_type: "generated_clip",
      file_url: path,
      source_tool: row.provider,
      approval_status: "pending",
      metadata_json: {
        bucket: "project-clips",
        file_size_bytes: bytes.byteLength,
        mime_type: contentType,
        provider_job_id: row.id,
        external_job_id: row.external_job_id,
        ingested_by: "ingest-provider-job",
        ...transformed,
      },
    })
    .select("id")
    .single();
  if (assetErr || !assetRow) {
    throw new Error(
      `project_assets insert failed: ${assetErr?.message ?? "no row returned"}`,
    );
  }

  // 6. Link the job to its asset.
  await (admin as any)
    .from("provider_jobs")
    .update({ result_asset_id: assetRow.id })
    .eq("id", row.id);

  return {
    jobId: row.id,
    assetId: assetRow.id as string,
    sizeBytes: bytes.byteLength,
  };
}
