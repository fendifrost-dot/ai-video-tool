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
export const SIGN_TTL = 2700;
export const FAL_POLL_INTERVAL_MS = 4000;
/** Max wall-clock spent polling Fal in a single edge invocation. */
export const POLL_SLICE_MS = 120_000;
/** Safety ceiling per invocation (platform hard limit ~400s). */
export const INVOCATION_BUDGET_MS = 350_000;

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
  inpaint_url: string | null;
  source1080_storage_path: string | null;
};

export type CcCtx = { switchxUrl: string; pollUrl: string; proxySecret: string };

export type RunContext = {
  admin: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2.45.0").createClient>;
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
    inpaint_url: null,
    source1080_storage_path: null,
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
): Promise<{ done: true; result: Record<string, unknown> } | { done: false }> {
  const deadline = Date.now() + sliceMs;
  while (Date.now() < deadline) {
    let resp: Response;
    try {
      resp = await fetchWithRetry(cc.pollUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.proxySecret },
        body: JSON.stringify({ status_url: queue.status_url, response_url: queue.response_url }),
      }, `cc_poll_${queue.model}`);
    } catch {
      await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
      continue;
    }
    if (resp.status >= 500) {
      await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
      continue;
    }
    const body = await resp.json().catch(() => ({}));
    const status = String(body?.status ?? "");
    if (status === "COMPLETED") {
      return { done: true, result: (body?.result ?? body) as Record<string, unknown> };
    }
    if (status === "FAILED" || body?.error) {
      throw new Error(`fal_failed_${queue.model}: ${JSON.stringify(body).slice(0, 1800)}`);
    }
    await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
  }
  return { done: false };
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
        },
      },
    })
    .eq("id", lookId);
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
        state.src_pad_storage_path = `${base}_pad_src.png`;
        state.mask_pad_storage_path = `${base}_pad_mask.png`;
        await uploadBytes(
          admin,
          state.src_pad_storage_path,
          await encodePng(padRgba(source1080, state.pad_w, state.pad_h, "edge")),
        );
        await uploadBytes(
          admin,
          state.mask_pad_storage_path,
          await encodePng(padRgba(mask1080, state.pad_w, state.pad_h, "black")),
        );
        if (state.depth_url) {
          const depth1080 = resizeRgba(await decodeToRgba(await download(state.depth_url)), OUT_W, OUT_H);
          state.depth_pad_storage_path = `${base}_pad_depth.png`;
          await uploadBytes(
            admin,
            state.depth_pad_storage_path,
            await encodePng(padRgba(depth1080, state.pad_w, state.pad_h, "edge")),
          );
        }
        state.mask_storage_path = `${base}_mask.png`;
        await uploadBytes(admin, state.mask_storage_path, await encodePng(mask1080));
      });
      state.step = "flux_submit";
      await persistState(ctx, state.look_id, state);
      return { terminal: false, schedule: true };
    }

    case "flux_submit": {
      if (!state.src_pad_storage_path || !state.mask_pad_storage_path) {
        throw new Error("flux_submit_missing_pad_paths");
      }
      const srcPadUrl = await signPath(admin, "look-composites", state.src_pad_storage_path);
      const maskPadUrl = await signPath(admin, "look-composites", state.mask_pad_storage_path);
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
        image_size: { width: state.pad_w, height: state.pad_h },
        ip_adapters: [{
          path: p.ipAdapterPath,
          image_encoder_path: p.imageEncoderPath,
          image_url: garmentUrl,
          scale: p.ipAdapterScale,
        }],
      };
      if (state.depth_pad_storage_path && state.cn_repo) {
        const depthPadUrl = await signPath(admin, "look-composites", state.depth_pad_storage_path);
        inpaintInput.controlnets = [{
          path: state.cn_repo,
          control_image_url: depthPadUrl,
          conditioning_scale: p.conditioningScale,
          end_percentage: 0.8,
        }];
      }
      state.fal_queue = await timed("flux_submit", () =>
        falSubmit(cc, "fal-ai/flux-general/inpainting", inpaintInput));
      state.step = "flux_poll";
      await persistState(ctx, state.look_id, state);
      return { terminal: false, schedule: true };
    }

    case "flux_poll": {
      if (!state.fal_queue) throw new Error("flux_poll_missing_queue");
      const poll = await timed("flux_poll", () => falPollSlice(cc, state.fal_queue!, POLL_SLICE_MS));
      if (!poll.done) {
        await persistState(ctx, state.look_id, state, { poll_slice_exhausted: true });
        return { terminal: false, schedule: true };
      }
      state.inpaint_url = firstImageUrl(poll.result);
      if (!state.inpaint_url) throw new Error("inpaint_no_url");
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
  if (row.status === "complete" || row.status === "failed") return;

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
