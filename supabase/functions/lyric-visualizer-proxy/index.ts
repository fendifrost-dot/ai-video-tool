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
const DEFAULT_MODEL = Deno.env.get("LYRIC_VISUALIZER_MODEL")?.trim() || "grok-4-fast";   // grok-4.6 took > 150 s per line (gateway idle timeout); grok-4-fast ≈ 18 s with the same schema
const MAX_LINES = 40;
const MAX_LYRIC_CHARS = 6000;
const MAX_OUTPUT_TOKENS = 12000;
// xAI list prices per 1M tokens for the default model (2026-09); the gate is an estimate, the ledger uses usage
const PRICE_PER_M: Record<string, { input: number; output: number }> = { "grok-4.6": { input: 3, output: 15 }, "grok-4-fast": { input: 0.2, output: 0.5 } };
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
  /** the artist's own creative exemplars — the bar every scene is held to (data, never hard-coded) */
  exemplars?: string[];
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
    type: "object", additionalProperties: false, required: ["ref", "text", "scenes"],
    properties: {
      ref: { type: "string" }, text: { type: "string" },
      scenes: { type: "array", items: { type: "object", additionalProperties: false,
        required: ["kind", "title", "logline", "world", "artist_presence", "characters", "beats", "camera", "fx", "renderer", "realism_risk", "risk_reason", "render_prompt", "performance_plate_prompt"],
        properties: {
          kind: { type: "string", enum: ["world", "performance_plate", "garment_character"], description: "world = a scene the artist is absent from or appears in as a character; performance_plate = what happens BEHIND the artist while he raps in the foreground; garment_character = the artist in the locked garment animated from his still" },
          title: { type: "string" },
          logline: { type: "string", description: "one sentence a director would say" },
          world: { type: "string", description: "the place: architecture, weather, light, surfaces, time of day, what is impossible about it" },
          artist_presence: { type: "string", enum: ["absent", "character_in_world", "performing_foreground"] },
          characters: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "wardrobe", "jewelry", "behaviour"],
            properties: { who: { type: "string" }, wardrobe: { type: "string" }, jewelry: { type: "string", description: "specific pieces: diamond tennis chains, Cuban links, grills — or 'none'" }, behaviour: { type: "string", description: "what they do, as if it were normal" } } } },
          beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["at_seconds", "action"], properties: { at_seconds: { type: "number" }, action: { type: "string" } } }, description: "the shot in order: what happens at which second" },
          camera: { type: "string" },
          fx: { type: "string" },
          renderer: { type: "string", enum: ["world_video", "performance_plate_video", "garment_image_to_video"], description: "world_video / performance_plate_video = text-to-video world builder; garment_image_to_video = the wardrobe-faithful animator from the artist's still" },
          realism_risk: { type: "string", enum: ["low", "medium", "high"] },
          risk_reason: { type: "string" },
          render_prompt: { type: "string", description: "the full prompt for the renderer: world, characters with wardrobe and jewelry, beats in order, camera, light, 'photographed, not animated'; for garment_image_to_video start with the hero description verbatim" },
          performance_plate_prompt: { type: "string", description: "for performance_plate scenes: the plate video prompt with the centre-foreground left clear for the artist and the action staged mid/background; empty string otherwise" },
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

  const exemplars = (body.exemplars ?? []).map((e, n) => `${n + 1}. ${e}`).join("\n") || "- (none supplied)";
  const system = [
    "You are the creative director of a photoreal, big-budget-looking music video. The job is to BRING EVERY LYRIC TO LIFE at the level of the artist's own exemplars below — worlds and characters a viewer remembers, staged so a camera could have witnessed them. Dull is a failure: a man walking down a corridor is not a scene.",
    "For every line produce three scenes, one of each kind: (1) world — a place and its inhabitants built around the line, the artist absent or present as a character (a model opens a door, flicks a switch, the room is the arctic: penguins and polar bears in diamond tennis chains and Cuban links, a half-snowman half-human in urban winter gear with diamond gold teeth walking around as if everything is normal); (2) performance_plate — the artist raps in the foreground while the line plays out BEHIND him with real depth (a fashion show running behind him; a Bentley truck passing followed by four kids carrying a wheel-less car on their shoulders, one at each wheel; a luxury car pulling up and reporters hopping out to film him); (3) garment_character — the artist in the locked garment, animated from his still, doing one thing the line implies.",
    "Specify everything: the world's architecture, weather, light and surfaces; every character's wardrobe and jewelry by name (diamond tennis chains, Cuban links, grills, gold teeth), and the behaviour that makes the impossible read as normal; the beats in order with seconds; the camera; the FX. Characters other than the artist are invented people or creatures — never a real public figure. No readable text or logos. No crowds beyond what the beat needs.",
    "render_prompt must be self-contained and photographic: lenses, light, textures, motion; end with 'photographed on a cinema camera, photoreal, no animation look'. For garment_character scenes the render_prompt starts with the hero description VERBATIM and ends with: keep his face, body and clothing exactly as in the image, keep the environment the same, only add motion and atmosphere. For performance_plate scenes also write performance_plate_prompt: the plate alone, the centre-foreground left clear for the artist, the action staged in the mid-ground and background so the space reads deep.",
    "Each scene is for one clip of about " + clipSeconds + " seconds. Rate realism_risk honestly against the renderer limits; a high-risk idea is welcome when it is strong — the gate downstream decides.",
    "The artist's exemplars (this is the bar):\n" + exemplars,
    "Locked rules (must hold in every prompt):\n" + rules,
    "Renderer limits:\n" + limits,
  ].join("\n\n");
  const context = { heroDescription: body.heroDescription, currentEnvironment: body.environment, style: body.style ?? null };
  const estInputTokens = body.lines.length * Math.ceil((system.length + JSON.stringify(context).length + 200 + JSON.stringify(SCHEMA).length) / 3.5);
  const estOutputTokens = Math.min(MAX_OUTPUT_TOKENS, body.lines.length * 3 * 450 + 200);
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
        model, temperature: 1.0, max_tokens: 4000,
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
