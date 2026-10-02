/**
 * The in-app batch runner: a shots.json list → provider jobs, from the signed-in browser.
 *
 * Why (2026-10-02): the paid half of a test round could only be run by a script holding a login, and no agent session
 * can hold one. The app already has the owner's session, the proxy (`proxy-provider-call`), a `provider_jobs` audit
 * table, a poller and a server-side ingest. This module is the missing piece: it turns the same shot list the scripts
 * run into those jobs, with the script's rules —
 *
 *   • the estimate is computed first and a run above the ceiling never starts;
 *   • WRITE-AHEAD: the provider_jobs row exists before the money moves, so a submit that dies mid-flight is visible as
 *     "unreconciled" and is never blindly resubmitted;
 *   • a shot that already has a live or finished job in this run is not submitted again;
 *   • a still generated for a shot whose motion submit then failed is reused on retry, not regenerated.
 *
 * Every effect arrives through `RunnerDeps`, so the rules are testable without a network.
 */
import type { LookPreset } from "@/lib/shotCompiler";
import { missingInput, type BatchShot } from "./dialect";
import { estimateBatchUsd, estimateShotUsd } from "./estimate";
import { buildMotionRequest, motionPrompt, stillPrompt } from "./requests";

export type BatchJobSettings = {
  batchRun: string;
  batchShotId: string;
  route: BatchShot["route"];
  kind: BatchShot["kind"];
  estimateUsd: number;
  lookPreset: string;
  sourcePath?: string | null;
  stillPath?: string | null;
  stillCandidates?: string[];
  stillCostUsd?: number | null;
  sourceWindow?: [number, number] | null;
  masterStart?: number | null;
};

/** The slice of a provider_jobs row the runner reads. */
export type BatchJobRow = {
  id: string;
  provider: string;
  status: "queued" | "running" | "succeeded" | "failed" | string;
  external_job_id: string | null;
  error_text: string | null;
  result_asset_id: string | null;
  created_at: string;
  request_payload_json: unknown;
  response_payload_json: unknown;
};

export type RunnerDeps = {
  userId: string;
  sign(bucket: "project-clips" | "project-references", path: string): Promise<string>;
  generateStills(body: Record<string, unknown>): Promise<{
    ok: boolean;
    stills?: { path: string; previewUrl?: string }[];
    actualCostUsd?: number | null;
    error?: string;
  }>;
  insertJob(row: {
    project_id: string;
    provider: "higgsfield" | "runway";
    status: "queued";
    request_payload_json: Record<string, unknown>;
  }): Promise<string>;
  updateJob(id: string, patch: Record<string, unknown>): Promise<void>;
  callProxy(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export type RunContext = { projectId: string; runId: string; lookPresetId: string; look: LookPreset | null };

export function settingsOf(job: Pick<BatchJobRow, "request_payload_json">): BatchJobSettings | null {
  const s = (job.request_payload_json as { settings?: Partial<BatchJobSettings> } | null)?.settings;
  return s && typeof s.batchRun === "string" && typeof s.batchShotId === "string" ? (s as BatchJobSettings) : null;
}

/** Jobs that belong to batch runs, newest run first; within a run, the newest job per shot leads. */
export function batchJobsByRun(jobs: readonly BatchJobRow[]): Map<string, BatchJobRow[]> {
  const out = new Map<string, BatchJobRow[]>();
  const sorted = [...jobs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const j of sorted) {
    const s = settingsOf(j);
    if (!s) continue;
    const list = out.get(s.batchRun) ?? [];
    list.push(j);
    out.set(s.batchRun, list);
  }
  return out;
}

export type ShotState =
  | { state: "ready" }
  | { state: "blocked"; reason: string }
  | { state: "unreconciled"; job: BatchJobRow }
  | { state: "running"; job: BatchJobRow }
  | { state: "succeeded"; job: BatchJobRow }
  | { state: "failed"; job: BatchJobRow; reuseStillPath: string | null };

/** Where one shot stands in one run, from the jobs table alone (so a reload loses nothing). */
export function shotState(shot: BatchShot, runJobs: readonly BatchJobRow[]): ShotState {
  const mine = runJobs.filter((j) => settingsOf(j)?.batchShotId === shot.id);
  const latest = mine[0]; // batchJobsByRun sorts newest first
  if (latest) {
    if (latest.status === "succeeded") return { state: "succeeded", job: latest };
    if (latest.status === "failed") {
      const still = mine.map((j) => settingsOf(j)?.stillPath).find((p) => !!p) ?? null;
      const blocked = missingInput(shot);
      return blocked ? { state: "blocked", reason: blocked } : { state: "failed", job: latest, reuseStillPath: still };
    }
    // queued / running: with an upstream id the provider has it; without one the submit never reported back
    return latest.external_job_id ? { state: "running", job: latest } : { state: "unreconciled", job: latest };
  }
  const blocked = missingInput(shot);
  return blocked ? { state: "blocked", reason: blocked } : { state: "ready" };
}

export type Plan = {
  submit: { shot: BatchShot; reuseStillPath: string | null }[];
  skip: { shot: BatchShot; why: string }[];
  estimateUsd: number;
};

/** What a press of Run would do. Failed shots are retried; anything live, finished or unreconciled is left alone. */
export function planRun(shots: readonly BatchShot[], runJobs: readonly BatchJobRow[]): Plan {
  const plan: Plan = { submit: [], skip: [], estimateUsd: 0 };
  for (const shot of shots) {
    const st = shotState(shot, runJobs);
    if (st.state === "ready") plan.submit.push({ shot, reuseStillPath: null });
    else if (st.state === "failed") plan.submit.push({ shot, reuseStillPath: st.reuseStillPath });
    else if (st.state === "blocked") plan.skip.push({ shot, why: st.reason });
    else if (st.state === "unreconciled")
      plan.skip.push({ shot, why: "a submit never reported back — check the provider before resubmitting" });
    else plan.skip.push({ shot, why: st.state === "succeeded" ? "already done in this run" : "already running in this run" });
  }
  plan.estimateUsd = estimateBatchUsd(
    plan.submit.map(({ shot, reuseStillPath }) => (reuseStillPath ? { ...shot, still_path: reuseStillPath } : shot)),
  );
  return plan;
}

export type SubmitResult = { rowId: string; providerJobId: string; prompt: string; stillPath: string | null };

/** Submit one shot. Throws after recording the failure on its row. */
export async function submitShot(
  shot: BatchShot,
  ctx: RunContext,
  deps: RunnerDeps,
  reuseStillPath: string | null = null,
): Promise<SubmitResult> {
  const blocked = missingInput(shot);
  if (blocked) throw new Error(`${shot.id}: ${blocked}`);

  let stillPath: string | null = shot.still_path ?? reuseStillPath ?? null;
  let stillCandidates: string[] | undefined;
  let stillCostUsd: number | null | undefined;
  if (shot.route.startsWith("still") && !stillPath) {
    const r = await deps.generateStills({
      projectId: ctx.projectId,
      prompt: stillPrompt(shot, ctx.look),
      n: shot.stills,
      aspectRatio: shot.aspect,
      resolution: "2k",
      shotLabel: `${ctx.runId}_${shot.id}`,
      promptVersion: "world_bar_v1",
      dryRun: false,
    });
    if (!r.ok || !r.stills?.length) throw new Error(`${shot.id}: still failed — ${r.error ?? "no stills returned"}`);
    stillCandidates = r.stills.map((s) => s.path);
    stillPath = stillCandidates[0]; // the look-bank pick lives in the scripts lane; the candidates are recorded
    stillCostUsd = r.actualCostUsd ?? null;
  }
  const stillUrl = stillPath ? await deps.sign("project-references", stillPath) : null;
  const sourceUrl = shot.route === "seedance_ref" ? await deps.sign("project-clips", shot.source_path!) : null;
  const prompt = motionPrompt(shot, ctx.look, !!stillUrl);
  const req = buildMotionRequest(shot, { prompt, stillUrl, sourceUrl, userId: deps.userId, projectId: ctx.projectId });

  const settings: BatchJobSettings = {
    batchRun: ctx.runId,
    batchShotId: shot.id,
    route: shot.route,
    kind: shot.kind,
    estimateUsd: Number(estimateShotUsd(stillPath ? { ...shot, still_path: stillPath } : shot).toFixed(3)),
    lookPreset: ctx.lookPresetId,
    sourcePath: shot.source_path ?? null,
    stillPath,
    stillCandidates,
    stillCostUsd,
    sourceWindow: shot.source_window ?? null,
    masterStart: shot.masterStart ?? null,
  };
  // WRITE-AHEAD: the record exists before the money moves.
  const rowId = await deps.insertJob({
    project_id: ctx.projectId,
    provider: req.provider,
    status: "queued",
    request_payload_json: {
      promptText: prompt,
      mode: req.body.mode ?? null,
      modelVariant: req.modelVariant,
      duration: req.body.duration ?? null,
      aspectRatio: shot.aspect,
      referenceImagePath: stillPath,
      settings,
    },
  });
  let env: Record<string, unknown>;
  try {
    env = await deps.callProxy(req.endpoint, req.body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await deps.updateJob(rowId, { status: "failed", error_text: message.slice(0, 500) });
    throw new Error(`${shot.id}: ${message}`);
  }
  const providerJobId = String(env.providerJobId ?? env.jobId ?? "");
  if (!providerJobId) {
    const message = "the provider answered without a job id";
    await deps.updateJob(rowId, { status: "failed", error_text: message, response_payload_json: env });
    throw new Error(`${shot.id}: ${message}`);
  }
  try {
    // only the two states the table and the poller both understand; the poller owns everything after this
    await deps.updateJob(rowId, {
      external_job_id: providerJobId,
      status: env.status === "running" ? "running" : "queued",
      response_payload_json: env,
    });
  } catch (e) {
    // the job is live and paid for: never report this as a failed submit, and never lose the id
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`${shot.id}: accepted by the provider as ${providerJobId}, but its record could not be updated — ${message}`);
  }
  return { rowId, providerJobId, prompt, stillPath };
}

export type RunOutcome = { submitted: SubmitResult[]; failed: { shotId: string; error: string }[]; skipped: Plan["skip"] };

/**
 * Run a plan under a ceiling. Shots are submitted one after another (each call can take minutes); one failure does
 * not stop the rest unless the provider refused for a reason that will refuse every further submit.
 */
export async function runPlan(
  plan: Plan,
  ctx: RunContext,
  deps: RunnerDeps,
  opts: { ceilingUsd: number; refusalPatterns?: Record<string, string[]>; onProgress?: (shotId: string, phase: "submitting" | "submitted" | "failed") => void },
): Promise<RunOutcome> {
  if (plan.estimateUsd > opts.ceilingUsd) {
    throw new Error(`estimate $${plan.estimateUsd.toFixed(2)} exceeds the ceiling $${opts.ceilingUsd.toFixed(2)} — nothing was submitted`);
  }
  const out: RunOutcome = { submitted: [], failed: [], skipped: [...plan.skip] };
  const exhausted = new Set<string>();
  for (const { shot, reuseStillPath } of plan.submit) {
    const provider = shot.route.includes("runway") ? "runway" : "higgsfield";
    if (exhausted.has(provider)) {
      out.skipped.push({ shot, why: `${provider} refused earlier in this run` });
      continue;
    }
    opts.onProgress?.(shot.id, "submitting");
    try {
      out.submitted.push(await submitShot(shot, ctx, deps, reuseStillPath));
      opts.onProgress?.(shot.id, "submitted");
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      out.failed.push({ shotId: shot.id, error });
      opts.onProgress?.(shot.id, "failed");
      const patterns = opts.refusalPatterns?.[provider] ?? [];
      if (patterns.some((p) => error.toLowerCase().includes(p.toLowerCase()))) exhausted.add(provider);
    }
  }
  return out;
}

/** The finished clip's public URL from the last status envelope, when the provider reported one. */
export function resultUrlOf(job: Pick<BatchJobRow, "response_payload_json">): string | null {
  const u = (job.response_payload_json as { resultUrl?: unknown } | null)?.resultUrl;
  return typeof u === "string" && u.startsWith("http") ? u : null;
}

/** Sum of the list estimates of the jobs that were actually accepted (not failed before reaching the provider). */
export function spentEstimateUsd(runJobs: readonly BatchJobRow[]): number {
  return runJobs.reduce((a, j) => {
    const s = settingsOf(j);
    if (!s) return a;
    // the motion estimate counts once the provider took the job; a still generated for this submit is spent either way
    return a + (j.external_job_id ? s.estimateUsd : 0) + (s.stillCostUsd ?? 0);
  }, 0);
}

/**
 * What a job-status envelope means for the row (run_world_batch.py's poll loop): a result URL is success whatever the
 * status word says; the provider's terminal failure words are a failure; anything else is still running.
 */
export function statusFromEnvelope(env: Record<string, unknown> | null | undefined): "running" | "succeeded" | "failed" {
  const url = env?.resultUrl;
  if (typeof url === "string" && url.startsWith("http")) return "succeeded";
  const s = typeof env?.status === "string" ? env.status.toLowerCase() : "";
  if (["failed", "canceled", "cancelled", "nsfw", "error"].includes(s)) return "failed";
  return "running";
}
