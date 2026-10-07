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
import { BatchShotSchema, PROVIDER_RATES, estimateShotUsd, submitShot, submitStills, type BatchShot, type MadeFrom, type SubmitResult } from "@/lib/worldBatch";
import { browserRunnerDeps } from "@/lib/worldBatch/browserDeps";
import { applyAssignmentOps, fetchAssignments } from "@/lib/queries/storyboard";
import { canonicalWords, continuitySource, referencePrompt, type ContinuityEntity, type ShotContinuity } from "@/lib/continuity/entities";
import { writtenFrom, type StoryboardBox } from "./boxes";
import { activeVariationIdOf } from "@/lib/queries/variations";
import { resolveEvents, type EventClock } from "./events";
import { planAssign } from "./media";
import { assertPlanCovers, temporalPlan, type TemporalPlan } from "./temporal";

/** Every job the storyboard starts carries this run id, so the box jobs can be told apart from a Runs-page batch. */
export const STORYBOARD_RUN = "storyboard";
export const DEFAULT_BOX_LOOK = "film_bar_v1";

/** A performance box is his real take: what is generated for it is the world AROUND him, never a stand-in for him. */
const PLATE_LINE = "The centre foreground is empty and clear: no person stands there.";
const EMPTY_SET = "An empty set, photographed with nobody in it: no people, no figures, no faces, no reflections of people.";
/**
 * Every picture the storyboard draws: an image model left to itself puts a maker's mark on anything that has one in
 * the world (the first live section's white sneakers came back with a sportswear logo, its runway with lettering on
 * the wall). A cutaway that shows somebody's trademark cannot be released.
 *
 * It forbids the marks nobody asked for — not one the shot itself names. A treatment that cuts a monogram into a
 * forest floor is asking for that mark; a blanket "no logos" appended after its description tells the model to leave
 * out the subject of the picture.
 */
export const NO_MARKS = "Nothing in the picture carries a logo, a brand mark or readable lettering other than what this description itself names.";
/**
 * The picture is the whole frame, and it is the scene — not a photograph of film. Asked for a "film" look, an image
 * model sometimes draws the film too: a dark border, a rounded frame line, and on a dark scene the scan itself
 * (a glow leaking in at the edges, scratches, a hair). The clip made from it carries that through every frame of the
 * shot (Astra's second look at the first live section: "a thin dark rectangular border surrounds the image").
 */
export const FULL_BLEED =
  "The picture fills the frame from edge to edge: no border, no frame line, no rounded corners, no letterbox bars. " +
  "It is the scene itself, not a scan of a film frame: no film edge, no light leak at the edges, no scratches, dust or hair on the picture.";
/**
 * A cutaway set in one of the project's places is a picture of ITS SUBJECT in that place. The place's canonical words
 * describe the whole room, and an image model handed them draws the whole room — the first cutaway drawn this way
 * (white sneakers on the runway) came back as an establishing shot of the runway with the sneakers small in a corner.
 */
export const SUBJECT_FIRST = "The picture is of this shot's own subject, close enough to fill the frame; the place is what is seen around and behind it, only as far as the frame reaches.";
/** A place said in fewer words than this is a label ("backstage"), not a picture: the scene is needed to draw it. */
const PLACE_WORDS = 6;

/**
 * The picture drawn for a PERFORMANCE shot: the place he performs in, with nobody in it. The scene of such a shot is
 * written about him ("he performs on the runway…"), and an image model handed that sentence draws a man — a
 * stranger the take would then be restaged next to. So the place is taken from where it is said on its own: the
 * frame the director wrote, else the place the writer named; only when neither says enough is the scene used, and
 * then it is told plainly to leave him out.
 */
export function placePrompt(spec: Pick<StoryboardBox["spec"], "openingFrame" | "environment" | "purpose" | "performanceDirection" | "origin">, canonicalPlace = ""): string {
  // a shot set in one of the project's locations is drawn from THAT location's words — the same in every such shot
  if (canonicalPlace.trim()) return `${EMPTY_SET} ${canonicalPlace.trim()} ${PLATE_LINE}`;
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
export function boxShot(box: StoryboardBox, lyricLines: readonly LyricLine[] | undefined, opts: BoxShotOptions = {}): BatchShot {
  const isPerformance = box.spec.shotType === "performance";
  // A shot that points at continuity entities is generated FROM them. A request built without them would quietly
  // recreate the place from the shot's own prose — the thing the entities exist to stop.
  if (pointsAtEntities(box.spec) && !opts.continuity) {
    throw new Error("This shot points at the project's continuity entities and the request was built without them. Nothing was generated.");
  }
  const source = opts.continuity ? continuitySource(opts.continuity, { forPlate: isPerformance }) : null;
  const canonicalPlace = isPerformance && opts.continuity?.location ? canonicalWords(opts.continuity.location) : "";
  // the compiler writes world shots for boxes that are not real performance; a performance box asks for its place,
  // drawn empty (the frame field carries the whole prompt, so nothing about him reaches the image model)
  const place = isPerformance ? placePrompt(box.spec, canonicalPlace) : "";
  // A cutaway set in one of the project's locations says the place ONCE — in the location's own words, below. The
  // shot's own sentence about the place (a writer fills that field with a paraphrase of the entity) is left out:
  // two descriptions of one room dilute the subject and are never quite the same room.
  const heldPlace = !isPerformance && !!opts.continuity?.location && !!canonicalWords(opts.continuity.location);
  const spec = isPerformance
    ? { ...box.spec, shotType: "b_roll" as const, kind: "broll" as const, origin: "override" as const, openingFrame: place, performanceDirection: box.spec.performanceDirection || box.spec.purpose, requiredElements: [] }
    : heldPlace
      ? { ...box.spec, environment: { ...box.spec.environment, description: "", location: "" } }
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
  // the entities' canonical words: identical in every shot that points at the same entity (the place of a
  // performance shot is already its whole picture, above)
  for (const line of source?.lines ?? []) {
    if (canonicalPlace && line.includes(canonicalPlace)) continue;
    if (!shot.prompt.includes(line)) shot.prompt = `${shot.prompt.trim()} ${line}`;
  }
  if (heldPlace && !shot.prompt.includes(SUBJECT_FIRST)) shot.prompt = `${shot.prompt.trim()} ${SUBJECT_FIRST}`;
  for (const line of [NO_MARKS, FULL_BLEED]) if (!shot.prompt.includes(line)) shot.prompt = `${shot.prompt.trim()} ${line}`;
  return shot;
}

export type BoxShotOptions = {
  lookPresetId?: string;
  stillPath?: string | null;
  aspect?: ProjectAspect;
  /** What the shot's continuity references resolve to (continuity/entities.ts resolveContinuity). Required when it has any. */
  continuity?: ShotContinuity;
};

/** True when the shot record points at a place, a prop or a lighting state of the project. */
export function pointsAtEntities(spec: Pick<StoryboardBox["spec"], "continuity">): boolean {
  const c = spec.continuity;
  return !!c && (!!c.location || (c.props?.length ?? 0) > 0 || !!c.lighting);
}

/** The route a cutaway's clip is made on (image → motion). */
export const CLIP_ROUTE = "still_kling" as const;

/**
 * What generating a clip for this box does with its timed events. A shot with change that must be DRAWN is not
 * handed to a model that draws one state: the plan comes back "refused" with the mechanisms on offer, unless the
 * director asked for the beats in order (`allowOrdered`). Performance shots are restaged — see restage.ts.
 */
export function clipTemporalPlan(box: StoryboardBox, clock: EventClock = {}, opts: { allowOrdered?: boolean } = {}): TemporalPlan {
  const window = { start: box.start, end: box.end };
  return temporalPlan({ route: CLIP_ROUTE, resolved: resolveEvents(box.spec.events, window, clock), shotSeconds: box.end - box.start, allowOrdered: opts.allowOrdered });
}

/** What the image of this box is, when the box changes while it plays: the state it opens in. */
export function imageTemporalPlan(box: StoryboardBox, clock: EventClock = {}): TemporalPlan {
  return temporalPlan({ route: "image", resolved: resolveEvents(box.spec.events, { start: box.start, end: box.end }, clock), shotSeconds: box.end - box.start });
}

/**
 * The clip request of a box with its timed events accounted for. Throws on a refused plan: nothing reaches a
 * provider flattened. "ordered" puts the beats, in order and without times, where the motion sentence goes and
 * marks the request so the job says how it was asked for.
 */
export function clipShot(
  box: StoryboardBox,
  lyricLines: readonly LyricLine[] | undefined,
  opts: BoxShotOptions & { temporal: TemporalPlan },
): BatchShot {
  const shot = boxShot(box, lyricLines, opts);
  const plan = opts.temporal;
  if (plan.mode === "refused") throw new Error(`${plan.reason} Nothing was generated.`);
  assertPlanCovers(box.spec, plan);
  if (plan.mode === "ordered") {
    if (!plan.script) throw new Error("This shot's beats say nothing a clip could show.");
    return BatchShotSchema.parse({ ...shot, motion: [shot.motion, plan.script].filter(Boolean).join(" "), temporal: { mode: "ordered", beats: plan.beats, measured: false, asked: plan.asked } });
  }
  if (plan.mode === "timed_script") {
    // no image-to-motion route takes a timed script today; if one is declared, this is where its form goes
    return BatchShotSchema.parse({ ...shot, motion: [shot.motion, plan.script].filter(Boolean).join(" "), temporal: { mode: "timed_script", beats: plan.beats, measured: plan.measured, asked: plan.asked } });
  }
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

/** What a box was when a job was asked of it — kept on the job (runner.ts `MadeFrom`). */
export function madeFromBox(box: StoryboardBox): MadeFrom {
  const w = writtenFrom(box);
  return { treatment: w.treatment, sceneWrittenAt: w.at, shotUpdatedAt: box.updatedAt || null };
}

function runContext(projectId: string, box: StoryboardBox, lookPresetId: string | undefined) {
  const { id, look } = resolveLookPreset(lookPresetId ?? DEFAULT_BOX_LOOK);
  return { projectId, variationId: box.variationId, runId: STORYBOARD_RUN, lookPresetId: id, look, shotIds: { [box.key]: box.id }, madeFrom: { [box.key]: madeFromBox(box) } };
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
    // the box's own variation: the still goes on the board it was drawn for, whatever is active by now
    const variationId = input.box.variationId ?? (await activeVariationIdOf(input.projectId));
    if (!variationId) throw new Error("the box belongs to no video variation");
    const ops = planAssign({
      assignments: await fetchAssignments(input.projectId, variationId),
      shotId: input.box.id,
      assetId,
      role: "generated_image",
      select: input.select && path === input.picked,
    });
    await applyAssignmentOps(input.projectId, ops, variationId);
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
  /** What the shot's continuity references resolve to. */
  continuity?: ShotContinuity;
}): Promise<BoxImageResult> {
  const deps = await browserRunnerDeps();
  const shot = boxShot(input.box, input.lyricLines, { lookPresetId: input.lookPresetId, aspect: input.aspect, continuity: input.continuity });
  const res = await submitStills(shot, { ...runContext(input.projectId, input.box, input.lookPresetId), selectStill: input.select ?? true }, deps);
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
  /** What is done with the box's timed events (clipTemporalPlan). A refused plan never gets here. */
  temporal: TemporalPlan;
  /** What the shot's continuity references resolve to. */
  continuity?: ShotContinuity;
}): Promise<SubmitResult> {
  const deps = await browserRunnerDeps();
  const shot = clipShot(input.box, input.lyricLines, { lookPresetId: input.lookPresetId, stillPath: input.stillPath, aspect: input.aspect, temporal: input.temporal, continuity: input.continuity });
  const result = await submitShot(shot, runContext(input.projectId, input.box, input.lookPresetId), deps);
  // an image drawn on the way to the clip belongs to the box too (as a version; the clip will be what shows)
  if (!input.stillPath && result.stillPath) {
    await attachStills({ projectId: input.projectId, box: input.box, paths: [result.stillPath], picked: result.stillPath, select: true }).catch(() => undefined);
  }
  return result;
}

/** The run id of pictures drawn for a continuity entity (not for a shot). */
export const ENTITY_RUN = "continuity";

/** The one picture request of an entity's own reference picture. Pure. */
export function entityShot(entity: ContinuityEntity, aspect: ProjectAspect = DEFAULT_PROJECT_ASPECT): BatchShot {
  const prompt = [referencePrompt(entity), NO_MARKS, FULL_BLEED].join(" ");
  // a place is drawn in the project's frame; an object is drawn square, whole
  return BatchShotSchema.parse({ id: `ent_${entity.key}`, kind: entity.kind === "location" ? "plate" : "world", route: CLIP_ROUTE, aspect: entity.kind === "location" ? stillRequestAspect(aspect).aspect : "1:1", prompt, motion: "", stills: 2 });
}

/**
 * Draw reference pictures of an entity from its canonical words. They are filed as the project's own assets (the
 * generator does that) and their ids are handed back for the entity to keep; nothing is approved here.
 */
export async function generateEntityReference(input: { projectId: string; entity: ContinuityEntity; aspect?: ProjectAspect }): Promise<{ assetIds: string[]; costUsd: number | null }> {
  const deps = await browserRunnerDeps();
  const shot = entityShot(input.entity, input.aspect);
  const { id, look } = resolveLookPreset(DEFAULT_BOX_LOOK);
  const res = await submitStills(shot, { projectId: input.projectId, variationId: input.entity.variationId, runId: ENTITY_RUN, lookPresetId: id, look, shotIds: {}, selectStill: false, entityId: input.entity.id }, deps);
  const { data, error } = await supabase.from("project_assets").select("id, file_url").eq("project_id", input.projectId).in("file_url", res.whole);
  if (error) throw new Error(`could not find the generated picture: ${error.message}`);
  const byPath = new Map((data ?? []).map((r) => [r.file_url, r.id]));
  const assetIds = res.whole.map((p) => byPath.get(p)).filter((x): x is string => !!x);
  if (assetIds[0]) await deps.updateJob(res.rowId, { result_asset_id: assetIds[0] });
  return { assetIds, costUsd: res.costUsd };
}
