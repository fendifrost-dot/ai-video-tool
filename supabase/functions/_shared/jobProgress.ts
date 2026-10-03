// Moving a submitted provider job to its end — the pure half.
//
// A job the batch runner submitted (the storyboard, Runs, a continuity picture) is moved by the SERVER from the
// moment its row exists: ask the provider → save the clip → put it on its shot (a restaged take is filed as a take in
// sync first) → finished. The browser shows the rows and may ask for a tick; it does none of this itself, so a job
// finishes whether or not any page is open.
//
// This file is the whole decision: what one job needs next and in what order. It reaches nothing itself — the
// provider, the storage and the tables come in as `deps` — so the same code runs in the edge function
// (provider-jobs-tick) and under test with an in-memory store and no browser at all.
//
// Pure: no Deno, no network, no project knowledge.

export type ProgressJob = {
  id: string;
  user_id: string;
  project_id: string;
  provider: string;
  status: string;
  external_job_id: string | null;
  error_text: string | null;
  result_asset_id: string | null;
  request_payload_json: Record<string, unknown> | null;
  response_payload_json: Record<string, unknown> | null;
  created_at: string;
  finalized_at: string | null;
  progress_failures: number;
  progress_note: string | null;
};

export type AssignmentRow = { id: string; shot_id: string; asset_id: string; role: string; is_primary: boolean; sort_order: number };

/** One change to the footage on a shot. The same three operations the app's own assignment plan makes. */
export type AssignmentOp =
  | { op: "update"; id: string; is_primary: boolean }
  | { op: "insert"; shot_id: string; asset_id: string; role: string; is_primary: boolean; sort_order: number };

export type ProgressDeps = {
  now: () => Date;
  /** Where the provider says the job stands (Control Center's status envelope). */
  providerStatus: (job: ProgressJob) => Promise<Record<string, unknown>>;
  /** Download the finished clip, store it, record it as a project asset, link it to the job. Returns the asset id. */
  saveClip: (job: ProgressJob) => Promise<string>;
  updateJob: (id: string, patch: Partial<ProgressJob>) => Promise<void>;
  shotExists: (projectId: string, shotId: string) => Promise<boolean>;
  assignmentsOf: (shotId: string) => Promise<AssignmentRow[]>;
  applyAssignments: (job: ProgressJob, ops: AssignmentOp[]) => Promise<void>;
  /** A project asset's metadata (null when the asset is gone). */
  assetMeta: (assetId: string) => Promise<Record<string, unknown> | null>;
  updateAsset: (assetId: string, patch: { footage_role?: string; metadata_json?: Record<string, unknown> }) => Promise<void>;
  /** The sync row of an asset in a project, if it has one. */
  syncOf: (projectId: string, assetId: string) => Promise<{ song_asset_id: string | null; drift_ppm: number | null; status: string | null } | null>;
  /** Keep pictures drawn for a continuity entity with that entity (nothing is approved). Absent = not supported here. */
  addEntityPictures?: (job: ProgressJob, entityId: string, assetIds: string[]) => Promise<void>;
  insertSync: (row: { user_id: string; project_id: string; song_asset_id: string | null; performance_asset_id: string; offset_seconds: number; drift_ppm: number; method: string; status: string; notes: string }) => Promise<void>;
};

/** A submit that has not reported a provider job id after this long never will. */
export const UNREPORTED_AFTER_MS = 10 * 60_000;
/** A render the provider has not finished after this long is given up on (the provider's own record is kept). */
export const RENDER_GIVE_UP_AFTER_MS = 6 * 60 * 60_000;
/** How long an image request's own page is given to finish the job before the server does. */
export const STILL_GRACE_MS = 2 * 60_000;
/** Steps that fail this many times are given up on, with the reason on the job. */
export const MAX_FAILURES = 6;

export const DERIVED_SYNC_METHOD = "derived";

type Settings = Record<string, unknown>;
const payloadOf = (job: ProgressJob) => (job.request_payload_json ?? {}) as Record<string, unknown>;
export const settingsOf = (job: ProgressJob): Settings => ((payloadOf(job).settings ?? {}) as Settings);
export const isStillJob = (job: ProgressJob) => payloadOf(job).mode === "still_only";
export const shotIdOf = (job: ProgressJob): string | null => (typeof payloadOf(job).shotId === "string" && payloadOf(job).shotId ? (payloadOf(job).shotId as string) : null);

/** The same reading of a status envelope the runner uses (src/lib/worldBatch/runner.ts statusFromEnvelope). */
export function statusFromEnvelope(env: Record<string, unknown> | null | undefined): "running" | "succeeded" | "failed" {
  const url = env?.resultUrl;
  if (typeof url === "string" && url.startsWith("http")) return "succeeded";
  const s = typeof env?.status === "string" ? env.status.toLowerCase() : "";
  if (["failed", "canceled", "cancelled", "nsfw", "error"].includes(s)) return "failed";
  return "running";
}

/** A restaged take: the job was given a cut of a take, and its clip keeps that take's place on the song. */
export function restagedFrom(job: ProgressJob): { sourceAssetId: string; songStart: number; sourceWindow: unknown; seconds: number | null } | null {
  const s = settingsOf(job);
  if (s.route !== "seedance_ref" || typeof s.sourceAssetId !== "string" || !s.sourceAssetId || typeof s.masterStart !== "number") return null;
  return { sourceAssetId: s.sourceAssetId, songStart: s.masterStart, sourceWindow: s.sourceWindow ?? null, seconds: typeof s.sourceSeconds === "number" ? s.sourceSeconds : null };
}

const PLAYABLE = new Set(["performance", "b_roll", "generated_clip", "generated_image"]);

/**
 * Put an asset on a shot. The same plan the app makes (src/lib/storyboard/media.ts planAssign — a test holds the
 * two equal): selected media is one per shot; putting the same asset on twice changes nothing.
 */
export function assignPlan(input: { assignments: readonly AssignmentRow[]; shotId: string; assetId: string; role: string; select: boolean }): AssignmentOp[] {
  const select = input.select && PLAYABLE.has(input.role);
  const onShot = input.assignments.filter((a) => a.shot_id === input.shotId);
  const ops: AssignmentOp[] = [];
  if (select) for (const a of onShot) if (a.is_primary && !(a.asset_id === input.assetId && a.role === input.role)) ops.push({ op: "update", id: a.id, is_primary: false });
  const same = onShot.find((a) => a.asset_id === input.assetId && a.role === input.role);
  if (same) {
    if (select && !same.is_primary) ops.push({ op: "update", id: same.id, is_primary: true });
    return ops;
  }
  ops.push({ op: "insert", shot_id: input.shotId, asset_id: input.assetId, role: input.role, is_primary: select, sort_order: onShot.reduce((m, a) => Math.max(m, a.sort_order), 0) + 1 });
  return ops;
}

export type StepReport = {
  jobId: string;
  /** What was done for the job in this pass, in order. */
  did: string[];
  /** finished = nothing more will be done; waiting = the provider (or a grace period) is still running; retry = a step failed and will be tried again. */
  state: "finished" | "waiting" | "retry";
  note?: string;
};

const words = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);

/**
 * Move one job as far as it can go now. Every step is safe to repeat: a job that was interrupted anywhere is picked
 * up at the step it had reached, read from its own row.
 */
export async function advanceJob(input: ProgressJob, deps: ProgressDeps): Promise<StepReport> {
  let job = input;
  const did: string[] = [];
  const set = async (patch: Partial<ProgressJob>) => {
    await deps.updateJob(job.id, patch);
    job = { ...job, ...patch };
  };
  const finish = async (note?: string): Promise<StepReport> => {
    await set({ finalized_at: deps.now().toISOString(), ...(note ? { progress_note: note } : {}) });
    did.push("finished");
    return { jobId: job.id, did, state: "finished", ...(note ? { note } : {}) };
  };
  const age = deps.now().getTime() - Date.parse(job.created_at);

  try {
    if (job.finalized_at) return { jobId: job.id, did, state: "finished" };

    // 1. a job the provider has not finished
    if (job.status === "queued" || job.status === "running") {
      if (isStillJob(job)) return await advanceStill(job, deps, did, set, finish, age);
      if (!job.external_job_id) {
        if (age < UNREPORTED_AFTER_MS) return { jobId: job.id, did, state: "waiting", note: "the submit has not reported a provider job yet" };
        await set({ status: "failed", error_text: "the submit never reported a provider job — nothing was recorded as sent" });
        did.push("failed: never reported");
        return await finish();
      }
      const env = await deps.providerStatus(job);
      const state = statusFromEnvelope(env);
      did.push(`provider: ${state}`);
      if (state === "running") {
        if (age > RENDER_GIVE_UP_AFTER_MS) {
          await set({ status: "failed", error_text: `the provider had not finished after ${Math.round(RENDER_GIVE_UP_AFTER_MS / 3_600_000)} hours`, response_payload_json: env });
          return await finish();
        }
        return { jobId: job.id, did, state: "waiting" };
      }
      if (state === "failed") {
        await set({ status: "failed", error_text: String(env.errorMessage ?? env.status ?? "the provider reported a failure").slice(0, 500), response_payload_json: env });
        return await finish();
      }
      await set({ status: "succeeded", response_payload_json: env });
    }

    if (job.status !== "succeeded") return await finish(); // failed or cancelled: nothing to save
    if (isStillJob(job)) return await finish(); // an image job the page itself finished

    // 2. the clip is rendered: save it
    if (!job.result_asset_id) {
      if (!job.external_job_id) return await finish("rendered, but there is no provider job id to fetch it by");
      const assetId = await deps.saveClip(job);
      job = { ...job, result_asset_id: assetId };
      did.push("saved");
    }

    // 3. put it on its shot, once
    const shotId = shotIdOf(job);
    const settings = settingsOf(job);
    if (!shotId) return await finish(); // a Runs batch: saved to the library is the end
    if (settings.attachedAt) return await finish();
    if (!(await deps.shotExists(job.project_id, shotId))) {
      return await finish("the shot this was made for no longer exists — the clip is in the project's library");
    }
    const restaged = restagedFrom(job);
    if (restaged) {
      await fileRestagedClip(job, restaged, deps);
      did.push("filed as a take in sync");
    }
    const ops = assignPlan({ assignments: await deps.assignmentsOf(shotId), shotId, assetId: job.result_asset_id!, role: restaged ? "performance" : "generated_clip", select: true });
    await deps.applyAssignments(job, ops);
    did.push("on its shot");
    await set({ request_payload_json: { ...payloadOf(job), settings: { ...settings, attachedAt: deps.now().toISOString(), attachedBy: "server" } } });
    return await finish();
  } catch (e) {
    const failures = (job.progress_failures ?? 0) + 1;
    const note = words(e);
    if (failures >= MAX_FAILURES) {
      // given up on, said plainly: what is paid for stays on record (the job, the provider's reply, a saved clip)
      await deps.updateJob(job.id, { progress_failures: failures, progress_note: note, finalized_at: deps.now().toISOString(), error_text: job.error_text ?? `not finished after ${failures} tries: ${note}`.slice(0, 500) }).catch(() => undefined);
      return { jobId: job.id, did: [...did, "given up"], state: "finished", note };
    }
    await deps.updateJob(job.id, { progress_failures: failures, progress_note: note }).catch(() => undefined);
    return { jobId: job.id, did, state: "retry", note };
  }
}

/**
 * An image job. The image request is one server call that files the pictures itself and writes them on the job; the
 * page that asked then checks them and puts them on the shot. When that page is gone, the server finishes the job:
 * the pictures go on the shot unselected and the job says they have not been checked — the check runs when the
 * storyboard is next opened. A picture is never selected for a shot without the check.
 */
async function advanceStill(
  job: ProgressJob,
  deps: ProgressDeps,
  did: string[],
  set: (patch: Partial<ProgressJob>) => Promise<void>,
  finish: (note?: string) => Promise<StepReport>,
  age: number,
): Promise<StepReport> {
  const recorded = (job.response_payload_json ?? {}) as { stills?: { path?: string; assetId?: string }[]; actualCostUsd?: number; recordedAt?: string };
  const stills = (recorded.stills ?? []).filter((s): s is { path: string; assetId: string } => typeof s?.path === "string" && typeof s?.assetId === "string");
  if (stills.length === 0) {
    if (age < UNREPORTED_AFTER_MS) return { jobId: job.id, did, state: "waiting", note: "the image request is still running" };
    await set({ status: "failed", error_text: "the image request did not finish — no picture was recorded" });
    did.push("failed: no picture recorded");
    return await finish();
  }
  const since = deps.now().getTime() - Date.parse(recorded.recordedAt ?? job.created_at);
  if (since < STILL_GRACE_MS) return { jobId: job.id, did, state: "waiting", note: "the page that asked for the image is finishing it" };

  const shotId = shotIdOf(job);
  const settings = settingsOf(job);
  if (shotId && (await deps.shotExists(job.project_id, shotId))) {
    for (const s of stills) {
      const ops = assignPlan({ assignments: await deps.assignmentsOf(shotId), shotId, assetId: s.assetId, role: "generated_image", select: false });
      await deps.applyAssignments(job, ops);
    }
    did.push("pictures on the shot, unselected");
  }
  // pictures drawn for a continuity entity are kept with it (the director still approves one by eye)
  const entityId = payloadOf(job).entityId;
  if (typeof entityId === "string" && entityId && deps.addEntityPictures) {
    await deps.addEntityPictures(job, entityId, stills.map((s) => s.assetId));
    did.push("pictures kept with their entity");
  }
  await set({
    status: "succeeded",
    result_asset_id: stills[0].assetId,
    request_payload_json: {
      ...payloadOf(job),
      settings: { ...settings, stillPath: null, stillCandidates: stills.map((s) => s.path), stillCostUsd: recorded.actualCostUsd ?? null, panelCheck: "pending", attachedBy: "server" },
    },
  });
  return await finish("the pictures were not checked for stacked panels — the check runs when the storyboard is opened");
}

/**
 * A finished restaging becomes a take of its own: marked as performance footage cut from its source, with a sync
 * whose offset is the song time of its first frame. Idempotent. (The server's copy of what the app did in
 * src/lib/storyboard/restage.ts fileRestagedClip.)
 */
export async function fileRestagedClip(job: ProgressJob, restaged: NonNullable<ReturnType<typeof restagedFrom>>, deps: ProgressDeps): Promise<void> {
  const assetId = job.result_asset_id!;
  const meta = await deps.assetMeta(assetId);
  if (!meta) throw new Error("could not read the restaged clip");
  const next: Record<string, unknown> = { ...meta, derived_from: { asset_id: restaged.sourceAssetId, source_window: restaged.sourceWindow, song_start: restaged.songStart } };
  if (!(Number(next.duration_seconds) > 0) && restaged.seconds) next.duration_seconds = restaged.seconds;
  await deps.updateAsset(assetId, { footage_role: "performance", metadata_json: next });
  if (await deps.syncOf(job.project_id, assetId)) return;
  const source = await deps.syncOf(job.project_id, restaged.sourceAssetId);
  const usable = source && (source.status === "confirmed" || source.status === "manual") ? source : null;
  await deps.insertSync({
    user_id: job.user_id,
    project_id: job.project_id,
    song_asset_id: usable?.song_asset_id ?? null,
    performance_asset_id: assetId,
    offset_seconds: restaged.songStart,
    drift_ppm: usable?.drift_ppm ?? 0,
    method: DERIVED_SYNC_METHOD,
    status: "confirmed",
    notes: "restaged from the take: its first frame sits where the cut began on the song",
  });
}

/** Move every job handed over, one after another, until the time allowed runs out. A job never stops the others. */
export async function advanceJobs(jobs: readonly ProgressJob[], deps: ProgressDeps, opts: { budgetMs?: number; release?: (job: ProgressJob) => Promise<void> } = {}): Promise<StepReport[]> {
  const started = deps.now().getTime();
  const reports: StepReport[] = [];
  for (const job of jobs) {
    if (opts.budgetMs && deps.now().getTime() - started > opts.budgetMs) {
      await opts.release?.(job).catch(() => undefined);
      continue;
    }
    const report = await advanceJob(job, deps);
    reports.push(report);
    // a job that is not finished is handed back at once, so the next tick can take it
    if (report.state !== "finished") await opts.release?.(job).catch(() => undefined);
  }
  return reports;
}
