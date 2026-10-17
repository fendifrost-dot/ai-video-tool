// montage-shot — the pure half: from what the database says about a shot (its window, its dressed take and that
// take's place on the song, its scene's plate) to the exact request the storyboard's own "Montage" button sends
// (src/lib/storyboard/restage.ts restageShot + src/lib/worldBatch/runner.ts submitShot, route seedance_ref). No
// network or database here; plan.test.ts holds it to the browser's numbers.

import {
  DEFAULT_LOOK_PRESET_ID,
  FRAME_ALLOWANCE,
  MONTAGE_LINES_MAX,
  RESTAGE_MAX_SECONDS,
  RESTAGE_MIN_SECONDS,
  RESTAGE_RESOLUTION,
  DEFAULT_LOOK_SUFFIX,
  brollMontagePrompt,
  castLine,
  defaultMontageLines,
  footwearLine,
  montagePrompt,
  montageRecord,
  planBeatLockedScenes,
  planMontageScenes,
  planShotMontageScenes,
  restageKeep,
  restageSeconds,
  seedanceAnglePrompt,
  seedanceUsd,
  thingOfLabel,
  type MontageFootwear,
  type MontageScene,
} from "../_shared/montagePrompt.ts";
import { CONTINUOUS_LINE_MAX, CONTINUOUS_VERSION, continuousPrompt, continuousSeconds, continuousSongStart, type TakeLyric } from "../_shared/continuousPrompt.ts";

/** The run every storyboard button files under (src/lib/storyboard/generate.ts STORYBOARD_RUN). */
export const STORYBOARD_RUN = "storyboard";
export const MONTAGE_ID_SUFFIX = "montage";
export const SEEDANCE_MODEL = "seedance-2.5-reference";
export const PROJECT_ASPECTS = ["9:16", "16:9", "1:1", "4:5"] as const;
export type ProjectAspect = (typeof PROJECT_ASPECTS)[number];
/** The frame the clip is asked for in (restage.ts clipAspect → project/aspect.ts stillRequestAspect): the project's, 4:5 going to the nearest the model has (3:4). */
export function clipAspect(aspect: unknown): "9:16" | "16:9" | "1:1" | "3:4" {
  if (aspect === "16:9" || aspect === "1:1") return aspect;
  if (aspect === "4:5") return "3:4";
  return "9:16";
}

export type ShotFacts = {
  id: string;
  key: string;
  /** The shot's window on the song, seconds. */
  start: number;
  end: number;
  variationId: string | null;
  /** The shot's timed events (spec_json.events). A shot with any is not shot from here: the browser builds its timed script. */
  events: readonly unknown[];
  /** What the writer wrote it from, as the job records it (madeFrom). */
  madeFrom?: {
    treatment: string | null;
    sceneWrittenAt: string | null;
    shotUpdatedAt: string | null;
  } | null;
};

export type TakeFacts = {
  id: string;
  bucket: string;
  path: string;
  /** The file's length, seconds (metadata_json.duration_seconds). */
  seconds: number;
  /** What he wears in it, in the director's words (metadata_json.shows), when Setup has it. */
  shows: string | null;
  /** The take's place on the song: its first frame's song time, and the drift. */
  sync: { offsetSeconds: number; driftPpm: number };
};

export type PlateFacts = {
  id: string;
  bucket: string;
  path: string;
  shotLabel: string | null;
  sceneTitle: string | null;
};

/** A scene still with the scene's own people in it (worlds/scene_*): the montage's cast. May be the place itself. */
export type CastFacts = {
  id: string;
  bucket: string;
  path: string;
};

export type MontageInput = {
  projectId: string;
  userId: string;
  aspect: unknown;
  shot: ShotFacts;
  take: TakeFacts;
  plate: PlateFacts;
  /** The director's scenes, one per line (the dialog's field); absent = the dialog's prefill. */
  lines?: string | null;
  /** The light the shot opens in, in the continuity entity's words, when the shot points at one. */
  light?: string | null;
  /** His shoes: the outfit's footwear picture (montageFootwear), sent as @Image2 after the place. */
  footwear?: MontageFootwear | null;
  /** The people of the scene: a still with them in it, sent after the place and the shoes (or the place itself). */
  cast?: CastFacts | null;
  /** The song's beats, song seconds (song_analyses.beat_map_json): untimed lines are cut on them. */
  beats?: readonly number[] | null;
};

export type MontagePlan = {
  seconds: number;
  /** The clip's first frame on the song: the dressed take's own, since the whole take is the source. */
  songStart: number;
  /** How far into the source the shot's first frame is (the dressed take's head handle): the scenes' seconds count from the file's first frame, not the shot's. */
  lead: number;
  scenes: MontageScene[];
  thing: string | null;
  footwear: MontageFootwear | null;
  cast: CastFacts | null;
  prompt: string;
  estimateUsd: number;
  /** The provider request, less the signed URLs (the I/O half signs and adds them: the take, the plate, the shoes). */
  body: Record<string, unknown>;
  /** request_payload_json of the provider_jobs row: what jobProgress.ts reads to file the clip on its shot, unselected. */
  payload: Record<string, unknown>;
};

export type Refusal = { ok: false; status: number; error: string; detail: string };
const refuse = (status: number, error: string, detail: string): Refusal => ({
  ok: false,
  status,
  error,
  detail,
});

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Song time of a frame of the take (src/lib/sync/performanceSync.ts performanceToSong). */
export function performanceToSong(t: number, sync: TakeFacts["sync"]): number {
  return sync.offsetSeconds + t * (1 + sync.driftPpm / 1e6);
}
export function songToPerformance(s: number, sync: TakeFacts["sync"]): number {
  return (s - sync.offsetSeconds) / (1 + sync.driftPpm / 1e6);
}

/**
 * The montage as the browser would send it, or why not. The source is the WHOLE dressed take — a dress is already
 * the shot's stretch of the take with its handles, and no encoder runs here to cut it closer — so the clip opens
 * where the dressed take opens (its head handle before the shot) exactly like the browser's "no encoder" branch
 * (restageBox: trimVideo, lead), and jobProgress.ts files it on the song at that frame.
 */
export function planMontage(input: MontageInput): { ok: true; plan: MontagePlan } | Refusal {
  const { shot, take, plate } = input;
  if (shot.events.length > 0) {
    return refuse(
      422,
      "shot_has_timed_events",
      "this shot has timed events, which the montage lane hands to the model as a timed script built in the app — shoot its montage from the storyboard for now",
    );
  }
  const shotSeconds = shot.end - shot.start;
  if (!(shotSeconds > 0))
    return refuse(422, "shot_has_no_length", "the shot's window on the song is empty");
  const takeIn = songToPerformance(shot.start, take.sync);
  const takeOut = songToPerformance(shot.end, take.sync);
  if (takeIn < -FRAME_ALLOWANCE)
    return refuse(
      422,
      "take_starts_after_shot",
      `the dressed take begins ${(-takeIn).toFixed(2)} s after this shot does — it covers only part of the shot`,
    );
  if (takeOut > take.seconds + 0.05)
    return refuse(
      422,
      "take_ends_before_shot",
      `the dressed take ends ${(takeOut - take.seconds).toFixed(2)} s before this shot does — it covers only part of the shot`,
    );
  const need = restageSeconds(shotSeconds);
  if (!need)
    return refuse(
      422,
      "shot_too_long",
      `a shot of ${shotSeconds.toFixed(1)} s is too long to restage in one piece — split it first`,
    );
  // the whole file, whole seconds: what the model is given and what it renders
  const seconds = Math.round(take.seconds);
  if (seconds < RESTAGE_MIN_SECONDS)
    return refuse(
      422,
      "take_too_short",
      `the dressed take is ${take.seconds.toFixed(2)} s; the model needs ${RESTAGE_MIN_SECONDS} s`,
    );
  if (seconds > RESTAGE_MAX_SECONDS)
    return refuse(
      422,
      "take_too_long",
      `the dressed take is ${take.seconds.toFixed(2)} s; at most ${RESTAGE_MAX_SECONDS} s go to the model in one piece`,
    );
  if (takeIn + shotSeconds > seconds + FRAME_ALLOWANCE)
    return refuse(
      422,
      "take_ends_before_shot",
      `the shot runs past the ${seconds} s the model is given`,
    );
  const thing = thingOfLabel(plate.shotLabel);
  const lines = (input.lines?.trim() ? input.lines : defaultMontageLines(thing)).slice(
    0,
    MONTAGE_LINES_MAX,
  );
  const lead = Math.max(0, takeIn);
  const songStart = r3(performanceToSong(0, take.sync));
  // the lines share the part of the clip the edit plays, cut on the song's beats (montagePrompt.ts planBeatLockedScenes)
  const clipZero = performanceToSong(0, take.sync);
  const locked = planBeatLockedScenes(lines, {
    renderSeconds: seconds,
    shotIn: lead,
    shotOut: lead + shotSeconds,
    beats: (input.beats ?? []).map((t) => t - clipZero),
  });
  const planned = locked ?? planMontageScenes(lines, seconds);
  if (!planned.ok) return refuse(422, "scenes_refused", `${planned.why}. Nothing was generated.`);
  const cutOn = locked && locked.ok ? { beats: locked.locked, cuts: locked.scenes.length - 1 } : null;
  const light = input.light?.trim() ? `The light: ${input.light.trim()}` : "";
  const footwear = input.footwear ?? null;
  const cast = input.cast ?? null;
  const pictures = picturesAfterPlace(plate, footwear, cast);
  // the app's order: the montage, its shoes and its people are the variant's sentence, the light follows it
  // (restage.ts restageShot)
  const angle = [
    montagePrompt(planned.scenes),
    footwearLine(footwear),
    cast ? castLine(pictures.castImage) : "",
    light,
  ]
    .filter(Boolean)
    .join(" ");
  const prompt = seedanceAnglePrompt(angle, restageKeep({ shows: take.shows }));
  const estimateUsd = Number(seedanceUsd(RESTAGE_RESOLUTION, seconds).toFixed(3));
  const aspect = clipAspect(input.aspect);
  const batchShotId = `${shot.key}_${MONTAGE_ID_SUFFIX}`;
  const sourceWindow: [number, number] = [0, r3(seconds)];
  const body = {
    promptText: prompt,
    mode: "reference_to_video",
    modelVariant: SEEDANCE_MODEL,
    duration: Math.max(4, Math.min(30, seconds)),
    resolution: RESTAGE_RESOLUTION,
    aspectRatio: aspect,
    generate_audio: false,
    avt_user_id: input.userId,
    avt_project_id: input.projectId,
  };
  const settings = {
    batchRun: STORYBOARD_RUN,
    batchShotId,
    route: "seedance_ref",
    kind: "angle",
    estimateUsd,
    lookPreset: DEFAULT_LOOK_PRESET_ID,
    sourcePath: take.path,
    stillPath: plate.path,
    ...(pictures.extra.length > 0 ? { extraImages: pictures.extra } : {}),
    sourceWindow,
    masterStart: songStart,
    sourceAssetId: take.id,
    sourceSeconds: seconds,
    alternate: true as const,
    variant: montageRecord(planned.scenes, thing, footwear, { cast, cutOn }),
    ...(shot.madeFrom ? { madeFrom: shot.madeFrom } : {}),
    submittedBy: "montage-shot",
    lead: r3(lead),
  };
  const payload = {
    promptText: prompt,
    mode: "reference_to_video",
    modelVariant: SEEDANCE_MODEL,
    duration: body.duration,
    aspectRatio: aspect,
    referenceImagePath: plate.path,
    shotId: shot.id,
    settings,
  };
  return {
    ok: true,
    plan: {
      seconds,
      songStart,
      lead: r3(lead),
      scenes: planned.scenes,
      thing,
      footwear,
      cast,
      prompt,
      estimateUsd,
      body,
      payload,
    },
  };
}

/**
 * The pictures sent after the place, in order — his shoes (@Image2), then the scene's people — and the number the
 * prompt calls the people by. A cast still that IS the place is not sent twice: its people are @Image1's.
 */
export function picturesAfterPlace(
  plate: Pick<PlateFacts, "id">,
  footwear: MontageFootwear | null,
  cast: CastFacts | null,
): { extra: { bucket: string; path: string }[]; castImage: number } {
  const extra: { bucket: string; path: string }[] = [];
  if (footwear) extra.push({ bucket: footwear.bucket, path: footwear.path });
  if (!cast || cast.id === plate.id) return { extra, castImage: 1 };
  extra.push({ bucket: cast.bucket, path: cast.path });
  return { extra, castImage: 1 + extra.length };
}

export type BrollInput = {
  projectId: string;
  userId: string;
  aspect: unknown;
  shot: ShotFacts;
  plate: PlateFacts;
  cast?: CastFacts | null;
  lines?: string | null;
  light?: string | null;
  /** The song's beats, song seconds: the lines are cut on them. */
  beats?: readonly number[] | null;
};

/**
 * A montage of a shot he is not in (b-roll): the same fast cuts from the place and its people, with no take — Fendi,
 * 17 Oct 2026: "These all need to be montage shots so a continuous running out of the store is unacceptable". The
 * model renders whole seconds, at least 4: the lines share the shot's own seconds and the last holds to the end of
 * the render. Filed on the shot unselected, its first frame at the shot's start.
 */
export function planBrollMontage(input: BrollInput): { ok: true; plan: MontagePlan } | Refusal {
  const { shot, plate } = input;
  if (shot.events.length > 0)
    return refuse(
      422,
      "shot_has_timed_events",
      "this shot has timed events, which the montage lane hands to the model as a timed script built in the app — shoot its montage from the storyboard for now",
    );
  const shotSeconds = shot.end - shot.start;
  if (!(shotSeconds > 0))
    return refuse(422, "shot_has_no_length", "the shot's window on the song is empty");
  const seconds = restageSeconds(shotSeconds, 0);
  if (!seconds)
    return refuse(
      422,
      "shot_too_long",
      `a shot of ${shotSeconds.toFixed(1)} s is too long to shoot in one piece — split it first`,
    );
  const thing = thingOfLabel(plate.shotLabel);
  if (!input.lines?.trim())
    return refuse(
      422,
      "lines_required",
      "a shot he is not in has no prefill: write its scenes, one per line (what the place and its people do, cut by cut)",
    );
  const lines = input.lines.slice(0, MONTAGE_LINES_MAX);
  const locked = planBeatLockedScenes(lines, {
    renderSeconds: seconds,
    shotIn: 0,
    shotOut: shotSeconds,
    beats: (input.beats ?? []).map((t) => t - shot.start),
  });
  const planned = locked ?? planShotMontageScenes(lines, shotSeconds, seconds);
  if (!planned.ok) return refuse(422, "scenes_refused", `${planned.why}. Nothing was generated.`);
  const cutOn = locked && locked.ok ? { beats: locked.locked, cuts: locked.scenes.length - 1 } : null;
  const cast = input.cast ?? null;
  const pictures = picturesAfterPlace(plate, null, cast);
  const light = input.light?.trim() ? `The light: ${input.light.trim()}` : "";
  const prompt = [
    brollMontagePrompt(planned.scenes, cast ? pictures.castImage : null),
    light,
    DEFAULT_LOOK_SUFFIX,
  ]
    .filter(Boolean)
    .join(" ");
  const estimateUsd = Number(seedanceUsd(RESTAGE_RESOLUTION, seconds, 0).toFixed(3));
  const aspect = clipAspect(input.aspect);
  const body = {
    promptText: prompt,
    mode: "reference_to_video",
    modelVariant: SEEDANCE_MODEL,
    duration: seconds,
    resolution: RESTAGE_RESOLUTION,
    aspectRatio: aspect,
    generate_audio: false,
    avt_user_id: input.userId,
    avt_project_id: input.projectId,
  };
  const settings = {
    batchRun: STORYBOARD_RUN,
    batchShotId: `${shot.key}_${MONTAGE_ID_SUFFIX}`,
    route: "seedance_ref",
    kind: "world",
    estimateUsd,
    lookPreset: DEFAULT_LOOK_PRESET_ID,
    stillPath: plate.path,
    ...(pictures.extra.length > 0 ? { extraImages: pictures.extra } : {}),
    masterStart: r3(shot.start),
    alternate: true as const,
    variant: montageRecord(planned.scenes, thing, null, { cast, broll: true, cutOn }),
    ...(shot.madeFrom ? { madeFrom: shot.madeFrom } : {}),
    submittedBy: "montage-shot",
    lead: 0,
  };
  const payload = {
    promptText: prompt,
    mode: "reference_to_video",
    modelVariant: SEEDANCE_MODEL,
    duration: seconds,
    aspectRatio: aspect,
    referenceImagePath: plate.path,
    shotId: shot.id,
    settings,
  };
  return {
    ok: true,
    plan: {
      seconds,
      songStart: r3(shot.start),
      lead: 0,
      scenes: planned.scenes,
      thing,
      footwear: null,
      cast,
      prompt,
      estimateUsd,
      body,
      payload,
    },
  };
}

// which pieces a shot wears lives with the dress words (dress-clip uses it too)
export { wornPieces } from "../_shared/dressWords.ts";

export type ContinuousInput = {
  projectId: string;
  userId: string;
  aspect: unknown;
  shot: ShotFacts;
  /** His dressed take, when he is in the shot (the identity and wardrobe reference, @Video1). */
  take: TakeFacts | null;
  plate: PlateFacts;
  camera: string;
  action: string;
  endMotion: string;
  seconds?: unknown;
  /** The pictures after the place (@Image2 …), signed by the I/O half, and what each is. */
  images?: { bucket: string; path: string; as: string }[];
  light?: string | null;
  /** The lyric lines he raps, seconds from the take's first frame (continuousPrompt lyricsInTake). */
  lyrics?: TakeLyric[];
  /** The slice of the song's vocals under the take goes as @Audio1 (the I/O half cuts, stores and signs it). */
  audio?: boolean;
};

/**
 * One continuous take on a shot (montage-shot's `continuous` mode; _shared/continuousPrompt.ts says why): one Seedance
 * call, as long as the lane allows, no scenes and no beat cuts. With him, his dressed take is @Video1 and the clip is
 * filed as a take in sync — he raps the lyric lines over the song's vocals (@Audio1) and the editor lines the mouth up by hand,
 * nothing repaints it afterwards; without him it is filed as a clip.
 * Its first frame is placed on the song so the shot's window sits in the middle of it — handles both sides.
 */
export function planContinuous(input: ContinuousInput): { ok: true; plan: MontagePlan } | Refusal {
  const { shot, take, plate } = input;
  const withHim = !!take;
  for (const [name, v] of [["camera", input.camera], ["action", input.action], ["endMotion", input.endMotion]] as const)
    if (typeof v !== "string" || !v.trim()) return refuse(400, `missing_${name}`, `say the ${name === "endMotion" ? "motion it ends on" : name} in words`);
  for (const [name, v] of [["camera", input.camera], ["action", input.action], ["endMotion", input.endMotion], ...(input.images ?? []).map((im, k) => [`picture ${k + 2}`, im.as] as const)] as const)
    if (String(v).replace(/\s+/g, " ").trim().length > CONTINUOUS_LINE_MAX)
      return refuse(400, "line_too_long", `the ${name} is longer than ${CONTINUOUS_LINE_MAX} characters — say it shorter (it is never cut)`);
  if (!(shot.end - shot.start > 0)) return refuse(422, "shot_has_no_length", "the shot's window on the song is empty");
  if (take && take.seconds > RESTAGE_MAX_SECONDS)
    return refuse(422, "take_too_long", `the dressed take is ${take.seconds.toFixed(2)} s; at most ${RESTAGE_MAX_SECONDS} s go to the model as a reference`);
  const seconds = continuousSeconds(input.seconds);
  const songStart = continuousSongStart(shot.start, shot.end, seconds);
  const images = input.images ?? [];
  const prompt = continuousPrompt({
    seconds,
    camera: input.camera,
    action: input.action,
    endMotion: input.endMotion,
    withHim,
    keep: take ? restageKeep({ shows: take.shows }) : undefined,
    images: images.map((i) => ({ as: i.as })),
    light: input.light ?? null,
    lyrics: withHim ? input.lyrics ?? [] : [],
    audio: withHim && !!input.audio,
  });
  const estimateUsd = Number(seedanceUsd(RESTAGE_RESOLUTION, seconds, take ? Math.round(take.seconds) : 0).toFixed(3));
  const aspect = clipAspect(input.aspect);
  const body = {
    promptText: prompt,
    mode: "reference_to_video",
    modelVariant: SEEDANCE_MODEL,
    duration: seconds,
    resolution: RESTAGE_RESOLUTION,
    aspectRatio: aspect,
    generate_audio: false,
    avt_user_id: input.userId,
    avt_project_id: input.projectId,
  };
  const variant = {
    version: CONTINUOUS_VERSION,
    seconds,
    camera: input.camera.trim(),
    action: input.action.trim(),
    endMotion: input.endMotion.trim(),
    withHim,
    images: images.map((i) => ({ path: i.path, as: i.as })),
    ...(withHim ? { lyrics: input.lyrics ?? [], audio: !!input.audio } : {}),
  };
  const settings = {
    batchRun: STORYBOARD_RUN,
    batchShotId: `${shot.key}_continuous`,
    route: "seedance_ref",
    kind: withHim ? "angle" : "world",
    estimateUsd,
    lookPreset: DEFAULT_LOOK_PRESET_ID,
    ...(take ? { sourcePath: take.path, sourceWindow: [0, r3(take.seconds)], sourceAssetId: take.id, sourceSeconds: r3(take.seconds) } : {}),
    stillPath: plate.path,
    ...(images.length > 0 ? { extraImages: images.map((i) => ({ bucket: i.bucket, path: i.path })) } : {}),
    masterStart: songStart,
    alternate: true as const,
    variant,
    ...(shot.madeFrom ? { madeFrom: shot.madeFrom } : {}),
    submittedBy: "montage-shot",
    lead: 0,
  };
  const payload = {
    promptText: prompt,
    mode: "reference_to_video",
    modelVariant: SEEDANCE_MODEL,
    duration: seconds,
    aspectRatio: aspect,
    referenceImagePath: plate.path,
    shotId: shot.id,
    settings,
  };
  return { ok: true, plan: { seconds, songStart, lead: 0, scenes: [], thing: null, footwear: null, cast: null, prompt, estimateUsd, body, payload } };
}
