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
/**
 * The `provider_jobs.provider` column is the `provider_name` enum (runway, veo, …, fal, …, manual, other) — there is no
 * "beeble" in it, and a row inserted with one is refused (the first submit on 16 Oct 2026 failed with job_record_failed
 * for exactly that). The row is filed under the enum's `other`; the vendor is named in the payload (`vendor`) and the
 * lane says what it is. Adding an enum value would be a live schema change for one benchmark lane.
 */
export const SWITCHX_BG_PROVIDER = "other";
export const SWITCHX_BG_VENDOR = "beeble";
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
/** The failure the first live job was given when the reader looked under `result`: a job failed with it is asked again. */
export const NO_RENDER_LINK = "beeble finished without a render link";

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
export function beebleEstimateUsd(
  frames: number,
  resolution: "720p" | "1080p" = SWITCHX_BG_RESOLUTION,
  pass: "background" | "keep-mask" = "background",
): { usd: number; upper: number; text: string } {
  const rate = BEEBLE_USD_PER_30_FRAMES[resolution];
  const usd = Math.round((frames / 30) * rate * 1000) / 1000;
  const upper = Math.round(Math.ceil(frames / 30) * rate * 1000) / 1000;
  return {
    usd,
    upper,
    text: `≈ $${usd.toFixed(3)} for SwitchX ${pass} at ${resolution} (${frames} frames at $${rate} per 30, list; at most $${upper.toFixed(3)})`,
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

/**
 * The keep-mask pass (26 Nov 2026): the same orchestrator, CC mode "custom" = Beeble alpha_mode "custom". The caller's
 * own matte video says, frame by frame, what is kept from the take (WHITE) and what Beeble generates from the words and
 * the reference picture (BLACK). Beeble's guide, "Upload" mode: "White in the alpha: kept from your original footage,
 * frame for frame, and only relit and restyled", "Black in the alpha: completely generated from your prompt and
 * reference images". A CANDIDATE UNDER BENCHMARK for a clothing change (the garment black; his face, cap and the room
 * white). It has no approved asset: the approved route on his real takes stays Genjutsu `dress-clip` + the put-back.
 * This is Beeble's video path (one job of at most 240 frames), not the per-frame `vton-frame` action of the same
 * Control Center function.
 *
 * What it is NOT: a finished picture of him. The kept region is relit by the model, so the face-preserving put-back
 * (docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md) still runs after it, and the proof line is still ours to print.
 * Which SwitchX version the pay-as-you-go API serves is not stated by Beeble (its schema has no version field).
 */
export const SWITCHX_KEEP_LANE = "switchx_keep_mask";
export const SWITCHX_KEEP_MODE = "custom";
/** The lanes this function files and answers for. */
export const SWITCHX_LANES: readonly string[] = [SWITCHX_BG_LANE, SWITCHX_KEEP_LANE];
/** Control Center refuses a prompt shorter than this, after our record is written: refused here first. */
export const SWITCHX_KEEP_PROMPT_MIN = 4;

export function isSwitchxLane(lane: unknown): lane is string {
  return typeof lane === "string" && SWITCHX_LANES.includes(lane);
}

/** What a record says it measured of a video's frames (read from `metadata_json`; see `measuredVideo` in index.ts), never a declared length. */
export type MeasuredVideo = { frames: number | null; fps: number | null; width: number | null; height: number | null };

/**
 * Whether a matte may be sent with a take, and why not. Beeble pairs them frame by frame, so a matte of another
 * frame count (or a still) would keep and generate the wrong pixels, on a paid job. It fails closed: both records must
 * carry a measured frame count, the counts must be EQUAL, and the frame rate and picture size must agree where both
 * are measured. A length in seconds is not compared: the same seconds at 24 and 30 fps are different frames, and a
 * take with sound and a silent matte differ in seconds with the same frames.
 */
export function switchxKeepMaskCheck(input: { source: MeasuredVideo; mask: MeasuredVideo; maskIsVideo: boolean; sameAsset: boolean }): { ok: true } | { ok: false; why: string } {
  if (input.sameAsset) return { ok: false, why: "the matte is the take itself" };
  if (!input.maskIsVideo) return { ok: false, why: "the matte must be a video, one frame per frame of the take" };
  const { source: s, mask: m } = input;
  if (!(s.frames && s.frames > 0)) return { ok: false, why: "the take has no measured frame count on its record (set metadata_json.frame_count from a probe of the file)" };
  if (!(m.frames && m.frames > 0)) return { ok: false, why: "the matte has no measured frame count on its record (set metadata_json.frame_count from a probe of the file)" };
  if (s.frames !== m.frames) return { ok: false, why: `the matte is ${m.frames} frames and the take ${s.frames}; they must be the same frames` };
  if (s.fps && m.fps && Math.abs(s.fps - m.fps) > 0.01) return { ok: false, why: `the matte is ${m.fps} fps and the take ${s.fps} fps` };
  if (s.width && s.height && m.width && m.height && Math.abs(s.width / s.height - m.width / m.height) > 0.01)
    return { ok: false, why: `the matte is ${m.width}x${m.height} and the take ${s.width}x${s.height}: not the same picture shape` };
  return { ok: true };
}

/**
 * The words of a keep-mask pass: the caller's own, one line, bounded. There is no default: what is generated in the
 * black region is the whole instruction, and a place-and-lighting default would describe the wrong thing.
 */
export function keepMaskPrompt(prompt: unknown): { ok: true; prompt: string } | { ok: false; why: string } {
  const p = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
  if (p.length < SWITCHX_KEEP_PROMPT_MIN) return { ok: false, why: "a keep-mask pass needs the words for what is generated" };
  return { ok: true, prompt: p.slice(0, SWITCHX_BG_PROMPT_MAX) };
}

/**
 * Whether Control Center's answer says the job it queued is the keep-mask job that was asked for. Its mode reader
 * sends a mode it does not know to "background": an older deployment would drop the matte, run a paid background
 * pass and answer ok. The answer's own `generation_metadata.beeble_alpha_mode` is the evidence.
 */
export function ccRanKeepMask(generationMetadata: unknown): boolean {
  const g = (generationMetadata && typeof generationMetadata === "object" ? generationMetadata : {}) as Record<string, unknown>;
  return g.beeble_alpha_mode === SWITCHX_KEEP_MODE && typeof g.alpha_url === "string" && g.alpha_url.length > 0;
}

/**
 * What the record keeps of Control Center's `generation_metadata`: the words that say what ran. The rest is left out
 * because it carries the signed links to the take, the matte and the reference picture for as long as they live.
 */
export function recordedGenerationMetadata(generationMetadata: unknown): Record<string, unknown> | null {
  if (!generationMetadata || typeof generationMetadata !== "object") return null;
  const g = generationMetadata as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ["mode", "beeble_alpha_mode", "alpha_generated", "polarity_override"]) {
    const v = g[k];
    if (typeof v === "string" ? v.length <= 64 : typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** An upstream error line with every link taken out (a provider may quote the signed input it could not fetch). */
export function withoutLinks(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, "<link>").replace(/token=[^\s&"']+/gi, "token=<removed>");
}

/**
 * Whether the caller asked for a dry run. `dryRun` and `dry_run` (the spelling the MCP tools use) both count; a value
 * that is not a boolean is refused, because the other reading of a mistyped flag is a paid job.
 */
export function readDryRun(body: { dryRun?: unknown; dry_run?: unknown }): { ok: true; dryRun: boolean } | { ok: false } {
  let dry = false;
  for (const v of [body.dryRun, body.dry_run]) {
    if (v === undefined) continue;
    if (typeof v !== "boolean") return { ok: false };
    dry = dry || v;
  }
  return { ok: true, dryRun: dry };
}

/** The frames Beeble will see: the measured count when the record has one, else the length at the measured or default rate. */
export function switchxFramesOf(measured: MeasuredVideo, seconds: number, declaredFps: number | null): number {
  if (measured.frames && measured.frames > 0) return measured.frames;
  return switchxFrames(seconds, measured.fps && measured.fps > 0 ? measured.fps : declaredFps);
}

export type SwitchxKeepMaskRequest = {
  sourceVideoUrl: string;
  prompt: string;
  mode: typeof SWITCHX_KEEP_MODE;
  alphaUrl: string;
  referenceImageUrl: string | null;
  queue_only: true;
};

/** The body CC's `switchx-restyle` takes for one keep-mask pass, queued. CC sends the words as given (no wrapper). */
export function switchxKeepMaskRequest(input: { sourceVideoUrl: string; alphaUrl: string; referenceImageUrl: string | null; prompt: string }): SwitchxKeepMaskRequest {
  return {
    sourceVideoUrl: input.sourceVideoUrl,
    prompt: input.prompt,
    mode: SWITCHX_KEEP_MODE,
    alphaUrl: input.alphaUrl,
    referenceImageUrl: input.referenceImageUrl,
    queue_only: true,
  };
}

export type BeebleRead = {
  state: "running" | "succeeded" | "failed";
  renderUrl: string | null;
  /** Beeble's alpha (the matte it cut him with) when it hands one back beside the render — a second matte source. */
  alphaUrl: string | null;
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
  // Beeble's real answer (VERIFIED 16 Oct 2026, job swx_iIawxiSLvr3mUhQQFqxHN) carries the links under `output`
  // ({render, source, alpha}); CC's poller spoke of `result`. Both are read — the first live job was marked failed
  // ("finished without a render link") while its render sat under `output.render`.
  const result = ((j.output && typeof j.output === "object" ? j.output : null) ?? (j.result && typeof j.result === "object" ? j.result : {})) as Record<string, unknown>;
  const rawRender = typeof result.render === "string" ? result.render : null;
  const renderUrl = isBeebleAnswerUrl(rawRender) ? rawRender : null;
  const framesRaw = [result.frames_processed, j.frames_processed].find((v) => typeof v === "number");
  const frames = typeof framesRaw === "number" && framesRaw >= 0 ? framesRaw : null;
  const resRaw = [result.resolution, j.resolution].find((v) => typeof v === "string");
  const resolution = typeof resRaw === "string" ? resRaw.toLowerCase() : null;
  const err = (j.error && typeof j.error === "object" ? j.error : {}) as Record<string, unknown>;
  const error = typeof err.message === "string" ? err.message.slice(0, 500) : typeof j.error === "string" ? j.error.slice(0, 500) : null;
  // CC's own poller treats "complete" and "errored" as terminal too (switchx-restyle pollBeebleUntilDone)
  if (status === "failed" || status === "error" || status === "errored" || status === "cancelled" || status === "canceled")
    return { state: "failed", renderUrl: null, alphaUrl: null, frames, resolution, error: error ?? `beeble ${status}`, status };
  if (renderUrl || rawRender || status === "completed" || status === "complete" || status === "succeeded" || status === "done") {
    const rawAlpha = typeof result.alpha === "string" ? result.alpha : null;
    if (renderUrl) return { state: "succeeded", renderUrl, alphaUrl: isBeebleAnswerUrl(rawAlpha) ? rawAlpha : null, frames, resolution, error: null, status };
    let why: string = NO_RENDER_LINK;
    if (rawRender) {
      let host = "?";
      try {
        host = new URL(rawRender).hostname;
      } catch {
        /* not a URL */
      }
      why = `beeble's render link is on an unexpected host (${host}) — not handed on`;
    }
    return { state: "failed", renderUrl: null, alphaUrl: null, frames, resolution, error: why, status };
  }
  return { state: "running", renderUrl: null, alphaUrl: null, frames, resolution, error: null, status };
}
