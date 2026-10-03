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
// ADDITIVE (B4, 2026-10-02) — absent from a request, nothing below changes:
//   mode             "all" (default, today's three scenes) | "literal" | "surreal" | "performance".
//                    The non-default modes return ONE scene, for regenerating a single
//                    storyboard box. `mode: "all"` is proven byte-identical to the prompt
//                    that shipped before this field existed (legacyPrompt.golden.ts).
//   template         a SEED `prompt_templates` row, by name or by its template_json basename
//                    ("motion_story_v1"). Rendered with templateContext and placed AHEAD of
//                    the standing instructions. Unfilled {{slots}} are stripped, never sent.
//   shot             the storyboard box's window/section/framing/camera move, so the beats fit it.
// The template is resolved before the cost gate, so a dry run reports the template name.
//
// Required secrets: XAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";
import {
  buildSystemPrompt,
  isLyricMode,
  renderTemplate,
  scenesPerLine,
  templateMatches,
  templateSlots,
  type LyricMode,
  type ShotWindow,
  type TemplateContext,
} from "./contract.ts";

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
/** A treatment is a page, not a book: a longer one is cut rather than refused (the box still gets written). */
const MAX_TREATMENT_CHARS = 8000;
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

  // --- additive (B4, 2026-10-02). Absent = exactly the behaviour above. ----
  /** Which scenes to come back with; "all" (default) is today's three. */
  mode?: LyricMode;
  /** A seed `prompt_templates` row, by name or by its template_json basename
   *  ("motion_story_v1"). Rendered and placed ahead of the standing instructions. */
  template?: string;
  /** Slot values for the template. Any slot not supplied is stripped, never left braced. */
  templateContext?: TemplateContext;
  /** The storyboard box this scene is written for, so the beats fit its window. */
  shot?: ShotWindow;

  // --- additive (storyboard redesign, 2026-10-03). Absent = exactly the behaviour above. ----
  /** The project's one treatment: the creative brief the scene serves. */
  treatment?: string;
  /** One line each about the boxes before and after this one. */
  neighbours?: { before?: string | null; after?: string | null };
  /** Locked facts about the box, as data (window, take range, footage on it, look, what the director fixed). */
  projectState?: Record<string, unknown>;
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

// Single-scene schema for the non-"all" modes (B4). It is the motion_story_v1 scene
// contract — purpose, visual, the motion beats (entrance → primary → secondary → exit),
// the camera move/framing/angle, the sound cue and the transition OBJECT that becomes the
// next scene — so the template actually drives the generator instead of only describing
// what it should do. `config/treatment_templates/motion_story_v1.json` is the source.
//
// A separate schema on purpose: "all" keeps the three-scene SCHEMA above untouched, so no
// existing caller sees its output shape move.
const SCENE_SCHEMA = {
  name: "lyric_scene_motion",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["ref", "text", "scene"],
    properties: {
      ref: { type: "string" }, text: { type: "string" },
      scene: { type: "object", additionalProperties: false,
        required: ["title", "purpose", "visual", "motion", "camera", "sound", "transition", "required_elements", "realism_risk", "risk_reason", "render_prompt"],
        properties: {
          title: { type: "string" },
          purpose: { type: "string", description: "the exact idea this scene adds — one sentence" },
          visual: { type: "string", description: "composition, character, objects, light, surfaces" },
          motion: { type: "object", additionalProperties: false, required: ["entrance", "primary", "secondary", "exit"],
            properties: {
              entrance: { type: "string", description: "how the scene arrives" },
              primary: { type: "string", description: "the main action" },
              secondary: { type: "string", description: "the reaction to it" },
              exit: { type: "string", description: "how it leaves" },
            } },
          camera: { type: "object", additionalProperties: false, required: ["move", "framing", "angle", "lens"],
            properties: {
              move: { type: "string", enum: ["push", "pull", "truck", "pedestal", "crane", "orbit", "whip_pan", "snap_zoom", "dolly_zoom", "static"], description: "static only when motivated" },
              framing: { type: "string", enum: ["extreme_wide", "wide", "medium_wide", "medium", "medium_close", "close", "extreme_close"] },
              angle: { type: "string", enum: ["eye", "low", "high", "over_shoulder", "birds_eye", "worms_eye", "dutch", "pov"] },
              lens: { type: "string" },
            } },
          sound: { type: "string", description: "music cue, ambience, synchronised tactile effect" },
          transition: { type: "object", additionalProperties: false, required: ["object", "preset"],
            properties: {
              object: { type: "string", description: "the visible object that physically becomes the next scene" },
              preset: { type: "string", enum: ["cut", "crossfade_1", "crossfade_2", "dip_black", "dip_white", "flash", "whip_left", "whip_right", "whip_up", "zoom_punch", "speed_ramp", "strobe_16", "luma_wipe", "glitch", "light_leak", "film_burn", "match_cut"] },
            } },
          required_elements: { type: "array", items: { type: "string" }, description: "the things that MUST be in frame, named as the lyric names them" },
          realism_risk: { type: "string", enum: ["low", "medium", "high"] },
          risk_reason: { type: "string" },
          render_prompt: { type: "string", description: "the full self-contained prompt for the renderer, ending 'photographed on a cinema camera, photoreal, no animation look'" },
        } },
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

  // --- mode + template (additive; absent = the behaviour that shipped) ------
  if (body.mode !== undefined && !isLyricMode(body.mode)) return json(400, { error: "bad_mode", detail: "mode must be all | literal | surreal | performance" });
  const mode: LyricMode = body.mode ?? "all";

  // The template is resolved BEFORE the cost gate and the dry run, so a dry run can
  // report which template it would have used — that is the whole point of asking for
  // one. Seed rows only: a template is a global, not something a caller can inject.
  let templateName: string | null = null;
  let templateBody: string | null = null;
  if (body.template?.trim()) {
    const { data: templates, error: tErr } = await admin
      .from("prompt_templates")
      .select("name, template_body, default_settings_json")
      .eq("is_seed", true);
    if (tErr) return json(500, { error: "template_query_failed", detail: tErr.message });
    const row = (templates ?? []).find((t) => templateMatches(t, body.template!));
    if (!row) return json(400, { error: "unknown_template", detail: body.template, available: (templates ?? []).map((t) => t.name) });
    templateName = row.name;
    templateBody = renderTemplate(row.template_body, templateSlots(body.templateContext));
  }

  const system = buildSystemPrompt({
    mode,
    clipSeconds,
    exemplars,
    rules,
    limits,
    templateBody,
    shot: body.shot ?? null,
    treatment: typeof body.treatment === "string" ? body.treatment.slice(0, MAX_TREATMENT_CHARS) : null,
    neighbours: body.neighbours ?? null,
    projectState: body.projectState ?? null,
    hasExemplars: (body.exemplars ?? []).length > 0,
  });
  const context = { heroDescription: body.heroDescription, currentEnvironment: body.environment, style: body.style ?? null };
  const activeSchema = mode === "all" ? SCHEMA : SCENE_SCHEMA;
  const estInputTokens = body.lines.length * Math.ceil((system.length + JSON.stringify(context).length + 200 + JSON.stringify(activeSchema).length) / 3.5);
  const estOutputTokens = Math.min(MAX_OUTPUT_TOKENS, body.lines.length * scenesPerLine(mode) * 450 + 200);
  const price = PRICE_PER_M[model] ?? { input: 5, output: 25 };
  const estimatedCostUsd = Number(((estInputTokens * price.input + estOutputTokens * price.output) / 1_000_000).toFixed(4));
  const maxCostUsd = Number(body.maxCostUsd ?? DEFAULT_MAX_COST_USD);
  const plan = { lines: body.lines.length, mode, template: templateName, clipSeconds, estInputTokens, estOutputTokens, estimatedCostUsd, maxCostUsd, parallel: PARALLEL };
  if (estimatedCostUsd > maxCostUsd) return json(200, { ok: false, error: "cost_gate", model, ...plan });
  if (body.dryRun) return json(200, { ok: true, dryRun: true, billed: false, model, ...plan });

  async function oneLine(line: Body["lines"][number]) {
    const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${xaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 1.0, max_tokens: 4000,
        response_format: { type: "json_schema", json_schema: mode === "all" ? SCHEMA : SCENE_SCHEMA },
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
