// AVT edge function — performance-sync
//
// Measures where a performance file's audio sits on the song master:
// mono, 16 kHz, band-pass 150–4000 Hz, onset envelope + FFT cross-correlation,
// second-window drift (supabase/functions/_shared/syncMatch.ts via performanceAlign.ts).
//
// The edge runtime has no ffmpeg, so the body carries mono float32 PCM (base64).
// scripts/performance-sync.mjs extracts that PCM from the files and can post it here.
// Silence is refused. dryRun defaults to true. A write is refused for the live YSL
// project and is refused unless write is explicitly true. Nothing here is billed.
//
// Auth: caller JWT, anonymous refused.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  alignPerformance,
  pcmFromBase64,
  syncWriteAllowed,
  ALIGN_SAMPLE_RATE,
} from "../_shared/performanceAlign.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_B64 = 12_000_000;

type Body = {
  songPcm?: string;
  takePcm?: string;
  sampleRate?: number;
  projectId?: string;
  performanceAssetId?: string;
  songAssetId?: string;
  dryRun?: boolean;
  write?: boolean;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return json(500, { ok: false, error: "server_misconfigured" });
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer "))
    return json(401, { ok: false, error: "missing_bearer" });
  const user = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoErr } = await user.auth.getUser();
  if (whoErr || !who.user || who.user.is_anonymous)
    return json(401, { ok: false, error: "unauthenticated" });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  if (!body.songPcm || !body.takePcm) {
    return json(422, {
      ok: false,
      error: "no_audio",
      message:
        "Send mono float32 PCM for the song and the take. A file with no audio track is refused. Extract with scripts/performance-sync.mjs.",
    });
  }
  if (body.songPcm.length > MAX_B64 || body.takePcm.length > MAX_B64) {
    return json(413, {
      ok: false,
      error: "pcm_too_large",
      message: "PCM is over the edge body limit. Run scripts/performance-sync.mjs on the files.",
    });
  }
  const song = pcmFromBase64(body.songPcm);
  const take = pcmFromBase64(body.takePcm);
  if (!song || !take) return json(400, { ok: false, error: "bad_pcm" });
  const aligned = alignPerformance({
    song,
    take,
    sampleRate: body.sampleRate ?? ALIGN_SAMPLE_RATE,
  });
  if (!aligned.ok) return json(422, { ok: false, error: aligned.error, message: aligned.message });

  const dryRun = body.dryRun !== false;
  const gate = syncWriteAllowed({
    projectId: body.projectId ?? "",
    write: body.write === true,
    dryRun,
  });
  if (!gate.ok || !body.performanceAssetId || !body.projectId) {
    return json(200, {
      ok: true,
      dryRun: true,
      stored: false,
      costUsd: 0,
      match: aligned.match,
      confident: aligned.confident,
      note: gate.ok ? "dry run" : gate.message,
    });
  }
  const row = {
    user_id: who.user.id,
    project_id: body.projectId,
    song_asset_id: body.songAssetId ?? null,
    performance_asset_id: body.performanceAssetId,
    offset_seconds: aligned.match.offsetSeconds,
    drift_ppm: aligned.match.driftPpm,
    method: aligned.match.method,
    status: "auto",
    confidence_json: aligned.match.confidence,
    notes: "measured from the take's audio against the song master",
  };
  const { error } = await user
    .from("performance_syncs")
    .upsert(row, { onConflict: "project_id,performance_asset_id" });
  if (error)
    return json(400, {
      ok: false,
      error: "write_failed",
      message: error.message,
      match: aligned.match,
    });
  return json(200, {
    ok: true,
    dryRun: false,
    stored: true,
    costUsd: 0,
    match: aligned.match,
    confident: aligned.confident,
  });
});
