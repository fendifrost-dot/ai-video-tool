/**
 * Browser mirror of supabase/functions/_shared/matteRequest.ts — the same constants and arithmetic, so the cost the
 * storyboard shows before the press is the cost the edge function computes after it. Edge functions cannot import
 * from src/ and the app does not import from supabase/functions/, so the two are kept identical by hand and held
 * together by matteRequest.mirror.test.ts.
 */

/** The one model this lane sends to; the others CC's allowlist carries are not driven from here yet. */
export const MATTE_MODEL = "veed/video-background-removal";
/** Fal's list price with refined edges on: per 30 frames of the source. */
export const MATTE_USD_PER_30_FRAMES = 0.0225;
/** A source longer than this is not sent: a composite is of one shot's window, not of a whole take. */
export const MATTE_MAX_SECONDS = 60;
/** A stored object bigger than this is not sent, whatever its row says it lasts (a 60 s 1080p clip is ~60 MB). */
export const MATTE_MAX_BYTES = 200 * 1024 * 1024;
/** An answer file bigger than this is not read: the browser holds it whole to decode it. */
export const MATTE_MAX_ANSWER_BYTES = 300 * 1024 * 1024;
/** Where Fal serves a job's answer files from; a link anywhere else is not followed. */
export const MATTE_ANSWER_HOST = /(^|\.)fal\.media$/;
/** What a frame rate is taken to be when the source does not say (the dressed takes are 24 fps). */
export const MATTE_DEFAULT_FPS = 24;

export type MatteInput = {
  video_url: string;
  output_codec: "h264";
  refine_foreground_edges: true;
  subject_is_person: true;
};

/** The exact body CC's fal-run forwards to the model. `videoUrl` is a signed link to the dressed take. */
export function buildMatteInput(videoUrl: string): MatteInput {
  return {
    video_url: videoUrl,
    output_codec: "h264",
    refine_foreground_edges: true,
    subject_is_person: true,
  };
}

/** How many frames the source has, from what is known of it. */
export function matteFrames(
  seconds: number,
  fps: number | null | undefined = MATTE_DEFAULT_FPS,
): number {
  const rate = fps && fps > 0 ? fps : MATTE_DEFAULT_FPS;
  return Math.max(1, Math.round(seconds * rate));
}

/**
 * What the matte costs at list price. `usd` prorates the 30-frame unit; `upper` rounds the frames up to whole units,
 * which is the most the provider can charge if it bills per started unit (its page does not say which).
 */
export function matteEstimateUsd(frames: number): { usd: number; upper: number; text: string } {
  const n = Math.max(1, Math.round(frames));
  const usd = Math.round((n / 30) * MATTE_USD_PER_30_FRAMES * 10000) / 10000;
  const upper = Math.round(Math.ceil(n / 30) * MATTE_USD_PER_30_FRAMES * 10000) / 10000;
  return {
    usd,
    upper,
    text: `≈ $${usd.toFixed(3)} for the matte (${n} frames at $${MATTE_USD_PER_30_FRAMES} per 30, list; at most $${upper.toFixed(3)})`,
  };
}

/** Whether a source may be sent at all, and why not. */
export function matteSourceCheck(input: {
  seconds: number | null;
  isVideo: boolean;
}): { ok: true } | { ok: false; why: string } {
  if (!input.isVideo) return { ok: false, why: "only a video can be matted" };
  if (input.seconds == null || !(input.seconds > 0))
    return { ok: false, why: "the take's length is not known, so its cost is not" };
  if (input.seconds > MATTE_MAX_SECONDS)
    return {
      ok: false,
      why: `a source of ${input.seconds.toFixed(1)} s is longer than the ${MATTE_MAX_SECONDS} s this lane sends`,
    };
  return { ok: true };
}

/** Whether a link is one of Fal's own answer files: https, on fal.media. */
export function isMatteAnswerUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" && MATTE_ANSWER_HOST.test(u.hostname) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}

/**
 * The files a finished matte job answers with. The model returns `video: [File, File]` for h264 — an RGB video and
 * an alpha video — and its page does not say in which order, so the browser tells them apart by looking (the alpha
 * one is grey). This only pulls the links out of the answer, whatever order they came in, and only Fal's own links.
 */
export function matteResultUrls(result: unknown): string[] {
  const r = result as { video?: unknown } | null;
  const v = r?.video;
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list
    .map((f) => (f && typeof f === "object" ? (f as { url?: unknown }).url : undefined))
    .filter(isMatteAnswerUrl);
}
