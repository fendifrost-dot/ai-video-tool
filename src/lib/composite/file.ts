/**
 * A finished composite becomes a take of its own: an `edited_clip` marked performance footage, made from the dressed
 * take (parent) over a plate, with the matte beside it for the record, a sync whose offset is the dressed take's
 * (the composite keeps every frame), and an UNSELECTED assignment on every shot the dressed take sits on — what the
 * shot shows does not change until someone selects it. Idempotent per file: a second filing of the same bytes is a
 * second alternate, never an overwrite.
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
  songStart: number | null;
};

export type FiledComposite = {
  assetId: string;
  path: string;
  mattePath: string;
  shotIds: string[];
};

export async function fileComposite(input: FileCompositeInput): Promise<FiledComposite> {
  const stamp = Date.now();
  const base = `${input.name}_${stamp}`;
  const path = buildStoragePath(input.userId, input.projectId, "composites", `${base}.mp4`);
  const mattePath = buildStoragePath(input.userId, input.projectId, "mattes", `${base}_alpha.mp4`);
  await uploadBytesToBucket("project-clips", mattePath, input.matte.bytes, "video/mp4", {
    upsert: false,
  });
  await uploadBytesToBucket("project-clips", path, input.render.bytes, "video/mp4", {
    upsert: false,
  });

  const metadata = {
    bucket: "project-clips",
    mime_type: "video/mp4",
    file_size_bytes: input.render.bytes.byteLength,
    duration_seconds: input.render.seconds,
    width: input.render.width,
    height: input.render.height,
    fps: input.render.fps,
    derived_from: {
      asset_id: input.dressed.id,
      source_window: [0, input.render.seconds],
      song_start: input.songStart,
      method: "composite",
    },
    composite: {
      version: 1,
      recipe: input.render.recipe,
      seed: input.render.seed,
      made_in: "browser",
      made_at: new Date(stamp).toISOString(),
      dressed_asset_id: input.dressed.id,
      take_asset_id: input.dressed.derivedFrom?.assetId ?? null,
      plate_asset_id: input.plate.id,
      plate_path: input.plate.path,
      plate_from: input.plateFrom,
      frames: input.render.frames,
      matte: {
        model: input.matte.model,
        request_id: input.matte.requestId,
        bucket: "project-clips",
        path: mattePath,
        frames: input.matte.frames,
        estimate_usd: input.matte.estimateUsd,
        source_url_host: hostOf(input.matte.url),
      },
    },
  };
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
      notes: `composite of ${input.dressed.name} over ${input.plate.name}`,
      metadata_json: metadata as unknown as Json,
    } as never)
    .select("id")
    .single();
  if (error || !asset)
    throw new Error(`could not file the composite: ${error?.message ?? "no row returned"}`);

  // the composite's clock is the dressed take's: its first frame sits where the dressed take's does on the song
  if (input.songStart != null) {
    const { data: parent } = await supabase
      .from("performance_syncs")
      .select("song_asset_id, drift_ppm")
      .eq("project_id", input.projectId)
      .eq("performance_asset_id", input.dressed.id)
      .limit(1);
    const { error: syncErr } = await supabase.from("performance_syncs").upsert(
      {
        user_id: input.userId,
        project_id: input.projectId,
        song_asset_id: parent?.[0]?.song_asset_id ?? null,
        performance_asset_id: asset.id,
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
  }

  // on every shot the dressed take is on (a grouped window covers several), unselected
  const { data: rows } = await supabase
    .from("shot_asset_assignments")
    .select("shot_id")
    .eq("project_id", input.projectId)
    .eq("asset_id", input.dressed.id)
    .eq("role", "performance");
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
        asset_id: asset.id,
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
  return { assetId: asset.id, path, mattePath, shotIds };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
