/**
 * A finished composite becomes a take of its own: an `edited_clip` marked performance footage, made from the dressed
 * take (parent) over a plate, with the matte beside it for the record, a sync whose offset is the dressed take's
 * (the composite keeps every frame), and an UNSELECTED assignment on every shot the dressed take sits on in this
 * variation — what the shot shows does not change until someone selects it.
 *
 * Filing is idempotent for one render: the files are named by the dressed take, the plate and the grain's seed and
 * written with upsert, the asset row is found again by its path before a new one is inserted, and the sync and the
 * assignments are upserts — so a filing that failed half-way (an asset with no sync, a sync with no assignment) is
 * finished by running it again with the same render, not by paying for another matte.
 */
import { supabase } from "@/lib/supabase";
import { buildStoragePath, uploadBytesToBucket } from "@/lib/storage";
import { DERIVED_SYNC_METHOD } from "@/lib/storyboard/restage";
import type { MediaAsset } from "@/lib/storyboard/media";
import type { Json } from "@/integrations/supabase/types";
import type { RenderResult } from "./render";

export type FileCompositeInput = {
  projectId: string;
  variationId: string | null;
  userId: string;
  /** A short name for the file: the run and the shot. */
  name: string;
  /** The shot this was made on; the dressed take's other shots are added from its assignments. */
  shotId: string;
  dressed: MediaAsset;
  plate: MediaAsset;
  /** The moving plate used instead of the still's pixels, when one was. */
  plateVideo?: MediaAsset | null;
  plateFrom: "scene" | "location";
  matte: {
    model: string;
    requestId: string | null;
    bytes: Uint8Array;
    frames: number;
    estimateUsd: number;
    url: string;
  };
  render: RenderResult;
  /** The song time of the composite's first frame: the dressed take's. Required — a take with no place on the song is not filed. */
  songStart: number;
};

export type FiledComposite = {
  assetId: string;
  path: string;
  mattePath: string;
  shotIds: string[];
  reused: boolean;
};

/** What the asset row records of the composite — pure, so it can be held against what the storyboard reads back. */
export function compositeMetadata(
  input: Omit<FileCompositeInput, "userId" | "projectId" | "variationId" | "shotId" | "name"> & {
    mattePath: string;
    madeAt: string;
  },
): Record<string, unknown> {
  return {
    bucket: "project-clips",
    mime_type: "video/mp4",
    file_size_bytes: input.render.bytes.byteLength,
    duration_seconds: input.render.seconds,
    width: input.render.width,
    height: input.render.height,
    fps: input.render.fps,
    colr: input.render.colr,
    derived_from: {
      asset_id: input.dressed.id,
      source_window: [0, input.render.seconds],
      song_start: input.songStart,
      method: "composite",
    },
    composite: {
      version: 2,
      recipe: input.render.recipe,
      seed: input.render.seed,
      made_in: "browser",
      made_at: input.madeAt,
      dressed_asset_id: input.dressed.id,
      take_asset_id: input.dressed.derivedFrom?.assetId ?? null,
      plate_asset_id: input.plate.id,
      plate_path: input.plate.path,
      plate_from: input.plateFrom,
      // the moving plate he went over, when there was one (its frames, not the still's pixels)
      plate_video_asset_id: input.plateVideo?.id ?? null,
      plate_video_path: input.plateVideo?.path ?? null,
      plate_frames: input.render.plateFrames,
      camera: input.render.camera,
      alpha_pairing: input.render.pairing,
      frames: input.render.frames,
      matte: {
        model: input.matte.model,
        request_id: input.matte.requestId,
        bucket: "project-clips",
        path: input.mattePath,
        frames: input.matte.frames,
        estimate_usd: input.matte.estimateUsd,
        source_url_host: hostOf(input.matte.url),
      },
    },
  };
}

/** The file names of one render: the same render files to the same paths. */
export function compositePaths(
  input: Pick<FileCompositeInput, "userId" | "projectId" | "name"> & {
    dressedId: string;
    plateId: string;
    /** The moving plate's id, when one was used: a composite over it is another file than one over the still. */
    plateVideoId?: string | null;
    seed: number;
  },
): { path: string; mattePath: string } {
  const plate = input.plateVideoId ? `${input.plateId.slice(0, 8)}m${input.plateVideoId.slice(0, 8)}` : input.plateId.slice(0, 8);
  const base = `${input.name}_${input.dressedId.slice(0, 8)}_${plate}_${input.seed}`;
  return {
    path: buildStoragePath(input.userId, input.projectId, "composites", `${base}.mp4`),
    mattePath: buildStoragePath(input.userId, input.projectId, "mattes", `${base}_alpha.mp4`),
  };
}

export async function fileComposite(input: FileCompositeInput): Promise<FiledComposite> {
  const { path, mattePath } = compositePaths({
    userId: input.userId,
    projectId: input.projectId,
    name: input.name,
    dressedId: input.dressed.id,
    plateId: input.plate.id,
    plateVideoId: input.plateVideo?.id ?? null,
    seed: input.render.seed,
  });
  await uploadBytesToBucket("project-clips", mattePath, input.matte.bytes, "video/mp4", {
    upsert: true,
  });
  await uploadBytesToBucket("project-clips", path, input.render.bytes, "video/mp4", {
    upsert: true,
  });

  // the row for this file, if a half-finished filing already wrote it
  const { data: existing } = await supabase
    .from("project_assets")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("file_url", path)
    .limit(1);
  let assetId = existing?.[0]?.id ?? null;
  const reused = !!assetId;
  if (!assetId) {
    const metadata = compositeMetadata({ ...input, mattePath, madeAt: new Date().toISOString() });
    const { data: asset, error } = await supabase
      .from("project_assets")
      .insert({
        user_id: input.userId,
        project_id: input.projectId,
        shot_id: input.shotId,
        asset_type: "edited_clip",
        file_url: path,
        source_tool: "fal",
        approval_status: "pending",
        parent_asset_id: input.dressed.id,
        footage_role: "performance",
        notes: `composite of ${input.dressed.name} over ${input.plateVideo ? `${input.plateVideo.name} (moving plate of ${input.plate.name})` : input.plate.name}`,
        metadata_json: metadata as unknown as Json,
      } as never)
      .select("id")
      .single();
    if (error || !asset)
      throw new Error(`could not file the composite: ${error?.message ?? "no row returned"}`);
    assetId = asset.id;
  }

  // the composite's clock is the dressed take's: its first frame sits where the dressed take's does on the song
  const { data: parent } = await supabase
    .from("performance_syncs")
    .select("song_asset_id, drift_ppm")
    .eq("project_id", input.projectId)
    .eq("performance_asset_id", input.dressed.id)
    .in("status", ["confirmed", "manual"])
    .limit(1);
  const { error: syncErr } = await supabase.from("performance_syncs").upsert(
    {
      user_id: input.userId,
      project_id: input.projectId,
      song_asset_id: parent?.[0]?.song_asset_id ?? null,
      performance_asset_id: assetId,
      offset_seconds: input.songStart,
      drift_ppm: parent?.[0]?.drift_ppm ?? 0,
      method: DERIVED_SYNC_METHOD,
      status: "confirmed",
      notes:
        "composited from the dressed take: every frame kept, so its first frame sits where the dressed take's does on the song",
    },
    { onConflict: "project_id,performance_asset_id" },
  );
  if (syncErr) throw new Error(`could not place the composite on the song: ${syncErr.message}`);

  // on every shot the dressed take is on in this variation (a grouped window covers several), unselected
  let q = supabase
    .from("shot_asset_assignments")
    .select("shot_id")
    .eq("project_id", input.projectId)
    .eq("asset_id", input.dressed.id)
    .eq("role", "performance");
  if (input.variationId) q = q.eq("variation_id", input.variationId);
  const { data: rows } = await q;
  const shotIds = [
    ...new Set([input.shotId, ...((rows ?? []) as { shot_id: string }[]).map((r) => r.shot_id)]),
  ];
  const now = new Date().toISOString();
  for (const shotId of shotIds) {
    const { error: aErr } = await supabase.from("shot_asset_assignments").upsert(
      {
        project_id: input.projectId,
        ...(input.variationId ? { variation_id: input.variationId } : {}),
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
    if (aErr) throw new Error(`could not put the composite on the shot: ${aErr.message}`);
  }
  return { assetId, path, mattePath, shotIds, reused };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
