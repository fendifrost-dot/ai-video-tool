/**
 * Durable step state-machine for jacket-inpaint-proxy.
 * Each edge invocation runs ONE step (or one poll slice) then self-schedules continue.
 */

import {
  ceilTo,
  cropRgba,
  decodeToRgba,
  encodePng,
  featherAlpha,
  maskToAlpha,
  padRgba,
  recomposite,
  resizeRgba,
} from "./jacketRecomposite.ts";

export const OUT_W = 1080;
export const OUT_H = 1920;
/**
 * Flux inpaint WORKING resolution — ÷16 on both axes, ~1.03 MP, ~9:16.
 *
 * flux-general/inpainting HANGS at the padded 1088×1920 (~2.1 MP) — that is far
 * above flux's ~1 MP sweet spot and the job never returns (observed 16 min → 6.7 h).
 * We therefore run flux at 768×1344 (1,032,192 px ≈ 1.03 MP), then upscale the flux
 * OUTPUT back to pad_w×pad_h and feed it to the EXACT SAME deterministic recomposite.
 * The recomposite still blends only the jacket-mask region onto the real 1080×1920
 * source, so face/glasses/scene stay sharp and untouched — only the jacket is the
 * (softer, upscaled) inpaint. A soft jacket is acceptable; the point is flux RETURNING.
 * Both scene AND mask are downscaled with the identical transform (from the padded
 * canvas) and the output is upscaled back to the same padded canvas, so mask
 * alignment is preserved end-to-end.
 */
export const FLUX_W = 768;
export const FLUX_H = 1344;
export const SIGN_TTL = 2700;
export const FAL_POLL_INTERVAL_MS = 4000;
// --- Per-fetch bounded timeouts (AbortSignal.timeout). Deno's fetch has NO
//     default request deadline, so a CC/Fal connection that opens but never
//     responds hangs forever — the retry loop can't fire (no throw, no 5xx) and
//     the isolate rides to the ~400s platform kill with no clean error. Each
//     bounded fetch instead ABORTS → throws → the existing retry engages → the
//     step fails cleanly with a real error we can see. Submit should return a
//     queue id near-instantly, so its window is tight.
export const FAL_SUBMIT_TIMEOUT_MS = 60_000;
export const FAL_POLL_FETCH_TIMEOUT_MS = 30_000;
export const DOWNLOAD_TIMEOUT_MS = 60_000;
export const SELF_INVOKE_TIMEOUT_MS = 30_000;
/** Max wall-clock spent polling Fal in a single edge invocation. */
export const POLL_SLICE_MS = 120_000;
/** Safety ceiling per invocation (platform hard limit ~400s). */
export const INVOCATION_BUDGET_MS = 350_000;
/**
 * Upper TOTAL-time cap on flux polling across ALL self-invoked slices. A padded
 * 1088×1920 flux inpaint at ~30 steps completes in ~1–5min; a job that has not
 * returned after this is dead/lost, not slow, so we fail it out instead of
 * self-invoking forever (a runaway once polled for ~5h / ~18,000,000ms). The cap
 * is evaluated from the MAX of (elapsed since flux_started_at_ms) and the
 * accumulated `timings_ms.flux_poll`, so it also trips immediately on a run that
 * was already stuck before this cap was deployed (old state has no
 * flux_started_at_ms but a huge accumulated flux_poll).
 */
export const FLUX_POLL_MAX_MS = 15 * 60_000; // 15 min
/**
 * WATCHDOG wall-clock deadline. A jacket-inpaint run that has been in a
 * non-terminal phase this long since started_at_ms is presumed DEAD (the
 * self-invoke chain was lost — the platform dropped the waitUntil, a slice
 * crashed before persisting, etc.) and is reaped to `failed` INDEPENDENT of
 * whether the chain is still alive. The 15-min in-chain flux cap only fires if
 * the chain survives; this fires even if it died. With flux now returning at
 * ~1 MP the whole pipeline completes in a few minutes, so 12 min is generous.
 */
export const WATCHDOG_STALE_MS = 12 * 60_000; // 12 min
/**
 * RESUME threshold. A non-terminal run whose last write (updated_at) is older than
 * this — but younger than the 12-min hard cap — is presumed STALLED (a self-invoke
 * handoff was dropped) and is nudged back to life by re-invoking `continue`, which
 * resumes idempotently from the last checkpoint. Must exceed a full poll slice
 * (POLL_SLICE_MS = 120s) so a run that is legitimately mid-poll — and only writes
 * at slice boundaries — is never mistaken for stalled.
 */
export const RESUME_STALL_MS = 3 * 60_000; // 3 min

export const RETRY_DELAYS_MS = [2000, 4000, 8000];

export const DEFAULTS = {
  seed: 777,
  strength: 0.85,
  guidanceScale: 5.0,
  steps: 30,
  ipAdapterScale: 0.9,
  controlnet: "none" as "depth" | "canny" | "pose" | "none",
  conditioningScale: 0.65,
  featherPx: 12,
  maskExpand: 4,
  maskPrompt: "cream off-white track jacket, upper torso clothing, sleeves",
  prompt:
    "Saint Laurent Track Jacket, cream off-white body, navy shoulder stripe, precise 'Saint Laurent' chest script, matching collar, sleeve panels, fabric drape and lighting on the body, high garment fidelity",
  negativePrompt:
    "face, glasses, hands, cap, orange pants, background, deformation, extra clothing, wrong pose, logo distortion, warped text",
  ipAdapterPath: "XLabs-AI/flux-ip-adapter-v2",
  imageEncoderPath: "openai/clip-vit-large-patch14",
  // Which inpaint model flux_submit routes to. Default keeps 746bd07 behavior
  // EXACTLY (fal-ai/flux-general/inpainting). Flip to an alternate — via the
  // JACKET_INPAINT_MODEL env var on AVT, or a per-request `inpaintModelKey` — to
  // swap instantly if flux-general/inpainting keeps 502-ing. See INPAINT_MODELS.
  inpaintModelKey: "flux-general" as InpaintModelKey,
};

export const CONTROLNET_REPOS: Record<string, string> = {
  depth: "jasperai/Flux.1-dev-Controlnet-Depth",
  canny: "Shakker-Labs/FLUX.1-dev-ControlNet-Canny",
};

/**
 * Inpaint-model registry. ONLY the flux_submit model id + payload capabilities
 * change between entries — all other plumbing (mask/depth/pad/downscale-to-~1MP/
 * crop-back/deterministic recomposite, seed 777, tracing, timeouts, resume) is
 * model-agnostic and untouched.
 *
 *   flux-general : CURRENT default. Supports ip_adapters (SL-jacket reference) AND
 *                  controlnets (depth). This is the endpoint currently 502-ing.
 *   flux-lora    : INSTANT-SWAP candidate. Same FLUX family → same ÷16 sizing / VAE
 *                  re-encode behavior, so the recomposite is unchanged and quality
 *                  profile is closest. Its schema does NOT accept ip_adapters or
 *                  controlnets, so the garment is carried by the text `prompt`
 *                  only (acceptable per "soft jacket is fine; final 4K is later").
 *                  Different Fal worker pool → not subject to flux-general's 502.
 *
 * ⚠️ Any non-default id must ALSO be added to CC's fal-run ALLOWED set
 *    (switchx-restyle, project 7fce9fc6) or CC returns model_not_allowed (400).
 */
export type InpaintModelKey = "flux-general" | "flux-lora";

export type InpaintModelSpec = {
  id: string;
  supportsIpAdapter: boolean;
  supportsControlnet: boolean;
};

export const INPAINT_MODELS: Record<InpaintModelKey, InpaintModelSpec> = {
  "flux-general": {
    id: "fal-ai/flux-general/inpainting",
    supportsIpAdapter: true,
    supportsControlnet: true,
  },
  "flux-lora": {
    id: "fal-ai/flux-lora/inpainting",
    supportsIpAdapter: false,
    supportsControlnet: false,
  },
};

export function resolveInpaintModelKey(raw: unknown): InpaintModelKey {
  return raw === "flux-lora" ? "flux-lora" : "flux-general";
}

export type PipelineParams = typeof DEFAULTS;

export type FalQueueRef = {
  model: string;
  status_url: string;
  response_url: string;
  step_name: string;
};

export type JacketInpaintStep =
  | "evf_sam_submit"
  | "evf_sam_poll"
  | "depth_submit"
  | "depth_poll"
  | "pad_upload"
  | "flux_submit"
  | "flux_poll"
  | "recomposite"
  | "complete"
  | "failed";

export type JacketInpaintState = {
  step: JacketInpaintStep;
  started_at_ms: number;
  timings_ms: Record<string, number>;
  user_id: string;
  artist_id: string;
  look_id: string;
  scene_path: string;
  scene_bucket: string;
  garment_path: string;
  params: PipelineParams;
  cn_repo: string | null;
  pad_w: number;
  pad_h: number;
  fal_queue: FalQueueRef | null;
  mask_url: string | null;
  mask_storage_path: string | null;
  depth_url: string | null;
  src_pad_storage_path: string | null;
  mask_pad_storage_path: string | null;
  depth_pad_storage_path: string | null;
  // Flux-sized (~1 MP) downscales of the padded src/mask/depth — what flux
  // actually runs on (see FLUX_W/FLUX_H). Optional/absent on pre-this-version state.
  src_flux_storage_path?: string | null;
  mask_flux_storage_path?: string | null;
  depth_flux_storage_path?: string | null;
  flux_w?: number;
  flux_h?: number;
  inpaint_url: string | null;
  source1080_storage_path: string | null;
  // --- flux diagnostics + cap (optional; absent on state written before this
  //     version — read defensively with ?? / falsy fallbacks). ---
  flux_started_at_ms?: number | null;
  /** Measured flux wall-clock from submit → returned. THE number that tells us
   *  whether lowering resolution fixed the hang. */
  flux_runtime_ms?: number | null;
  flux_input_debug?: Record<string, unknown> | null;
  flux_last_status?: string | null;
  flux_poll_count?: number;
  // --- flux submit (CC proxy call) diagnostics — pinpoints whether a stall is
  //     the CC proxy call vs Fal itself. ---
  flux_submit_cc_status?: number | null;
  flux_submit_ms?: number | null;
  // --- self-invoke (continuation) diagnostics. Records the result of the last
  //     handoff POST so a dropped continuation is visible on the row. ---
  self_invoke_last_status?: string | null;
  self_invoke_at_ms?: number | null;
};

export type CcCtx = { switchxUrl: string; pollUrl: string; proxySecret: string };

export type RunContext = {
  // NOTE: the bare `SupabaseClient` default generics (`<any, "public", any>`)
  // match what a concrete `createClient(url, key)` call returns. Using
  // `ReturnType<typeof createClient>` instead resolves the schema param to
  // `never` and mis-types every `admin` assignment (deno check TS2322/TS2345).
  admin: import("https://esm.sh/@supabase/supabase-js@2.45.0").SupabaseClient;
  cc: CcCtx;
  supabaseUrl: string;
  serviceRoleKey: string;
  recipe: Record<string, unknown>;
};

export function initialState(input: {
  lookId: string;
  userId: string;
  artistId: string;
  scenePath: string;
  sceneBucket: string;
  garmentPath: string;
  params: PipelineParams;
}): JacketInpaintState {
  const cnRepo = input.params.controlnet !== "none"
    ? (CONTROLNET_REPOS[input.params.controlnet] ?? null)
    : null;
  return {
    step: "evf_sam_submit",
    started_at_ms: Date.now(),
    timings_ms: {},
    user_id: input.userId,
    artist_id: input.artistId,
    look_id: input.lookId,
    scene_path: input.scenePath,
    scene_bucket: input.sceneBucket,
    garment_path: input.garmentPath,
    params: input.params,
    cn_repo: cnRepo,
    pad_w: ceilTo(OUT_W, 16),
    pad_h: ceilTo(OUT_H, 16),
    fal_queue: null,
    mask_url: null,
    mask_storage_path: null,
    depth_url: null,
    src_pad_storage_path: null,
    mask_pad_storage_path: null,
    depth_pad_storage_path: null,
    src_flux_storage_path: null,
    mask_flux_storage_path: null,
    depth_flux_storage_path: null,
    flux_w: FLUX_W,
    flux_h: FLUX_H,
    inpaint_url: null,
    source1080_storage_path: null,
    flux_started_at_ms: null,
    flux_runtime_ms: null,
    flux_input_debug: null,
    flux_last_status: null,
    flux_poll_count: 0,
    flux_submit_cc_status: null,
    flux_submit_ms: null,
    self_invoke_last_status: null,
    self_invoke_at_ms: null,
  };
}

export function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://") && v.trim().length < 2048;
}

export function firstImageUrl(result: Record<string, unknown>): string | null {
  const image = result?.image as { url?: string } | undefined;
  if (isHttpsUrl(image?.url)) return image!.url!.trim();
  const images = result?.images as Array<{ url?: string }> | undefined;
  if (Array.isArray(images) && isHttpsUrl(images[0]?.url)) return images[0]!.url!.trim();
  if (isHttpsUrl(result?.image_url)) return String(result.image_url).trim();
  return null;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs: number = FAL_POLL_FETCH_TIMEOUT_MS,
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    try {
      // Fresh per-attempt deadline. A hung connection aborts here (TimeoutError)
      // instead of blocking indefinitely, so the catch below can retry / fail clean.
      const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (resp.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
        lastErr = `${label}_http_${resp.status}`;
        continue;
      }
      return resp;
    } catch (e) {
      lastErr = e;
      if (attempt >= RETRY_DELAYS_MS.length) break;
    }
  }
  throw new Error(`${label}_network: ${String(lastErr)}`);
}

export async function falSubmit(
  cc: CcCtx,
  model: string,
  input: Record<string, unknown>,
  opts?: { timeoutMs?: number; diag?: Record<string, unknown> },
): Promise<FalQueueRef> {
  const t0 = Date.now();
  const submit = await fetchWithRetry(cc.switchxUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.proxySecret },
    body: JSON.stringify({ action: "fal-run", model, input }),
  }, `cc_submit_${model}`, opts?.timeoutMs ?? FAL_SUBMIT_TIMEOUT_MS);
  const ccMs = Date.now() - t0;
  const sub = await submit.json().catch(() => ({}));
  // Surface the CC proxy response so a submit hang/error is pinpointed to the CC
  // call (vs the handoff or Fal itself). Truncate the body to keep logs bounded.
  const bodyPreview = JSON.stringify(sub).slice(0, 300);
  if (opts?.diag) {
    opts.diag.cc_status = submit.status;
    opts.diag.cc_ms = ccMs;
    opts.diag.body_preview = bodyPreview;
  }
  console.log(
    `cc_submit_responded: model=${model} status=${submit.status} ms=${ccMs} body=${bodyPreview}`,
  );
  const statusUrl = String(sub?.status_url ?? "");
  const responseUrl = String(sub?.response_url ?? "");
  if (!submit.ok || !statusUrl || !responseUrl) {
    const detail = sub?.detail ? ` detail=${JSON.stringify(sub.detail).slice(0, 400)}` : "";
    throw new Error(
      `cc_submit_${model}_${submit.status}: ${sub?.error ?? JSON.stringify(sub).slice(0, 200)}${detail}`,
    );
  }
  return { model, status_url: statusUrl, response_url: responseUrl, step_name: model };
}

export async function falPollSlice(
  cc: CcCtx,
  queue: FalQueueRef,
  sliceMs: number,
): Promise<
  | { done: true; result: Record<string, unknown>; lastStatus: string; polls: number }
  | { done: false; lastStatus: string; polls: number }
> {
  const deadline = Date.now() + sliceMs;
  // Diagnostics: the last Fal queue status observed this slice (IN_QUEUE /
  // IN_PROGRESS / a transient network/5xx marker) and how many polls we made —
  // so a stuck flux job is diagnosable (queue backlog vs genuinely-long inference).
  let lastStatus = "";
  let polls = 0;
  while (Date.now() < deadline) {
    let resp: Response;
    try {
      resp = await fetchWithRetry(cc.pollUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.proxySecret },
        body: JSON.stringify({ status_url: queue.status_url, response_url: queue.response_url }),
      }, `cc_poll_${queue.model}`, FAL_POLL_FETCH_TIMEOUT_MS);
    } catch {
      lastStatus = "network_error";
      console.log(`cc_poll_responded: model=${queue.model} status=network_error`);
      await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
      continue;
    }
    if (resp.status >= 500) {
      lastStatus = `http_${resp.status}`;
      console.log(`cc_poll_responded: model=${queue.model} status=http_${resp.status}`);
      await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
      continue;
    }
    const body = await resp.json().catch(() => ({}));
    polls++;
    const status = String(body?.status ?? "");
    console.log(`cc_poll_responded: model=${queue.model} http=${resp.status} fal_status=${status || "?"}`);
    if (status) lastStatus = status;
    if (status === "COMPLETED") {
      return { done: true, result: (body?.result ?? body) as Record<string, unknown>, lastStatus, polls };
    }
    if (status === "FAILED" || body?.error) {
      throw new Error(`fal_failed_${queue.model}: ${JSON.stringify(body).slice(0, 1800)}`);
    }
    await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
  }
  return { done: false, lastStatus, polls };
}

export async function download(url: string): Promise<Uint8Array> {
  const r = await fetchWithRetry(url, { headers: { Accept: "image/*" } }, "download", DOWNLOAD_TIMEOUT_MS);
  if (!r.ok) throw new Error(`download_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// deno-lint-ignore no-explicit-any
export async function signPath(admin: any, bucket: string, path: string): Promise<string> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGN_TTL);
  if (error || !data?.signedUrl) throw new Error(`sign_failed(${bucket}/${path})`);
  return data.signedUrl as string;
}

// deno-lint-ignore no-explicit-any
export async function uploadBytes(admin: any, path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await admin.storage
    .from("look-composites")
    .upload(path, bytes, { contentType: "image/png", cacheControl: "3600", upsert: true });
  if (error) throw new Error(`upload_failed(${path}): ${error.message}`);
}

// deno-lint-ignore no-explicit-any
export async function uploadTempSigned(admin: any, path: string, bytes: Uint8Array): Promise<string> {
  await uploadBytes(admin, path, bytes);
  return signPath(admin, "look-composites", path);
}

export async function signSceneUrl(
  // deno-lint-ignore no-explicit-any
  admin: any,
  state: JacketInpaintState,
): Promise<string> {
  return signPath(admin, state.scene_bucket, state.scene_path);
}

export async function signGarmentUrl(
  // deno-lint-ignore no-explicit-any
  admin: any,
  garmentPath: string,
): Promise<string> {
  try {
    return await signPath(admin, "wardrobe-refs", garmentPath);
  } catch {
    return signPath(admin, "product-assets", garmentPath);
  }
}

/**
 * Fire the self-invoke that advances the state machine to its next step.
 *
 * This is the handoff that was silently dropping — the old version fire-and-forgot
 * the fetch (no await), so when the isolate ended before the outbound connection
 * completed, the next step NEVER RAN and the row orphaned mid-pipeline (observed:
 * checkpointed phase=flux_submit, chain died, flux never executed). Now we AWAIT
 * the POST and RETRY on network/5xx with backoff, and return the terminal status
 * so the caller can persist it (self_invoke_last_status) — making a dropped handoff
 * both far less likely AND visible on the row. The continue endpoint returns 200 as
 * soon as it accepts (the actual step runs under waitUntil), so awaiting is cheap.
 */
export async function scheduleContinue(ctx: RunContext, lookId: string): Promise<string> {
  const url = `${ctx.supabaseUrl.replace(/\/$/, "")}/functions/v1/jacket-inpaint-proxy`;
  let lastStatus = "no_attempt";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "continue", lookId }),
        // Bounded: a hung self-invoke is itself a way the chain dies silently.
        signal: AbortSignal.timeout(SELF_INVOKE_TIMEOUT_MS),
      });
      lastStatus = `http_${resp.status}`;
      // Drain/close the body so the connection is released promptly.
      await resp.body?.cancel().catch(() => {});
      if (resp.ok) return lastStatus;
      if (resp.status >= 500 && attempt < RETRY_DELAYS_MS.length) continue;
      break; // 4xx — retrying won't help
    } catch (e) {
      lastStatus = `network_error:${String(e).slice(0, 60)}`;
      if (attempt >= RETRY_DELAYS_MS.length) break;
    }
  }
  console.error(`jacket_continue_schedule_failed[${lookId}]:`, lastStatus);
  return lastStatus;
}

export async function persistState(
  ctx: RunContext,
  lookId: string,
  state: JacketInpaintState,
  extraMeta?: Record<string, unknown>,
): Promise<void> {
  const meta = {
    phase: state.step,
    pipeline_mode: "durable_steps",
    step_timings_ms: state.timings_ms,
    duration_ms: Date.now() - state.started_at_ms,
    updated_at_ms: Date.now(),
    fal_queue: state.fal_queue
      ? { model: state.fal_queue.model, step_name: state.fal_queue.step_name }
      : null,
    // Flux diagnostics (only present once flux_submit has run) — surfaced here so
    // the exact submitted payload + live queue status are visible on the row.
    ...(state.flux_input_debug ? { flux_input_debug: state.flux_input_debug } : {}),
    ...(state.flux_started_at_ms ? { flux_started_at_ms: state.flux_started_at_ms } : {}),
    ...(state.flux_runtime_ms ? { flux_runtime_ms: state.flux_runtime_ms } : {}),
    ...(state.flux_last_status ? { flux_last_status: state.flux_last_status } : {}),
    ...(state.flux_poll_count ? { flux_poll_count: state.flux_poll_count } : {}),
    ...(state.flux_submit_cc_status != null ? { flux_submit_cc_status: state.flux_submit_cc_status } : {}),
    ...(state.flux_submit_ms != null ? { flux_submit_ms: state.flux_submit_ms } : {}),
    ...(state.self_invoke_last_status ? { self_invoke_last_status: state.self_invoke_last_status } : {}),
    ...(state.self_invoke_at_ms ? { self_invoke_at_ms: state.self_invoke_at_ms } : {}),
    ...extraMeta,
  };
  await ctx.admin
    .from("artist_looks")
    .update({
      composition_recipe_json: {
        ...ctx.recipe,
        jacket_inpaint_state: state,
        generation_metadata: meta,
      },
    })
    .eq("id", lookId);
}

export async function markFailed(
  ctx: RunContext,
  lookId: string,
  state: JacketInpaintState,
  failedStep: string,
  raw: string,
): Promise<void> {
  state.step = "failed";
  await ctx.admin
    .from("artist_looks")
    .update({
      status: "failed",
      error_message: `[${failedStep}] ${raw}`.slice(0, 1000),
      composition_recipe_json: {
        ...ctx.recipe,
        jacket_inpaint_state: state,
        generation_metadata: {
          failed: true,
          failed_step: failedStep,
          fal_error_raw: raw.slice(0, 1800),
          step_timings_ms: state.timings_ms,
          duration_ms: Date.now() - state.started_at_ms,
          pipeline_mode: "durable_steps",
          // Preserve the flux diagnostics so a timeout-fail is diagnosable.
          ...(state.flux_input_debug ? { flux_input_debug: state.flux_input_debug } : {}),
          ...(state.flux_started_at_ms ? { flux_started_at_ms: state.flux_started_at_ms } : {}),
          ...(state.flux_runtime_ms ? { flux_runtime_ms: state.flux_runtime_ms } : {}),
          ...(state.flux_last_status ? { flux_last_status: state.flux_last_status } : {}),
          ...(state.flux_poll_count ? { flux_poll_count: state.flux_poll_count } : {}),
          ...(state.flux_submit_cc_status != null ? { flux_submit_cc_status: state.flux_submit_cc_status } : {}),
          ...(state.flux_submit_ms != null ? { flux_submit_ms: state.flux_submit_ms } : {}),
        },
      },
    })
    .eq("id", lookId);
}

/**
 * WATCHDOG / self-healing sweep. Walks non-terminal jacket-inpaint rows and, for
 * each, does ONE of three things based on wall-clock, INDEPENDENT of whether the
 * self-invoke chain is still alive:
 *
 *   • age > WATCHDOG_STALE_MS (12 min, hard cap): presumed dead beyond recovery →
 *     write terminal (`failed` + failed_step + fal_error_raw). Final bail.
 *   • stall > RESUME_STALL_MS (3 min since last write) but under the hard cap:
 *     presumed STALLED (a handoff was dropped) → RESUME by re-invoking `continue`,
 *     which picks up idempotently from the last checkpoint. A poll step re-polls
 *     the stored Fal status_url/response_url (no duplicate Fal job); a step that
 *     already advanced is a no-op (continue re-reads fresh state / bails if terminal).
 *   • otherwise: fresh or actively progressing → leave alone.
 *
 * Called at the head of every submit AND exposed as the `reap` action (which a
 * pg_cron job POSTs on a schedule) so stalled runs recover even when no new submit
 * arrives. Never throws — a watchdog that crashes its host request is worse than
 * one that logs and moves on. Returns counts for observability.
 */
export async function sweepStaleRuns(
  ctx: RunContext,
): Promise<{ resumed: number; reaped: number; scanned: number }> {
  const now = Date.now();
  let resumed = 0;
  let reaped = 0;
  let scanned = 0;
  try {
    const { data: rows, error } = await ctx.admin
      .from("artist_looks")
      .select("id, status, created_at, updated_at, composition_recipe_json")
      .in("status", ["pending", "processing"])
      .limit(100);
    if (error || !rows) return { resumed, reaped, scanned };
    for (const row of rows as Array<Record<string, unknown>>) {
      const recipe = (row.composition_recipe_json ?? {}) as Record<string, unknown>;
      if (recipe.pipeline_preference !== "jacket_only_inpaint_masked") continue;
      const state = recipe.jacket_inpaint_state as JacketInpaintState | undefined;
      if (!state?.step || state.step === "complete" || state.step === "failed") continue;
      scanned++;
      const startedMs = typeof state.started_at_ms === "number"
        ? state.started_at_ms
        : (row.created_at ? Date.parse(String(row.created_at)) : 0);
      const updatedMs = row.updated_at ? Date.parse(String(row.updated_at)) : startedMs;
      const ageMs = startedMs ? now - startedMs : 0;
      const stallMs = updatedMs ? now - updatedMs : ageMs;

      if (startedMs && ageMs > WATCHDOG_STALE_MS) {
        // Hard cap — write terminal. markFailed spreads ctx.recipe, so point it at
        // THIS row's recipe to preserve its own state + diagnostics.
        const rowCtx: RunContext = { ...ctx, recipe };
        await markFailed(
          rowCtx,
          String(row.id),
          state,
          `watchdog-${state.step}`,
          `watchdog_reaped_stale_run_after_${Math.round(ageMs / 1000)}s ` +
            `(no progress past hard cap; self-invoke chain presumed dead)`,
        );
        reaped++;
        console.error(
          `jacket_inpaint_watchdog_reaped: look=${row.id} step=${state.step} age=${Math.round(ageMs / 1000)}s`,
        );
        continue;
      }

      if (stallMs > RESUME_STALL_MS) {
        // Stalled but recoverable — nudge the chain back to life.
        const status = await scheduleContinue(ctx, String(row.id));
        resumed++;
        console.error(
          `jacket_inpaint_watchdog_resumed: look=${row.id} step=${state.step} ` +
            `stall=${Math.round(stallMs / 1000)}s post=${status}`,
        );
      }
    }
    return { resumed, reaped, scanned };
  } catch (e) {
    console.error("jacket_inpaint_watchdog_error:", String(e).slice(0, 300));
    return { resumed, reaped, scanned };
  }
}

export type StepResult = { terminal: true } | { terminal: false; schedule: true };

export async function runPipelineStep(
  ctx: RunContext,
  state: JacketInpaintState,
): Promise<StepResult> {
  const invStart = Date.now();
  const p = state.params;
  const { admin, cc } = ctx;
  const base = `${state.user_id}/${state.artist_id}/${state.look_id}`;

  const timed = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      state.timings_ms[key] = (state.timings_ms[key] ?? 0) + (Date.now() - t0);
    }
  };

  switch (state.step) {
    case "evf_sam_submit": {
      const humanUrl = await signSceneUrl(admin, state);
      state.fal_queue = await timed("evf_sam_submit", () =>
        falSubmit(cc, "fal-ai/evf-sam", {
          image_url: humanUrl,
          prompt: p.maskPrompt,
          mask_only: true,
          expand_mask: p.maskExpand,
          fill_holes: true,
        }));
      state.step = "evf_sam_poll";
      await persistState(ctx, state.look_id, state);
      return { terminal: false, schedule: true };
    }

    case "evf_sam_poll": {
      if (!state.fal_queue) throw new Error("evf_sam_poll_missing_queue");
      const poll = await timed("evf_sam_poll", () => falPollSlice(cc, state.fal_queue!, POLL_SLICE_MS));
      if (!poll.done) {
        await persistState(ctx, state.look_id, state, { poll_slice_exhausted: true });
        return { terminal: false, schedule: true };
      }
      state.mask_url = firstImageUrl(poll.result);
      if (!state.mask_url) throw new Error("mask_no_url");
      state.fal_queue = null;
      state.step = state.cn_repo ? "depth_submit" : "pad_upload";
      await persistState(ctx, state.look_id, state);
      return { terminal: false, schedule: true };
    }

    case "depth_submit": {
      const humanUrl = await signSceneUrl(admin, state);
      const model = p.controlnet === "canny" ? "fal-ai/imageutils/canny" : "fal-ai/imageutils/depth";
      state.fal_queue = await timed("depth_submit", () =>
        falSubmit(cc, model, { image_url: humanUrl }));
      state.step = "depth_poll";
      await persistState(ctx, state.look_id, state);
      return { terminal: false, schedule: true };
    }

    case "depth_poll": {
      if (!state.fal_queue) throw new Error("depth_poll_missing_queue");
      const poll = await timed("depth_poll", () => falPollSlice(cc, state.fal_queue!, POLL_SLICE_MS));
      if (!poll.done) {
        await persistState(ctx, state.look_id, state, { poll_slice_exhausted: true });
        return { terminal: false, schedule: true };
      }
      state.depth_url = firstImageUrl(poll.result);
      if (!state.depth_url) throw new Error(`control_${p.controlnet}_no_url`);
      state.fal_queue = null;
      state.step = "pad_upload";
      await persistState(ctx, state.look_id, state);
      return { terminal: false, schedule: true };
    }

    case "pad_upload": {
      const humanUrl = await signSceneUrl(admin, state);
      if (!state.mask_url) throw new Error("pad_missing_mask_url");
      const source1080 = resizeRgba(await decodeToRgba(await download(humanUrl)), OUT_W, OUT_H);
      const mask1080 = resizeRgba(await decodeToRgba(await download(state.mask_url)), OUT_W, OUT_H);
      state.source1080_storage_path = `${base}_source1080.png`;
      await timed("pad_upload", async () => {
        await uploadBytes(admin, state.source1080_storage_path!, await encodePng(source1080));
        // Padded ÷16 canvases (edge-fill scene/depth, black-fill mask). Kept for
        // diagnostics + as the exact geometry the flux downscale derives from.
        const srcPad = padRgba(source1080, state.pad_w, state.pad_h, "edge");
        const maskPad = padRgba(mask1080, state.pad_w, state.pad_h, "black");
        state.src_pad_storage_path = `${base}_pad_src.png`;
        state.mask_pad_storage_path = `${base}_pad_mask.png`;
        await uploadBytes(admin, state.src_pad_storage_path, await encodePng(srcPad));
        await uploadBytes(admin, state.mask_pad_storage_path, await encodePng(maskPad));
        // Flux-sized (~1 MP) downscales — what flux actually inpaints on. Scene and
        // mask get the IDENTICAL down-transform from the padded canvas, so their
        // alignment is preserved; the output is upscaled back to pad_w×pad_h before
        // the crop, so mask alignment survives the full round trip.
        state.src_flux_storage_path = `${base}_flux_src.png`;
        state.mask_flux_storage_path = `${base}_flux_mask.png`;
        await uploadBytes(admin, state.src_flux_storage_path, await encodePng(resizeRgba(srcPad, FLUX_W, FLUX_H)));
        await uploadBytes(admin, state.mask_flux_storage_path, await encodePng(resizeRgba(maskPad, FLUX_W, FLUX_H)));
        if (state.depth_url) {
          const depth1080 = resizeRgba(await decodeToRgba(await download(state.depth_url)), OUT_W, OUT_H);
          const depthPad = padRgba(depth1080, state.pad_w, state.pad_h, "edge");
          state.depth_pad_storage_path = `${base}_pad_depth.png`;
          await uploadBytes(admin, state.depth_pad_storage_path, await encodePng(depthPad));
          state.depth_flux_storage_path = `${base}_flux_depth.png`;
          await uploadBytes(admin, state.depth_flux_storage_path, await encodePng(resizeRgba(depthPad, FLUX_W, FLUX_H)));
        }
        state.mask_storage_path = `${base}_mask.png`;
        await uploadBytes(admin, state.mask_storage_path, await encodePng(mask1080));
      });
      state.step = "flux_submit";
      await persistState(ctx, state.look_id, state);
      return { terminal: false, schedule: true };
    }

    case "flux_submit": {
      // Run flux at the ~1 MP working resolution (FLUX_W×FLUX_H) — the padded
      // 2.1 MP inpaint HANGS; ~1 MP is flux's sweet spot and RETURNS. Fall back to
      // the padded images only if the flux downscales are missing (pre-version state).
      const srcFluxPath = state.src_flux_storage_path ?? state.src_pad_storage_path;
      const maskFluxPath = state.mask_flux_storage_path ?? state.mask_pad_storage_path;
      if (!srcFluxPath || !maskFluxPath) {
        throw new Error("flux_submit_missing_flux_paths");
      }
      const usingFluxSize = !!state.src_flux_storage_path && !!state.mask_flux_storage_path;
      const fluxW = usingFluxSize ? FLUX_W : state.pad_w;
      const fluxH = usingFluxSize ? FLUX_H : state.pad_h;
      // Resolve the inpaint model for THIS run (locked at submit time via
      // params.inpaintModelKey). Only the model id + which advanced fields are
      // included change — the rest of the payload is identical across models.
      const modelKey = resolveInpaintModelKey((p as PipelineParams).inpaintModelKey);
      const modelSpec = INPAINT_MODELS[modelKey];
      const modelId = modelSpec.id;
      const srcPadUrl = await signPath(admin, "look-composites", srcFluxPath);
      const maskPadUrl = await signPath(admin, "look-composites", maskFluxPath);
      const inpaintInput: Record<string, unknown> = {
        image_url: srcPadUrl,
        mask_url: maskPadUrl,
        prompt: p.prompt,
        negative_prompt: p.negativePrompt,
        strength: p.strength,
        guidance_scale: p.guidanceScale,
        num_inference_steps: p.steps,
        seed: p.seed,
        num_images: 1,
        output_format: "png",
        image_size: { width: fluxW, height: fluxH },
      };
      // IP-Adapter garment reference — only for models that accept it (flux-general).
      // On models without it (flux-lora) the garment is carried by the text prompt.
      if (modelSpec.supportsIpAdapter) {
        const garmentUrl = await signGarmentUrl(admin, state.garment_path);
        inpaintInput.ip_adapters = [{
          path: p.ipAdapterPath,
          image_encoder_path: p.imageEncoderPath,
          image_url: garmentUrl,
          scale: p.ipAdapterScale,
        }];
      }
      const depthFluxPath = state.depth_flux_storage_path ?? state.depth_pad_storage_path;
      if (modelSpec.supportsControlnet && depthFluxPath && state.cn_repo) {
        const depthPadUrl = await signPath(admin, "look-composites", depthFluxPath);
        inpaintInput.controlnets = [{
          path: state.cn_repo,
          control_image_url: depthPadUrl,
          conditioning_scale: p.conditioningScale,
          end_percentage: 0.8,
        }];
      }
      // Diagnostics: record the EXACT flux payload shape (confirm the ~1 MP working
      // size, step count, guidance/strength, that controlnets is truly empty, and
      // which src/mask images were sent) so a stuck/slow flux run is diagnosable.
      // Store storage paths (not signed URLs) to avoid leaking short-lived tokens.
      const controlnetsArr = Array.isArray(inpaintInput.controlnets)
        ? (inpaintInput.controlnets as unknown[])
        : [];
      const ipAdaptersArr = Array.isArray(inpaintInput.ip_adapters)
        ? (inpaintInput.ip_adapters as unknown[])
        : [];
      state.flux_input_debug = {
        model: modelId,
        inpaint_model_key: modelKey,
        image_size: { width: fluxW, height: fluxH },
        flux_working_megapixels: Number(((fluxW * fluxH) / 1_000_000).toFixed(2)),
        pad_size: { width: state.pad_w, height: state.pad_h },
        num_inference_steps: p.steps,
        guidance_scale: p.guidanceScale,
        strength: p.strength,
        seed: p.seed,
        ip_adapters_count: ipAdaptersArr.length,
        ip_adapter_scale: p.ipAdapterScale,
        ip_adapter_path: p.ipAdapterPath,
        controlnets_count: controlnetsArr.length,
        controlnet_repo: state.cn_repo,
        src_flux_storage_path: srcFluxPath,
        mask_flux_storage_path: maskFluxPath,
        garment_path: state.garment_path,
      };
      console.log("jacket_inpaint_flux_submit:", JSON.stringify(state.flux_input_debug));
      // Trace the CC call end-to-end so the NEXT run tells us WHY, not just THAT:
      // (a) calling → the self-invoke handoff fired and we reached the CC call;
      // (b) responded → the CC proxy answered (status+ms); (c) queued → Fal
      // accepted and returned a queue id. A gap between (a) and (b) => the CC
      // proxy call is the hang (now bounded to FAL_SUBMIT_TIMEOUT_MS); (b) with a
      // bad status => CC/Fal rejected; reaching (c) but never completing => Fal.
      console.log(
        "flux_submit_calling_cc:",
        JSON.stringify({
          cc_url: cc.switchxUrl,
          model: modelId,
          inpaint_model_key: modelKey,
          image_size: { width: fluxW, height: fluxH },
          src_flux_storage_path: srcFluxPath,
          mask_flux_storage_path: maskFluxPath,
          submit_timeout_ms: FAL_SUBMIT_TIMEOUT_MS,
        }),
      );
      const submitDiag: Record<string, unknown> = {};
      state.fal_queue = await timed("flux_submit", () =>
        falSubmit(cc, modelId, inpaintInput, {
          timeoutMs: FAL_SUBMIT_TIMEOUT_MS,
          diag: submitDiag,
        }));
      state.flux_submit_cc_status = typeof submitDiag.cc_status === "number" ? submitDiag.cc_status : null;
      state.flux_submit_ms = typeof submitDiag.cc_ms === "number"
        ? submitDiag.cc_ms
        : (state.timings_ms["flux_submit"] ?? null);
      console.log(
        `flux_submit_cc_responded: status=${state.flux_submit_cc_status ?? "?"} ms=${state.flux_submit_ms ?? "?"}`,
      );
      console.log(`flux_submit_fal_queued: id=${state.fal_queue.status_url}`);
      state.flux_started_at_ms = Date.now();
      state.step = "flux_poll";
      await persistState(ctx, state.look_id, state);
      return { terminal: false, schedule: true };
    }

    case "flux_poll": {
      if (!state.fal_queue) throw new Error("flux_poll_missing_queue");
      // --- Upper TOTAL-time cap: fail a hung/dead Fal job cleanly instead of
      //     self-invoking forever. Evaluate from the MAX of (elapsed since
      //     flux_started_at_ms) and the accumulated flux_poll timing, so this also
      //     trips on the FIRST post-deploy self-invoke of a run that was already
      //     stuck (old state carries a huge timings_ms.flux_poll but no
      //     flux_started_at_ms). Checked BEFORE polling so a stuck run terminates
      //     without burning another 120s slice.
      const fluxElapsedMs = Math.max(
        state.flux_started_at_ms ? Date.now() - state.flux_started_at_ms : 0,
        state.timings_ms["flux_poll"] ?? 0,
      );
      if (fluxElapsedMs > FLUX_POLL_MAX_MS) {
        const secs = Math.round(fluxElapsedMs / 1000);
        console.error(
          `jacket_inpaint_flux_timeout: ${secs}s > cap ${Math.round(FLUX_POLL_MAX_MS / 1000)}s` +
            ` (last_status=${state.flux_last_status ?? "?"})`,
        );
        const timedOutModel = INPAINT_MODELS[resolveInpaintModelKey(state.params.inpaintModelKey)].id;
        await markFailed(
          ctx,
          state.look_id,
          state,
          "flux-inpaint",
          `fal_timeout_${timedOutModel}_after_${secs}s`,
        );
        return { terminal: true };
      }
      const poll = await timed("flux_poll", () => falPollSlice(cc, state.fal_queue!, POLL_SLICE_MS));
      state.flux_last_status = poll.lastStatus || state.flux_last_status;
      state.flux_poll_count = (state.flux_poll_count ?? 0) + poll.polls;
      if (!poll.done) {
        await persistState(ctx, state.look_id, state, {
          poll_slice_exhausted: true,
          flux_elapsed_ms: fluxElapsedMs,
        });
        return { terminal: false, schedule: true };
      }
      state.inpaint_url = firstImageUrl(poll.result);
      if (!state.inpaint_url) throw new Error("inpaint_no_url");
      // Record the measured flux wall-clock — THE number that shows whether running
      // at ~1 MP fixed the hang. Prefer elapsed-since-submit; fall back to the
      // accumulated poll timing if flux_started_at_ms was absent (pre-version state).
      state.flux_runtime_ms = state.flux_started_at_ms
        ? Date.now() - state.flux_started_at_ms
        : (state.timings_ms["flux_poll"] ?? null);
      console.log(
        `jacket_inpaint_flux_returned: runtime_ms=${state.flux_runtime_ms}` +
          ` (${Math.round((state.flux_runtime_ms ?? 0) / 1000)}s) polls=${state.flux_poll_count}` +
          ` last_status=${state.flux_last_status ?? "?"}` +
          ` size=${state.flux_w ?? "?"}x${state.flux_h ?? "?"}`,
      );
      state.fal_queue = null;
      state.step = "recomposite";
      await persistState(ctx, state.look_id, state);
      return { terminal: false, schedule: true };
    }

    case "recomposite": {
      if (!state.source1080_storage_path || !state.mask_storage_path || !state.inpaint_url) {
        throw new Error("recomposite_missing_artifacts");
      }
      const source1080 = resizeRgba(
        await decodeToRgba(
          await download(await signPath(admin, "look-composites", state.source1080_storage_path)),
        ),
        OUT_W,
        OUT_H,
      );
      const mask1080 = resizeRgba(
        await decodeToRgba(
          await download(await signPath(admin, "look-composites", state.mask_storage_path)),
        ),
        OUT_W,
        OUT_H,
      );
      const inpaintPad = resizeRgba(await decodeToRgba(await download(state.inpaint_url)), state.pad_w, state.pad_h);
      const inpaint1080 = cropRgba(inpaintPad, OUT_W, OUT_H);
      const feathered = featherAlpha(maskToAlpha(mask1080), OUT_W, OUT_H, p.featherPx);
      const result = recomposite(source1080, inpaint1080, feathered, OUT_W, OUT_H);
      const outPng = await encodePng(result.image);
      const storagePath = `${base}.png`;

      await timed("recomposite", async () => {
        await uploadBytes(admin, storagePath, outPng);
      });

      const meta = {
        lane: "jacket_only_inpaint_masked",
        pipeline_mode: "durable_steps",
        resolution: { width: OUT_W, height: OUT_H },
        inpaint_model: INPAINT_MODELS[resolveInpaintModelKey(p.inpaintModelKey)].id,
        inpaint_model_key: resolveInpaintModelKey(p.inpaintModelKey),
        inpaint_resolution: { width: state.pad_w, height: state.pad_h },
        flux_working_resolution: { width: state.flux_w ?? FLUX_W, height: state.flux_h ?? FLUX_H },
        flux_runtime_ms: state.flux_runtime_ms ?? null,
        seed: p.seed,
        strength: p.strength,
        guidance_scale: p.guidanceScale,
        steps: p.steps,
        ip_adapter_scale: p.ipAdapterScale,
        controlnet: state.cn_repo ? p.controlnet : "none",
        controlnet_repo: state.cn_repo,
        conditioning_scale: state.cn_repo ? p.conditioningScale : null,
        feather_px: p.featherPx,
        mask_expand: p.maskExpand,
        mask_prompt: p.maskPrompt,
        mask_coverage: Number(result.maskCoverage.toFixed(4)),
        changed_pixels: result.changedPixels,
        changed_fraction: Number((result.changedPixels / (OUT_W * OUT_H)).toFixed(4)),
        mask_storage_path: state.mask_storage_path,
        garment_path: state.garment_path,
        duration_ms: Date.now() - state.started_at_ms,
        step_timings_ms: state.timings_ms,
        invocation_ms: Date.now() - invStart,
      };
      console.log("jacket_inpaint_gate_ok:", JSON.stringify(meta));

      state.step = "complete";
      await ctx.admin
        .from("artist_looks")
        .update({
          status: "complete",
          generated_image_url: storagePath,
          generated_storage_path: storagePath,
          pipeline_used: "jacket_only_inpaint_masked",
          cost_cents: 12,
          composition_recipe_json: {
            ...ctx.recipe,
            jacket_inpaint_state: state,
            generation_metadata: meta,
          },
          error_message: null,
        })
        .eq("id", state.look_id);
      return { terminal: true };
    }

    case "complete":
    case "failed":
      return { terminal: true };

    default:
      throw new Error(`unknown_step_${state.step}`);
  }
}

export async function runContinueInvocation(ctx: RunContext, lookId: string): Promise<void> {
  const { data: row, error } = await ctx.admin
    .from("artist_looks")
    .select("id, status, composition_recipe_json")
    .eq("id", lookId)
    .maybeSingle();
  if (error || !row) throw new Error("look_not_found");
  // Terminal-status bail: if the row is already done, failed, or was cancelled
  // (a run can be halted out-of-band by setting its status), RETURN immediately —
  // no poll, no self-invoke. This is the hard backstop against any runaway loop.
  if (row.status === "complete" || row.status === "failed" || row.status === "cancelled") return;

  const recipe = (row.composition_recipe_json ?? {}) as Record<string, unknown>;
  const state = recipe.jacket_inpaint_state as JacketInpaintState | undefined;
  if (!state?.step) throw new Error("missing_jacket_inpaint_state");

  const invDeadline = Date.now() + INVOCATION_BUDGET_MS;
  let failedStep = state.step;

  try {
    if (Date.now() > invDeadline) {
      throw new Error(`invocation_budget_exceeded_${Math.round(INVOCATION_BUDGET_MS / 1000)}s`);
    }
    const result = await runPipelineStep(ctx, state);
    if (!result.terminal && result.schedule) {
      // AWAIT the handoff (with retry) so the outbound POST actually completes
      // before this isolate ends — the old fire-and-forget dropped it and stranded
      // the run. Record the result on the row so a dropped handoff is diagnosable.
      const status = await scheduleContinue(ctx, lookId);
      state.self_invoke_last_status = status;
      state.self_invoke_at_ms = Date.now();
      if (!status.startsWith("http_2")) {
        // The handoff did NOT land, so no successor invocation will race this write —
        // safe to persist the failure marker. The watchdog will resume from here.
        await persistState(ctx, lookId, state, { self_invoke_failed: true }).catch(() => {});
      }
    }
  } catch (err) {
    const raw = String(err instanceof Error ? err.message : err);
    console.error(`jacket_inpaint_step_failed[${failedStep}]:`, raw.slice(0, 1000));
    await markFailed(ctx, lookId, state, failedStep, raw);
  }
}
