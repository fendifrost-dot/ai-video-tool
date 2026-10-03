/**
 * Generating for ONE storyboard box: an image, or a clip.
 *
 * Nothing new is invented here. A box compiles to one shot of the same shots.json dialect the Runs page and the
 * scripts use (shot compiler → world batch), and is submitted through the same runner: the job is recorded before
 * any money moves, a still that came back as stacked panels never reaches the box or the motion model, and the
 * finished clip is filed under the box's own record.
 */
import { supabase } from "@/lib/supabase";
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import { DEFAULT_PROJECT_ASPECT, stillRequestAspect, type ProjectAspect } from "@/lib/project/aspect";
import { compileToWorldBatch, phrasesFromShotSpecs, resolveLookPreset } from "@/lib/shotCompiler";
import { BatchShotSchema, PROVIDER_RATES, estimateShotUsd, submitShot, submitStills, type BatchShot, type SubmitResult } from "@/lib/worldBatch";
import { browserRunnerDeps } from "@/lib/worldBatch/browserDeps";
import { applyAssignmentOps, fetchAssignments } from "@/lib/queries/storyboard";
import type { StoryboardBox } from "./boxes";
import { planAssign } from "./media";

/** Every job the storyboard starts carries this run id, so the box jobs can be told apart from a Runs-page batch. */
export const STORYBOARD_RUN = "storyboard";
export const DEFAULT_BOX_LOOK = "film_bar_v1";

/** A performance box is his real take: what is generated for it is the world AROUND him, never a stand-in for him. */
const PLATE_LINE = "The centre foreground is empty and clear: no person stands there.";
const EMPTY_SET = "An empty set, photographed with nobody in it: no people, no figures, no faces, no reflections of people.";
/** A place said in fewer words than this is a label ("backstage"), not a picture: the scene is needed to draw it. */
const PLACE_WORDS = 6;

/**
 * The picture drawn for a PERFORMANCE shot: the place he performs in, with nobody in it. The scene of such a shot is
 * written about him ("he performs on the runway…"), and an image model handed that sentence draws a man — a
 * stranger the take would then be restaged next to. So the place is taken from where it is said on its own: the
 * frame the director wrote, else the place the writer named; only when neither says enough is the scene used, and
 * then it is told plainly to leave him out.
 */
export function placePrompt(spec: Pick<StoryboardBox["spec"], "openingFrame" | "environment" | "purpose" | "performanceDirection" | "origin">): string {
  const frame = spec.openingFrame?.trim();
  const named = (spec.environment.description || spec.environment.location || "").trim();
  const scene = (spec.origin === "override" && spec.performanceDirection.trim() ? spec.performanceDirection : spec.purpose).trim();
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const place = frame || (words(named) >= PLACE_WORDS ? named : "");
  const body = place
    ? place
    : `${named ? `${named.replace(/[.;]*$/, "")}. ` : ""}Only the place of this scene, without the performer it mentions: ${scene}`;
  return `${EMPTY_SET} ${body.replace(/\s+$/, "")}${/[.!?]$/.test(body.trim()) ? "" : "."} ${PLATE_LINE}`;
}

/**
 * The one shot a box compiles to. `stillPath` set = the box already has its image; the clip is made from it.
 * Throws when the box has nothing to draw (no scene text at all).
 */
export function boxShot(box: StoryboardBox, lyricLines: readonly LyricLine[] | undefined, opts: { lookPresetId?: string; stillPath?: string | null; aspect?: ProjectAspect } = {}): BatchShot {
  const isPerformance = box.spec.shotType === "performance";
  // the compiler writes world shots for boxes that are not real performance; a performance box asks for its place,
  // drawn empty (the frame field carries the whole prompt, so nothing about him reaches the image model)
  const place = isPerformance ? placePrompt(box.spec) : "";
  const spec = isPerformance
    ? { ...box.spec, shotType: "b_roll" as const, kind: "broll" as const, origin: "override" as const, openingFrame: place, performanceDirection: box.spec.performanceDirection || box.spec.purpose, requiredElements: [] }
    : box.spec;
  const phrases = phrasesFromShotSpecs([spec], lyricLines ?? [], { stillPaths: opts.stillPath ? { [box.key]: opts.stillPath } : undefined });
  // the picture is asked for in the project's frame (or the nearest shape the image model has; see aspect.ts)
  const aspectDefault = stillRequestAspect(opts.aspect ?? DEFAULT_PROJECT_ASPECT).aspect;
  const compiled = compileToWorldBatch({ phrases, lookPresetId: opts.lookPresetId ?? DEFAULT_BOX_LOOK, aspectDefault }).shots[0];
  if (!compiled) throw new Error("This box has no scene to generate from — write or regenerate its scene first.");
  const shot = BatchShotSchema.parse({ ...compiled, ...(opts.stillPath ? { still_path: opts.stillPath } : {}) });
  if (isPerformance && !shot.prompt.includes(PLATE_LINE)) shot.prompt = `${shot.prompt.trim()} ${PLATE_LINE}`;
  // the place is still: its motion sentence is the camera's, never a person's action
  if (isPerformance) shot.motion = "";
  return shot;
}

/** List price of "Generate image" for a box (the candidates the generator draws). */
export function imageEstimateUsd(shot: BatchShot): number {
  return PROVIDER_RATES.still_usd_each * shot.stills;
}

/** List price of "Generate clip": the motion, plus the image when the box has none yet. */
export function clipEstimateUsd(shot: BatchShot): number {
  return estimateShotUsd(shot);
}

function runContext(projectId: string, box: StoryboardBox, lookPresetId: string | undefined) {
  const { id, look } = resolveLookPreset(lookPresetId ?? DEFAULT_BOX_LOOK);
  return { projectId, runId: STORYBOARD_RUN, lookPresetId: id, look, shotIds: { [box.key]: box.id } };
}

/**
 * The stills the generator made are already project assets (it files them itself). Put them on the box: file them
 * under the box's record and assign them as generated images, the picked one selected when `select` is set.
 */
export async function attachStills(input: { projectId: string; box: StoryboardBox; paths: string[]; picked: string | null; select: boolean }): Promise<string[]> {
  if (input.paths.length === 0) return [];
  const { data, error } = await supabase.from("project_assets").select("id, file_url").eq("project_id", input.projectId).in("file_url", input.paths);
  if (error) throw new Error(`could not find the generated image: ${error.message}`);
  const byPath = new Map((data ?? []).map((r) => [r.file_url, r.id]));
  const ids: string[] = [];
  // the picked still first, so it is the one selected
  const ordered = [...input.paths].sort((a, b) => Number(b === input.picked) - Number(a === input.picked));
  for (const path of ordered) {
    const assetId = byPath.get(path);
    if (!assetId) continue;
    ids.push(assetId);
    await supabase.from("project_assets").update({ shot_id: input.box.id }).eq("id", assetId);
    const ops = planAssign({
      assignments: await fetchAssignments(input.projectId),
      shotId: input.box.id,
      assetId,
      role: "generated_image",
      select: input.select && path === input.picked,
    });
    await applyAssignmentOps(input.projectId, ops);
  }
  return ids;
}

export type BoxImageResult = { assetIds: string[]; picked: string; candidates: number; rejected: number; costUsd: number | null };

/** "Generate image": draw the box's scene, check it, and put it on the box as the selected media. */
export async function generateBoxImage(input: {
  projectId: string;
  box: StoryboardBox;
  lyricLines: readonly LyricLine[] | undefined;
  lookPresetId?: string;
  /** The project's frame. */
  aspect?: ProjectAspect;
  /** false = keep what the shot shows (a performance shot keeps showing its take; the image is the place to restage it in). */
  select?: boolean;
}): Promise<BoxImageResult> {
  const deps = await browserRunnerDeps();
  const shot = boxShot(input.box, input.lyricLines, { lookPresetId: input.lookPresetId, aspect: input.aspect });
  const res = await submitStills(shot, runContext(input.projectId, input.box, input.lookPresetId), deps);
  // on a performance shot the image is the PLACE the take can be restaged in — the take stays what the shot shows
  const assetIds = await attachStills({ projectId: input.projectId, box: input.box, paths: res.whole, picked: res.picked, select: input.select ?? true });
  // the job points at the image it produced, so nothing downstream mistakes it for a clip still waiting to be saved
  if (assetIds[0]) await deps.updateJob(res.rowId, { result_asset_id: assetIds[0] });
  return { assetIds, picked: res.picked!, candidates: res.candidates.length, rejected: res.candidates.length - res.whole.length, costUsd: res.costUsd };
}

/**
 * "Generate clip": animate the box's image (drawing one first if the box has none). The clip arrives later — the
 * job is polled and its result filed under the box (queries/boxJobs.ts).
 */
export async function generateBoxClip(input: {
  projectId: string;
  box: StoryboardBox;
  lyricLines: readonly LyricLine[] | undefined;
  lookPresetId?: string;
  /** Storage path of the box's selected generated image, when it has one. */
  stillPath: string | null;
  /** The project's frame. */
  aspect?: ProjectAspect;
}): Promise<SubmitResult> {
  const deps = await browserRunnerDeps();
  const shot = boxShot(input.box, input.lyricLines, { lookPresetId: input.lookPresetId, stillPath: input.stillPath, aspect: input.aspect });
  const result = await submitShot(shot, runContext(input.projectId, input.box, input.lookPresetId), deps);
  // an image drawn on the way to the clip belongs to the box too (as a version; the clip will be what shows)
  if (!input.stillPath && result.stillPath) {
    await attachStills({ projectId: input.projectId, box: input.box, paths: [result.stillPath], picked: result.stillPath, select: true }).catch(() => undefined);
  }
  return result;
}
