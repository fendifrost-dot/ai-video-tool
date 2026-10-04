/**
 * Holding a restaged clip against the take it was made from — the effects. The arithmetic is storyboard/takeCheck.ts;
 * this reads both files' frames in the browser, finds his face on each (media/faceSeries.ts), and keeps the result
 * on the clip's own asset (`metadata_json.take_check`) beside the beat check.
 */
import { supabase } from "@/lib/supabase";
import { openVideo } from "@/lib/media/frames";
import { faceSeries } from "@/lib/media/faceSeries";
import { SERIES_MAX_SECONDS } from "@/lib/media/frameSeries";
import { checkAgainstTake, type TakeCheck } from "@/lib/storyboard/takeCheck";
import type { MediaAsset } from "@/lib/storyboard/media";

type FileOf = Pick<MediaAsset, "bucket" | "path">;

/**
 * Read the clip and the stretch of the take it was made from, and compare them. `window` is that stretch on the
 * take's own clock. Throws when either file cannot be read or the face reader cannot be loaded.
 */
export async function measureAgainstTake(input: { clip: FileOf; clipUrl: string; take: FileOf; takeUrl: string; window: readonly [number, number]; onStage?: (stage: string) => void }): Promise<TakeCheck> {
  const clip = await openVideo(`${input.clip.bucket}:${input.clip.path}`, input.clipUrl);
  if (!clip.probe.video) throw new Error(clip.probe.note ?? "the clip could not be read");
  if (clip.probe.video.duration > SERIES_MAX_SECONDS) throw new Error("this clip is too long to read frame by frame");
  const take = await openVideo(`${input.take.bucket}:${input.take.path}`, input.takeUrl);
  if (!take.probe.video) throw new Error(take.probe.note ?? "the take could not be read");
  const [from, to] = input.window;
  if (!(to > from)) throw new Error("the clip's record does not say which stretch of the take it was made from");
  input.onStage?.("reading his face in the clip…");
  const clipFrames = await faceSeries(clip.read, clip.probe.video);
  input.onStage?.("reading his face in the take…");
  const takeFrames = await faceSeries(take.read, take.probe.video, from, to);
  if (clipFrames.length < 4 || takeFrames.length < 4) throw new Error("too few frames could be read to compare");
  return checkAgainstTake(takeFrames, from, clipFrames, new Date().toISOString());
}

/** Keep the check on the clip. The file is not touched; everything else on the asset stays as it is. */
export async function saveTakeCheck(assetId: string, check: TakeCheck): Promise<void> {
  const { data, error } = await supabase.from("project_assets").select("metadata_json").eq("id", assetId).single();
  if (error) throw new Error(`could not read the clip's record: ${error.message}`);
  const meta = { ...((data?.metadata_json ?? {}) as Record<string, unknown>), take_check: check };
  const { error: upErr } = await supabase.from("project_assets").update({ metadata_json: meta as never }).eq("id", assetId);
  if (upErr) throw new Error(`could not keep the check: ${upErr.message}`);
}
