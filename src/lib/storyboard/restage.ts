/**
 * "Restage the take" — the storyboard's clip for a PERFORMANCE shot.
 *
 * A performance shot is the real take. Its clip is therefore not a new performer: it is the same stretch of the same
 * take, re-shot inside the shot's scene by a video-to-video model (Seedance reference-to-video — the one route that
 * holds his face and wardrobe). What goes to the model is only the part of the take this shot plays, cut out of the
 * master in the browser, to the frame (media/mp4Cut.ts).
 *
 * The result keeps the take's place on the song. It is filed as a take of its own with a sync of its own — its first
 * frame sits at the song time the cut began — so the storyboard, Review and "Check this cut" address it by the song
 * clock exactly as they address the master: never by a stored range, never stretched. It is never offered as the
 * base layer of other shots (it is a version of one moment, not a take of the song).
 */
import { canonicalWords, type ShotContinuity } from "@/lib/continuity/entities";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/integrations/supabase/aliases";
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import { openVideo } from "@/lib/media/frames";
import { canCutExact, cutVideoExact, shownAt } from "@/lib/media/mp4Cut";
import { trimVideo } from "@/lib/media/mp4Trim";
import { DEFAULT_PROJECT_ASPECT, stillRequestAspect, type ProjectAspect } from "@/lib/project/aspect";
import { buildStoragePath, signedUrl, uploadBytesToBucket } from "@/lib/storage";
import { performanceToSong } from "@/lib/sync/performanceSync";
import { BatchShotSchema, seedanceUsd, submitShot, type BatchShot, type SubmitResult } from "@/lib/worldBatch";
import { browserRunnerDeps } from "@/lib/worldBatch/browserDeps";
import type { StoryboardBox } from "./boxes";
import { resolveEvents, type EventClock } from "./events";
import { pointsAtEntities, DEFAULT_BOX_LOOK, STORYBOARD_RUN } from "./generate";
import { assertPlanCovers, scriptOf, temporalPlan, type TemporalPlan } from "./temporal";
import type { BoxMediaItem, MediaAsset, TakeSync } from "./media";
import { resolveLookPreset } from "@/lib/shotCompiler";

/** What the model accepts as a source, seconds. */
export const RESTAGE_MIN_SECONDS = 4;
export const RESTAGE_MAX_SECONDS = 12;
export const RESTAGE_RESOLUTION = "720p" as const;
/** A cut opens on the frame showing when the shot starts — up to a frame before it. The cut is that much longer. */
export const FRAME_ALLOWANCE = 0.042;
export const DERIVED_SYNC_METHOD = "derived";

export type RestageSource = { take: MediaAsset; sync: TakeSync; takeIn: number; takeOut: number };

/** The take a performance shot plays: the one showing (when it is a real take), else the base layer. */
export function restageSource(items: readonly BoxMediaItem[], syncs: readonly TakeSync[]): { ok: true; source: RestageSource } | { ok: false; why: string } {
  const real = items.filter((i) => i.role === "performance" && i.kind === "video" && !i.asset.derivedFrom);
  const item = real.find((i) => i.selected) ?? real.find((i) => i.base) ?? real[0];
  if (!item) return { ok: false, why: "this shot has no take in sync with the song — match a take in Setup first" };
  if (item.sourceIn == null || item.sourceOut == null) return { ok: false, why: item.note ?? "the take has no footage for this part of the song" };
  if (item.leadIn > 0.05 || (item.note ?? "").includes("only part")) return { ok: false, why: "the take covers only part of this shot — it cannot be restaged whole" };
  const sync = syncs.find((s) => s.performanceAssetId === item.asset.id);
  if (!sync) return { ok: false, why: "the take's match to the song could not be found" };
  return { ok: true, source: { take: item.asset, sync, takeIn: item.sourceIn, takeOut: item.sourceOut } };
}

/**
 * Whole seconds to ask the model for. `lead` is how far before the shot the cut has to open (0 when the browser cuts
 * to the frame). Null = too long to restage in one piece.
 */
export function restageSeconds(shotSeconds: number, lead = FRAME_ALLOWANCE): number | null {
  const need = Math.ceil(shotSeconds + lead - 1e-3);
  const seconds = Math.max(RESTAGE_MIN_SECONDS, need);
  return seconds > RESTAGE_MAX_SECONDS ? null : seconds;
}

/** What a restage of this many seconds costs: the rate the provider has been seen to charge (worldBatch/estimate.ts). */
export function restageEstimateUsd(seconds: number): number {
  return seedanceUsd(RESTAGE_RESOLUTION, seconds);
}

/** What is kept of him, word for word — the take's own description when Setup has one. */
export function restageKeep(take: Pick<MediaAsset, "shows">): string[] {
  const shows = take.shows?.trim();
  return shows ? [`his face, skin and build`, shows] : ["his face, skin and build", "every piece of his wardrobe and everything he wears, exactly as in @Video1"];
}

/**
 * A take filmed from the thighs up has no knees or feet to show: the widest frame of him is the take's own. The word
 * "wide" is never said — asked for "a wide shot of him in the place, framed as far down as @Video1 frames him", the
 * model put him small and whole in the room and drew the legs and feet the take never filmed (the first restaging of
 * the fresh section). The place is wide; he is framed as he was filmed.
 */
export const TAKE_FRAMING = "he fills the frame exactly as he does in @Video1 — cut off at the same place on his body, no smaller — with the place seen around and behind him";
const FRAMING_WORDS: Record<string, string> = {
  extreme_wide: TAKE_FRAMING,
  wide: TAKE_FRAMING,
  medium_wide: TAKE_FRAMING,
  medium: "a medium shot from the waist up",
  medium_close: "a medium close-up of his chest and face",
  close_up: "a close-up of his face",
  extreme_close_up: "an extreme close-up of his face",
  insert: "a medium shot from the waist up",
};
const ANGLE_WORDS: Record<string, string> = { low: "from a low angle", high: "from a high angle", birds_eye: "from directly above", dutch: "on a tilted horizon", over_shoulder: "over a shoulder", worms_eye: "from the floor looking up" };
const MOVE_WORDS: Record<string, string> = {
  static: "the camera locked off",
  truck: "the camera tracking slowly sideways past him",
  pan: "the camera panning slowly across him",
  tilt: "the camera tilting slowly up him",
  pedestal: "the camera rising slowly",
  crane: "the camera rising slowly on a crane",
  jib: "the camera rising slowly on a jib",
  orbit: "the camera orbiting slowly around him",
  handheld: "handheld, breathing with him",
  whip_pan: "the camera locked off",
};
/**
 * The moves that close on him. Asked for "a medium shot from the waist up, the camera pushing slowly toward him", the
 * model opened far back on the whole of him — legs and feet drawn that the take never filmed — and pushed in until it
 * reached the framing named (the fresh section's second restaging). A framing beside a closing move says where the
 * move ENDS as easily as where it starts, so these say which: the framing named is the shot's first and widest frame.
 */
const CLOSING_MOVES: Record<string, string> = {
  dolly: "the camera pushing slowly closer",
  steadicam: "the camera gliding slowly closer",
  gimbal: "the camera gliding slowly closer",
  zoom: "a slow zoom closer",
  drone: "the camera drifting slowly closer",
};
const CLOSING_DEFAULT = "the camera easing slowly closer";
export const OPENS_WIDEST = "and that is the widest frame of the shot: it opens there";

/**
 * What the model must not do when it re-frames him: draw the parts of him the take never filmed. Asked for a wider
 * shot than the take, it invents them — the first live section came back with shorts on a man filmed in jeans from
 * the thighs up.
 */
export const NEVER_WIDER = "Never show more of his body than @Video1 shows, in any frame from the first to the last: whatever is out of frame in @Video1 stays out of frame here.";

/** The camera sentence of the restaged shot: the shot's own framing, angle and move — never his action. */
export function restageAngle(box: StoryboardBox): string {
  const spec = box.spec;
  const framing = (spec.framing && FRAMING_WORDS[spec.framing]) || "a medium shot from the waist up";
  const angle = spec.cameraAngle ? ANGLE_WORDS[spec.cameraAngle] : "";
  const type = spec.cameraMotion.type ?? "";
  const framed = [framing, angle].filter(Boolean).join(" ");
  const held = MOVE_WORDS[type];
  if (held) return `${framed}, ${held}. ${NEVER_WIDER}`;
  return `${framed}, ${OPENS_WIDEST}, ${CLOSING_MOVES[type] ?? CLOSING_DEFAULT} from there. ${NEVER_WIDER}`;
}

/**
 * What a restaging does with the shot's timed events. The restage model takes a script with times, so a shot that
 * changes is given one — said to the director as what it is: asked for, not yet measured.
 */
export function restageTemporalPlan(box: StoryboardBox, clock: EventClock = {}): TemporalPlan {
  return temporalPlan({ route: "seedance_ref", resolved: resolveEvents(box.spec.events, { start: box.start, end: box.end }, clock), shotSeconds: box.end - box.start });
}

export type RestageRequest = { shot: BatchShot; songStart: number; takeStart: number; seconds: number };

/** The frame the clip is asked for in: the project's own where the model has it. */
function clipAspect(aspect: ProjectAspect | undefined): BatchShot["aspect"] {
  const a = aspect ?? DEFAULT_PROJECT_ASPECT;
  return a === "4:5" ? stillRequestAspect(a).aspect : a;
}

/** The shot handed to the runner, once the cut exists. Pure. */
export function restageShot(input: {
  box: StoryboardBox;
  lyricLines: readonly LyricLine[] | undefined;
  source: RestageSource;
  sourcePath: string;
  stillPath: string;
  cut: { start: number; seconds: number };
  aspect?: ProjectAspect;
  /** The shot's timed events as the restage model is given them (restageTemporalPlan). Required: a shot is never restaged without saying what happens to its beats. */
  temporal: TemporalPlan;
  /** What the shot's continuity references resolve to. Required when it has any (generate.ts pointsAtEntities). */
  continuity?: ShotContinuity;
}): RestageRequest {
  const seconds = Math.round(input.cut.seconds);
  const plan = input.temporal;
  if (pointsAtEntities(input.box.spec) && !input.continuity) {
    throw new Error("This shot points at the project's continuity entities and the restaging was built without them. Nothing was generated.");
  }
  // the place is the picture; what the words still have to carry is the light the shot opens in
  const light = input.continuity?.lighting && canonicalWords(input.continuity.lighting) ? `The light: ${canonicalWords(input.continuity.lighting)}` : "";
  if (plan.mode === "refused") throw new Error(`${plan.reason} Nothing was generated.`);
  assertPlanCovers(input.box.spec, plan);
  // The script's seconds are the CLIP's. A cut made to the frame opens on the shot's first frame (within a frame);
  // a cut that had to open on an earlier sync frame carries that much footage first, and every time moves by it.
  const lead = Math.max(0, input.source.takeIn - input.cut.start);
  const shift = lead > FRAME_ALLOWANCE ? Math.round(lead * 1000) / 1000 : 0;
  const asked = plan.mode === "timed_script" ? plan.asked.map((b) => ({ ...b, offset: Math.round((b.offset + shift) * 1000) / 1000 })) : [];
  const script = plan.mode === "timed_script" ? scriptOf(asked) : "";
  const songStart = Math.round(performanceToSong(input.cut.start, input.source.sync) * 1000) / 1000;
  const shot = BatchShotSchema.parse({
    id: input.box.key,
    kind: "angle",
    route: "seedance_ref",
    aspect: clipAspect(input.aspect),
    seconds,
    source_path: input.sourcePath,
    source_seconds: seconds,
    source_window: [Math.round(input.cut.start * 1000) / 1000, Math.round((input.cut.start + input.cut.seconds) * 1000) / 1000],
    source_asset_id: input.source.take.id,
    masterStart: songStart,
    angle: [restageAngle(input.box), light, script].filter(Boolean).join(" "),
    ...(plan.mode === "timed_script" ? { temporal: { mode: "timed_script" as const, beats: plan.beats, measured: plan.measured, asked } } : {}),
    keep: restageKeep(input.source.take),
    resolution: RESTAGE_RESOLUTION,
    still_path: input.stillPath,
  });
  return { shot, songStart, takeStart: input.cut.start, seconds };
}

export type RestageResult = SubmitResult & { songStart: number; seconds: number; estimateUsd: number };

/**
 * Cut the shot's stretch out of the take, hand it to the model with the shot's image as the place, and record the
 * job. The clip arrives later (queries/boxJobs.ts files it as a take in sync).
 */
export async function restageBox(input: {
  projectId: string;
  box: StoryboardBox;
  lyricLines: readonly LyricLine[] | undefined;
  source: RestageSource;
  /** Storage path of the shot's image: the place he is put in. */
  stillPath: string;
  /** The seconds the director agreed to pay for: a cut that would need more is refused, not sent. */
  maxSeconds: number;
  aspect?: ProjectAspect;
  /** The shot's timed events as the model is given them (restageTemporalPlan). */
  temporal: TemporalPlan;
  /** What the shot's continuity references resolve to. */
  continuity?: ShotContinuity;
  onStage?: (text: string) => void;
}): Promise<RestageResult> {
  const say = input.onStage ?? (() => undefined);
  const deps = await browserRunnerDeps();
  const { take } = input.source;
  say("reading the take…");
  // the file as filmed, not a lighter copy: the model is given the real picture
  const url = await signedUrl(take.bucket as never, take.path, 3600);
  const { read, probe } = await openVideo(`${take.bucket}:${take.path}`, url);
  if (!probe.video) throw new Error(probe.note ?? "the take could not be read (it has to be an MP4 or MOV to be cut in the browser)");
  const shotSeconds = input.source.takeOut - input.source.takeIn;
  const track = probe.video;
  let cut: { bytes: Uint8Array; start: number; seconds: number };
  if (await canCutExact(track)) {
    const seconds = restageSeconds(shotSeconds);
    if (!seconds) throw new Error(`a shot of ${shotSeconds.toFixed(1)} s is too long to restage in one piece — split it first`);
    say("cutting this shot out of the take…");
    cut = await cutVideoExact(read, track, input.source.takeIn, seconds);
  } else {
    // no encoder here: the cut has to open on the sync frame before the shot, and run long enough to cover it from there
    const key = track.keyframeAt(input.source.takeIn);
    const lead = key ? Math.max(0, input.source.takeIn - Math.max(0, shownAt(track, key))) : 0;
    const seconds = restageSeconds(shotSeconds, lead + FRAME_ALLOWANCE);
    if (!seconds || seconds > input.maxSeconds) {
      throw new Error(
        `this browser cannot cut the take to the frame, and the nearest clean cut starts ${lead.toFixed(1)} s before this shot — ` +
          `that is ${seconds ? `${seconds} s of render (about $${restageEstimateUsd(seconds).toFixed(2)})` : "too long to restage"}. Open the project in Chrome to restage this shot.`,
      );
    }
    say("cutting this shot out of the take…");
    const copied = await trimVideo(read, track, input.source.takeIn, seconds);
    cut = { bytes: copied.bytes, start: copied.plan.start, seconds: copied.plan.seconds };
  }
  if (cut.seconds < RESTAGE_MIN_SECONDS - 0.2) throw new Error("there is not enough of the take left here to restage (the model needs 4 s)");
  say("uploading the cut…");
  const sourcePath = buildStoragePath(deps.userId, input.projectId, "seedance", `${STORYBOARD_RUN}_${input.box.key}_${Date.now()}_src.mp4`);
  await uploadBytesToBucket("project-clips", sourcePath, cut.bytes, "video/mp4", { upsert: true });
  const req = restageShot({ box: input.box, lyricLines: input.lyricLines, source: input.source, sourcePath, stillPath: input.stillPath, cut: { start: cut.start, seconds: cut.seconds }, aspect: input.aspect, temporal: input.temporal, continuity: input.continuity });
  say("sending it to render…");
  const { id, look } = resolveLookPreset(DEFAULT_BOX_LOOK);
  const result = await submitShot(req.shot, { projectId: input.projectId, runId: STORYBOARD_RUN, lookPresetId: id, look, shotIds: { [input.box.key]: input.box.id } }, deps);
  return { ...result, songStart: req.songStart, seconds: req.seconds, estimateUsd: restageEstimateUsd(req.seconds) };
}

/**
 * A finished restaging becomes a take of its own: marked as performance footage cut from its source, with a sync
 * whose offset is the song time of its first frame. Idempotent — a second call changes nothing.
 */
export async function fileRestagedClip(input: {
  projectId: string;
  assetId: string;
  sourceAssetId: string;
  songStart: number;
  sourceWindow: [number, number] | null;
  seconds: number | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { data: asset, error } = await supabase.from("project_assets").select("id, metadata_json").eq("id", input.assetId).single();
  if (error || !asset) throw new Error(`could not read the restaged clip: ${error?.message ?? "not found"}`);
  const meta = { ...((asset.metadata_json ?? {}) as Record<string, unknown>) };
  meta.derived_from = { asset_id: input.sourceAssetId, source_window: input.sourceWindow, song_start: input.songStart };
  if (!(Number(meta.duration_seconds) > 0) && input.seconds) meta.duration_seconds = input.seconds;
  const { error: upErr } = await supabase
    .from("project_assets")
    .update({ footage_role: "performance", metadata_json: meta as unknown as Json } as never)
    .eq("id", input.assetId);
  if (upErr) throw new Error(`could not file the restaged clip: ${upErr.message}`);

  const { data: existing } = await supabase.from("performance_syncs").select("id").eq("project_id", input.projectId).eq("performance_asset_id", input.assetId).limit(1);
  if (existing && existing.length) return;
  const { data: source } = await supabase
    .from("performance_syncs")
    .select("song_asset_id, drift_ppm")
    .eq("project_id", input.projectId)
    .eq("performance_asset_id", input.sourceAssetId)
    .in("status", ["confirmed", "manual"])
    .limit(1);
  const { error: syncErr } = await supabase.from("performance_syncs").insert({
    user_id: auth.user.id,
    project_id: input.projectId,
    song_asset_id: source?.[0]?.song_asset_id ?? null,
    performance_asset_id: input.assetId,
    offset_seconds: input.songStart,
    drift_ppm: source?.[0]?.drift_ppm ?? 0,
    method: DERIVED_SYNC_METHOD,
    status: "confirmed",
    notes: "restaged from the take: its first frame sits where the cut began on the song",
  });
  if (syncErr) throw new Error(`could not place the restaged clip on the song: ${syncErr.message}`);
}
