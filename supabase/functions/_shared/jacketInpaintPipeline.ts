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
};

export const CONTROLNET_REPOS: Record<string, string> = {
  depth: "jasperai/Flux.1-dev-Controlnet-Depth",
  canny: "Shakker-Labs/FLUX.1-dev-ControlNet-Canny",
};

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
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    try {
      const resp = await fetch(url, init);
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
): Promise<FalQueueRef> {
  const submit = await fetchWithRetry(cc.switchxUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.proxySecret },
    body: JSON.stringify({ action: "fal-run", model, input }),
  }, `cc_submit_${model}`);
  const sub = await submit.json().catch(() => ({}));
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
      }, `cc_poll_${queue.model}`);
    } catch {
      lastStatus = "network_error";
      await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
      continue;
    }
    if (resp.status >= 500) {
      lastStatus = `http_${resp.status}`;
      await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
      continue;
    }
    const body = await resp.json().catch(() => ({}));
    polls++;
    const status = String(body?.status ?? "");
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
  const r = await fetchWithRetry(url, { headers: { Accept: "image/*" } }, "download");
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

export function scheduleContinue(ctx: RunContext, lookId: string): void {
  const url = `${ctx.supabaseUrl.replace(/\/$/, "")}/functions/v1/jacket-inpaint-proxy`;
  fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "continue", lookId }),
  }).catch((e) => console.error("jacket_continue_schedule_failed:", String(e).slice(0, 200)));
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
        },
      },
    })
    .eq("id", lookId);
}

/**
 * WATCHDOG / reaper. Sweeps `artist_looks` rows still `pending` in a
 * jacket-inpaint pipeline whose wall-clock (state.started_at_ms, else the row's
 * created_at) is older than WATCHDOG_STALE_MS, and writes them terminal
 * (`failed` + failed_step + fal_error_raw). This is INDEPENDENT of the
 * self-invoke chain: even if the chain died (dropped waitUntil, crashed slice)
 * the row still gets reaped. Called at the start of every new submit (and
 * exposed as a `reap` action) so a fresh run first clears any dead predecessors.
 * Returns the number of rows reaped. Never throws — a watchdog that crashes the
 * submit it rode in on would be worse than one that logs and moves on.
 */
export async function reapStaleRuns(ctx: RunContext): Promise<number> {
  const cutoffMs = Date.now() - WATCHDOG_STALE_MS;
  try {
    const { data: rows, error } = await ctx.admin
      .from("artist_looks")
      .select("id, status, created_at, composition_recipe_json")
      .eq("status", "pending")
      .limit(100);
    if (error || !rows) return 0;
    let reaped = 0;
    for (const row of rows as Array<Record<string, unknown>>) {
      const recipe = (row.composition_recipe_json ?? {}) as Record<string, unknown>;
      if (recipe.pipeline_preference !== "jacket_only_inpaint_masked") continue;
      const state = recipe.jacket_inpaint_state as JacketInpaintState | undefined;
      if (!state?.step || state.step === "complete" || state.step === "failed") continue;
      const startedMs = typeof state.started_at_ms === "number"
        ? state.started_at_ms
        : (row.created_at ? Date.parse(String(row.created_at)) : 0);
      if (!startedMs || startedMs > cutoffMs) continue; // still within deadline
      const ageSecs = Math.round((Date.now() - startedMs) / 1000);
      // markFailed spreads ctx.recipe — point it at THIS row's recipe so we
      // preserve its own state + flux diagnostics rather than overwriting them.
      const rowCtx: RunContext = { ...ctx, recipe };
      await markFailed(
        rowCtx,
        String(row.id),
        state,
        `watchdog-${state.step}`,
        `watchdog_reaped_stale_run_after_${ageSecs}s (self-invoke chain presumed dead)`,
      );
      reaped++;
      console.error(
        `jacket_inpaint_watchdog_reaped: look=${row.id} step=${state.step} age=${ageSecs}s`,
      );
    }
    return reaped;
  } catch (e) {
    console.error("jacket_inpaint_watchdog_error:", String(e).slice(0, 300));
    return 0;
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
      const srcPadUrl = await signPath(admin, "look-composites", srcFluxPath);
      const maskPadUrl = await signPath(admin, "look-composites", maskFluxPath);
      const garmentUrl = await signGarmentUrl(admin, state.garment_path);
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
        ip_adapters: [{
          path: p.ipAdapterPath,
          image_encoder_path: p.imageEncoderPath,
          image_url: garmentUrl,
          scale: p.ipAdapterScale,
        }],
      };
      const depthFluxPath = state.depth_flux_storage_path ?? state.depth_pad_storage_path;
      if (depthFluxPath && state.cn_repo) {
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
      state.flux_input_debug = {
        model: "fal-ai/flux-general/inpainting",
        image_size: { width: fluxW, height: fluxH },
        flux_working_megapixels: Number(((fluxW * fluxH) / 1_000_000).toFixed(2)),
        pad_size: { width: state.pad_w, height: state.pad_h },
        num_inference_steps: p.steps,
        guidance_scale: p.guidanceScale,
        strength: p.strength,
        seed: p.seed,
        ip_adapter_scale: p.ipAdapterScale,
        ip_adapter_path: p.ipAdapterPath,
        controlnets_count: controlnetsArr.length,
        controlnet_repo: state.cn_repo,
        src_flux_storage_path: srcFluxPath,
        mask_flux_storage_path: maskFluxPath,
        garment_path: state.garment_path,
      };
      console.log("jacket_inpaint_flux_submit:", JSON.stringify(state.flux_input_debug));
      state.fal_queue = await timed("flux_submit", () =>
        falSubmit(cc, "fal-ai/flux-general/inpainting", inpaintInput));
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
        await markFailed(
          ctx,
          state.look_id,
          state,
          "flux-inpaint",
          `fal_timeout_flux-general/inpainting_after_${secs}s`,
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
      scheduleContinue(ctx, lookId);
    }
  } catch (err) {
    const raw = String(err instanceof Error ? err.message : err);
    console.error(`jacket_inpaint_step_failed[${failedStep}]:`, raw.slice(0, 1000));
    await markFailed(ctx, lookId, state, failedStep, raw);
  }
}
