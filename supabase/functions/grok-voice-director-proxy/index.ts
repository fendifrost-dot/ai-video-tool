// AVT edge function — grok-voice-director-proxy
//
// Phase 1 Voice Director (READ-ONLY kill-test).
// STT → project briefing + whats_next → Grok text phrasing → TTS.
// No database writes. No Imagine/video. No speech-to-speech.
//
// Auth: user JWT (verify_jwt = true). XAI_API_KEY stays on the server.
//
// Actions: transcribe | direct | speak

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveXaiApiKey, xaiKeyMissingMessage } from "../_shared/xaiApiKey.ts";

const XAI_BASE = "https://api.x.ai/v1";
const DIRECTOR_MODEL = Deno.env.get("GROK_DIRECTOR_MODEL")?.trim() || "grok-4.6";
const TTS_VOICE = Deno.env.get("GROK_DIRECTOR_VOICE")?.trim() || "eve";

const MAX_AUDIO_BYTES = 2_000_000;
const MAX_TRANSCRIPT_CHARS = 2000;
const MAX_TTS_CHARS = 800;
const MAX_TURNS_PER_WINDOW = 40;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const ALLOWED_ORIGINS = new Set([
  "https://aivideotool.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
]);

const corsBase = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TurnBucket = { resetAt: number; count: number };
const turnBuckets = new Map<string, TurnBucket>();

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  if (ALLOWED_ORIGINS.has(origin)) {
    return { ...corsBase, "Access-Control-Allow-Origin": origin };
  }
  return { ...corsBase };
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function originAllowed(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

function takeTurn(userId: string): boolean {
  const now = Date.now();
  const bucket = turnBuckets.get(userId);
  if (!bucket || now >= bucket.resetAt) {
    turnBuckets.set(userId, { resetAt: now + RATE_WINDOW_MS, count: 1 });
    return true;
  }
  if (bucket.count >= MAX_TURNS_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function normSection(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

type ShotRow = {
  shot_number: number;
  song_section: string | null;
  scene_description: string | null;
  duration_seconds: number | null;
  shot_type: string | null;
  status: string | null;
};

function computeWhatsNext(input: {
  hasTreatment: boolean;
  hasAnalysis: boolean;
  sections: string[];
  shots: ShotRow[];
}): { toolsUsed: string[]; gaps: string[]; options: string[]; summary: string } {
  const gaps: string[] = [];
  const toolsUsed = ["read_project", "read_shots", "whats_next"];
  if (input.hasAnalysis) toolsUsed.splice(2, 0, "read_song_analysis");

  if (!input.hasTreatment) {
    gaps.push("No treatment draft yet — use the Treatment page (voice will not draft it in Phase 1).");
  }
  if (!input.hasAnalysis) gaps.push("No song analysis — I will not invent BPM or drop times.");
  if (input.shots.length === 0) gaps.push("Shot list is empty.");

  const shotsBySection = new Map<string, number>();
  for (const shot of input.shots) {
    const key = shot.song_section ? normSection(shot.song_section) : "";
    if (!key) continue;
    shotsBySection.set(key, (shotsBySection.get(key) ?? 0) + 1);
  }
  const uncovered: string[] = [];
  for (const name of input.sections) {
    const key = normSection(name);
    if (!key) continue;
    if ((shotsBySection.get(key) ?? 0) === 0) uncovered.push(name.trim());
  }
  if (uncovered.length > 0) gaps.push(`No shots on: ${uncovered.join(", ")}.`);

  const unsectioned = input.shots.filter((s) => !s.song_section?.trim()).length;
  if (unsectioned > 0) gaps.push(`${unsectioned} shot(s) have no song section.`);

  const options: string[] = [];
  if (input.shots.length === 0) {
    options.push(
      "Start with a wide performance in verse 1.",
      "Lock a jacket CU for the first hook.",
      "Add one establishing shot before verse 1.",
    );
  } else {
    for (const name of uncovered) {
      if (options.length >= 3) break;
      options.push(`Cover ${name} — one performance + one detail.`);
    }
    if (options.length < 3 && unsectioned > 0) {
      options.push("Assign the unsectioned shots to a chorus or verse.");
    }
    if (options.length < 3) {
      options.push("Read the existing shots back and cut anything that does not earn a cut.");
    }
  }

  const summary =
    input.shots.length === 0
      ? "No shots yet. Three ways to start are below."
      : uncovered.length > 0
        ? `${input.shots.length} shot(s) on the list; ${uncovered.length} section(s) still uncovered.`
        : `${input.shots.length} shot(s). Sections that exist on the structure have at least one shot.`;

  return { toolsUsed, gaps, options: options.slice(0, 3), summary };
}

function parseSections(songStructure: unknown, sectionsJson: unknown): string[] {
  const names: string[] = [];
  const push = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const name = String((raw as { name?: unknown }).name ?? "").trim();
    if (name) names.push(name);
  };
  if (Array.isArray(songStructure)) songStructure.forEach(push);
  if (Array.isArray(sectionsJson)) sectionsJson.forEach(push);
  return [...new Set(names)];
}

function treatmentExcerpt(treatmentJson: unknown): string {
  if (!treatmentJson || typeof treatmentJson !== "object") return "";
  const rec = treatmentJson as Record<string, unknown>;
  const text = String(rec.text ?? rec.narrative ?? "").trim();
  return text.slice(0, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, errorMessage: "POST only" });
  }
  if (!originAllowed(req)) {
    return json(req, 403, { ok: false, errorMessage: "Origin not allowed" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, 401, { ok: false, errorMessage: "Missing bearer token" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json(req, 401, { ok: false, errorMessage: "Invalid bearer token" });
  }

  if (!takeTurn(userData.user.id)) {
    return json(req, 429, {
      ok: false,
      errorMessage: "Voice Director turn budget reached. Try again later.",
    });
  }

  const key = resolveXaiApiKey();
  if (!key) return json(req, 500, { ok: false, errorMessage: xaiKeyMissingMessage() });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(req, 400, { ok: false, errorMessage: "Invalid JSON" });
  }

  const action = String(body.action ?? "");

  try {
    if (action === "transcribe") {
      const b64 = String(body.audioBase64 ?? "");
      const mime = String(body.mime ?? "audio/webm");
      if (!b64) return json(req, 400, { ok: false, errorMessage: "audioBase64 required" });
      const bytes = decodeBase64(b64);
      if (bytes.byteLength > MAX_AUDIO_BYTES) {
        return json(req, 413, { ok: false, errorMessage: "Audio too large (2 MB max)" });
      }
      const form = new FormData();
      form.append("language", "en");
      form.append("format", "true");
      form.append("file", new Blob([bytes], { type: mime }), "turn.webm");
      const stt = await fetch(`${XAI_BASE}/stt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      const sttJson = await stt.json().catch(() => ({}));
      if (!stt.ok) {
        return json(req, 502, {
          ok: false,
          errorMessage: `stt_failed: ${stt.status}`,
        });
      }
      const text = String((sttJson as { text?: string }).text ?? "").trim().slice(0, MAX_TRANSCRIPT_CHARS);
      return json(req, 200, { ok: true, text });
    }

    if (action === "speak") {
      const text = String(body.text ?? "").trim().slice(0, MAX_TTS_CHARS);
      if (!text) return json(req, 400, { ok: false, errorMessage: "text required" });
      const tts = await fetch(`${XAI_BASE}/tts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, voice_id: TTS_VOICE, language: "en" }),
      });
      if (!tts.ok) {
        return json(req, 502, { ok: false, errorMessage: `tts_failed: ${tts.status}` });
      }
      const audio = new Uint8Array(await tts.arrayBuffer());
      return json(req, 200, {
        ok: true,
        mime: tts.headers.get("content-type") || "audio/mpeg",
        audioBase64: encodeBase64(audio),
      });
    }

    if (action === "direct") {
      const projectId = String(body.projectId ?? "");
      const transcript = String(body.transcript ?? "").trim().slice(0, MAX_TRANSCRIPT_CHARS);
      if (!projectId || !transcript) {
        return json(req, 400, { ok: false, errorMessage: "projectId and transcript required" });
      }

      const { data: project, error: projectErr } = await userClient
        .from("video_projects")
        .select("id, title, mood, visual_style, lyrics, song_title, song_structure_json, treatment_json, user_id")
        .eq("id", projectId)
        .maybeSingle();
      if (projectErr) return json(req, 500, { ok: false, errorMessage: projectErr.message });
      if (!project || project.user_id !== userData.user.id) {
        return json(req, 403, { ok: false, errorMessage: "Project not found" });
      }

      const { data: shots } = await userClient
        .from("shots")
        .select("shot_number, song_section, scene_description, duration_seconds, shot_type, status")
        .eq("project_id", projectId)
        .order("shot_number", { ascending: true });

      const { data: analysis } = await userClient
        .from("song_analyses")
        .select("bpm, drops_json, sections_json, duration_seconds")
        .eq("project_id", projectId)
        .maybeSingle();

      const shotRows = (shots ?? []) as ShotRow[];
      const sections = parseSections(project.song_structure_json, analysis?.sections_json);
      const hasTreatment = treatmentExcerpt(project.treatment_json).length > 0;
      const hasAnalysis = !!analysis;
      const next = computeWhatsNext({
        hasTreatment,
        hasAnalysis,
        sections,
        shots: shotRows,
      });

      let shotPrompt: string | null = null;
      const shotMatch = transcript.match(/shot\s*#?\s*(\d+)/i);
      const wantPrompt = /prompt|read (?:me )?(?:shot|the (?:next )?shot)/i.test(transcript);
      if (shotMatch || wantPrompt) {
        const n = shotMatch ? Number(shotMatch[1]) : shotRows[0]?.shot_number;
        const shot = shotRows.find((s) => s.shot_number === n) ?? null;
        if (shot) {
          next.toolsUsed = [...new Set([...next.toolsUsed, "compile_prompt"])];
          const desc = shot.scene_description?.trim() || "(no scene description yet)";
          shotPrompt = `Shot #${shot.shot_number}${shot.song_section ? ` · ${shot.song_section}` : ""}: ${desc}`;
        }
      }

      const briefing = {
        title: project.title,
        songTitle: project.song_title,
        mood: project.mood,
        visualStyle: project.visual_style,
        lyricsExcerpt: String(project.lyrics ?? "").trim().slice(0, 800),
        treatmentExcerpt: treatmentExcerpt(project.treatment_json),
        sections,
        shots: shotRows.map((s) => ({
          n: s.shot_number,
          section: s.song_section,
          dur: s.duration_seconds,
          type: s.shot_type,
          status: s.status,
          scene: s.scene_description,
        })),
        analysis: analysis
          ? {
              bpm: analysis.bpm,
              duration_seconds: analysis.duration_seconds,
              drops: analysis.drops_json,
            }
          : null,
        whats_next: next,
        shotPrompt,
      };

      const chat = await fetch(`${XAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DIRECTOR_MODEL,
          temperature: 0.4,
          max_tokens: 350,
          messages: [
            {
              role: "system",
              content:
                "You are the AVT music-video Director. Speak in short spoken-aloud director language (6–10 sentences max). " +
                "Use ONLY the briefing JSON. Offer three options when asked what is next. " +
                "You cannot add shots, draft treatments, generate video, or approve looks. " +
                "If the user asks you to write or generate, tell them that is not in this prototype. " +
                "Never invent BPM, drop times, or shots that are not in the briefing.",
            },
            {
              role: "user",
              content: `Briefing:\n${JSON.stringify(briefing)}\n\nUser said:\n${transcript}`,
            },
          ],
        }),
      });
      const chatJson = (await chat.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!chat.ok) {
        return json(req, 502, {
          ok: false,
          errorMessage: `direct_failed: ${chat.status} ${chatJson.error?.message ?? ""}`.trim(),
        });
      }
      const replyText = String(chatJson.choices?.[0]?.message?.content ?? "").trim();
      if (!replyText) return json(req, 502, { ok: false, errorMessage: "Empty Grok reply" });

      return json(req, 200, {
        ok: true,
        replyText: replyText.slice(0, 1200),
        toolTrace: { ...next, shotPrompt },
      });
    }

    return json(req, 400, { ok: false, errorMessage: "Unknown action" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "director_failed";
    return json(req, 500, { ok: false, errorMessage: message });
  }
});
