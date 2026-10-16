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
  defaultMontageLines,
  footwearLine,
  montagePrompt,
  montageRecord,
  planMontageScenes,
  restageKeep,
  restageSeconds,
  seedanceAnglePrompt,
  seedanceUsd,
  thingOfLabel,
  type MontageFootwear,
  type MontageScene,
} from "../_shared/montagePrompt.ts";

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
  const planned = planMontageScenes(lines, seconds);
  if (!planned.ok) return refuse(422, "scenes_refused", `${planned.why}. Nothing was generated.`);
  const lead = Math.max(0, takeIn);
  const songStart = r3(performanceToSong(0, take.sync));
  const light = input.light?.trim() ? `The light: ${input.light.trim()}` : "";
  const footwear = input.footwear ?? null;
  // the app's order: the montage and its shoes are the variant's sentence, the light follows it (restage.ts restageShot)
  const angle = [montagePrompt(planned.scenes), footwearLine(footwear), light]
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
    ...(footwear ? { extraImages: [{ bucket: footwear.bucket, path: footwear.path }] } : {}),
    sourceWindow,
    masterStart: songStart,
    sourceAssetId: take.id,
    sourceSeconds: seconds,
    alternate: true as const,
    variant: montageRecord(planned.scenes, thing, footwear),
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
      prompt,
      estimateUsd,
      body,
      payload,
    },
  };
}

/**
 * Which outfit's pieces he wears in the shot (wardrobe/outfits.ts resolveOutfit + effectiveGarments): the shot's own
 * garments when it names any; else, by the shot's outfit mode, none / its exception outfit / its scene's outfit.
 * Answers the pieces when they are already known, else the outfit key to look up.
 */
export function wornPieces(
  spec: Record<string, unknown>,
  sceneOutfitKey: string | null,
): { ids: string[] } | { outfitKey: string } | { none: true } {
  const w = (spec.wardrobe ?? {}) as Record<string, unknown>;
  const own = Array.isArray(w.garments)
    ? w.garments.filter((g): g is string => typeof g === "string")
    : [];
  if (own.length > 0) return { ids: own };
  const mode = typeof w.outfitMode === "string" ? w.outfitMode : "inherit";
  if (mode === "none") return { none: true };
  const key =
    mode === "exception" ? (typeof w.outfitKey === "string" ? w.outfitKey : null) : sceneOutfitKey;
  return key ? { outfitKey: key } : { none: true };
}
