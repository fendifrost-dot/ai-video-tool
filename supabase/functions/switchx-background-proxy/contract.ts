/**
 * The Beeble SwitchX "background" request — what AVT asks Control Center for when it tries the OTHER way of putting
 * him in a place: Beeble regenerates the background and relights him in one generative pass (its own matte), against
 * the composite lane's cut-out over the plate. Pure: no Deno, no supabase, so the estimate the record carries and the
 * request the function sends are the same arithmetic and the same words.
 *
 * Why this exists (Fendi, 16 Oct 2026): "Switch X is the right tool I was thinking about, which removes or changes
 * the background and lighting… it did have masking and lighting all in one. It was a Beeble product." The benchmark:
 * the same dressed take through both lanes, side by side, with the cost beside each.
 *
 * Control Center's `switchx-restyle` function is the Beeble orchestrator (CC holds BEEBLE_API_KEY; AVT never does):
 * mode "background" = Beeble alpha_mode "auto" at 720p, the subject and clothing preserved, the scene from the prompt
 * and a reference picture. `queue_only` returns Beeble's job id at once; `beeble-poll-debug` on CC answers its status.
 */

export const SWITCHX_BG_LANE = "switchx_background";
export const SWITCHX_BG_PROVIDER = "beeble";
export const SWITCHX_BG_MODE = "background";
/** Beeble's list price per 30 frames of the source, by output resolution (CC's note: verified 14 Jun 2026). */
export const BEEBLE_USD_PER_30_FRAMES: Record<"720p" | "1080p", number> = { "720p": 0.1, "1080p": 0.3 };
/** The resolution CC's background mode asks Beeble for. */
export const SWITCHX_BG_RESOLUTION = "720p" as const;
/** Beeble takes at most 240 frames a job (~8 s at 30 fps); a longer source is refused before anything is sent. */
export const SWITCHX_BG_MAX_SECONDS = 8;
export const SWITCHX_BG_MAX_FRAMES = 240;
/** A stored object bigger than this is not sent, whatever its row says it lasts. */
export const SWITCHX_BG_MAX_BYTES = 200 * 1024 * 1024;
/** What a frame rate is taken to be when the source does not say (the dressed takes are ~24 fps). */
export const SWITCHX_BG_DEFAULT_FPS = 24;
/** The longest prompt forwarded. */
export const SWITCHX_BG_PROMPT_MAX = 1500;
/**
 * Where Beeble may serve a render from; a link anywhere else is not handed on (the matte lane pins fal.media the same
 * way). Beeble's own domain and the object stores a render CDN sits on; the first real answer confirms which, and an
 * unexpected host fails the job with the host named, never a download from it.
 */
export const BEEBLE_ANSWER_HOSTS: readonly RegExp[] = [/(^|\.)beeble\.ai$/i, /(^|\.)amazonaws\.com$/i, /(^|\.)cloudfront\.net$/i, /(^|\.)googleapis\.com$/i, /(^|\.)storage\.googleapis\.com$/i];
export const BEEBLE_ANSWER_URL_MAX = 2048;

/** Whether a render link is one this lane will hand on: https, bounded, on a host Beeble serves from. */
export function isBeebleAnswerUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > BEEBLE_ANSWER_URL_MAX) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && BEEBLE_ANSWER_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

/** How many frames Beeble will see: the source's length at its frame rate, whole frames, at least one. */
export function switchxFrames(seconds: number, fps: number | null): number {
  const rate = fps && fps > 0 ? fps : SWITCHX_BG_DEFAULT_FPS;
  return Math.max(1, Math.ceil(seconds * rate));
}

/** Whether a source may be sent, and why not. */
export function switchxSourceCheck(input: { seconds: number | null; isVideo: boolean }): { ok: true } | { ok: false; why: string } {
  if (!input.isVideo) return { ok: false, why: "only a video is sent to SwitchX" };
  if (input.seconds == null || !(input.seconds > 0)) return { ok: false, why: "the source has no length on its record" };
  if (input.seconds > SWITCHX_BG_MAX_SECONDS)
    return { ok: false, why: `the source is ${input.seconds.toFixed(2)} s; Beeble takes at most ${SWITCHX_BG_MAX_SECONDS} s (240 frames) a job` };
  return { ok: true };
}

/** The list price for `frames` at `resolution`: exact by the per-30-frame rate, and an upper bound at whole blocks of 30. */
export function beebleEstimateUsd(frames: number, resolution: "720p" | "1080p" = SWITCHX_BG_RESOLUTION): { usd: number; upper: number; text: string } {
  const rate = BEEBLE_USD_PER_30_FRAMES[resolution];
  const usd = Math.round((frames / 30) * rate * 1000) / 1000;
  const upper = Math.round(Math.ceil(frames / 30) * rate * 1000) / 1000;
  return {
    usd,
    upper,
    text: `≈ $${usd.toFixed(3)} for SwitchX background at ${resolution} (${frames} frames at $${rate} per 30, list; at most $${upper.toFixed(3)})`,
  };
}

/** The words Beeble is given when the caller gives none: the place, with him kept as he is. */
export function defaultBackgroundPrompt(sceneTitle: string | null): string {
  const place = sceneTitle?.trim() ? sceneTitle.trim() : "the place in the reference picture";
  return (
    `The subject performs exactly as in the source — same face, same clothes, same motion — standing in ${place}, ` +
    "the scene and its lighting taken from the reference picture: a real night street, photoreal, the same time of day and weather as the picture; no text, no captions."
  );
}

/** The prompt as sent: one line, bounded. */
export function normalizePrompt(prompt: unknown, sceneTitle: string | null): string {
  const p = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
  return (p || defaultBackgroundPrompt(sceneTitle)).slice(0, SWITCHX_BG_PROMPT_MAX);
}

export type SwitchxBackgroundRequest = {
  sourceVideoUrl: string;
  prompt: string;
  mode: typeof SWITCHX_BG_MODE;
  referenceImageUrl: string | null;
  queue_only: true;
};

/** The body CC's `switchx-restyle` takes for one background pass, queued (Beeble's id comes back at once). */
export function switchxBackgroundRequest(input: { sourceVideoUrl: string; referenceImageUrl: string | null; prompt: string }): SwitchxBackgroundRequest {
  return {
    sourceVideoUrl: input.sourceVideoUrl,
    prompt: input.prompt,
    mode: SWITCHX_BG_MODE,
    referenceImageUrl: input.referenceImageUrl,
    queue_only: true,
  };
}

export type BeebleRead = {
  state: "running" | "succeeded" | "failed";
  renderUrl: string | null;
  frames: number | null;
  resolution: string | null;
  error: string | null;
  /** Beeble's own status word, for the record. */
  status: string | null;
};

/**
 * Beeble's status answer, read: done when a render link is there (or the status says so), failed when it says so,
 * running otherwise. Field names as CC's poller reads them (`status`, `result.render`, `result.frames_processed`,
 * `result.resolution`, `error.message`).
 */
export function readBeebleStatus(json: unknown): BeebleRead {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const status = typeof j.status === "string" ? j.status.toLowerCase() : null;
  const result = (j.result && typeof j.result === "object" ? j.result : {}) as Record<string, unknown>;
  const rawRender = typeof result.render === "string" ? result.render : null;
  const renderUrl = isBeebleAnswerUrl(rawRender) ? rawRender : null;
  const frames = typeof result.frames_processed === "number" && result.frames_processed >= 0 ? result.frames_processed : null;
  const resolution = typeof result.resolution === "string" ? result.resolution.toLowerCase() : null;
  const err = (j.error && typeof j.error === "object" ? j.error : {}) as Record<string, unknown>;
  const error = typeof err.message === "string" ? err.message.slice(0, 500) : typeof j.error === "string" ? j.error.slice(0, 500) : null;
  // CC's own poller treats "complete" and "errored" as terminal too (switchx-restyle pollBeebleUntilDone)
  if (status === "failed" || status === "error" || status === "errored" || status === "cancelled" || status === "canceled")
    return { state: "failed", renderUrl: null, frames, resolution, error: error ?? `beeble ${status}`, status };
  if (renderUrl || rawRender || status === "completed" || status === "complete" || status === "succeeded" || status === "done") {
    if (renderUrl) return { state: "succeeded", renderUrl, frames, resolution, error: null, status };
    let why = "beeble finished without a render link";
    if (rawRender) {
      let host = "?";
      try {
        host = new URL(rawRender).hostname;
      } catch {
        /* not a URL */
      }
      why = `beeble's render link is on an unexpected host (${host}) — not handed on`;
    }
    return { state: "failed", renderUrl: null, frames, resolution, error: why, status };
  }
  return { state: "running", renderUrl: null, frames, resolution, error: null, status };
}
