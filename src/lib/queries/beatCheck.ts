/**
 * Measuring a clip against the script it was asked for with — the effects. The arithmetic is storyboard/beatCheck.ts;
 * this reads the file's frames in the browser, runs it, and keeps the result on the clip's own asset
 * (`metadata_json.beat_check`), so the measurement is made once and is there for every page that shows the clip.
 */
import { supabase } from "@/lib/supabase";
import { openVideo } from "@/lib/media/frames";
import { frameSeries, SERIES_MAX_SECONDS } from "@/lib/media/frameSeries";
import { measureBeats, type AskedChange, type BeatCheck } from "@/lib/storyboard/beatCheck";
import type { MediaAsset } from "@/lib/storyboard/media";

/** Decode the clip and hold it against what was asked. Throws when the browser cannot read the file. */
export async function measureClip(asset: Pick<MediaAsset, "bucket" | "path" | "durationSeconds">, url: string, asked: readonly AskedChange[]): Promise<BeatCheck> {
  const { read, probe } = await openVideo(`${asset.bucket}:${asset.path}`, url);
  if (!probe.video) throw new Error(probe.note ?? "the clip could not be read");
  if (probe.video.duration > SERIES_MAX_SECONDS) throw new Error("this file is too long to measure frame by frame");
  const frames = await frameSeries(read, probe.video);
  if (frames.length < 4) throw new Error("the clip has too few frames to measure");
  return measureBeats(frames, asked, new Date().toISOString());
}

/** Keep the measurement on the clip. The file is not touched; everything else on the asset stays as it is. */
export async function saveBeatCheck(assetId: string, check: BeatCheck): Promise<void> {
  const { data, error } = await supabase.from("project_assets").select("metadata_json").eq("id", assetId).single();
  if (error) throw new Error(`could not read the clip's record: ${error.message}`);
  const meta = { ...((data?.metadata_json ?? {}) as Record<string, unknown>), beat_check: check };
  const { error: upErr } = await supabase.from("project_assets").update({ metadata_json: meta as never }).eq("id", assetId);
  if (upErr) throw new Error(`could not keep the measurement: ${upErr.message}`);
}
