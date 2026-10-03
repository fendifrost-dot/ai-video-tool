// AVT edge function — provider-jobs-tick
//
// Moves submitted provider jobs to their end on the SERVER, so a job finishes whether or not any page is open:
// ask the provider where it stands → save the finished clip → put it on its shot (a restaged take is filed as a take
// in sync first) → finished. What one job needs next is decided in _shared/jobProgress.ts; this file only gives that
// code the real provider, storage and tables.
//
// Who calls it:
//   • the scheduler — pg_cron → public.kick_provider_jobs() → pg_net, once a minute while a job is unfinished, with
//     the header `x-cron-key` (the key lives in public.job_runner_config, readable by the service role only). It
//     moves every user's jobs.
//   • a signed-in page — `Authorization: Bearer <user JWT>`: "move MY jobs now". It moves that user's jobs only. The
//     page does none of the work itself; it asks, then reads the rows.
// Anything else is refused. (verify_jwt is off for this function because the scheduler has no user; both callers are
// authenticated here.)
//
// Request: POST, body ignored.
// Reply:   { ok, scope: "all" | "user", claimed, reports: [{ jobId, did[], state, note? }] }
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CONTROL_CENTER_URL, AVT_PROXY_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { callControlCenter, controlCenterConfig } from "../_shared/controlCenterClient.ts";
import { ingestOne } from "../_shared/ingestClip.ts";
import { advanceJobs, type AssignmentOp, type ProgressDeps, type ProgressJob } from "../_shared/jobProgress.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Leave room inside the gateway's limit: stop taking jobs after this long (a job in hand is finished). */
const BUDGET_MS = 90_000;
const CLAIM_LIMIT = 12;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Compare two secrets without stopping at the first different byte. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json(500, { ok: false, error: "server_misconfigured" });
  const cc = controlCenterConfig();
  if (!cc) return json(503, { ok: false, error: "control_center_not_configured" });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // --- who is asking ---------------------------------------------------------------------------------------------
  let userId: string | null = null;
  const cronKey = req.headers.get("x-cron-key") ?? "";
  if (cronKey) {
    const { data: cfg, error } = await (admin as any).from("job_runner_config").select("cron_key").eq("id", true).maybeSingle();
    if (error || !cfg?.cron_key || !same(String(cfg.cron_key), cronKey)) return json(401, { ok: false, error: "bad_cron_key" });
  } else {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { ok: false, error: "missing_credentials" });
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json(401, { ok: false, error: "invalid_jwt" });
    userId = userData.user.id;
  }

  // --- the jobs that need work, handed over atomically -----------------------------------------------------------
  const { data: claimed, error: claimErr } = await (admin as any).rpc("claim_provider_jobs", { p_user: userId, p_limit: CLAIM_LIMIT });
  if (claimErr) return json(500, { ok: false, error: "claim_failed", detail: claimErr.message });
  const jobs = (claimed ?? []) as ProgressJob[];
  if (jobs.length === 0) return json(200, { ok: true, scope: userId ? "user" : "all", claimed: 0, reports: [] });

  const deps: ProgressDeps = {
    now: () => new Date(),
    providerStatus: async (job) => {
      const query: Record<string, string> = { provider: job.provider, id: job.external_job_id! };
      const modelVariant = String((job.request_payload_json as any)?.modelVariant ?? "");
      if ((job.provider === "fal" || job.provider === "pika") && modelVariant) query.modelPath = modelVariant;
      const r = await callControlCenter(cc, { endpoint: "video-providers-job-status", method: "GET", query, timeoutMs: 30_000 });
      // a gateway error is not a verdict on the job: it is tried again
      if (r.httpStatus >= 500) throw new Error(`Control Center answered ${r.httpStatus} to the status question`);
      return r.payload;
    },
    saveClip: async (job) => {
      const out = await ingestOne(
        { id: job.id, user_id: job.user_id, project_id: job.project_id, prompt_id: (job as any).prompt_id ?? null, provider: job.provider, external_job_id: job.external_job_id, request_payload_json: job.request_payload_json, result_asset_id: job.result_asset_id },
        cc.url,
        cc.key,
        admin as any,
      );
      return out.assetId;
    },
    updateJob: async (id, patch) => {
      const { error } = await (admin as any).from("provider_jobs").update(patch).eq("id", id);
      if (error) throw new Error(`could not update the job: ${error.message}`);
    },
    shotExists: async (projectId, shotId) => {
      const { data, error } = await (admin as any).from("shots").select("id").eq("id", shotId).eq("project_id", projectId).maybeSingle();
      if (error) throw new Error(`could not read the shot: ${error.message}`);
      return !!data;
    },
    assignmentsOf: async (shotId) => {
      const { data, error } = await (admin as any).from("shot_asset_assignments").select("id, shot_id, asset_id, role, is_primary, sort_order").eq("shot_id", shotId);
      if (error) throw new Error(`could not read the shot's footage: ${error.message}`);
      return data ?? [];
    },
    applyAssignments: async (job, ops: AssignmentOp[]) => {
      const now = new Date().toISOString();
      // the same order the app applies them in: take the selection off first, then set it, then add
      const ordered = [...ops.filter((o) => o.op === "update" && !o.is_primary), ...ops.filter((o) => o.op === "update" && o.is_primary), ...ops.filter((o) => o.op === "insert")];
      for (const o of ordered) {
        if (o.op === "update") {
          const { error } = await (admin as any).from("shot_asset_assignments").update({ is_primary: o.is_primary, updated_at: now }).eq("id", o.id);
          if (error) throw new Error(`could not update the shot's footage: ${error.message}`);
        } else {
          const { error } = await (admin as any)
            .from("shot_asset_assignments")
            .upsert(
              { user_id: job.user_id, project_id: job.project_id, shot_id: o.shot_id, asset_id: o.asset_id, role: o.role, is_primary: o.is_primary, source_in_seconds: null, source_out_seconds: null, sort_order: o.sort_order, updated_at: now },
              { onConflict: "shot_id,asset_id,role" },
            );
          if (error) throw new Error(`could not put the clip on its shot: ${error.message}`);
          // the asset is filed under the shot it was made for
          await (admin as any).from("project_assets").update({ shot_id: o.shot_id }).eq("id", o.asset_id).is("shot_id", null);
        }
      }
    },
    assetMeta: async (assetId) => {
      const { data, error } = await (admin as any).from("project_assets").select("metadata_json").eq("id", assetId).maybeSingle();
      if (error) throw new Error(`could not read the clip: ${error.message}`);
      return data ? ((data.metadata_json ?? {}) as Record<string, unknown>) : null;
    },
    updateAsset: async (assetId, patch) => {
      const { error } = await (admin as any).from("project_assets").update(patch).eq("id", assetId);
      if (error) throw new Error(`could not file the clip: ${error.message}`);
    },
    syncOf: async (projectId, assetId) => {
      const { data, error } = await (admin as any).from("performance_syncs").select("song_asset_id, drift_ppm, status").eq("project_id", projectId).eq("performance_asset_id", assetId).limit(1);
      if (error) throw new Error(`could not read the sync: ${error.message}`);
      return data && data.length ? data[0] : null;
    },
    addEntityPictures: async (job, entityId, assetIds) => {
      const { data, error } = await (admin as any).from("continuity_entities").select("id, reference_asset_ids").eq("id", entityId).eq("project_id", job.project_id).maybeSingle();
      if (error) throw new Error(`could not read the entity: ${error.message}`);
      if (!data) return; // the entity is gone: the pictures stay in the project's library
      const next = [...new Set([...((data.reference_asset_ids ?? []) as string[]), ...assetIds])];
      const { error: upErr } = await (admin as any).from("continuity_entities").update({ reference_asset_ids: next, updated_at: new Date().toISOString() }).eq("id", entityId);
      if (upErr) throw new Error(`could not keep the pictures with the entity: ${upErr.message}`);
    },
    insertSync: async (row) => {
      const { error } = await (admin as any).from("performance_syncs").insert(row);
      if (error) throw new Error(`could not place the clip on the song: ${error.message}`);
    },
  };

  const release = async (job: ProgressJob) => {
    await (admin as any).from("provider_jobs").update({ progress_claimed_at: null }).eq("id", job.id).is("finalized_at", null);
  };
  const reports = await advanceJobs(jobs, deps, { budgetMs: BUDGET_MS, release });
  return json(200, { ok: true, scope: userId ? "user" : "all", claimed: jobs.length, reports });
});
