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
import { apiBilling, decideAfterApiRefusal, type BillingRecord, type SubscriptionRouting } from "./billing";
import { missingInput, type BatchShot } from "./dialect";
import { estimateBatchUsd, estimateShotUsd } from "./estimate";
import { buildMotionRequest, motionPrompt, providerOfRoute, stillPrompt } from "./requests";
import { describeSeam, isStackedPanels, type PanelSeam } from "./stillCheck";

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
  /** The asset the source clip was cut from, and how many seconds were asked for (a restaged take). */
  sourceAssetId?: string | null;
  sourceSeconds?: number | null;
  /**
   * How the shot's timed events were handed to the model, when it has any that must be drawn: "timed_script" (a
   * script with times, to a model that takes one) or "ordered" (the beats in order, asked for by name — the timing
   * is NOT kept). Absent = the shot was one state. Never claims the result follows the beats: `measured` says
   * whether anything has checked.
   */
  temporal?: { mode: "timed_script" | "ordered"; beats: number; measured: boolean; asked?: { id: string; offset: number; kinds: string[]; says: string }[] } | null;
  /** An image job: whether the picked picture becomes what the shot shows (false on a performance shot — it is the place). */
  selectStill?: boolean;
  /**
   * Set by the server when it finished an image job by itself (the page that asked was gone): "pending" until the
   * storyboard has looked at the pictures for stacked panels, then "passed" or "rejected".
   */
  panelCheck?: "pending" | "passed" | "rejected";
  /** When the result was put on its shot, and by whom ("server" = provider-jobs-tick). */
  attachedAt?: string;
  attachedBy?: string;
  /** Which money pays for this job (billing.ts). Absent on rows written before routes were kept: those ran on the API. */
  billing?: BillingRecord;
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
  /** Look at a generated still for the stacked-panels seam (stillCheck.ts). Absent or throwing = not checked. */
  inspectStill?(path: string): Promise<PanelSeam | null>;
  insertJob(row: {
    project_id: string;
    provider: "higgsfield" | "runway" | "grok";
    status: "queued";
    request_payload_json: Record<string, unknown>;
  }): Promise<string>;
  updateJob(id: string, patch: Record<string, unknown>): Promise<void>;
  callProxy(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export type RunContext = {
  projectId: string;
  runId: string;
  lookPresetId: string;
  look: LookPreset | null;
  /**
   * The storyboard box record each shot belongs to (batch shot id → `shots.id`). Written on the job as `shotId`, which
   * is what the server ingest files the finished clip under — so a clip generated for a box lands on that box.
   */
  shotIds?: Record<string, string>;
  /** An image job: whether the picked picture becomes what the shot shows. Recorded so the server can finish the job as asked. */
  selectStill?: boolean;
  /** An image job drawn for a continuity entity (not a shot): the entity the pictures are kept with. */
  entityId?: string;
  /** When a job the API refused for lack of funds may wait for the subscription runner instead. Absent = never. */
  subscriptionRouting?: SubscriptionRouting;
  /** The clock, for the record of a move (tests set it). */
  now?: () => Date;
};

/** The box record a shot belongs to, as the job payload carries it (absent when the shot is not a box). */
function shotIdOf(ctx: RunContext, shot: BatchShot): { shotId?: string } {
  const id = ctx.shotIds?.[shot.id];
  return id ? { shotId: id } : {};
}

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
    // queued / running: with an upstream id the provider has it; a job waiting for the subscription runner is live
    // too (the runner owns its submit); otherwise the submit never reported back
    if (latest.external_job_id || settingsOf(latest)?.billing?.route === "subscription") return { state: "running", job: latest };
    return { state: "unreconciled", job: latest };
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

export type SubmitResult = {
  rowId: string;
  providerJobId: string;
  prompt: string;
  stillPath: string | null;
  /** The API refused for lack of funds and the job now waits for the subscription runner (no provider job yet). */
  awaitingRunner?: boolean;
};

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
    if (deps.inspectStill && shot.panel_check !== false) {
      // A still that came back as two pictures stacked must not reach the motion model: take the first candidate
      // that is one picture; if none is, stop here with the stills on record (they are paid for) and no motion spend.
      const inspect = deps.inspectStill;
      const seams = await Promise.all(stillCandidates.map((p) => inspect(p).catch(() => null)));
      const whole = stillCandidates.filter((_, i) => !isStackedPanels(seams[i]));
      if (whole.length === 0) {
        const worst = seams.find((s) => isStackedPanels(s))!;
        const message = `every still came back as stacked panels (${describeSeam(worst)}) — describe the scene by depth (in front, behind), not by halves of the frame; "panel_check": false on the shot accepts it as it is`;
        const rowId = await deps.insertJob({
          project_id: ctx.projectId,
          provider: providerOfRoute(shot.route),
          status: "queued",
          request_payload_json: {
            promptText: stillPrompt(shot, ctx.look),
            mode: "still_only",
            ...shotIdOf(ctx, shot),
            settings: {
              batchRun: ctx.runId, batchShotId: shot.id, route: shot.route, kind: shot.kind, estimateUsd: 0, lookPreset: ctx.lookPresetId,
              // no stillPath: a retry must generate again, not reuse a picture that is two pictures
              stillPath: null, stillCandidates, stillCostUsd,
            } satisfies BatchJobSettings,
          },
        });
        await deps.updateJob(rowId, { status: "failed", error_text: message.slice(0, 500) });
        throw new Error(`${shot.id}: ${message}`);
      }
      stillPath = whole[0];
    }
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
    ...(shot.source_asset_id ? { sourceAssetId: shot.source_asset_id, sourceSeconds: shot.source_seconds ?? null } : {}),
    ...(shot.temporal ? { temporal: shot.temporal } : {}),
  };
  settings.billing = apiBilling(req.provider, settings.estimateUsd);
  // WRITE-AHEAD: the record exists before the money moves.
  const payload = {
    promptText: prompt,
    mode: req.body.mode ?? null,
    modelVariant: req.modelVariant,
    duration: req.body.duration ?? null,
    aspectRatio: shot.aspect,
    referenceImagePath: stillPath,
    ...shotIdOf(ctx, shot),
    settings,
  };
  const rowId = await deps.insertJob({ project_id: ctx.projectId, provider: req.provider, status: "queued", request_payload_json: payload });
  let env: Record<string, unknown>;
  try {
    env = await deps.callProxy(req.endpoint, req.body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // The API said no before taking the job. Only a confirmed lack of funds, with routing switched on and this
    // operation verified there, parks the SAME row for the subscription runner — one row, one submit, no second job.
    const decision = decideAfterApiRefusal({
      provider: req.provider, route: shot.route, errorText: message, accepted: false,
      routing: ctx.subscriptionRouting, now: (ctx.now?.() ?? new Date()).toISOString(),
    });
    if (decision.action === "move_to_subscription") {
      await deps.updateJob(rowId, {
        status: "queued",
        error_text: null,
        request_payload_json: {
          ...payload,
          settings: {
            ...settings,
            // the same signed links the API was just sent (a day's life), so the runner sends the same inputs
            billing: { ...decision.billing, inputs: { sourceUrl, stillUrl, expiresAt: new Date((ctx.now?.() ?? new Date()).getTime() + 23 * 3_600_000).toISOString() } },
          },
        },
      });
      return { rowId, providerJobId: "", prompt, stillPath, awaitingRunner: true };
    }
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

export type StillsResult = {
  rowId: string;
  prompt: string;
  /** Every still the generator returned (all are paid for and on record). */
  candidates: string[];
  /** The candidates that are one picture (not stacked panels). */
  whole: string[];
  /** The still the box shows: the first whole candidate. Null when every candidate came back as panels. */
  picked: string | null;
  costUsd: number | null;
};

/**
 * Generate the still of one shot and stop there (the storyboard's "Generate image"). Same rules as a motion submit:
 * the job row exists before the call, the stills are checked for the stacked-panels seam, and a result that is two
 * pictures is recorded as a failure with the stills kept — it is never shown as the box's image.
 */
export async function submitStills(shot: BatchShot, ctx: RunContext, deps: RunnerDeps): Promise<StillsResult> {
  if (!shot.prompt.trim()) throw new Error(`${shot.id}: needs a scene to draw`);
  const prompt = stillPrompt(shot, ctx.look);
  const settings: BatchJobSettings = {
    batchRun: ctx.runId,
    batchShotId: shot.id,
    route: shot.route,
    kind: shot.kind,
    estimateUsd: 0, // the still's cost is carried in stillCostUsd once the generator reports it
    lookPreset: ctx.lookPresetId,
    stillPath: null,
    selectStill: ctx.selectStill ?? true,
    billing: apiBilling("xai", null),
  };
  const payload = { promptText: prompt, mode: "still_only", aspectRatio: shot.aspect, ...shotIdOf(ctx, shot), ...(ctx.entityId ? { entityId: ctx.entityId } : {}) };
  const rowId = await deps.insertJob({ project_id: ctx.projectId, provider: "grok", status: "queued", request_payload_json: { ...payload, settings } });
  let r: Awaited<ReturnType<RunnerDeps["generateStills"]>>;
  try {
    r = await deps.generateStills({
      projectId: ctx.projectId,
      prompt,
      n: shot.stills,
      aspectRatio: shot.aspect,
      resolution: "2k",
      shotLabel: `${ctx.runId}_${shot.id}`,
      promptVersion: "world_bar_v1",
      dryRun: false,
      // the pictures are written on this job's row by the server the moment they exist
      jobRowId: rowId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await deps.updateJob(rowId, { status: "failed", error_text: message.slice(0, 500) });
    throw new Error(`${shot.id}: still failed — ${message}`);
  }
  if (!r.ok || !r.stills?.length) {
    const message = r.error ?? "no stills returned";
    await deps.updateJob(rowId, { status: "failed", error_text: message.slice(0, 500) });
    throw new Error(`${shot.id}: still failed — ${message}`);
  }
  const candidates = r.stills.map((x) => x.path);
  let whole = candidates;
  let rejected: string | null = null;
  if (deps.inspectStill && shot.panel_check !== false) {
    const inspect = deps.inspectStill;
    const seams = await Promise.all(candidates.map((p) => inspect(p).catch(() => null)));
    whole = candidates.filter((_, i) => !isStackedPanels(seams[i]));
    if (whole.length === 0) {
      rejected = `every still came back as stacked panels (${describeSeam(seams.find((x) => isStackedPanels(x))!)}) — describe the scene by depth (in front, behind), not by halves of the frame`;
    }
  }
  const picked = whole[0] ?? null;
  const costUsd = r.actualCostUsd ?? null;
  await deps.updateJob(rowId, {
    status: picked ? "succeeded" : "failed",
    ...(rejected ? { error_text: rejected.slice(0, 500) } : {}),
    request_payload_json: { ...payload, referenceImagePath: picked, settings: { ...settings, stillPath: picked, stillCandidates: candidates, stillCostUsd: costUsd } },
  });
  if (!picked) throw new Error(`${shot.id}: ${rejected}`);
  return { rowId, prompt, candidates, whole, picked, costUsd };
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

/**
 * Why a job failed, in the provider's own words where it gave any. The envelope's own errorMessage first; then what
 * the provider itself said, which the proxy passes through under providerMetadata — a restaging refused for a low
 * balance was recorded as "failed" and nothing else while the provider's sentence sat unread in the response
 * (the fresh section). The status word alone is the last resort.
 */
export function failureReason(env: Record<string, unknown> | null | undefined): string {
  const text = (v: unknown): string => {
    if (typeof v === "string") return v.trim();
    const m = v && typeof v === "object" ? (v as { message?: unknown }).message : null;
    return typeof m === "string" ? m.trim() : "";
  };
  const meta = (env?.providerMetadata && typeof env.providerMetadata === "object" ? env.providerMetadata : {}) as Record<string, unknown>;
  const said = [env?.errorMessage, env?.error, meta.error, meta.detail, meta.message, meta.failure_reason].map(text).find(Boolean);
  if (said) return said.slice(0, 500);
  const status = typeof env?.status === "string" ? env.status.trim() : "";
  return status && !["failed", "error"].includes(status.toLowerCase()) ? `the provider reported: ${status}` : "the provider reported a failure and did not say why";
}
