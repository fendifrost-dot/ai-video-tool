// AVT edge function — lipsync-shot
//
// Puts a performance clip's mouth back on the song (Fendi, 17 Oct 2026: "the lip sync doesn't line up with music … it's
// right on the lipsync test but not in the implementation of the video"). The montage model draws a new mouth on every
// clip and its timing does not follow the take, so a clip is re-synced to the song's own vocals over the stretch of the
// song it plays (_shared/lipsync.ts says why and how). The result is filed on the shot UNSELECTED, beside the clip, with
// the clip's own place on the song (provider-jobs-tick → _shared/jobProgress.ts, route "lipsync").
//
// What it does, in order:
//   1. the song's vocals: an asset of the project (asset_type "other", metadata stem "vocals", stem_of the song) — or,
//      the first time, a Demucs job through Control Center (`switchx-restyle` action `fal-run`; AVT holds no Fal key).
//      While it runs the call answers 202 { state: "separating" }: call again in a minute. When it is done the vocals
//      are downloaded from Fal's CDN, stored in project-audio and filed; the call then goes on with the clip;
//   2. the shot (by id, or by spec key on the project's active variation) and the clip: `assetId`, else the shot's
//      selected performance clip; its place on the song is its performance sync (refused without one);
//   3. the slice of the vocals under the clip — read as byte ranges of the WAV, never decoded — stored in project-audio;
//   4. the provider_jobs row FIRST (write-ahead), then Sync Lipsync 2.0 through Control Center, then the row's
//      external_job_id. The tick runner polls it, saves the clip and files it as a take in sync on the shot.
//
// Cost: Sync Lipsync 2.0, $3 a minute of video (a 4 s clip ≈ $0.20); the vocals once per song (≤ $0.30).
// dryRun: true answers with the plan and sends, spends and writes nothing (the vocals are not made either).
//
// Auth: the caller's user JWT (verify_jwt) and getUser(); anonymous sessions are refused. Reads and writes are the
// caller's (RLS), so a shot or clip that is not theirs is simply not found.
//
// Env: COMPOSE_LOOK_CC_URL, SWITCHX_PROXY_SECRET (or COMPOSE_LOOK_PROXY_SECRET), SUPABASE_URL, SUPABASE_ANON_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildLipsyncInput,
  buildStemInput,
  isFalOutputUrl,
  LIPSYNC_MAX_SECONDS,
  LIPSYNC_MODEL,
  lipsyncEstimateUsd,
  parseWavHead,
  songWindowOf,
  STEM_ESTIMATE_USD,
  STEM_MODEL,
  vocalsUrlOf,
  wavSeconds,
} from "../_shared/lipsync.ts";
import { sliceVocals } from "../_shared/vocalSlice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[A-Za-z0-9_.-]{1,20}$/;
const SIGN_TTL = 86400;
/** A vocals separation started within this window is still running: a second one is not sent. */
const STEM_IN_FLIGHT_MINUTES = 30;
const STEM_MAX_BYTES = 200 * 1024 * 1024;

type Body = {
  projectId: string;
  /** The shot row (shots.id) — or its spec key (c037) on the project's active variation, or on variationId. */
  shotId?: string;
  shotKey?: string;
  variationId?: string;
  /** The clip to re-sync (a performance clip on the shot). Absent = the shot's selected performance clip. */
  assetId?: string;
  /** Answer with the plan and send nothing. */
  dryRun?: boolean;
};
type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;

function ccUrl(composeLookCcUrl: string, fn: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, `/${fn}`);
}
function requestIdOf(statusUrl: string): string | null {
  const m = /\/requests\/([^/]+)\/status\/?$/.exec(statusUrl);
  return m ? m[1] : null;
}

async function falRun(cc: { url: string; secret: string }, model: string, input: Row): Promise<{ status_url: string; response_url: string }> {
  const r = await fetch(ccUrl(cc.url, "switchx-restyle"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.secret },
    body: JSON.stringify({ action: "fal-run", model, input }),
  });
  const text = await r.text();
  let body: Row = {};
  try { body = JSON.parse(text) as Row; } catch { /* kept as text below */ }
  if (!r.ok || !str(body.status_url) || !str(body.response_url))
    throw new Error(String(body.error ?? body.detail ?? text.slice(0, 300) ?? `HTTP ${r.status}`));
  return { status_url: String(body.status_url), response_url: String(body.response_url) };
}

async function falPoll(cc: { url: string; secret: string }, q: { status_url: string; response_url: string }): Promise<Row> {
  const r = await fetch(ccUrl(cc.url, "fal-queue-poll"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.secret },
    body: JSON.stringify(q),
  });
  const text = await r.text();
  let body: Row = {};
  try { body = JSON.parse(text) as Row; } catch { body = { error: text.slice(0, 300) }; }
  if (!r.ok) return { status: "FAILED", error: body.error ?? `HTTP ${r.status}`, detail: body.fal_body_preview ?? body.detail ?? null };
  return body;
}

/** The project's vocals, made once: the asset, or where its making stands. */
async function vocalsOf(
  user: SupabaseClient,
  cc: { url: string; secret: string },
  ctx: { userId: string; projectId: string; dryRun: boolean },
): Promise<{ state: "ready"; asset: Row } | { state: "separating"; jobId: string; note: string } | { state: "error"; status: number; error: string; detail?: string }> {
  const { data: songs, error: songErr } = await user
    .from("project_assets")
    .select("id, file_url, metadata_json")
    .eq("project_id", ctx.projectId)
    .eq("asset_type", "audio")
    .order("created_at", { ascending: false })
    .limit(1);
  if (songErr) return { state: "error", status: 500, error: "song_lookup_failed", detail: songErr.message };
  const song = (songs?.[0] as Row | undefined) ?? null;
  if (!song) return { state: "error", status: 400, error: "no_song", detail: "upload the song in Setup first" };
  const songId = String(song.id);

  const { data: stems } = await user
    .from("project_assets")
    .select("id, file_url, metadata_json, created_at")
    .eq("project_id", ctx.projectId)
    .eq("asset_type", "other")
    .eq("metadata_json->>stem", "vocals")
    .eq("metadata_json->>stem_of", songId)
    .order("created_at", { ascending: false })
    .limit(1);
  const stem = (stems?.[0] as Row | undefined) ?? null;
  if (stem) return { state: "ready", asset: stem };
  if (ctx.dryRun) return { state: "separating", jobId: "", note: `the song's vocals are not made yet: a real call separates them first (${STEM_MODEL}, ≤ $${STEM_ESTIMATE_USD})` };

  // a separation already sent?
  const since = new Date(Date.now() - STEM_IN_FLIGHT_MINUTES * 60_000).toISOString();
  const { data: running } = await user
    .from("provider_jobs")
    .select("id, status, response_payload_json")
    .eq("project_id", ctx.projectId)
    .eq("provider", "fal")
    .eq("request_payload_json->>lane", "stem")
    .eq("request_payload_json->>songAssetId", songId)
    .in("status", ["queued", "running"])
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  const job = (running?.[0] as Row | undefined) ?? null;
  if (job) {
    const q = (job.response_payload_json ?? {}) as Row;
    if (!str(q.status_url) || !str(q.response_url))
      return { state: "separating", jobId: String(job.id), note: "the vocals were asked for a moment ago; call again in a minute" };
    const polled = await falPoll(cc, { status_url: String(q.status_url), response_url: String(q.response_url) });
    if (polled.status === "FAILED") {
      await user.from("provider_jobs").update({ status: "failed", error_text: String(polled.error ?? "the separation failed").slice(0, 500), response_payload_json: { ...q, poll: polled } }).eq("id", job.id);
      return { state: "error", status: 502, error: "vocals_failed", detail: String(polled.detail ?? polled.error ?? "") };
    }
    if (polled.status !== "COMPLETED") return { state: "separating", jobId: String(job.id), note: "the song's vocals are being separated; call again in a minute" };
    const url = vocalsUrlOf(polled.result);
    if (!url || !isFalOutputUrl(url)) {
      await user.from("provider_jobs").update({ status: "failed", error_text: "the separation finished without a vocals file on Fal's CDN" }).eq("id", job.id);
      return { state: "error", status: 502, error: "vocals_missing" };
    }
    const dl = await fetch(url);
    if (!dl.ok) return { state: "error", status: 502, error: "vocals_download_failed", detail: `HTTP ${dl.status}` };
    const bytes = new Uint8Array(await dl.arrayBuffer());
    if (bytes.length > STEM_MAX_BYTES) return { state: "error", status: 502, error: "vocals_too_large" };
    let seconds: number | null = null;
    try { seconds = wavSeconds(parseWavHead(bytes.subarray(0, 65536), bytes.length)); } catch (e) {
      return { state: "error", status: 502, error: "vocals_not_wav", detail: e instanceof Error ? e.message : String(e) };
    }
    const path = `${ctx.userId}/${ctx.projectId}/stems/vocals_${songId}.wav`;
    const up = await user.storage.from("project-audio").upload(path, bytes, { contentType: "audio/wav", upsert: true });
    if (up.error) return { state: "error", status: 500, error: "vocals_store_failed", detail: up.error.message };
    const { data: made, error: madeErr } = await user
      .from("project_assets")
      .insert({
        user_id: ctx.userId,
        project_id: ctx.projectId,
        asset_type: "other",
        file_url: path,
        source_tool: "fal",
        metadata_json: { bucket: "project-audio", mime_type: "audio/wav", stem: "vocals", stem_of: songId, model: STEM_MODEL, duration_seconds: seconds, size_bytes: bytes.length, provider_job_id: job.id },
      })
      .select("id, file_url, metadata_json")
      .single();
    if (madeErr || !made) return { state: "error", status: 500, error: "vocals_file_failed", detail: madeErr?.message };
    await user.from("provider_jobs").update({ status: "succeeded", result_asset_id: made.id, finalized_at: new Date().toISOString(), response_payload_json: { ...q, result: polled.result } }).eq("id", job.id);
    return { state: "ready", asset: made as Row };
  }

  // the first time: separate them
  const songBucket = str((song.metadata_json as Row | null)?.bucket) ?? "project-audio";
  const signed = await user.storage.from(songBucket).createSignedUrl(String(song.file_url), SIGN_TTL);
  if (signed.error || !signed.data?.signedUrl) return { state: "error", status: 500, error: "song_sign_failed", detail: signed.error?.message };
  const { data: row, error: rowErr } = await user
    .from("provider_jobs")
    .insert({
      user_id: ctx.userId,
      project_id: ctx.projectId,
      provider: "fal",
      status: "queued",
      request_payload_json: { lane: "stem", model: STEM_MODEL, songAssetId: songId, estimateUsd: STEM_ESTIMATE_USD, input: { ...buildStemInput("<signed song>") } },
    })
    .select("id")
    .single();
  if (rowErr || !row) return { state: "error", status: 500, error: "job_record_failed", detail: rowErr?.message };
  try {
    const q = await falRun(cc, STEM_MODEL, buildStemInput(signed.data.signedUrl));
    await user.from("provider_jobs").update({ status: "running", external_job_id: requestIdOf(q.status_url), response_payload_json: q }).eq("id", row.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await user.from("provider_jobs").update({ status: "failed", error_text: message.slice(0, 500) }).eq("id", row.id);
    return { state: "error", status: 502, error: "vocals_refused", detail: message };
  }
  return { state: "separating", jobId: String(row.id), note: "the song's vocals are being separated (once per song); call again in a minute" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const composeCcUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret = Deno.env.get("SWITCHX_PROXY_SECRET")?.trim() || Deno.env.get("COMPOSE_LOOK_PROXY_SECRET")?.trim() || "";
  if (!supabaseUrl || !anonKey || !composeCcUrl || !proxySecret) return json(500, { ok: false, error: "server_misconfigured" });
  const cc = { url: composeCcUrl, secret: proxySecret };

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { ok: false, error: "missing_bearer" });
  const user = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await user.auth.getUser();
  if (userErr || !userData?.user) return json(401, { ok: false, error: "unauthenticated" });
  if ((userData.user as { is_anonymous?: boolean }).is_anonymous === true)
    return json(403, { ok: false, error: "sign_in_required", detail: "Sign in to lip-sync a shot." });
  const userId = userData.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!UUID_RE.test(projectId)) return json(400, { ok: false, error: "missing_project_id" });
  const dryRun = body.dryRun === true;

  // 1. the project and the shot
  const { data: project, error: projErr } = await user.from("video_projects").select("id, active_variation_id").eq("id", projectId).maybeSingle();
  if (projErr) return json(500, { ok: false, error: "project_lookup_failed", detail: projErr.message });
  if (!project) return json(404, { ok: false, error: "project_not_found" });
  const select = "id, spec_key, variation_id, project_id";
  let shot: Row | null = null;
  const shotId = typeof body.shotId === "string" ? body.shotId.trim() : "";
  const shotKey = typeof body.shotKey === "string" ? body.shotKey.trim() : "";
  if (shotId) {
    if (!UUID_RE.test(shotId)) return json(400, { ok: false, error: "bad_shot_id" });
    const { data, error } = await user.from("shots").select(select).eq("id", shotId).eq("project_id", projectId).maybeSingle();
    if (error) return json(500, { ok: false, error: "shot_lookup_failed", detail: error.message });
    shot = (data as Row | null) ?? null;
  } else if (shotKey) {
    if (!KEY_RE.test(shotKey)) return json(400, { ok: false, error: "bad_shot_key" });
    const variationId = typeof body.variationId === "string" && UUID_RE.test(body.variationId) ? body.variationId : str(project.active_variation_id);
    if (!variationId) return json(400, { ok: false, error: "no_variation", detail: "the project has no active variation; give variationId" });
    const { data, error } = await user.from("shots").select(select).eq("project_id", projectId).eq("variation_id", variationId).eq("spec_key", shotKey).limit(1);
    if (error) return json(500, { ok: false, error: "shot_lookup_failed", detail: error.message });
    shot = (data?.[0] as Row | undefined) ?? null;
  } else return json(400, { ok: false, error: "missing_shot", detail: "give shotId, or shotKey (c037) with the board's variationId" });
  if (!shot) return json(404, { ok: false, error: "shot_not_found" });
  const key = str(shot.spec_key) ?? String(shot.id).slice(0, 8);

  // 2. the clip, and its place on the song
  let assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
  if (assetId && !UUID_RE.test(assetId)) return json(400, { ok: false, error: "bad_asset_id" });
  if (!assetId) {
    const { data: asg, error: asgErr } = await user
      .from("shot_asset_assignments")
      .select("asset_id, is_primary, role")
      .eq("shot_id", shot.id)
      .eq("role", "performance")
      .eq("is_primary", true)
      .limit(1);
    if (asgErr) return json(500, { ok: false, error: "assignment_lookup_failed", detail: asgErr.message });
    assetId = str((asg?.[0] as Row | undefined)?.asset_id) ?? "";
    if (!assetId) return json(400, { ok: false, error: "no_clip", detail: "the shot shows no performance clip; give assetId" });
  }
  const { data: clip, error: clipErr } = await user.from("project_assets").select("id, project_id, file_url, metadata_json").eq("id", assetId).eq("project_id", projectId).maybeSingle();
  if (clipErr) return json(500, { ok: false, error: "clip_lookup_failed", detail: clipErr.message });
  if (!clip) return json(404, { ok: false, error: "clip_not_found" });
  const clipMeta = (clip.metadata_json ?? {}) as Row;
  const clipSeconds = num(clipMeta.duration_seconds);
  if (!clipSeconds || clipSeconds <= 0) return json(400, { ok: false, error: "clip_length_unknown" });
  if (clipSeconds > LIPSYNC_MAX_SECONDS) return json(400, { ok: false, error: "clip_too_long", detail: `${clipSeconds} s; the lane takes up to ${LIPSYNC_MAX_SECONDS} s` });
  const { data: syncRow, error: syncErr } = await user
    .from("performance_syncs")
    .select("offset_seconds, status")
    .eq("project_id", projectId)
    .eq("performance_asset_id", assetId)
    .maybeSingle();
  if (syncErr) return json(500, { ok: false, error: "sync_lookup_failed", detail: syncErr.message });
  const synced = num(syncRow?.offset_seconds);
  if (synced == null || syncRow?.status === "rejected")
    return json(400, { ok: false, error: "clip_not_on_the_song", detail: "the clip has no usable performance sync: it has no place on the song to be lip-synced to" });
  // a clip lined up by hand on this shot (Lyric sync: shot_asset_assignments.slip_seconds) plays that much later than
  // its sync, so its vocals are cut from there; "*" so a database without the column reads as no slip
  const { data: slipRows } = await user.from("shot_asset_assignments").select("*").eq("shot_id", shot.id).eq("asset_id", assetId).eq("role", "performance").limit(1);
  const slip = num((slipRows?.[0] as Row | undefined)?.slip_seconds) ?? 0;
  const songStart = Math.round((synced + slip) * 1e4) / 1e4;
  const window = songWindowOf(songStart, clipSeconds);
  const derived = (clipMeta.derived_from ?? {}) as Row;
  const sourceMethod = str(derived.method) ?? "take";
  const estimateUsd = lipsyncEstimateUsd(clipSeconds);
  const facts = { shot: { id: shot.id, key }, clip: { id: assetId, seconds: clipSeconds, songStart, method: sourceMethod }, songWindow: window, model: LIPSYNC_MODEL, estimateUsd };

  // 3. the vocals, and the slice of them under the clip
  const vocals = await vocalsOf(user, cc, { userId, projectId, dryRun });
  if (vocals.state === "error") return json(vocals.status, { ok: false, error: vocals.error, detail: vocals.detail, ...facts });
  if (vocals.state === "separating") {
    if (dryRun) return json(200, { ok: true, dryRun: true, ...facts, vocals: vocals.note, note: "nothing was sent, spent or written" });
    return json(202, { ok: true, state: "separating", jobId: vocals.jobId, note: vocals.note, ...facts });
  }
  const stem = vocals.asset;
  const stemBucket = str((stem.metadata_json as Row | null)?.bucket) ?? "project-audio";
  if (dryRun) return json(200, { ok: true, dryRun: true, ...facts, vocalsAssetId: stem.id, note: "nothing was sent, spent or written" });

  const stemSigned = await user.storage.from(stemBucket).createSignedUrl(String(stem.file_url), 600);
  if (stemSigned.error || !stemSigned.data?.signedUrl) return json(500, { ok: false, error: "vocals_sign_failed", detail: stemSigned.error?.message });
  const fileBytes = num((stem.metadata_json as Row | null)?.size_bytes);
  const sliced = await sliceVocals(stemSigned.data.signedUrl, fileBytes, window);
  if (!sliced.ok) return json(sliced.status, { ok: false, error: sliced.error, detail: sliced.detail, ...facts });
  const slice = sliced.wav;
  const audioPath = `${userId}/${projectId}/lipsync/${key}_${Date.now()}.wav`;
  const up = await user.storage.from("project-audio").upload(audioPath, slice, { contentType: "audio/wav", upsert: false });
  if (up.error) return json(500, { ok: false, error: "slice_store_failed", detail: up.error.message });

  // 4. sign, record the job, then spend
  const clipBucket = str(clipMeta.bucket) ?? "project-clips";
  const [videoSigned, audioSigned] = await Promise.all([
    user.storage.from(clipBucket).createSignedUrl(String(clip.file_url), SIGN_TTL),
    user.storage.from("project-audio").createSignedUrl(audioPath, SIGN_TTL),
  ]);
  if (videoSigned.error || !videoSigned.data?.signedUrl) return json(500, { ok: false, error: "clip_sign_failed", detail: videoSigned.error?.message });
  if (audioSigned.error || !audioSigned.data?.signedUrl) return json(500, { ok: false, error: "slice_sign_failed", detail: audioSigned.error?.message });
  const lipsync = { model: LIPSYNC_MODEL, vocalsAssetId: stem.id, audioPath, songWindow: window, sourceMethod };
  const { data: job, error: jobErr } = await user
    .from("provider_jobs")
    .insert({
      user_id: userId,
      project_id: projectId,
      ...(str(shot.variation_id) ? { variation_id: shot.variation_id } : {}),
      provider: "fal",
      status: "queued",
      request_payload_json: {
        modelVariant: LIPSYNC_MODEL,
        shotId: shot.id,
        input: buildLipsyncInput("<signed clip>", "<signed vocals slice>"),
        settings: {
          batchRun: "storyboard",
          batchShotId: `${key}_lipsync`,
          route: "lipsync",
          kind: "angle",
          estimateUsd,
          sourcePath: clip.file_url,
          sourceAssetId: assetId,
          masterStart: songStart,
          sourceWindow: [0, clipSeconds],
          sourceSeconds: clipSeconds,
          alternate: true,
          lipsync,
          submittedBy: "lipsync-shot",
        },
      },
    })
    .select("id")
    .single();
  if (jobErr || !job) return json(500, { ok: false, error: "job_record_failed", detail: jobErr?.message });
  let q: { status_url: string; response_url: string };
  try {
    q = await falRun(cc, LIPSYNC_MODEL, buildLipsyncInput(videoSigned.data.signedUrl, audioSigned.data.signedUrl));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await user.from("provider_jobs").update({ status: "failed", error_text: message.slice(0, 500) }).eq("id", job.id);
    return json(502, { ok: false, error: "provider_refused", detail: message, jobId: job.id, ...facts });
  }
  const providerJobId = requestIdOf(q.status_url);
  const { error: upErr } = await user
    .from("provider_jobs")
    .update({ status: "running", external_job_id: providerJobId, response_payload_json: q })
    .eq("id", job.id);
  if (upErr || !providerJobId)
    return json(200, { ok: true, ...facts, jobId: job.id, providerJobId, warning: `accepted by the provider, but its record could not be completed — ${upErr?.message ?? "no request id in the status link"}` });
  return json(200, { ok: true, ...facts, jobId: job.id, providerJobId, filedAs: "an alternate on the shot, unselected, once provider-jobs-tick finishes it (a few minutes)" });
});
