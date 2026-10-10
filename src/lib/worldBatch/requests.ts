/**
 * The provider request for one shot — the same endpoint and body run_world_batch.py's motion_submit() sends, so a shot
 * list behaves identically from the script and from the app.
 */
import { seedanceAnglePrompt, wrapPrompt, type LookPreset } from "@/lib/shotCompiler";
import type { BatchShot } from "./dialect";
import { billedSeconds, sourceSeconds } from "./estimate";
import { PROMPT_CAPS } from "./rates";

export type MotionRequest = {
  endpoint: "video-providers-higgsfield-model" | "video-providers-higgsfield-generate" | "video-providers-runway-generate";
  provider: "higgsfield" | "runway";
  modelVariant: string;
  body: Record<string, unknown>;
};

export function providerOfRoute(route: BatchShot["route"]): "higgsfield" | "runway" {
  return route === "still_runway" || route === "still_runway45" || route === "runway_t2v" ? "runway" : "higgsfield";
}

/** The prompt that generates the still (xAI): preamble + scene + suffix. */
export function stillPrompt(shot: BatchShot, look: LookPreset | null): string {
  return wrapPrompt(shot.prompt, look, { maxChars: PROMPT_CAPS.xai });
}

/** The prompt the motion model receives (run_world_batch.py main loop, step 1). */
export function motionPrompt(shot: BatchShot, look: LookPreset | null, hasStill: boolean): string {
  // a shot asked for with timed changes is not also told that its place never changes
  if (shot.route === "seedance_ref") {
    const dress = shot.dress.length > 0 ? { pieces: shot.dress.map((d) => d.label), words: shot.dress_words } : null;
    const prompt = seedanceAnglePrompt(shot.angle ?? "", shot.keep, look, hasStill, { timedChanges: !!shot.temporal, dress });
    // A dressed restaging says more, and the provider takes only so much: a prompt cut short would lose the place's
    // light or the look — or, worse, be cut by someone else, mid-garment. It is refused here, before the job row and
    // the provider. (A place picture drawn first for this shot has been paid for by then: review finding A4 / S2.)
    if (dress && prompt.length > PROMPT_CAPS.higgsfield) {
      throw new Error(`${shot.id}: the request that dresses him is ${prompt.length} characters and the video model takes ${PROMPT_CAPS.higgsfield} — shorten the outfit's words or take a piece off the shot. Nothing was sent.`);
    }
    return prompt;
  }
  const cap = PROMPT_CAPS[providerOfRoute(shot.route)];
  // image-to-video: the still already carries the look — the prompt is the motion sentence plus the suffix
  return hasStill
    ? wrapPrompt(shot.motion || shot.prompt, look, { preamble: false, maxChars: cap })
    : wrapPrompt(shot.prompt, look, { maxChars: cap });
}

export function buildMotionRequest(
  shot: BatchShot,
  ctx: {
    prompt: string;
    stillUrl?: string | null;
    sourceUrl?: string | null;
    /** One link per garment of `shot.dress`, in its order (seedance_ref). */
    dressUrls?: readonly string[];
    userId: string;
    projectId: string;
  },
): MotionRequest {
  const audit = { avt_user_id: ctx.userId, avt_project_id: ctx.projectId };
  const stillUrl = ctx.stillUrl ?? null;
  if (shot.route === "seedance_ref") {
    if (!ctx.sourceUrl) throw new Error(`${shot.id}: seedance_ref needs the source clip's URL`);
    // The prompt names each garment by the position of its picture: one that is missing would shift every name after
    // it onto the wrong picture, and one that is dropped would leave him in the take's clothes with nothing said.
    const dressUrls = ctx.dressUrls ?? [];
    if (dressUrls.length !== shot.dress.length || dressUrls.some((u) => !u)) {
      throw new Error(`${shot.id}: the shot dresses him in ${shot.dress.length} garment picture${shot.dress.length === 1 ? "" : "s"} and ${dressUrls.filter(Boolean).length} could be read — nothing was sent`);
    }
    const sec = Math.max(4, Math.min(30, Math.round(sourceSeconds(shot))));
    return {
      endpoint: "video-providers-higgsfield-model",
      provider: "higgsfield",
      modelVariant: "seedance-2.5-reference",
      body: {
        promptText: ctx.prompt,
        mode: "reference_to_video",
        modelVariant: "seedance-2.5-reference",
        referenceVideoUrls: [ctx.sourceUrl],
        // the place first (@Image1), then the garments in the order the prompt names them
        referenceImageUrls: [...(stillUrl ? [stillUrl] : []), ...dressUrls],
        duration: sec,
        resolution: shot.resolution,
        aspectRatio: shot.aspect,
        generate_audio: false,
        ...audit,
      },
    };
  }
  if (shot.route === "still_dop") {
    const model = shot.model ?? "dop-turbo";
    return {
      endpoint: "video-providers-higgsfield-generate",
      provider: "higgsfield",
      modelVariant: model,
      body: { promptText: ctx.prompt, mode: "image_to_video", referenceImageUrl: stillUrl, modelVariant: model, ...audit },
    };
  }
  const duration = billedSeconds(shot);
  if (providerOfRoute(shot.route) === "runway") {
    const model = shot.route === "still_runway" ? "gen4_turbo" : "gen4.5";
    const body: Record<string, unknown> = {
      promptText: ctx.prompt,
      mode: stillUrl ? "image_to_video" : "text_to_video",
      modelVariant: model,
      duration,
      aspectRatio: shot.aspect,
      ...audit,
    };
    if (stillUrl) body.referenceImageUrl = stillUrl;
    return { endpoint: "video-providers-runway-generate", provider: "runway", modelVariant: model, body };
  }
  const model = stillUrl ? "kling-2.5-turbo-pro-i2v" : "kling-2.5-turbo-pro-t2v";
  const body: Record<string, unknown> = {
    promptText: ctx.prompt,
    mode: stillUrl ? "image_to_video" : "text_to_video",
    modelVariant: model,
    duration,
    ...audit,
  };
  if (stillUrl) body.referenceImageUrl = stillUrl;
  return { endpoint: "video-providers-higgsfield-model", provider: "higgsfield", modelVariant: model, body };
}

/**
 * Why the still generator did not draw, in words. It answers with a code ("xai_error", "cost_gate") and, beside it,
 * what the image model itself said — "the image failed — xai_error" told the director nothing about a refusal that
 * the second attempt was bound to repeat.
 */
export function stillFailure(data: Record<string, unknown>): string {
  const code = typeof data.error === "string" && data.error ? data.error : "the image generator failed";
  if (code === "cost_gate") return `this would cost about $${Number(data.estimatedCostUsd ?? 0).toFixed(2)}, above the limit of $${Number(data.maxCostUsd ?? 0).toFixed(2)} for one request`;
  const detail = data.detail as { error?: unknown; message?: unknown; code?: unknown; _raw?: unknown } | string | null | undefined;
  const said =
    typeof detail === "string"
      ? detail
      : detail && typeof detail === "object"
        ? typeof detail.error === "string"
          ? detail.error
          : detail.error && typeof detail.error === "object" && typeof (detail.error as { message?: unknown }).message === "string"
            ? (detail.error as { message: string }).message
            : typeof detail.message === "string"
              ? detail.message
              : typeof detail._raw === "string"
                ? detail._raw
                : ""
        : "";
  // the image model took fewer pictures than the generator lists for it: nothing was drawn and nothing is billed, and
  // every still of this size will be refused the same way until the limit is lowered — say that, not the raw answer
  const fewer = /at most (\d+) input image/i.exec(said);
  if (fewer) return `the image model took at most ${fewer[1]} reference pictures, fewer than the generator lists for it — nothing was drawn. Until the limit is corrected, send no more than ${fewer[1]} pictures with a still`;
  const status = typeof data.httpStatus === "number" ? ` (${data.httpStatus})` : "";
  const who = code === "xai_error" ? "the image model refused" : code;
  return said.trim() ? `${who}${status}: ${said.trim().slice(0, 300)}` : `${who}${status}`;
}
