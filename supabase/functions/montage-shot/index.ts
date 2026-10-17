// AVT edge function — montage-shot
//
// The storyboard's "Montage" button, as a server call: a performance shot re-shot as a fast-cut sequence of angles
// and cutaways in the place of its scene's plate, in ONE Seedance 2.5 reference-to-video call through Control
// Center, filed on the shot UNSELECTED when the job runner finishes it (provider-jobs-tick → _shared/jobProgress.ts,
// settings.alternate). Built 16 Oct 2026 for the MCP (avt_montage / avt_call): Fendi — "the montage is the go-to
// for all performance shots … you do not need the browser; whatever you need the browser for, build it into the
// MCP." Before this, a montage needed a headless Chrome pressing the storyboard (scripts/agent-browser).
//
// What it does, in order (the pure half is plan.ts; the words are _shared/montagePrompt.ts, a copy of the app's
// held to it by a test):
//   1. the shot (by id, or by spec key on the project's active variation) — its window on the song, its events;
//   2. its DRESSED take: the newest non-rejected clip on the shot whose derived_from.method is "dressed" (the
//      selected one first) and that take's place on the song (performance_syncs) — the montage wears what the video
//      wears. A shot with no dressed take is refused: dress it first (the browser's fallback to cutting the raw
//      take needs an encoder this function does not have);
//   3. the place: the newest usable plate still (metadata lane world_still) of the scene the shot falls in
//      (variation_scenes by its start), else refused — generate the place first; and his shoes: the footwear
//      picture among the pieces he wears in the shot (its own garments, else its outfit), sent as @Image2;
//   4. the scenes (the director's lines, one per line, each optionally timed "2.0-2.7 s: …"; absent = the dialog's
//      prefill), the prompt, the estimate;
//   5. the provider_jobs row FIRST (write-ahead, status queued), then proxy-provider-call → CC
//      video-providers-higgsfield-model (reference_to_video, seedance-2.5-reference, 720p, the project's frame), then
//      the row's external_job_id. The tick runner polls the job, saves the clip and files it on the shot unselected
//      as a take in sync (its first frame = the dressed take's first frame on the song).
//
// Cost: one Seedance 2.5 call, 720p, the dressed take's whole length (4 s → about $2.22 list; the API has charged
// ≈ $1.55 for it). dryRun: true answers with the exact prompt, request and job settings and sends nothing.
//
// Auth: the caller's user JWT (verify_jwt) and getUser(); anonymous sessions are refused. Everything is read and
// written as the caller (RLS), so a shot that is not theirs is simply not found. The source and the plate are
// signed as the caller for 24 h, as the browser signs them.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  planBrollMontage,
  planMontage,
  wornPieces,
  type CastFacts,
  type PlateFacts,
  type ShotFacts,
  type TakeFacts,
} from "./plan.ts";
import { montageFootwear, type MontageFootwear } from "../_shared/montagePrompt.ts";

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
const KEY_RE = /^[A-Za-z0-9_.-]{1,20}$/;
const SIGN_TTL = 86400;

type Body = {
  projectId: string;
  /** The shot row (shots.id) — or its spec key (c042) on the project's active variation, or on variationId. */
  shotId?: string;
  shotKey?: string;
  variationId?: string;
  /** The scenes, in order, one per line; a line may carry its own seconds ("2.0-2.7 s: …"). Absent = the dialog's prefill. */
  lines?: string;
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
      detail: "Sign in to shoot a montage.",
    });
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!UUID_RE.test(projectId)) return json(400, { ok: false, error: "missing_project_id" });
  const dryRun = body.dryRun === true;
  const lines = typeof body.lines === "string" ? body.lines : null;

  // 1. the project (its frame, its board) and the shot
  const { data: project, error: projErr } = await user
    .from("video_projects")
    .select("id, aspect_ratio, active_variation_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr)
    return json(500, { ok: false, error: "project_lookup_failed", detail: projErr.message });
  if (!project) return json(404, { ok: false, error: "project_not_found" });

  let shotRow: Row | null = null;
  const shotId = typeof body.shotId === "string" ? body.shotId.trim() : "";
  const shotKey = typeof body.shotKey === "string" ? body.shotKey.trim() : "";
  const select =
    "id, spec_key, shot_type, timestamp_start, timestamp_end, variation_id, project_id, spec_json, generated_json, updated_at";
  if (shotId) {
    if (!UUID_RE.test(shotId)) return json(400, { ok: false, error: "bad_shot_id" });
    const { data, error } = await user
      .from("shots")
      .select(select)
      .eq("id", shotId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) return json(500, { ok: false, error: "shot_lookup_failed", detail: error.message });
    shotRow = (data as Row | null) ?? null;
  } else if (shotKey) {
    if (!KEY_RE.test(shotKey)) return json(400, { ok: false, error: "bad_shot_key" });
    const variationId =
      typeof body.variationId === "string" && UUID_RE.test(body.variationId)
        ? body.variationId
        : str(project.active_variation_id);
    if (!variationId)
      return json(400, {
        ok: false,
        error: "no_variation",
        detail: "the project has no active variation; give variationId",
      });
    const { data, error } = await user
      .from("shots")
      .select(select)
      .eq("project_id", projectId)
      .eq("variation_id", variationId)
      .eq("spec_key", shotKey)
      .limit(1);
    if (error) return json(500, { ok: false, error: "shot_lookup_failed", detail: error.message });
    shotRow = (data?.[0] as Row | undefined) ?? null;
  } else {
    return json(400, {
      ok: false,
      error: "missing_shot",
      detail: "give shotId, or shotKey (c042) with the board's variationId",
    });
  }
  if (!shotRow) return json(404, { ok: false, error: "shot_not_found" });
  // the spec the board works from (override_json holds only the director's partial edits, never a whole spec)
  const spec = ((shotRow.spec_json as Row | null) ??
    (shotRow.generated_json as Row | null) ??
    {}) as Row;
  const specEvents = Array.isArray((shotRow.spec_json as Row | null)?.events)
    ? ((shotRow.spec_json as Row).events as unknown[])
    : [];
  const start = num(shotRow.timestamp_start);
  const end = num(shotRow.timestamp_end);
  if (start == null || end == null) return json(422, { ok: false, error: "shot_has_no_window" });
  const shotType = str(shotRow.shot_type) ?? str(spec.shotType);
  // a shot he is not in is a montage of the place and its people, with no take (plan.ts planBrollMontage)
  const broll = !!shotType && shotType !== "performance";
  const provenance = ((shotRow.generated_json as Row | null)?.provenance as Row | null) ?? null;
  const shot: ShotFacts = {
    id: String(shotRow.id),
    key: String(shotRow.spec_key),
    start,
    end,
    variationId: str(shotRow.variation_id),
    events: specEvents,
    madeFrom: {
      treatment: str(provenance?.treatment),
      sceneWrittenAt: str(provenance?.createdAt),
      shotUpdatedAt: str(shotRow.updated_at),
    },
  };

  // 2. the dressed take on the shot (a performance shot only)
  let take: TakeFacts | null = null;
  if (!broll) {
    const found = await dressedTakeOf(user, projectId, shot.id);
    if (!found.ok) return json(found.status, found.body);
    take = found.take;
  }

  // 3. the scene the shot falls in, and the newest usable plate still filed for it
  const sceneQuery = user
    .from("variation_scenes")
    .select("id, name, start_seconds, end_seconds, outfit_key")
    .eq("project_id", projectId)
    .lte("start_seconds", shot.start)
    .gt("end_seconds", shot.start)
    .order("updated_at", { ascending: false });
  const { data: sceneRows, error: sceneErr } = await (shot.variationId
    ? sceneQuery.eq("variation_id", shot.variationId)
    : sceneQuery);
  if (sceneErr)
    return json(500, { ok: false, error: "scene_lookup_failed", detail: sceneErr.message });
  const scene = (sceneRows?.[0] as Row | undefined) ?? null;
  if (!scene)
    return json(422, {
      ok: false,
      error: "no_scene",
      detail: `no scene of this board covers ${shot.start} s — the plate is the scene's`,
    });
  const { data: plateRows, error: plateErr } = await user
    .from("project_assets")
    .select("id, file_url, created_at, metadata_json")
    .eq("project_id", projectId)
    .eq("metadata_json->>lane", "world_still")
    .eq("metadata_json->>scene_title", String(scene.name))
    .order("created_at", { ascending: false })
    .limit(20);
  if (plateErr)
    return json(500, { ok: false, error: "plate_lookup_failed", detail: plateErr.message });
  // the place is an EMPTY plate (worlds/plate_*); a still with the scene's own people in it (worlds/scene_*) is its
  // cast — and the place too when the scene has no usable empty plate (its people are then @Image1's)
  const usable = ((plateRows ?? []) as Row[]).filter(
    (p) => ((p.metadata_json ?? {}) as Row).usable !== false,
  );
  const castRow = usable.find((p) => /\/worlds\/scene_/.test(String(p.file_url))) ?? null;
  const plateRow =
    usable.find((p) => /\/worlds\/plate_/.test(String(p.file_url))) ??
    castRow ??
    usable.find((p) => !/\.(mp4|mov|webm)$/i.test(String(p.file_url))) ??
    null;
  if (!plateRow)
    return json(422, {
      ok: false,
      error: "no_plate",
      detail: `scene "${scene.name}" has no usable plate to shoot the montage in — generate the place first`,
    });
  const plateMeta = (plateRow.metadata_json ?? {}) as Row;
  const plate: PlateFacts = {
    id: String(plateRow.id),
    bucket: str(plateMeta.bucket) ?? "project-references",
    path: String(plateRow.file_url),
    shotLabel: str(plateMeta.shot_label),
    sceneTitle: str(plateMeta.scene_title),
  };
  const cast: CastFacts | null = castRow
    ? {
        id: String(castRow.id),
        bucket: str(((castRow.metadata_json ?? {}) as Row).bucket) ?? "project-references",
        path: String(castRow.file_url),
      }
    : null;

  // his shoes: the footwear picture among the pieces he wears in the shot (the montage's low angles show feet the
  // waist-up takes never had; without a picture the model makes up a pair)
  let footwear: MontageFootwear | null = null;
  const worn = wornPieces(spec, str(scene.outfit_key));
  let pieceIds: string[] = "ids" in worn && !broll ? worn.ids : [];
  if ("outfitKey" in worn && !broll) {
    const outfitQuery = user
      .from("continuity_entities")
      .select("garment_feature_ids")
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
    const ids = (outfitRows?.[0] as Row | undefined)?.garment_feature_ids;
    pieceIds = Array.isArray(ids) ? ids.map(String) : [];
  }
  if (pieceIds.length > 0) {
    const { data: pieces, error: piecesErr } = await user
      .from("character_features")
      .select("id, feature_type, label, storage_path, dimensions_description")
      .in("id", pieceIds);
    if (piecesErr)
      return json(500, { ok: false, error: "wardrobe_lookup_failed", detail: piecesErr.message });
    footwear = montageFootwear(
      pieceIds,
      ((pieces ?? []) as Row[]).map((p) => ({
        id: String(p.id),
        feature_type: String(p.feature_type),
        label: String(p.label ?? ""),
        storage_path: str(p.storage_path),
        dimensions_description: str(p.dimensions_description),
      })),
    );
  }

  // the light the shot opens in, when it points at a lighting entity (the place itself is the picture)
  let light: string | null = null;
  const lightingKey = str((spec.continuity as Row | null)?.lighting);
  if (lightingKey) {
    const { data: ent } = await user
      .from("continuity_entities")
      .select("description, constraints")
      .eq("project_id", projectId)
      .eq("key", lightingKey)
      .limit(1);
    const e = (ent?.[0] as Row | undefined) ?? null;
    const sentence = (s: unknown) =>
      typeof s === "string" && s.trim() ? s.trim().replace(/[.\s]+$/, "") + "." : "";
    const words = e
      ? [sentence(e.description), sentence(e.constraints)].filter(Boolean).join(" ")
      : "";
    light = words || null;
  }

  // 4. the request
  const planned = take
    ? planMontage({
        projectId,
        userId,
        aspect: project.aspect_ratio,
        shot,
        take,
        plate,
        lines,
        light,
        footwear,
        cast,
      })
    : planBrollMontage({
        projectId,
        userId,
        aspect: project.aspect_ratio,
        shot,
        plate,
        cast,
        lines,
        light,
      });
  if (!planned.ok)
    return json(planned.status, { ok: false, error: planned.error, detail: planned.detail });
  const plan = planned.plan;
  const facts = {
    shot: { id: shot.id, key: shot.key, start: shot.start, end: shot.end },
    take: take
      ? {
          id: take.id,
          path: take.path,
          seconds: take.seconds,
          songStart: take.sync.offsetSeconds,
        }
      : null,
    broll,
    scene: { id: String(scene.id), name: String(scene.name) },
    plate: { id: plate.id, path: plate.path },
    shoes: footwear ? { id: footwear.id, label: footwear.label, path: footwear.path } : null,
    cast: plan.cast ? { id: plan.cast.id, path: plan.cast.path, isPlace: plan.cast.id === plate.id } : null,
    seconds: plan.seconds,
    songStart: plan.songStart,
    lead: plan.lead,
    scenes: plan.scenes,
    thing: plan.thing,
    estimateUsd: plan.estimateUsd,
    prompt: plan.prompt,
  };
  if (dryRun)
    return json(200, {
      ok: true,
      dryRun: true,
      ...facts,
      request: plan.body,
      settings: plan.payload.settings,
      note: "nothing was sent, spent or written",
    });

  // 5. sign the files as the caller, record the job, then spend
  // @Image1 the place, then the pictures after it in the order the prompt names them (his shoes, the scene's people)
  const extra = ((plan.payload.settings as Row).extraImages ?? []) as { bucket: string; path: string }[];
  const [srcSigned, stillSigned, ...extraSigned] = await Promise.all([
    take ? user.storage.from(take.bucket).createSignedUrl(take.path, SIGN_TTL) : null,
    user.storage.from(plate.bucket).createSignedUrl(plate.path, SIGN_TTL),
    ...extra.map((x) => user.storage.from(x.bucket).createSignedUrl(x.path, SIGN_TTL)),
  ]);
  if (srcSigned && (srcSigned.error || !srcSigned.data?.signedUrl))
    return json(500, { ok: false, error: "source_sign_failed", detail: srcSigned.error?.message });
  if (!stillSigned || stillSigned.error || !stillSigned.data?.signedUrl)
    return json(500, { ok: false, error: "plate_sign_failed", detail: stillSigned?.error?.message });
  const badExtra = extraSigned.find((x) => !x || x.error || !x.data?.signedUrl);
  if (badExtra !== undefined)
    return json(500, { ok: false, error: "picture_sign_failed", detail: badExtra?.error?.message });
  const requestBody = {
    ...plan.body,
    ...(srcSigned ? { referenceVideoUrls: [srcSigned.data!.signedUrl] } : {}),
    referenceImageUrls: [stillSigned.data.signedUrl, ...extraSigned.map((x) => x!.data!.signedUrl)],
  };

  const { data: job, error: jobErr } = await user
    .from("provider_jobs")
    .insert({
      user_id: userId,
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
      body: JSON.stringify({
        endpoint: "video-providers-higgsfield-model",
        method: "POST",
        body: requestBody,
      }),
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
  const providerJobId = String(env.providerJobId ?? env.jobId ?? "");
  if (!providerJobId) {
    await user
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: "the provider answered without a job id",
        response_payload_json: env,
      })
      .eq("id", rowId);
    return json(502, { ok: false, error: "no_provider_job_id", jobId: rowId });
  }
  const { error: upErr } = await user
    .from("provider_jobs")
    .update({
      external_job_id: providerJobId,
      status: env.status === "running" ? "running" : "queued",
      response_payload_json: env,
    })
    .eq("id", rowId);
  if (upErr) {
    // the job is live and paid for: never report this as a failed submit, and never lose the id
    return json(200, {
      ok: true,
      ...facts,
      jobId: rowId,
      providerJobId,
      warning: `accepted by the provider as ${providerJobId}, but its record could not be updated — ${upErr.message}`,
    });
  }
  return json(200, {
    ok: true,
    ...facts,
    jobId: rowId,
    providerJobId,
    filedAs: "an alternate on the shot, unselected, once provider-jobs-tick finishes it (minutes)",
  });
});

type Found =
  | { ok: true; take: TakeFacts }
  | { ok: false; status: number; body: Record<string, unknown> };

/** The dressed take on the shot, the selected one first, else the newest; and its place on the song. */
// NOTE: `ReturnType<typeof createClient>` resolves the schema param to `never` under
// Deno check, while instantiated clients carry `<any, "public", any>` — use the bare
// `SupabaseClient` default generics, same pattern as `_shared/jacketInpaintPipeline.ts`.
async function dressedTakeOf(
  user: import("https://esm.sh/@supabase/supabase-js@2.45.0").SupabaseClient,
  projectId: string,
  shotId: string,
): Promise<Found> {
  const fail = (status: number, body: Record<string, unknown>): Found => ({
    ok: false,
    status,
    body: { ok: false, ...body },
  });
  const { data: dressedRows, error: dressedErr } = await user
    .from("project_assets")
    .select("id, file_url, approval_status, created_at, metadata_json")
    .eq("shot_id", shotId)
    .eq("metadata_json->derived_from->>method", "dressed")
    .neq("approval_status", "rejected")
    .order("created_at", { ascending: false })
    .limit(20);
  if (dressedErr) return fail(500, { error: "take_lookup_failed", detail: dressedErr.message });
  const dressed = (dressedRows ?? []) as Row[];
  if (dressed.length === 0)
    return fail(422, {
      error: "no_dressed_take",
      detail:
        "this shot has no dressed take to re-shoot — dress it first (the montage wears what the video wears)",
    });
  const { data: assignments } = await user
    .from("shot_asset_assignments")
    .select("asset_id, is_primary")
    .eq("shot_id", shotId)
    .eq("is_primary", true);
  const primary = new Set(((assignments ?? []) as Row[]).map((a) => String(a.asset_id)));
  const takeRow = dressed.find((d) => primary.has(String(d.id))) ?? dressed[0];
  const takeMeta = (takeRow.metadata_json ?? {}) as Row;
  const takeSeconds = num(takeMeta.duration_seconds);
  if (takeSeconds == null)
    return fail(422, {
      error: "take_length_unknown",
      detail: "the dressed take's length is not on its record",
    });
  const { data: syncRows, error: syncErr } = await user
    .from("performance_syncs")
    .select("offset_seconds, drift_ppm, status")
    .eq("project_id", projectId)
    .eq("performance_asset_id", String(takeRow.id))
    .in("status", ["confirmed", "manual"])
    .order("updated_at", { ascending: false })
    .limit(1);
  if (syncErr) return fail(500, { error: "sync_lookup_failed", detail: syncErr.message });
  const sync = (syncRows?.[0] as Row | undefined) ?? null;
  const offset = sync ? num(sync.offset_seconds) : null;
  if (offset == null)
    return fail(422, {
      error: "take_not_in_sync",
      detail: "the dressed take's match to the song could not be found",
    });
  return {
    ok: true,
    take: {
      id: String(takeRow.id),
      bucket: str(takeMeta.bucket) ?? "project-clips",
      path: String(takeRow.file_url),
      seconds: takeSeconds,
      shows: str(takeMeta.shows),
      sync: { offsetSeconds: offset, driftPpm: num(sync?.drift_ppm) ?? 0 },
    },
  };
}
