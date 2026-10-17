// AVT edge function — dress-clip
//
// Swap pieces of his wardrobe on a clip that is already on a shot — a montage, a take — with Higgsfield's clothing
// swap (Genjutsu object swap, the storyboard Dress button's model), leaving everything else in the footage as it is.
// Built 17 Oct 2026 for the MCP (avt_call dress-clip): Fendi, on a montage re-shot to fix his shoes — "I didn't
// really want the footage changed. I just wanted the swap on the shoes … use the tool specifically to swap clothes."
//
// What it does, in order (the pure half is plan.ts; the words are _shared/dressWords.ts, a copy of the app's held to
// it by a test):
//   1. the clip (project_assets, the caller's), its shot, and its place on the song (performance_syncs);
//   2. its real length, read from the file's bytes (the result is conformed to it);
//   3. the pieces: pieceIds when given, else the FOOTWEAR among what he wears in the shot (its own garments, else its
//      outfit — the scene's or its exception);
//   4. the request and the dress record (dryRun: true answers with them and sends nothing);
//   5. the provider_jobs row FIRST (write-ahead), then proxy-provider-call → CC video-providers-higgsfield-model; the
//      tick runner downloads the result, conforms it to the clip's length and files it on the shot UNSELECTED, in sync
//      where the clip is — named as what the clip was (a montage stays "Montage" on the board).
//
// One swap of a clip at a time: a second call while one runs is refused, not billed twice.
// Cost: Genjutsu at 720p, $0.681 per started second of the clip (a 4.04 s montage bills 5 s → $3.405 list).
//
// Auth: the caller's user JWT (verify_jwt) and getUser(); anonymous sessions are refused. Everything is read and
// written as the caller (RLS); the clip and the pictures are signed as the caller for 24 h.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pieceOf, planDressClip, SWAP_ENDPOINT, type ClipFacts } from "./plan.ts";
import { DRESS_ROUTE, scrubEnvelope, wornPieces } from "../_shared/dressWords.ts";
import { mp4Durations } from "../_shared/mp4Retime.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_TTL = 86400;
const MAX_CLIP_BYTES = 200 * 1024 * 1024;

type Body = {
  projectId: string;
  /** The clip to swap pieces on (project_assets.id): it must be on a shot. */
  assetId: string;
  /** The wardrobe pictures to put on him (character_features ids). Absent = the shoes he wears in the shot. */
  pieceIds?: string[];
  /** Answer with the exact request and send nothing. */
  dryRun?: boolean;
};

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return json(500, { ok: false, error: "server_misconfigured" });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer "))
    return json(401, { ok: false, error: "missing_bearer" });
  const user = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await user.auth.getUser();
  if (userErr || !userData?.user) return json(401, { ok: false, error: "unauthenticated" });
  if ((userData.user as { is_anonymous?: boolean }).is_anonymous === true)
    return json(403, {
      ok: false,
      error: "sign_in_required",
      detail: "Sign in to swap his clothes.",
    });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!UUID_RE.test(projectId)) return json(400, { ok: false, error: "missing_project_id" });
  const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
  if (!UUID_RE.test(assetId)) return json(400, { ok: false, error: "missing_asset_id" });
  const askedPieces = Array.isArray(body.pieceIds)
    ? body.pieceIds.filter((p): p is string => typeof p === "string" && UUID_RE.test(p))
    : null;
  if (Array.isArray(body.pieceIds) && askedPieces && askedPieces.length !== body.pieceIds.length)
    return json(400, { ok: false, error: "bad_piece_ids" });
  const dryRun = body.dryRun === true;

  // 1. the clip, its shot, its place on the song
  const { data: clipRow, error: clipErr } = await user
    .from("project_assets")
    .select("id, project_id, shot_id, file_url, approval_status, metadata_json")
    .eq("id", assetId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (clipErr)
    return json(500, { ok: false, error: "clip_lookup_failed", detail: clipErr.message });
  if (!clipRow) return json(404, { ok: false, error: "clip_not_found" });
  const clipMeta = ((clipRow as Row).metadata_json ?? {}) as Row;
  const shotIdOfClip = str((clipRow as Row).shot_id);
  if (!shotIdOfClip)
    return json(422, {
      ok: false,
      error: "clip_not_on_a_shot",
      detail: "the clip is not on a shot of the board",
    });
  if ((clipRow as Row).approval_status === "rejected")
    return json(422, {
      ok: false,
      error: "clip_rejected",
      detail: "the clip was rejected; nothing to swap on it",
    });
  const bucket = str(clipMeta.bucket) ?? "project-clips";
  const path = String((clipRow as Row).file_url ?? "");
  if (!path) return json(422, { ok: false, error: "clip_has_no_file" });

  const { data: shotRow, error: shotErr } = await user
    .from("shots")
    .select("id, spec_key, variation_id, timestamp_start, spec_json, generated_json")
    .eq("id", shotIdOfClip)
    .eq("project_id", projectId)
    .maybeSingle();
  if (shotErr)
    return json(500, { ok: false, error: "shot_lookup_failed", detail: shotErr.message });
  if (!shotRow) return json(404, { ok: false, error: "shot_not_found" });
  const shot = {
    id: String((shotRow as Row).id),
    key: String((shotRow as Row).spec_key),
    variationId: str((shotRow as Row).variation_id),
  };

  const { data: syncRows, error: syncErr } = await user
    .from("performance_syncs")
    .select("id, offset_seconds, drift_ppm, status")
    .eq("project_id", projectId)
    .eq("performance_asset_id", assetId)
    .in("status", ["confirmed", "manual"])
    .order("updated_at", { ascending: false })
    .limit(1);
  if (syncErr)
    return json(500, { ok: false, error: "sync_lookup_failed", detail: syncErr.message });
  const syncRow = (syncRows?.[0] as Row | undefined) ?? null;
  const offset = syncRow ? num(syncRow.offset_seconds) : null;
  if (offset == null)
    return json(422, {
      ok: false,
      error: "clip_not_in_sync",
      detail:
        "the clip has no place on the song (no confirmed sync) — the swapped clip could not be filed in sync",
    });

  // 2. its real length, from the bytes
  const { data: blob, error: dlErr } = await user.storage.from(bucket).download(path);
  if (dlErr || !blob)
    return json(500, { ok: false, error: "clip_download_failed", detail: dlErr?.message });
  if (blob.size > MAX_CLIP_BYTES) return json(422, { ok: false, error: "clip_too_large" });
  let seconds: number;
  try {
    const d = mp4Durations(new Uint8Array(await blob.arrayBuffer()));
    seconds = d.videoSeconds ?? d.movieSeconds;
  } catch (e) {
    return json(422, {
      ok: false,
      error: "clip_unreadable",
      detail: `the clip's length could not be read: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  const derived = (clipMeta.derived_from ?? null) as Row | null;
  const clip: ClipFacts = {
    id: assetId,
    bucket,
    path,
    seconds,
    method: str(derived?.method),
    sync: { id: str(syncRow?.id), offsetSeconds: offset, driftPpm: num(syncRow?.drift_ppm) ?? 0 },
  };

  // 3. the pieces: the ones asked for, else the shoes he wears in the shot
  let pieceIds: string[] = askedPieces ?? [];
  let outfit: { id: string; key: string; name: string; version: number } | null = null;
  let sceneId: string | null = null;
  if (!askedPieces) {
    const start = num((shotRow as Row).timestamp_start);
    const sceneQuery = user
      .from("variation_scenes")
      .select("id, name, outfit_key")
      .eq("project_id", projectId)
      .lte("start_seconds", start ?? 0)
      .gt("end_seconds", start ?? 0)
      .order("updated_at", { ascending: false });
    const { data: sceneRows, error: sceneErr } = await (shot.variationId
      ? sceneQuery.eq("variation_id", shot.variationId)
      : sceneQuery);
    if (sceneErr)
      return json(500, { ok: false, error: "scene_lookup_failed", detail: sceneErr.message });
    const scene = (sceneRows?.[0] as Row | undefined) ?? null;
    sceneId = scene ? String(scene.id) : null;
    const spec = (((shotRow as Row).spec_json as Row | null) ??
      ((shotRow as Row).generated_json as Row | null) ??
      {}) as Row;
    const worn = wornPieces(spec, str(scene?.outfit_key));
    let ids: string[] = "ids" in worn ? worn.ids : [];
    if ("outfitKey" in worn) {
      const outfitQuery = user
        .from("continuity_entities")
        .select("id, key, name, version, garment_feature_ids")
        .eq("project_id", projectId)
        .eq("kind", "outfit")
        .eq("key", worn.outfitKey)
        .eq("archived", false)
        .limit(1);
      const { data: outfitRows, error: outfitErr } = await (shot.variationId
        ? outfitQuery.eq("variation_id", shot.variationId)
        : outfitQuery);
      if (outfitErr)
        return json(500, { ok: false, error: "outfit_lookup_failed", detail: outfitErr.message });
      const o = (outfitRows?.[0] as Row | undefined) ?? null;
      if (o) {
        outfit = {
          id: String(o.id),
          key: String(o.key),
          name: String(o.name),
          version: num(o.version) ?? 1,
        };
        ids = Array.isArray(o.garment_feature_ids) ? o.garment_feature_ids.map(String) : [];
      }
    }
    pieceIds = ids;
  }
  let pieces: ReturnType<typeof pieceOf>[] = [];
  if (pieceIds.length > 0) {
    const { data: rows, error: piecesErr } = await user
      .from("character_features")
      .select("id, label, feature_type, storage_path, dimensions_description, reference_images")
      .in("id", pieceIds);
    if (piecesErr)
      return json(500, { ok: false, error: "wardrobe_lookup_failed", detail: piecesErr.message });
    const byId = new Map(((rows ?? []) as Row[]).map((r) => [String(r.id), r]));
    pieces = pieceIds
      .map((id) => byId.get(id))
      .filter((r): r is Row => !!r)
      .filter((r) => askedPieces || r.feature_type === "wardrobe_footwear")
      .map((r) =>
        pieceOf({
          id: String(r.id),
          label: str(r.label),
          feature_type: String(r.feature_type),
          storage_path: str(r.storage_path),
          dimensions_description: str(r.dimensions_description),
          reference_images: r.reference_images,
        }),
      );
  }

  // 4. the request
  const planned = planDressClip({ projectId, clip, shot, pieces, sceneId, outfit });
  if (!planned.ok)
    return json(planned.status, { ok: false, error: planned.error, detail: planned.detail });
  const plan = planned.plan;
  const facts = {
    clip: {
      id: clip.id,
      path: clip.path,
      seconds: clip.seconds,
      method: clip.method,
      songStart: offset,
    },
    shot,
    pieces: pieces.map((p) => ({ id: p.id, label: p.label })),
    references: plan.references,
    notSent: plan.notSent,
    billedSeconds: plan.billedSeconds,
    estimateUsd: plan.estimateUsd,
    prompt: plan.prompt,
  };
  if (dryRun)
    return json(200, {
      ok: true,
      dryRun: true,
      ...facts,
      request: plan.body,
      settings: (plan.payload as Row).settings,
      note: "nothing was sent, spent or written",
    });

  // one swap of this clip at a time
  const { data: live, error: liveErr } = await user
    .from("provider_jobs")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["queued", "running"])
    .eq("request_payload_json->settings->>route", DRESS_ROUTE)
    .eq("request_payload_json->settings->>sourceAssetId", assetId)
    .limit(1);
  if (liveErr) return json(500, { ok: false, error: "job_lookup_failed", detail: liveErr.message });
  if ((live ?? []).length > 0)
    return json(409, {
      ok: false,
      error: "already_swapping",
      detail: "a swap of this clip is already running — nothing was sent",
      jobId: String((live![0] as Row).id),
    });

  // 5. sign as the caller, record the job, then spend
  const srcSigned = await user.storage.from(bucket).createSignedUrl(path, SIGN_TTL);
  if (srcSigned.error || !srcSigned.data?.signedUrl)
    return json(500, { ok: false, error: "source_sign_failed", detail: srcSigned.error?.message });
  const refSigned = await Promise.all(
    plan.references.map((r) =>
      user.storage.from("wardrobe-refs").createSignedUrl(r.path, SIGN_TTL),
    ),
  );
  const badRef = refSigned.findIndex((s) => s.error || !s.data?.signedUrl);
  if (badRef >= 0)
    return json(500, {
      ok: false,
      error: "reference_sign_failed",
      detail: refSigned[badRef].error?.message ?? plan.references[badRef].path,
    });
  const requestBody = {
    ...plan.body,
    referenceVideoUrl: srcSigned.data.signedUrl,
    referenceImageUrls: refSigned.map((s) => s.data!.signedUrl),
  };

  const { data: job, error: jobErr } = await user
    .from("provider_jobs")
    .insert({
      user_id: userData.user.id,
      project_id: projectId,
      ...(shot.variationId ? { variation_id: shot.variationId } : {}),
      provider: "higgsfield",
      status: "queued",
      request_payload_json: plan.payload,
    })
    .select("id")
    .single();
  if (jobErr || !job)
    return json(500, {
      ok: false,
      error: "job_record_failed",
      detail: jobErr?.message ?? "no row returned",
    });
  const rowId = String(job.id);

  let env: Row;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/proxy-provider-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: authHeader },
      body: JSON.stringify({ endpoint: SWAP_ENDPOINT, method: "POST", body: requestBody }),
    });
    const text = await res.text();
    try {
      env = JSON.parse(text) as Row;
    } catch {
      env = { ok: false, errorMessage: text.slice(0, 500) };
    }
    if (!res.ok || env.ok === false)
      throw new Error(String(env.errorMessage ?? env.error ?? env.detail ?? `HTTP ${res.status}`));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await user
      .from("provider_jobs")
      .update({ status: "failed", error_text: message.slice(0, 500) })
      .eq("id", rowId);
    return json(502, { ok: false, error: "provider_refused", detail: message, jobId: rowId });
  }
  // the provider's own request id: Control Center's job id is not answered by the status endpoint
  const providerJobId = String(env.providerJobId ?? "");
  if (!providerJobId) {
    await user
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: "the provider answered without a request id",
        response_payload_json: scrubEnvelope(env),
      })
      .eq("id", rowId);
    return json(502, { ok: false, error: "no_provider_job_id", jobId: rowId });
  }
  const { error: upErr } = await user
    .from("provider_jobs")
    .update({
      external_job_id: providerJobId,
      status: env.status === "running" ? "running" : "queued",
      response_payload_json: scrubEnvelope(env),
    })
    .eq("id", rowId);
  if (upErr)
    return json(200, {
      ok: true,
      ...facts,
      jobId: rowId,
      providerJobId,
      warning: `accepted by the provider as ${providerJobId}, but its record could not be updated — ${upErr.message}`,
    });
  return json(200, {
    ok: true,
    ...facts,
    jobId: rowId,
    providerJobId,
    filedAs: "a new version on the shot, unselected, once provider-jobs-tick finishes it (minutes)",
  });
});
