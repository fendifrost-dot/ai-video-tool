// AVT edge function — edit-render
//
// Plans an ffmpeg cut for an edit_sequences row. Each picture clip and the song asset are resolved to
// a file in this project's storage. The plan carries a short-lived signed URL for the local encoder.
// Those URLs are never argv inputs and this function never calls a generation provider. A lip-sync
// placeholder with no file stays a labelled slate. File duration comes from ffprobe in
// scripts/edit-render.mjs; the 4.04 s filing default is not used as a length.
// dryRun defaults to true and returns the plan plus how many real inputs resolved and which are missing.
// cost is always 0. This function does not run ffmpeg. A dryRun of false only queues an edit_renders
// row (status queued) for scripts/edit-render.mjs.
//
// Class C. Auth: caller JWT, anonymous refused. Writes go through the caller's RLS.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  assertPlanSafe,
  sequenceFromRows,
  type RenderAspect,
  type RenderKind,
} from "../_shared/editModel.ts";
import {
  SIGN_TTL_SECONDS,
  alignSigned,
  assertMediaUrls,
  loadStoredAssets,
  mediaSummary,
  planForSequence,
} from "../_shared/editMedia.ts";
import {
  PROVENANCE_VERSION,
  applyPerformanceProvenance,
  loadProvenance,
  provenanceCounts,
} from "../_shared/performanceProvenance.ts";

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

type Body = {
  sequenceId?: string;
  dryRun?: boolean;
  kind?: RenderKind;
  aspect?: RenderAspect;
  grain?: boolean;
  captions?: boolean;
  upscale?: boolean;
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
  const { data: userData, error: userErr } = await user.auth.getUser();
  if (userErr || !userData.user || userData.user.is_anonymous)
    return json(401, { ok: false, error: "unauthenticated" });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  if (!body.sequenceId) return json(400, { ok: false, error: "sequence_required" });
  const { data: sequence, error: seqErr } = await user
    .from("edit_sequences")
    .select("*")
    .eq("id", body.sequenceId)
    .maybeSingle();
  if (seqErr || !sequence) return json(404, { ok: false, error: "sequence_not_found" });
  const { data: clips } = await user
    .from("edit_clips")
    .select("*")
    .eq("sequence_id", body.sequenceId);
  const { data: markers } = await user
    .from("edit_markers")
    .select("*")
    .eq("sequence_id", body.sequenceId);
  const seq = sequenceFromRows(
    sequence as Record<string, unknown>,
    (clips ?? []) as Record<string, unknown>[],
    (markers ?? []) as Record<string, unknown>[],
  );
  let rows;
  try {
    rows = await loadStoredAssets(user, seq);
  } catch (e) {
    return json(400, {
      ok: false,
      error: "assets_unreadable",
      message: e instanceof Error ? e.message : "unreadable",
    });
  }
  const plan = await planForSequence(
    seq,
    rows,
    async (bucket, paths) => {
      const { data, error } = await user.storage
        .from(bucket)
        .createSignedUrls(paths, SIGN_TTL_SECONDS);
      if (error || !data) return alignSigned(paths, null);
      return alignSigned(paths, data);
    },
    {
      kind: body.kind ?? "proxy",
      aspect: body.aspect ?? "9:16",
      grain: body.grain,
      captions: body.captions,
      upscale: body.upscale,
    },
  );
  try {
    assertPlanSafe(plan);
    assertMediaUrls(plan);
  } catch (e) {
    return json(422, {
      ok: false,
      error: "plan_refused",
      message: e instanceof Error ? e.message : "refused",
    });
  }
  const dryRun = body.dryRun !== false;
  const media = mediaSummary(plan);
  // what each picture's performance is, from its asset lineage (reported only; the plan does not use it)
  let provenance: { version: string; counts: Record<string, number> } | { version: string; error: string };
  try {
    const ids = seq.clips.filter((c) => c.track === "V1" && c.assetId).map((c) => c.assetId!);
    const { assets, jobs } = await loadProvenance(user, ids);
    provenance = { version: PROVENANCE_VERSION, counts: provenanceCounts(applyPerformanceProvenance(seq, assets, jobs).byClip) };
  } catch (e) {
    provenance = { version: PROVENANCE_VERSION, error: e instanceof Error ? e.message : "unreadable" };
  }
  if (dryRun) return json(200, { ok: true, dryRun: true, costUsd: 0, media, provenance, plan });

  const { data: row, error: insErr } = await user
    .from("edit_renders")
    .insert({
      sequence_id: body.sequenceId,
      user_id: userData.user.id,
      kind: plan.kind,
      status: "queued",
      plan,
      cost_usd: 0,
    })
    .select("id")
    .single();
  if (insErr) return json(400, { ok: false, error: "queue_failed", message: insErr.message });
  return json(200, {
    ok: true,
    dryRun: false,
    costUsd: 0,
    renderId: row.id,
    media,
    provenance,
    note: "Queued. ffmpeg runs in scripts/edit-render.mjs, which downloads the signed files and probes them. This function did not encode and did not call a provider.",
    plan,
  });
});
