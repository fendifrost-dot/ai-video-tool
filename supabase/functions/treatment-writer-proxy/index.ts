// AVT edge function — treatment-writer-proxy
//
// Writes the project's ONE treatment and the scene of every storyboard shot it is handed. User-JWT only; the project
// must belong to the caller. The storyboard's own grid comes in on the request and owns timing: this function writes
// words for shots, it never cuts them.
//
// One call writes the treatment (or the director's own text is used word for word); then the grid is written in runs
// of a few shots, in parallel, each inside that treatment and with the whole board as context — so no single model
// call outlives the gateway's idle window however long the song is.
//
// Request (POST, JSON):
//   avt_project_id   the project
//   mode             "full_treatment"
//   write_text       true = the writer writes the treatment text; false = `concept` IS the treatment, kept as written
//   concept          the director's treatment text (write_text false), or a hint for the writer (write_text true)
//   clip_grid        [{ key, start, end, section, energy, lyrics }] — the shots to write
//   song_title, lyrics, artist_profile, visual_style, mood, additional_notes, analysis, looks,
//   has_performance_footage, project_type
//   continuity_entities  [{ key, kind: location|prop|lighting, name, description }] — what a shot may point at by key
//   avt_variation_id the video variation the board belongs to (evidence only — the grid and the text come in on the request)
// Reply: { ok, model, treatment: { concept, narrative, sections, clips[] }, beats, allocation, coverage, runId, missing,
//          repeated, rewritten, relinked, usage, actualCostUsd, estimatedCostUsd }
//        `repeated` = shots that came back with another shot's sentence; `rewritten` = those written again as their own.
//        Before the shots are written, the treatment's BEATS are read out once and the grid's shots allotted to them
//        (beats.ts): each shot is written inside its beat; `coverage` says whether the board carries every beat, its
//        people and its ties. Every run leaves a row in writer_runs (its variation, treatment revision, outcome, cost).
//        A clip may carry `timed_beats` — moments inside the shot at which something changes (_shared/timedBeats.ts).
//        or { ok: false, errorCode, errorMessage } with a non-2xx status.
//
// Required secrets: XAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";
import { costOf, estimateCostUsd, fingerprint, SHOTS_PER_CALL, acceptShots, writerEntities, chunkGrid, linkedShots, linkUserMessage, repeatedScenes, rewriteUserMessage, shotsSystemPrompt, shotsUserMessage, SHOTS_SCHEMA, treatmentSystemPrompt, TREATMENT_SCHEMA, withRewrites, type GridShot, type WriterContext } from "./contract.ts";
import { acceptBeats, allocateBeats, BEATS_SCHEMA, beatsSystemPrompt, coverageOf, shotBriefs, withRequiredLinks, type Allocation, type Beat, type ShotBrief } from "./beats.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MODEL = Deno.env.get("TREATMENT_WRITER_MODEL")?.trim() || "grok-4-fast";
const MAX_SHOTS = 160;
const MAX_TEXT = 12000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "INVALID_INPUT", "Method must be POST");

  const xaiKey = resolveXaiApiKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!xaiKey) return fail(500, "PROVIDER_KEY_NOT_CONFIGURED", xaiKeyMissingMessage());
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return fail(500, "INTERNAL", "The function is missing its Supabase settings");

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return fail(401, "UNAUTHORISED", "Missing bearer token");
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return fail(401, "UNAUTHORISED", "Not signed in");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "INVALID_INPUT", "Body is not valid JSON"); }
  const projectId = String(body.avt_project_id ?? "");
  if (!UUID_RE.test(projectId)) return fail(400, "INVALID_INPUT", "avt_project_id is missing");
  if (body.mode !== "full_treatment") return fail(400, "INVALID_INPUT", "mode must be full_treatment");

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: project, error: pErr } = await admin.from("video_projects").select("id, user_id").eq("id", projectId).maybeSingle();
  if (pErr) return fail(500, "INTERNAL", `The project could not be read: ${pErr.message}`);
  if (!project || project.user_id !== userData.user.id) return fail(403, "FORBIDDEN", "This project is not yours");

  const variationId = typeof body.avt_variation_id === "string" && UUID_RE.test(body.avt_variation_id) ? body.avt_variation_id : null;

  const rawGrid = Array.isArray(body.clip_grid) ? (body.clip_grid as Record<string, unknown>[]) : [];
  const grid: GridShot[] = rawGrid
    .map((g) => ({ key: String(g.key ?? ""), start: Number(g.start), end: Number(g.end), section: text(g.section, 80), energy: text(g.energy, 40), lyrics: text(g.lyrics, 600) }))
    .filter((g) => g.key && Number.isFinite(g.start) && Number.isFinite(g.end) && g.end > g.start);
  if (grid.length === 0) return fail(400, "INVALID_INPUT", "clip_grid has no shots to write");
  if (grid.length > MAX_SHOTS) return fail(400, "INVALID_INPUT", `clip_grid has ${grid.length} shots; the most that can be written at once is ${MAX_SHOTS}`);

  const ctx: WriterContext = {
    projectType: text(body.project_type, 40),
    songTitle: text(body.song_title, 200),
    lyrics: text(body.lyrics),
    artistProfile: text(body.artist_profile, 4000),
    visualStyle: text(body.visual_style, 4000),
    mood: text(body.mood, 2000),
    notes: text(body.additional_notes, 8000),
    analysis: body.analysis ?? null,
    looks: Array.isArray(body.looks) ? (body.looks as { name: string; description?: string | null }[]) : [],
    hasPerformanceFootage: body.has_performance_footage === true,
    entities: writerEntities(body.continuity_entities),
  };
  const writeText = body.write_text === true;
  const given = text(body.concept) ?? "";
  if (!writeText && !given.trim()) return fail(400, "INVALID_INPUT", "There is no treatment text to write the shots from");

  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const usage: Usage = { prompt_tokens: 0, completion_tokens: 0 };

  async function ask(system: string, user: string, schema: unknown, maxTokens: number): Promise<{ ok: true; value: unknown } | { ok: false; why: string }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${xaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, temperature: 0.9, max_tokens: maxTokens, response_format: { type: "json_schema", json_schema: schema }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        });
        const payload = (await res.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }>; usage?: Partial<Usage>; error?: { message?: string } | string };
        if (!res.ok) {
          const why = typeof payload.error === "string" ? payload.error : (payload.error?.message ?? "no reason given");
          // a refusal that will not change on a second try
          if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) return { ok: false, why: `the model refused (${res.status}): ${why}` };
          if (attempt === 1) return { ok: false, why: `the model failed (${res.status}): ${why}` };
          continue;
        }
        usage.prompt_tokens += payload.usage?.prompt_tokens ?? 0;
        usage.completion_tokens += payload.usage?.completion_tokens ?? 0;
        try {
          return { ok: true, value: JSON.parse(String(payload.choices?.[0]?.message?.content ?? "")) };
        } catch {
          if (attempt === 1) return { ok: false, why: "the model's answer could not be read" };
        }
      } catch (e) {
        if (attempt === 1) return { ok: false, why: e instanceof Error ? e.message : String(e) };
      }
    }
    return { ok: false, why: "the model did not answer" };
  }

  // 1. the treatment: written here, or the director's own words
  let concept = given.trim();
  let narrative = "";
  let sections: { name: string; intent: string }[] = [];
  if (writeText) {
    const sectionNames = [...new Set(grid.map((g) => g.section).filter(Boolean))].join(", ");
    const r = await ask(treatmentSystemPrompt(ctx), JSON.stringify({ sections_of_the_song: sectionNames, shots: grid.length, hint: given.trim() || null }), TREATMENT_SCHEMA, 1500);
    if (!r.ok) return fail(502, "PROVIDER_API_ERROR", `The treatment was not written: ${r.why}`);
    const t = r.value as { concept?: string; narrative?: string; sections?: { name: string; intent: string }[] };
    concept = String(t.concept ?? "").trim();
    narrative = String(t.narrative ?? "").trim();
    sections = Array.isArray(t.sections) ? t.sections : [];
    if (!concept) return fail(502, "PROVIDER_API_ERROR", "The treatment came back empty");
  }
  const treatment = [concept, narrative].filter(Boolean).join("\n\n");

  // the run's evidence: who, for which variation and treatment revision, what it should cost — then its outcome
  const contextChars = [ctx.artistProfile, ctx.visualStyle, ctx.mood, ctx.notes, ctx.lyrics].reduce((n, t) => n + (t?.length ?? 0), 0) + JSON.stringify(ctx.entities ?? []).length;
  const estimatedCostUsd = estimateCostUsd(model, grid.length, treatment.length, contextChars);
  const { data: runRow } = await admin
    .from("writer_runs")
    .insert({ user_id: userData.user.id, project_id: projectId, variation_id: variationId, treatment_fingerprint: fingerprint(treatment), treatment_chars: treatment.length, mode: "full_treatment", model, status: "running", shots_asked: grid.length, estimated_cost_usd: estimatedCostUsd })
    .select("id")
    .maybeSingle();
  const runId: string | null = runRow?.id ?? null;
  const finish = async (patch: Record<string, unknown>) => {
    if (!runId) return;
    await admin.from("writer_runs").update({ ...patch, usage_json: usage, finished_at: new Date().toISOString() }).eq("id", runId);
  };
  const failRun = async (status: number, code: string, message: string) => {
    await finish({ status: "failed", error_text: message, actual_cost_usd: usage.prompt_tokens + usage.completion_tokens > 0 ? costOf(model, usage) : null });
    return fail(status, code, message);
  };

  // 2. the treatment's beats, read once, and the grid allotted to them — so the shots carry the whole treatment in
  //    its order, with its people, its wardrobe and its ties, before any shot is written
  let beats: Beat[] = [];
  let allocation: Allocation | null = null;
  let briefs: Record<string, ShotBrief> = {};
  {
    const r = await ask(beatsSystemPrompt(ctx.entities ?? [], ctx.hasPerformanceFootage === true), JSON.stringify({ treatment }), BEATS_SCHEMA, 6000);
    if (!r.ok) return failRun(502, "PROVIDER_API_ERROR", `The treatment's beats could not be read: ${r.why}`);
    beats = acceptBeats(r.value, ctx.entities ?? []);
    if (beats.length === 0) return failRun(502, "PROVIDER_API_ERROR", "The treatment's beats came back empty — nothing was written");
    allocation = allocateBeats(beats, grid);
    briefs = shotBriefs(beats, allocation);
  }

  // 3. the shots, a few per call, all at once — each inside its beat
  const system = shotsSystemPrompt(ctx, treatment, grid, true);
  const chunks = chunkGrid(grid, SHOTS_PER_CALL);
  const boardKeys = grid.map((g) => g.key);
  const written = await Promise.all(
    chunks.map(async (chunk) => {
      let got = acceptShots(chunk, null);
      let why = "";
      for (let attempt = 0; attempt < 2 && got.missing.length > 0; attempt++) {
        const left = chunk.filter((s) => got.missing.includes(s.key));
        const r = await ask(system, shotsUserMessage(left, briefs), SHOTS_SCHEMA, 400 + left.length * 560);
        if (!r.ok) { why = r.why; continue; }
        const more = acceptShots(left, r.value, ctx.entities, boardKeys);
        got = { clips: [...got.clips, ...more.clips], missing: more.missing };
      }
      return { ...got, why };
    }),
  );
  let clips = written.flatMap((w) => w.clips);
  const missing = written.flatMap((w) => w.missing);
  if (clips.length === 0) return failRun(502, "PROVIDER_API_ERROR", `No shot was written: ${written.find((w) => w.why)?.why ?? "the model returned nothing usable"}`);

  // 4. shots that came back with another shot's sentence are asked for again, once (the runs cannot see each other)
  const repeated = new Set(repeatedScenes(clips));
  let rewritten: string[] = [];
  if (repeated.size > 0) {
    const used = clips.map((c) => String(c.scene_description ?? ""));
    const again = await Promise.all(
      chunkGrid(grid.filter((g) => repeated.has(g.key)), SHOTS_PER_CALL).map(async (chunk) => {
        const r = await ask(system, rewriteUserMessage(chunk, used, briefs), SHOTS_SCHEMA, 400 + chunk.length * 560);
        return r.ok ? acceptShots(chunk, r.value, ctx.entities, boardKeys).clips : [];
      }),
    );
    const merged = withRewrites(clips, again.flat());
    clips = merged.clips;
    rewritten = merged.replaced;
  }

  // 5. the ties the treatment states are links whether or not the writer wrote them; then shots tied to other shots
  //    are written again once, beside their partners' scenes (the runs could not see them)
  clips = withRequiredLinks(clips, briefs);
  const partners = linkedShots(clips);
  let relinked: string[] = [];
  if (partners.size > 0) {
    const again = await Promise.all(
      chunkGrid(grid.filter((g) => partners.has(g.key)), SHOTS_PER_CALL).map(async (chunk) => {
        const r = await ask(system, linkUserMessage(chunk, clips, partners, briefs), SHOTS_SCHEMA, 400 + chunk.length * 560);
        return r.ok ? withRequiredLinks(acceptShots(chunk, r.value, ctx.entities, boardKeys).clips, briefs) : [];
      }),
    );
    const byKey = new Map(again.flat().map((c) => [String(c.key), c]));
    clips = clips.map((c) => byKey.get(String(c.key)) ?? c);
    relinked = [...byKey.keys()];
  }

  // 6. does the board carry the treatment? said here, kept with the run, shown to the director — never silently
  const coverage = allocation ? coverageOf(beats, allocation, clips) : null;
  // the actual cost is the provider's own token counts at list price; with no counts it is unknown, not estimated
  const actualCostUsd = usage.prompt_tokens + usage.completion_tokens > 0 ? costOf(model, usage) : null;
  await finish({ status: "succeeded", shots_written: clips.length, actual_cost_usd: actualCostUsd, beats_json: beats, allocation_json: allocation, coverage_json: coverage, clips_json: clips, missing_json: missing });
  return json(200, { ok: true, model, treatment: { concept, narrative, sections, clips }, beats, allocation, coverage, runId, missing, repeated: [...repeated], rewritten, relinked, usage, actualCostUsd, estimatedCostUsd });
});

