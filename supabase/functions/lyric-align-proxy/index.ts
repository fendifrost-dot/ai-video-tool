// AVT edge function — lyric-align-proxy
//
// The hosted transcriber behind "Time the lyrics to the song" in Setup. The app cuts the song into overlapping
// 30 s windows (16 kHz mono WAV, < 1 MB each) and sends them here one at a time; this returns the words heard in
// that window with their times inside it. Nothing is stored and nothing is aligned here — see contract.ts.
//
// Auth: user JWT (verify_jwt = true) and the project must be the caller's. Keys stay on the server.
// Provider: OpenAI whisper-1 with word timestamps and the lyrics as the prompt (the hosted form of what the
// proven script runs locally), falling back to xAI /v1/stt. LYRIC_STT_PROVIDER=xai swaps the order.
//
// Action: transcribe

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveXaiApiKey } from "../_shared/xaiApiKey.ts";
import {
  MAX_AUDIO_BYTES,
  MAX_WINDOWS_PER_QUARTER_HOUR,
  MAX_WINDOW_SECONDS,
  estimateUsd,
  parseTranscribeRequest,
  providerOrder,
  wavInfo,
  heardFromOpenAi,
  wordsFromXai,
  type HeardWord,
  type SttProvider,
} from "./contract.ts";

const OPENAI_BASE = "https://api.openai.com/v1";
const XAI_BASE = "https://api.x.ai/v1";
const OPENAI_MODEL = Deno.env.get("LYRIC_STT_OPENAI_MODEL")?.trim() || "whisper-1";
const OPENAI_KEY_ENV = ["OPENAI_API_KEY", "FROST_OPENAI", "ASTRA_API_KEY"] as const;
const PROVIDER_TIMEOUT_MS = 90_000;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const ALLOWED_ORIGINS = new Set(["https://aivideotool.lovable.app", "http://localhost:5173", "http://localhost:8080", "http://127.0.0.1:5173", "http://127.0.0.1:8080"]);
const corsBase = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  if (ALLOWED_ORIGINS.has(origin)) return { ...corsBase, "Access-Control-Allow-Origin": origin };
  return { ...corsBase };
}
function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

function resolveOpenAiKey(): string {
  for (const n of OPENAI_KEY_ENV) {
    const v = Deno.env.get(n)?.trim();
    if (v) return v;
  }
  return "";
}

const buckets = new Map<string, { resetAt: number; count: number }>();
function takeWindow(userId: string): boolean {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || now >= b.resetAt) {
    buckets.set(userId, { resetAt: now + RATE_WINDOW_MS, count: 1 });
    return true;
  }
  if (b.count >= MAX_WINDOWS_PER_QUARTER_HOUR) return false;
  b.count += 1;
  return true;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

type Heard = { ok: true; words: HeardWord[]; dropped?: number; model: string } | { ok: false; error: string };

async function hearWithOpenAi(key: string, wav: Uint8Array, prompt: string | null, language: string | null): Promise<Heard> {
  const form = new FormData();
  form.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "window.wav");
  form.append("model", OPENAI_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  // segments carry the model's own measures (avg_logprob, compression_ratio): contract.ts drops the words of a
  // segment that is a loop
  form.append("timestamp_granularities[]", "segment");
  form.append("temperature", "0");
  if (language) form.append("language", language.slice(0, 2));
  if (prompt) form.append("prompt", prompt);
  const res = await withTimeout(`${OPENAI_BASE}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = String((body as { error?: { message?: string } }).error?.message ?? "").slice(0, 200);
    return { ok: false, error: `openai ${res.status}${detail ? `: ${detail}` : ""}` };
  }
  const heard = heardFromOpenAi(body);
  return { ok: true, words: heard.words, dropped: heard.dropped, model: OPENAI_MODEL };
}

async function hearWithXai(key: string, wav: Uint8Array, language: string | null): Promise<Heard> {
  const form = new FormData();
  if (language) form.append("language", language);
  form.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "window.wav");
  const res = await withTimeout(`${XAI_BASE}/stt`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `xai ${res.status}` };
  return { ok: true, words: wordsFromXai(body), model: String((body as { model?: string }).model ?? "grok-voice-transcribe") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, errorMessage: "POST only" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(req, 401, { ok: false, errorMessage: "Missing bearer token" });
  const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(req, 401, { ok: false, errorMessage: "Invalid bearer token" });
  // a guest session is a valid token too (the app signs every visitor in anonymously): it does not get to spend
  if ((userData.user as { is_anonymous?: boolean }).is_anonymous === true) return json(req, 403, { ok: false, errorMessage: "Sign in to time lyrics" });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(req, 400, { ok: false, errorMessage: "Invalid JSON" });
  }
  if (String(body.action ?? "") !== "transcribe") return json(req, 400, { ok: false, errorMessage: "Unknown action" });

  const parsed = parseTranscribeRequest(body);
  if (!parsed.ok) return json(req, parsed.status, { ok: false, errorMessage: parsed.error });
  const { projectId, audioBase64, prompt, language } = parsed.request;

  // the project must be the caller's (read through the caller's own token)
  const { data: project, error: projectError } = await userClient.from("video_projects").select("id").eq("id", projectId).eq("user_id", userData.user.id).maybeSingle();
  if (projectError || !project) return json(req, 403, { ok: false, errorMessage: "Not your project" });

  if (!takeWindow(userData.user.id)) return json(req, 429, { ok: false, errorMessage: "Too many windows in a short time. Try again in a few minutes." });

  let wav: Uint8Array;
  try {
    wav = decodeBase64(audioBase64);
  } catch {
    return json(req, 400, { ok: false, errorMessage: "audioBase64 is not base64" });
  }
  if (wav.byteLength > MAX_AUDIO_BYTES) return json(req, 413, { ok: false, errorMessage: "Window too large" });
  const info = wavInfo(wav);
  if (!info) return json(req, 400, { ok: false, errorMessage: "The window must be a PCM WAV" });
  if (info.seconds > MAX_WINDOW_SECONDS) return json(req, 413, { ok: false, errorMessage: "Window too long" });

  const openAiKey = resolveOpenAiKey();
  const xaiKey = resolveXaiApiKey();
  const order = providerOrder(Deno.env.get("LYRIC_STT_PROVIDER"), { openai: !!openAiKey, xai: !!xaiKey });
  if (order.length === 0) return json(req, 500, { ok: false, errorMessage: "No speech-to-text key is configured (OPENAI_API_KEY or XAI_API_KEY)." });

  const errors: string[] = [];
  for (const provider of order as SttProvider[]) {
    try {
      const heard = provider === "openai" ? await hearWithOpenAi(openAiKey, wav, prompt, language) : await hearWithXai(xaiKey, wav, language);
      if (heard.ok) {
        return json(req, 200, { ok: true, provider, model: heard.model, words: heard.words, dropped: heard.dropped ?? 0, seconds: Math.round(info.seconds * 1000) / 1000, estimatedCostUsd: estimateUsd(provider, info.seconds), triedBefore: errors });
      }
      errors.push(heard.error);
    } catch (e) {
      errors.push(`${provider}: ${e instanceof Error ? e.name : "error"}`);
    }
  }
  return json(req, 502, { ok: false, errorMessage: `The transcriber did not answer (${errors.join("; ")})` });
});
