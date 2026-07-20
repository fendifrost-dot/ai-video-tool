// AVT edge function — jacket-inpaint-proxy
//
// Durable step state-machine: each invocation runs one pipeline step (or one
// Fal poll slice) then self-schedules continue via service-role fetch.
// Survives Supabase ~400s waitUntil wall clock — no orphaned pending rows.
//
// See docs/AVT_jacket_inpaint_fal_payload.md and CURSOR_HANDOFF_avt_persistence.md.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pickVtonGarmentPath } from "../_shared/garmentReference.ts";
import {
  DEFAULTS,
  initialState,
  type InpaintModelKey,
  INPAINT_MODELS,
  resolveInpaintModelKey,
  runContinueInvocation,
  scheduleContinue,
  sweepStaleRuns,
  type PipelineParams,
  type RunContext,
} from "../_shared/jacketInpaintPipeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SubmitBody = {
  artistId: string;
  wardrobeFeatureId: string;
  scenePath: string;
  sceneBucket?: string;
  humanImageUrl?: string;
  name?: string;
  projectId?: string;
  heroFrameSessionId?: string;
  candidateIndex?: number;
  seed?: number;
  strength?: number;
  guidanceScale?: number;
  steps?: number;
  ipAdapterScale?: number;
  controlnet?: "depth" | "canny" | "pose" | "none";
  conditioningScale?: number;
  featherPx?: number;
  maskExpand?: number;
  maskPrompt?: string;
  prompt?: string;
  negativePrompt?: string;
  // Face-guard mask (second evf-sam pass, subtracted from the garment mask).
  // Defaults on; see DEFAULTS.faceGuard.
  faceGuard?: boolean;
  faceGuardPrompt?: string;
  faceGuardDilate?: number;
  // Optional per-request inpaint-model override ("flux-general" | "flux-lora").
  // Precedence: request body > JACKET_INPAINT_MODEL env > default (flux-general).
  inpaintModelKey?: InpaintModelKey;
};

type ContinueBody = {
  action: "continue";
  lookId: string;
};

function reapCtx(
  admin: RunContext["admin"],
  supabaseUrl: string,
  serviceRoleKey: string,
  cc: RunContext["cc"],
): RunContext {
  return { admin, supabaseUrl, serviceRoleKey, cc, recipe: {} };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://") && v.trim().length < 2048;
}

function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k in obj) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

function ccSwitchxUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/switchx-restyle");
}

function ccFalPollUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/fal-queue-poll");
}

function isServiceRoleRequest(req: Request, serviceRoleKey: string): boolean {
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${serviceRoleKey}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const composeCcUrl = Deno.env.get("COMPOSE_LOOK_CC_URL")?.trim() ?? "";
  const proxySecret =
    Deno.env.get("SWITCHX_PROXY_SECRET")?.trim() ||
    Deno.env.get("COMPOSE_LOOK_PROXY_SECRET")?.trim() ||
    "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }
  if (!composeCcUrl || !proxySecret) {
    return json(503, {
      error: "cc_not_configured",
      detail: "Set COMPOSE_LOOK_CC_URL and SWITCHX_PROXY_SECRET on AVT.",
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  // --- Internal continue (service-role self-invoke) --------------------
  if (rawBody.action === "continue") {
    if (!isServiceRoleRequest(req, serviceRoleKey)) {
      return json(401, { error: "continue_requires_service_role" });
    }
    const body = rawBody as ContinueBody;
    if (!body.lookId) return json(400, { error: "missing_look_id" });

    const ctx: RunContext = {
      admin,
      supabaseUrl,
      serviceRoleKey,
      cc: {
        switchxUrl: ccSwitchxUrl(composeCcUrl),
        pollUrl: ccFalPollUrl(composeCcUrl),
        proxySecret,
      },
      recipe: {},
    };

    const { data: row } = await admin
      .from("artist_looks")
      .select("composition_recipe_json")
      .eq("id", body.lookId)
      .maybeSingle();
    ctx.recipe = (row?.composition_recipe_json ?? {}) as Record<string, unknown>;

    const run = () => runContinueInvocation(ctx, body.lookId);
    const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
      .EdgeRuntime;
    if (er?.waitUntil) {
      er.waitUntil(run());
    } else {
      await run();
    }
    return json(200, { ok: true, action: "continue", lookId: body.lookId });
  }

  // --- Watchdog sweep (service-role, standalone) -----------------------
  // A dead self-invoke chain can't advance or fail its own row. This action sweeps
  // non-terminal jacket-inpaint rows and, INDEPENDENT of the chain, RESUMES the
  // stalled ones (re-invokes `continue`) and hard-fails the ones past the 12-min
  // cap. Callable by pg_cron (via pg_net) or manually; the same sweep also runs at
  // the head of every submit. Kept reachable under the historical `reap` action too.
  if (rawBody.action === "reap" || rawBody.action === "sweep") {
    if (!isServiceRoleRequest(req, serviceRoleKey)) {
      return json(401, { error: "sweep_requires_service_role" });
    }
    const cc = {
      switchxUrl: ccSwitchxUrl(composeCcUrl),
      pollUrl: ccFalPollUrl(composeCcUrl),
      proxySecret,
    };
    const result = await sweepStaleRuns(reapCtx(admin, supabaseUrl, serviceRoleKey, cc));
    return json(200, { ok: true, action: "sweep", ...result });
  }

  // --- User submit -----------------------------------------------------
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "missing_bearer" });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;

  const body = rawBody as SubmitBody;
  if (!body?.artistId || !body?.wardrobeFeatureId) {
    return json(400, { error: "missing_artist_or_wardrobe" });
  }
  if (!body?.scenePath && !isHttpsUrl(body?.humanImageUrl)) {
    return json(400, { error: "missing_scene", detail: "Provide scenePath or humanImageUrl." });
  }

  // Inpaint-model toggle. Precedence: request body > JACKET_INPAINT_MODEL env >
  // default. Locked into the run's params here so it stays consistent across all
  // self-invoked steps (env changes affect NEW runs only). Flip the env to swap
  // instantly if flux-general/inpainting keeps 502-ing — one config step, no code
  // change. NOTE: the chosen id must also be in CC's fal-run allowlist.
  const envModel = Deno.env.get("JACKET_INPAINT_MODEL")?.trim();
  const inpaintModelKey = resolveInpaintModelKey(body.inpaintModelKey ?? envModel);
  const p = { ...DEFAULTS, ...clean(body), inpaintModelKey } as PipelineParams;

  const { data: wardrobe, error: wErr } = await admin
    .from("character_features")
    .select("id, artist_id, feature_type, label, file_url, storage_path, reference_images")
    .eq("id", body.wardrobeFeatureId)
    .maybeSingle();
  if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
  if (!wardrobe || wardrobe.artist_id !== body.artistId) {
    return json(404, { error: "wardrobe_not_found" });
  }

  const refImages = Array.isArray(wardrobe.reference_images) ? wardrobe.reference_images : [];
  const garmentPath = pickVtonGarmentPath(refImages, wardrobe.storage_path ?? wardrobe.file_url);
  if (!garmentPath) return json(404, { error: "wardrobe_no_image" });

  if (!body.scenePath && isHttpsUrl(body.humanImageUrl)) {
    return json(400, {
      error: "scene_path_required",
      detail: "Durable pipeline requires scenePath for re-signing across steps.",
    });
  }

  // Watchdog: before starting a new run, sweep predecessors — RESUME any stalled
  // chain and hard-fail any past the cap. Fires even if that run's self-invoke
  // chain died. Run in the background (waitUntil) so it never delays the user's
  // submit; sweepStaleRuns is self-contained (never throws).
  {
    const cc = {
      switchxUrl: ccSwitchxUrl(composeCcUrl),
      pollUrl: ccFalPollUrl(composeCcUrl),
      proxySecret,
    };
    const sweep = sweepStaleRuns(reapCtx(admin, supabaseUrl, serviceRoleKey, cc));
    const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
      .EdgeRuntime;
    if (er?.waitUntil) er.waitUntil(sweep);
    else await sweep;
  }

  const lookId = crypto.randomUUID();
  const sceneBucket = body.sceneBucket ?? "project-references";
  const scenePath = body.scenePath!;

  const pipelineState = initialState({
    lookId,
    userId,
    artistId: body.artistId,
    scenePath,
    sceneBucket,
    garmentPath,
    params: p,
  });

  const recipe = {
    pipeline_preference: "jacket_only_inpaint_masked",
    wardrobe_feature_id: wardrobe.id,
    garment_path_used: garmentPath,
    scene_path: scenePath,
    scene_bucket: sceneBucket,
    hero_frame_session_id: body.heroFrameSessionId ?? null,
    hero_frame_candidate_index: body.candidateIndex ?? null,
    hero_frame_project_id: body.projectId ?? null,
    params: {
      seed: p.seed,
      strength: p.strength,
      guidance_scale: p.guidanceScale,
      steps: p.steps,
      ip_adapter_scale: p.ipAdapterScale,
      controlnet: p.controlnet,
      conditioning_scale: p.conditioningScale,
      feather_px: p.featherPx,
      mask_expand: p.maskExpand,
      mask_prompt: p.maskPrompt,
      face_guard: p.faceGuard,
      face_guard_prompt: p.faceGuard ? p.faceGuardPrompt : null,
      face_guard_dilate: p.faceGuard ? p.faceGuardDilate : null,
      inpaint_model_key: inpaintModelKey,
      inpaint_model: INPAINT_MODELS[inpaintModelKey].id,
    },
    jacket_inpaint_state: pipelineState,
    generation_metadata: {
      phase: "evf_sam_submit",
      pipeline_mode: "durable_steps",
      duration_ms: 0,
    },
  };

  const { data: childLook, error: insErr } = await userClient
    .from("artist_looks")
    .insert({
      id: lookId,
      artist_id: body.artistId,
      user_id: userId,
      name: body.name ?? `Jacket-Only Inpaint · ${String(wardrobe.label).slice(0, 40)}`,
      description:
        "Jacket-only masked inpaint (IP-Adapter + ControlNet) with deterministic real-pixel recomposite.",
      status: "pending",
      generated_image_url: null,
      generated_storage_path: null,
      composition_recipe_json: recipe,
      pipeline_used: null,
      cost_cents: 0,
      iterations: 1,
      parent_look_id: null,
    })
    .select("*")
    .single();
  if (insErr || !childLook) {
    return json(500, { error: "look_insert_failed", detail: insErr?.message });
  }

  const ctx: RunContext = {
    admin,
    supabaseUrl,
    serviceRoleKey,
    cc: {
      switchxUrl: ccSwitchxUrl(composeCcUrl),
      pollUrl: ccFalPollUrl(composeCcUrl),
      proxySecret,
    },
    recipe,
  };
  // Kick off the state machine. scheduleContinue is now awaited internally (with
  // retry) — run it under waitUntil so the handoff POST completes before this
  // isolate ends without delaying the user's response. If it still drops, the
  // watchdog sweep resumes the run from its first checkpoint within a few minutes.
  {
    const kickoff = scheduleContinue(ctx, lookId).then((status) =>
      console.log(`jacket_inpaint_kickoff[${lookId}]: post=${status}`)
    );
    const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
      .EdgeRuntime;
    if (er?.waitUntil) er.waitUntil(kickoff);
    else await kickoff;
  }

  return json(200, { ok: true, lookId, look: childLook, status: "pending" });
});
