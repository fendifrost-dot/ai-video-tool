// AVT edge function — lyric-visualizer-proxy ("bring every lyric to life")
//
// User-JWT-only xAI chat call that turns a song's lyric lines into CONCRETE, FILMABLE visual
// concepts and provider-ready image-to-video prompts — the creative layer the beat-grid planner
// does not have. For every lyric line it returns three concept kinds:
//   literal      the words made physically real in the artist's world (gator boots that snap,
//                a goose that lands in the mirror room, money that talks)
//   surreal      the line's metaphor pushed past reality but shot like a real event
//   performance  the artist delivering the line with an environment/camera idea that embodies it
// Each concept carries a realism_risk (the renderer's known weaknesses: crowds, hands, text,
// liquids, animals, physics) and a B-roll prompt built on the production's locked recipe:
// the artist's identity/garment description is injected VERBATIM, the environment is kept
// ("keep the environment the same" — the still is composited on the plate first), motion and
// atmosphere are described, and nothing re-describes locked items (jewelry etc.) when the
// project's notes say not to.
//
// Nothing here knows a song or a project: lyrics, the hero description, the environment, the
// locked-item rules and the renderer limits all come in on the request (the app reads them from
// video_projects / artist / look rows). Output is strict JSON the app can store on shots
// (shot_type lyric_visual, notes "LYRIC: …") or feed straight into grok-broll-proxy.
//
// Required secrets: XAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MODEL = Deno.env.get("LYRIC_VISUALIZER_MODEL")?.trim() || "grok-4.6";
const MAX_LINES = 40;
const MAX_LYRIC_CHARS = 6000;
const MAX_OUTPUT_TOKENS = 12000;
// xAI list prices per 1M tokens for the default model (2026-09); the gate is an estimate, the ledger uses usage
const PRICE_PER_M: Record<string, { input: number; output: number }> = { "grok-4.6": { input: 3, output: 15 } };
const DEFAULT_MAX_COST_USD = 0.5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = {
  projectId: string;
  /** lyric lines to visualise (already split by the caller; a section, a hook, or the whole song ≤ MAX_LINES) */
  lines: Array<{ ref: string; text: string; section?: string; seconds?: number }>;
  /** the locked hero/garment description reused verbatim in every prompt (identity anchor) */
  heroDescription: string;
  /** the environment the still is composited on ("dark mirrored corridor with vertical white light strips") */
  environment: string;
  /** mood / visual style / palette words from the project */
  style?: string;
  /** rules that must hold in every prompt (e.g. "do not redescribe chains, watches or rings") */
  lockedRules?: string[];
  /** the renderer's known weaknesses, so concepts carry an honest realism_risk */
  rendererLimits?: string[];
  /** seconds per B-roll clip the prompts are written for */
  clipSeconds?: number;
  model?: string;
  maxCostUsd?: number;
  dryRun?: boolean;
};

// One xAI call PER LINE, run in parallel: a whole-song call outlives the gateway's 150 s idle window (seen live
// 2026-10-01: eight hook lines in one call → 504 IDLE_TIMEOUT), while per-line calls finish in ~20–40 s together.
const PARALLEL = 8;
const SCHEMA = {
  name: "lyric_visualisation",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["ref", "text", "concepts"],
    properties: {
          ref: { type: "string" }, text: { type: "string" },
          concepts: { type: "array", items: { type: "object", additionalProperties: false,
            required: ["kind", "title", "what_we_see", "why_it_lands", "camera", "motion_and_fx", "realism_risk", "risk_reason", "broll_prompt", "needs_plate_change"],
            properties: {
              kind: { type: "string", enum: ["literal", "surreal", "performance"] },
              title: { type: "string" },
              what_we_see: { type: "string", description: "one or two sentences a director would say" },
              why_it_lands: { type: "string" },
              camera: { type: "string", description: "lens + move in the production's vocabulary (push, orbit, crane, whip, dolly zoom, locked macro)" },
              motion_and_fx: { type: "string" },
              realism_risk: { type: "string", enum: ["low", "medium", "high"] },
              risk_reason: { type: "string" },
              broll_prompt: { type: "string", description: "the full image-to-video prompt: hero description verbatim, action, camera, atmosphere, 'keep the environment the same', locked rules honoured" },
              needs_plate_change: { type: "boolean", description: "true when the concept cannot live on the current environment plate" },
            } } },
    },
  },
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const xaiKey = resolveXaiApiKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!xaiKey) return json(500, { error: "xai_api_key_missing", detail: xaiKeyMissingMessage() });
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { error: "server_misconfigured" });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "missing_bearer" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (!body.projectId || !UUID_RE.test(body.projectId)) return json(400, { error: "missing_project_id" });
  if (!Array.isArray(body.lines) || body.lines.length === 0) return json(400, { error: "missing_lines" });
  if (body.lines.length > MAX_LINES) return json(400, { error: "too_many_lines", max: MAX_LINES });
  const lyricChars = body.lines.reduce((n, l) => n + (l.text ?? "").length, 0);
  if (lyricChars > MAX_LYRIC_CHARS) return json(400, { error: "lyrics_too_long", max: MAX_LYRIC_CHARS });
  if (!body.heroDescription || !body.environment) return json(400, { error: "missing_hero_or_environment" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: project, error: pErr } = await admin.from("video_projects").select("id, user_id").eq("id", body.projectId).maybeSingle();
  if (pErr) return json(500, { error: "project_query_failed", detail: pErr.message });
  if (!project || project.user_id !== userId) return json(403, { error: "project_forbidden" });

  const model = body.model ?? DEFAULT_MODEL;
  const clipSeconds = Math.max(4, Math.min(15, Number(body.clipSeconds ?? 6)));
  const rules = (body.lockedRules ?? []).map((r) => `- ${r}`).join("\n") || "- (none)";
  const limits = (body.rendererLimits ?? []).map((r) => `- ${r}`).join("\n") || "- (none stated)";

  const system = [
    "You are the creative director of a photoreal music video. Your job is to BRING EVERY LYRIC TO LIFE: turn each line into images a viewer would remember, shot so they read as real footage.",
    "For every line produce exactly three concepts, one of each kind: literal (the words made physically real in the artist's world — if the lyric says boots are alligators, the boots snap and bite; if money talks, the bills have something to say), surreal (the metaphor pushed past reality but staged like something a camera could witness), performance (the artist delivering the line, with an environment and camera idea that embodies it).",
    "Rules: the hero description is reused VERBATIM at the start of every broll_prompt; the environment stays the same unless needs_plate_change is true (and then say what the new plate is in what_we_see); never put words or logos on screen; no crowds; keep hands simple; prompts describe camera, motion and atmosphere in filmmaker language and end with: keep his face, body and clothing exactly as in the image, keep the environment the same, only add motion and atmosphere.",
    "Be specific and visual, never generic (no 'luxury vibes', no 'cinematic lighting' on its own). Prefer one striking idea per concept over a list of things. Each prompt is for one clip of about " + clipSeconds + " seconds.",
    "Rate realism_risk honestly against the renderer limits; a high-risk concept is still welcome when the idea is strong — the gate downstream decides.",
    "Locked rules (must hold in every prompt):\n" + rules,
    "Renderer limits:\n" + limits,
  ].join("\n\n");
  const context = { heroDescription: body.heroDescription, environment: body.environment, style: body.style ?? null };
  const estInputTokens = body.lines.length * Math.ceil((system.length + JSON.stringify(context).length + 200 + JSON.stringify(SCHEMA).length) / 3.5);
  const estOutputTokens = Math.min(MAX_OUTPUT_TOKENS, body.lines.length * 3 * 220 + 200);
  const price = PRICE_PER_M[model] ?? { input: 5, output: 25 };
  const estimatedCostUsd = Number(((estInputTokens * price.input + estOutputTokens * price.output) / 1_000_000).toFixed(4));
  const maxCostUsd = Number(body.maxCostUsd ?? DEFAULT_MAX_COST_USD);
  const plan = { lines: body.lines.length, clipSeconds, estInputTokens, estOutputTokens, estimatedCostUsd, maxCostUsd, parallel: PARALLEL };
  if (estimatedCostUsd > maxCostUsd) return json(200, { ok: false, error: "cost_gate", model, ...plan });
  if (body.dryRun) return json(200, { ok: true, dryRun: true, billed: false, model, ...plan });

  async function oneLine(line: Body["lines"][number]) {
    const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${xaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.9, max_tokens: 2500,
        response_format: { type: "json_schema", json_schema: SCHEMA },
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ ...context, line }) }],
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, number>; error?: { message?: string } };
    if (!res.ok) return { ref: line.ref, error: `xai_${res.status}`, detail: payload.error?.message ?? null, usage: null, result: null };
    const text = String(payload.choices?.[0]?.message?.content ?? "");
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* reported as parse_error below */ }
    return { ref: line.ref, error: parsed ? null : "parse_error", detail: parsed ? null : text.slice(0, 500), usage: payload.usage ?? null, result: parsed };
  }
  const results: Array<Awaited<ReturnType<typeof oneLine>>> = [];
  for (let i = 0; i < body.lines.length; i += PARALLEL) {
    results.push(...(await Promise.all(body.lines.slice(i, i + PARALLEL).map(oneLine))));
  }
  const usage = results.reduce((acc, r) => ({ prompt_tokens: acc.prompt_tokens + (r.usage?.prompt_tokens ?? 0), completion_tokens: acc.completion_tokens + (r.usage?.completion_tokens ?? 0) }), { prompt_tokens: 0, completion_tokens: 0 });
  const actualCostUsd = Number(((usage.prompt_tokens * price.input + usage.completion_tokens * price.output) / 1_000_000).toFixed(4));
  const lines = results.filter((r) => r.result).map((r) => r.result);
  const failures = results.filter((r) => !r.result).map((r) => ({ ref: r.ref, error: r.error, detail: r.detail }));
  return json(200, { ok: failures.length === 0, billed: usage.prompt_tokens > 0, model, usage, actualCostUsd, result: { lines }, failures, ...plan });
});
});
