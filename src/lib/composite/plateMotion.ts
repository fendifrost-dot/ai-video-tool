/**
 * The moving plate: the scene's plate still animated into a few seconds of the place with its own life — traffic,
 * lights, a passer-by — by the image-to-video lane the storyboard already uses for clips (Kling through Control
 * Center), so a composite is a man in a place that moves, not a man pinned to a photograph. One moving plate serves
 * every shot of the scene; the composite (plan.ts) takes the newest usable one of its still.
 *
 * What is decided is pure (planPlateMotion, composePlateMotionRequest, plateMotionSettings); animatePlate submits:
 * it writes the job row FIRST, then asks the provider, and the server (jobProgress.ts) files the finished clip as a
 * plate of the scene — never on a shot, never selected.
 */
import { signedUrl } from "@/lib/storage";
import type { MediaAsset } from "@/lib/storyboard/media";
import { STORYBOARD_RUN } from "@/lib/storyboard/generate";
import { scrubEnvelope, type LiveJobRow } from "@/lib/storyboard/dress";
import { supabase } from "@/lib/supabase";
import { PROVIDER_RATES } from "@/lib/worldBatch/rates";
import { browserRunnerDeps } from "@/lib/worldBatch/browserDeps";
import type { RunnerDeps } from "@/lib/worldBatch/runner";
import { nudgeJobProgress } from "@/lib/providerJobs/progress";
import { videoPlatesOf } from "./plan";

/** The route a moving-plate job records; the server files its clip by it. */
export const PLATE_MOTION_ROUTE = "plate_motion";
export const PLATE_MOTION_ENDPOINT = "video-providers-higgsfield-model";
export const PLATE_MOTION_PROVIDER = "higgsfield" as const;
export const PLATE_MOTION_MODEL = "kling-2.5-turbo-pro-i2v";
/** Kling bills whole clips of 5 or 10 s; the windows are under 5 s, and a longer take holds the plate's last frame. */
export const PLATE_MOTION_SECONDS = 5;
export const PLATE_MOTION_VERSION = "plate-motion-v3-2026-10-16";
/** The longest event the director may ask for, in characters. */
export const PLATE_EVENT_MAX = 400;

/**
 * The motion asked for. The camera is told to stay put twice (a moving camera under a static matte would tear him
 * off the place); the life is in the street, never in the centre foreground where he stands.
 */
const PLATE_MOTION_BASE =
  "Locked-off camera on a tripod: no camera movement, no pan, no zoom, no push-in; the framing stays exactly as in the picture. " +
  "The place comes alive at its own pace: cars and buses pass along the street with their headlights and tail lights, " +
  "traffic signals change, a pedestrian walks by in the distance, signs and windows flicker softly, a light breeze moves " +
  "what can move. The centre foreground stays empty: nothing and nobody enters it. Photoreal, the same time of day, " +
  "the same light and weather as the picture; no text, no captions";
export const PLATE_MOTION_PROMPT = `${PLATE_MOTION_BASE}, no added objects.`;

/**
 * The prompt for one plate: the locked-off base, plus — when the director asks for one — the EVENT: one absurd,
 * eye-catching thing that happens in the place while he performs (Fendi, 16 Oct: "we need something absurd happening
 * that catches people's attention and isn't boring"). The event is placed in the street or on the far side; the
 * centre foreground stays his.
 */
/** The event as it is kept and as it is said: one line, single spaces, at most PLATE_EVENT_MAX characters. */
export function normalizeEvent(event: string | null | undefined): string | null {
  const e = (event ?? "").trim().replace(/\s+/g, " ").slice(0, PLATE_EVENT_MAX).trim();
  return e || null;
}

export function plateMotionPrompt(event: string | null | undefined): string {
  const e = normalizeEvent(event);
  if (!e) return PLATE_MOTION_PROMPT;
  // The event LEADS (v3): with it last, after a base that forbade "added objects", the model made plain traffic and
  // no horse (plate 614055fc, 16 Oct 05:31 UTC). Now it is the first sentence, and the base no longer forbids it.
  return (
    `${e.replace(/[.!?]+$/, "")} — this is the one thing in the shot that catches the eye and holds it: it plays out fully ` +
    "inside these five seconds, large and clearly visible, in the street, on the far side or in the middle distance, real as " +
    `if filmed, never in the centre foreground. ${PLATE_MOTION_BASE}.`
  );
}

export type PlateMotionPlan = {
  /** The still to animate: the plate the composite would use. */
  still: MediaAsset;
  /** The moving plates already made from it, newest first. */
  existing: MediaAsset[];
  seconds: number;
  model: string;
  /** The absurd thing asked for, or null. */
  event: string | null;
  prompt: string;
  cost: { usd: number; text: string };
};

export function plateMotionEstimateUsd(seconds: number): number {
  return Math.round(PROVIDER_RATES.kling_usd_per_s * seconds * 1000) / 1000;
}

/** Whether a plate can be animated, and what that would send. Pure. */
export function planPlateMotion(f: {
  still: MediaAsset | null;
  assets: readonly MediaAsset[];
  /** What happens in the place, in the director's words — or nothing: the street's ordinary life. */
  event?: string | null;
}): { ok: true; plan: PlateMotionPlan } | { ok: false; why: string } {
  const still = f.still;
  if (!still) return { ok: false, why: "this shot has no plate to animate — generate the place first" };
  if (!still.isImage || still.plate?.kind !== "still")
    return { ok: false, why: "only a realism plate of the scene (a still under worlds/) is animated" };
  const usd = plateMotionEstimateUsd(PLATE_MOTION_SECONDS);
  return {
    ok: true,
    plan: {
      still,
      existing: videoPlatesOf(f.assets, still.id),
      seconds: PLATE_MOTION_SECONDS,
      model: PLATE_MOTION_MODEL,
      event: normalizeEvent(f.event),
      prompt: plateMotionPrompt(f.event),
      cost: {
        usd,
        text: `About $${usd.toFixed(3)} by the provider's own pricing rule (${PLATE_MOTION_SECONDS} s of ${PLATE_MOTION_MODEL} at $${PROVIDER_RATES.kling_usd_per_s}/s)`,
      },
    },
  };
}

export type PlateMotionRequest = {
  endpoint: typeof PLATE_MOTION_ENDPOINT;
  provider: typeof PLATE_MOTION_PROVIDER;
  modelVariant: string;
  body: Record<string, unknown>;
};

/** The provider request — what goes through proxy-provider-call. Pure. */
export function composePlateMotionRequest(input: {
  prompt: string;
  stillUrl: string;
  seconds: number;
  projectId: string;
}): PlateMotionRequest {
  return {
    endpoint: PLATE_MOTION_ENDPOINT,
    provider: PLATE_MOTION_PROVIDER,
    modelVariant: PLATE_MOTION_MODEL,
    body: {
      promptText: input.prompt,
      mode: "image_to_video",
      modelVariant: PLATE_MOTION_MODEL,
      referenceImageUrl: input.stillUrl,
      duration: input.seconds,
      avt_project_id: input.projectId,
    },
  };
}

/** The job's settings: how the server knows to file the clip as a moving plate of the scene, and of which still. */
export function plateMotionSettings(input: { still: MediaAsset; seconds: number; prompt: string; event?: string | null }): Record<string, unknown> {
  return {
    route: PLATE_MOTION_ROUTE,
    version: PLATE_MOTION_VERSION,
    event: input.event ?? null,
    batchRun: STORYBOARD_RUN,
    // a plate is the scene's, not a shot's: no box claims this job (latestBoxJobs keys by batchShotId)
    batchShotId: null,
    plate: {
      still_asset_id: input.still.id,
      still_path: input.still.path,
      scene_title: input.still.plate?.sceneTitle ?? null,
      shot_label: input.still.plate?.shotLabel ?? null,
    },
    model: PLATE_MOTION_MODEL,
    seconds: input.seconds,
    prompt: input.prompt,
  };
}

/** A moving plate of this still that is still being made (queued or running, not finished by the server). */
export function findLivePlateJob(rows: readonly LiveJobRow[], stillId: string): LiveJobRow | null {
  for (const r of rows) {
    if (!(r.status === "queued" || r.status === "running") || r.finalized_at) continue;
    const payload = (r.request_payload_json ?? {}) as { settings?: { route?: unknown; plate?: { still_asset_id?: unknown } } };
    if (payload.settings?.route !== PLATE_MOTION_ROUTE) continue;
    if (payload.settings?.plate?.still_asset_id !== stillId) continue;
    return r;
  }
  return null;
}

export type PlateMotionInput = {
  projectId: string;
  variationId: string | null;
  plan: PlateMotionPlan;
  onStage?: (text: string) => void;
  /** Plan everything, send nothing, spend nothing: returns what would be sent. */
  dryRun?: boolean;
};

export type PlateMotionResult =
  | { dryRun: true; request: PlateMotionRequest; settings: Record<string, unknown> }
  | { dryRun: false; rowId: string; providerJobId: string; estimateUsd: number };

export type PlateMotionLookups = {
  livePlateRows: (projectId: string) => Promise<LiveJobRow[]>;
};

async function browserPlateLookups(): Promise<PlateMotionLookups> {
  return {
    livePlateRows: async (projectId) => {
      const { data, error } = await supabase
        .from("provider_jobs")
        .select("id, status, finalized_at, request_payload_json")
        .eq("project_id", projectId)
        .in("status", ["queued", "running"])
        .is("finalized_at", null)
        .eq("request_payload_json->settings->>route", PLATE_MOTION_ROUTE);
      if (error) throw new Error(`could not check for a running plate: ${error.message}`);
      return (data ?? []) as LiveJobRow[];
    },
  };
}

/** "Animate the plate": one paid image-to-video of the still, filed by the server as a moving plate of the scene. */
export async function animatePlate(
  input: PlateMotionInput,
  depsIn?: RunnerDeps,
  lookupsIn?: PlateMotionLookups,
): Promise<PlateMotionResult> {
  const say = input.onStage ?? (() => undefined);
  const { plan } = input;
  const settings = plateMotionSettings({ still: plan.still, seconds: plan.seconds, prompt: plan.prompt, event: plan.event });
  if (input.dryRun) {
    return {
      dryRun: true,
      request: composePlateMotionRequest({
        prompt: plan.prompt,
        stillUrl: `<signed project-references/${plan.still.path}>`,
        seconds: plan.seconds,
        projectId: input.projectId,
      }),
      settings,
    };
  }
  const deps = depsIn ?? (await browserRunnerDeps());
  const lookups = lookupsIn ?? (await browserPlateLookups());
  // one paid animation of a still at a time: a second press while the first runs is refused, not billed twice
  if (findLivePlateJob(await lookups.livePlateRows(input.projectId), plan.still.id))
    throw new Error("this plate is already being animated — nothing was sent");

  say("signing the plate…");
  const stillUrl = await signedUrl(plan.still.bucket as never, plan.still.path, 3600);
  const req = composePlateMotionRequest({ prompt: plan.prompt, stillUrl, seconds: plan.seconds, projectId: input.projectId });

  // WRITE-AHEAD: the record exists before the money moves. No shotId: the clip is a plate of the scene, not a shot's clip.
  say("sending the plate to the video model…");
  const rowId = await deps.insertJob({
    project_id: input.projectId,
    ...(input.variationId ? { variation_id: input.variationId } : {}),
    provider: PLATE_MOTION_PROVIDER,
    status: "queued",
    request_payload_json: {
      promptText: plan.prompt,
      mode: "image_to_video",
      modelVariant: PLATE_MOTION_MODEL,
      duration: plan.seconds,
      referenceImagePath: plan.still.path,
      settings,
    },
  });
  let env: Record<string, unknown>;
  try {
    env = await deps.callProxy(req.endpoint, req.body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await deps.updateJob(rowId, { status: "failed", error_text: message.slice(0, 500) });
    throw new Error(message);
  }
  const providerJobId = String(env.providerJobId ?? "");
  if (!providerJobId) {
    await deps.updateJob(rowId, {
      status: "failed",
      error_text: "the provider answered without a request id",
      response_payload_json: scrubEnvelope(env),
    });
    throw new Error("the provider answered without a request id");
  }
  await deps.updateJob(rowId, {
    external_job_id: providerJobId,
    status: env.status === "running" ? "running" : "queued",
    response_payload_json: scrubEnvelope(env),
  });
  void nudgeJobProgress();
  return { dryRun: false, rowId, providerJobId, estimateUsd: plan.cost.usd };
}
