/**
 * Region swap — the browser's two steps (plan.ts says why):
 *   swapRegion: cut the box out of a clip, enlarged to its frame, upload it, and send it to dress-clip as a crop (the
 *     server records the job first and spends; the job runner saves the swapped crop to the library, unplaced);
 *   putRegionBack: when that job is done, draw the swapped crop back into the box over the ORIGINAL clip and file the
 *     result on the clip's shots UNSELECTED, in sync where the clip is, named as what the clip was (a montage stays a
 *     Montage on the board). Idempotent: the same job files to the same path and row.
 */
import { supabase } from "@/lib/supabase";
import { openVideo } from "@/lib/media/frames";
import { cutSize } from "@/lib/media/mp4Cut";
import { buildStoragePath, signedUrl, uploadBytesToBucket } from "@/lib/storage";
import { DERIVED_SYNC_METHOD } from "@/lib/storyboard/restage";
import type { Json } from "@/integrations/supabase/types";
import { boxOf, cropRect, REGION_SWAP_VERSION, type Box, type PixelRect } from "./plan";
import { renderCrop, renderPutBack } from "./render";

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("sign in first");
  return data.user.id;
}

async function openClip(bucket: string, path: string) {
  const url = await signedUrl(bucket as never, path, 3600);
  const { read, probe } = await openVideo(`${bucket}:${path}`, url);
  if (!probe.video) throw new Error(probe.note ?? "the clip could not be read (it has to be an MP4)");
  if (!probe.video.width || !probe.video.height) throw new Error("the clip's size is not known");
  return { read, track: probe.video };
}

/** The function's own message when it refused (the client's error is generic). */
async function invoke(name: string, body: Record<string, unknown>): Promise<Row> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    try {
      const b = (await (error as { context?: Response }).context?.json?.()) as Row | undefined;
      detail = String(b?.detail ?? b?.error ?? detail);
    } catch {
      // no body to read
    }
    throw new Error(detail);
  }
  return (data ?? {}) as Row;
}

export type SwapRegionResult = {
  rect: PixelRect;
  box: Box;
  cropPath: string;
  answer: Row;
};

/** Step 1: cut the box, enlarged, upload it, and send the swap (dryRun: the request only — the crop is still uploaded). */
export async function swapRegion(input: {
  projectId: string;
  assetId: string;
  box: Box;
  window: [number, number] | null;
  pieceIds?: string[];
  dryRun?: boolean;
  onStage?: (text: string) => void;
}): Promise<SwapRegionResult> {
  const say = input.onStage ?? (() => undefined);
  const uid = await userId();
  const { data: asset, error } = await supabase
    .from("project_assets")
    .select("id, file_url, metadata_json")
    .eq("id", input.assetId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (error || !asset) throw new Error(error?.message ?? "the clip is not in this project");
  const meta = ((asset as Row).metadata_json ?? {}) as Row;
  const bucket = str(meta.bucket) ?? "project-clips";
  say("reading the clip…");
  const clip = await openClip(bucket, String((asset as Row).file_url));
  const { width, height } = cutSize(clip.track.width!, clip.track.height!);
  const rect = cropRect(input.box, width, height);
  say("cutting the box out and enlarging it…");
  const crop = await renderCrop({
    clip,
    rect,
    width,
    height,
    onProgress: (d, t) => say(`cutting the box out… ${d}/${t}`),
  });
  const cropPath = buildStoragePath(uid, input.projectId, "swap-crops", `${input.assetId.slice(0, 8)}_${Date.now()}_crop.mp4`);
  say("uploading the crop…");
  await uploadBytesToBucket("project-clips", cropPath, crop.bytes, "video/mp4", { upsert: true });
  say(input.dryRun ? "asking for the request (nothing is sent)…" : "sending the swap…");
  const answer = await invoke("dress-clip", {
    projectId: input.projectId,
    assetId: input.assetId,
    ...(input.pieceIds?.length ? { pieceIds: input.pieceIds } : {}),
    dryRun: input.dryRun === true,
    crop: { path: cropPath, rect: boxOf(rect, width, height), window: input.window },
  });
  return { rect, box: boxOf(rect, width, height), cropPath, answer };
}

export type PutBackResult = { assetId: string; path: string; shotIds: string[]; reused: boolean; frames: number; pairing: "index" | "time" };

/** The pixel rectangle of a recorded 0–1 box on a frame (the box was cut to even pixels; this rounds back to them). */
export function rectOfBox(box: Box, width: number, height: number): PixelRect {
  const even = (n: number) => Math.round(n / 2) * 2;
  return { x: even(box.x * width), y: even(box.y * height), w: even(box.w * width), h: even(box.h * height) };
}

/** Step 2: the swapped crop of a finished job, put back into its box over the original clip, and filed. */
export async function putRegionBack(input: {
  projectId: string;
  jobId: string;
  onStage?: (text: string) => void;
}): Promise<PutBackResult> {
  const say = input.onStage ?? (() => undefined);
  const uid = await userId();
  const { data: job, error: jobErr } = await supabase
    .from("provider_jobs")
    .select("id, status, result_asset_id, variation_id, request_payload_json")
    .eq("id", input.jobId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (jobErr || !job) throw new Error(jobErr?.message ?? "the swap job is not in this project");
  const j = job as Row;
  if (j.status !== "succeeded" || !str(j.result_asset_id)) throw new Error("the swap is not finished yet");
  const { data: swappedRow } = await supabase
    .from("project_assets")
    .select("id, file_url, metadata_json")
    .eq("id", String(j.result_asset_id))
    .maybeSingle();
  const cs = (((swappedRow as Row | null)?.metadata_json ?? {}) as Row).crop_swap as Row | undefined;
  if (!swappedRow || !cs) throw new Error("the job's result is not a swapped region");
  const ofId = String(cs.of_asset_id);
  const { data: origRow } = await supabase
    .from("project_assets")
    .select("id, shot_id, file_url, metadata_json, notes")
    .eq("id", ofId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (!origRow) throw new Error("the clip the region was cut from is gone");
  const o = origRow as Row;
  const oMeta = (o.metadata_json ?? {}) as Row;
  const derived = (oMeta.derived_from ?? null) as Row | null;
  const songStart = Number(cs.song_start);
  if (!Number.isFinite(songStart)) throw new Error("the clip's place on the song was not recorded with the swap");

  say("reading the clip and the swapped crop…");
  const original = await openClip(str(oMeta.bucket) ?? "project-clips", String(o.file_url));
  const swapped = await openClip("project-clips", String((swappedRow as Row).file_url));
  const { width, height } = cutSize(original.track.width!, original.track.height!);
  const r = cs.rect as Row;
  const rect = rectOfBox({ x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h) }, width, height);
  const window = Array.isArray(cs.window) ? ([Number(cs.window[0]), Number(cs.window[1])] as [number, number]) : null;
  say("putting the swap back into the box…");
  const rendered = await renderPutBack({
    original,
    swapped,
    rect,
    window,
    width,
    height,
    onProgress: (d, t) => say(`putting the swap back… ${d}/${t}`),
  });

  const path = buildStoragePath(uid, input.projectId, "swaps", `${ofId.slice(0, 8)}_${input.jobId.slice(0, 8)}.mp4`);
  say("filing it on the shot…");
  await uploadBytesToBucket("project-clips", path, rendered.bytes, "video/mp4", { upsert: true });
  const { data: existing } = await supabase
    .from("project_assets")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("file_url", path)
    .limit(1);
  let assetId = existing?.[0]?.id ?? null;
  const reused = !!assetId;
  const settings = ((j.request_payload_json ?? {}) as Row).settings as Row | undefined;
  const dress = (settings?.dress ?? {}) as Row;
  if (!assetId) {
    const metadata = {
      bucket: "project-clips",
      mime_type: "video/mp4",
      file_size_bytes: rendered.bytes.byteLength,
      duration_seconds: rendered.seconds,
      width: rendered.width,
      height: rendered.height,
      fps: rendered.fps,
      derived_from: {
        asset_id: ofId,
        source_window: [0, rendered.seconds],
        song_start: songStart,
        // named as what the clip was: a montage whose shoes changed is still that montage on the board
        method: str(derived?.method) === "montage" ? "montage" : "dressed",
        job_id: input.jobId,
      },
      region_swap: {
        version: REGION_SWAP_VERSION,
        made_in: "browser",
        made_at: new Date().toISOString(),
        box: { x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h) },
        rect,
        window,
        crop_path: str(cs.path),
        swapped_asset_id: String((swappedRow as Row).id),
        job_id: input.jobId,
        pairing: rendered.pairing,
        frames: rendered.frames,
        prompt: str(dress.prompt),
        pieces: dress.swapped ?? null,
      },
    };
    const { data: asset, error } = await supabase
      .from("project_assets")
      .insert({
        user_id: uid,
        project_id: input.projectId,
        shot_id: str(o.shot_id),
        asset_type: "generated_clip",
        file_url: path,
        source_tool: "higgsfield",
        approval_status: "pending",
        parent_asset_id: ofId,
        footage_role: "performance",
        notes: "pieces swapped inside a box of the clip; the rest is the original footage",
        metadata_json: metadata as unknown as Json,
      } as never)
      .select("id")
      .single();
    if (error || !asset) throw new Error(`could not file the swap: ${error?.message ?? "no row returned"}`);
    assetId = (asset as { id: string }).id;
  }

  // its clock is the clip's: every frame kept
  const { data: parent } = await supabase
    .from("performance_syncs")
    .select("song_asset_id, drift_ppm")
    .eq("project_id", input.projectId)
    .eq("performance_asset_id", ofId)
    .in("status", ["confirmed", "manual"])
    .limit(1);
  const { error: syncErr } = await supabase.from("performance_syncs").upsert(
    {
      user_id: uid,
      project_id: input.projectId,
      song_asset_id: parent?.[0]?.song_asset_id ?? null,
      performance_asset_id: assetId,
      offset_seconds: songStart,
      drift_ppm: parent?.[0]?.drift_ppm ?? 0,
      method: DERIVED_SYNC_METHOD,
      status: "confirmed",
      notes: "a region swap of the clip: every frame kept, so its first frame sits where the clip's does on the song",
    } as never,
    { onConflict: "project_id,performance_asset_id" },
  );
  if (syncErr) throw new Error(`could not place the swap on the song: ${syncErr.message}`);

  // on every shot the clip is on, unselected: what the shot shows does not change until someone selects it
  const { data: rows } = await supabase
    .from("shot_asset_assignments")
    .select("shot_id, variation_id")
    .eq("project_id", input.projectId)
    .eq("asset_id", ofId);
  const shots = new Map<string, string | null>();
  if (str(o.shot_id)) shots.set(String(o.shot_id), str(j.variation_id));
  for (const a of (rows ?? []) as Row[]) shots.set(String(a.shot_id), str(a.variation_id));
  const now = new Date().toISOString();
  for (const [shotId, variationId] of shots) {
    const { error: aErr } = await supabase.from("shot_asset_assignments").upsert(
      {
        project_id: input.projectId,
        ...(variationId ? { variation_id: variationId } : {}),
        shot_id: shotId,
        asset_id: assetId,
        role: "performance",
        is_primary: false,
        source_in_seconds: null,
        source_out_seconds: null,
        sort_order: 1,
        updated_at: now,
      } as never,
      { onConflict: "shot_id,asset_id,role" },
    );
    if (aErr) throw new Error(`could not put the swap on the shot: ${aErr.message}`);
  }
  return { assetId: assetId!, path, shotIds: [...shots.keys()], reused, frames: rendered.frames, pairing: rendered.pairing };
}

/** The region-swap jobs of a clip, newest first (for the page's list). */
export async function regionSwapJobs(projectId: string, assetId: string): Promise<Row[]> {
  const { data } = await supabase
    .from("provider_jobs")
    .select("id, status, error_text, progress_note, result_asset_id, created_at, request_payload_json")
    .eq("project_id", projectId)
    .eq("request_payload_json->settings->>route", "genjutsu_swap")
    .eq("request_payload_json->settings->>sourceAssetId", assetId)
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as Row[]).filter((r) => !!(((r.request_payload_json as Row)?.settings as Row)?.dress as Row)?.crop);
}
