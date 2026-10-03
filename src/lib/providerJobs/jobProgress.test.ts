/**
 * A submitted job finishes without the browser.
 *
 * The "server" here is the real decision code the edge function runs (supabase/functions/_shared/jobProgress.ts)
 * over an in-memory copy of the tables and a stand-in provider. The "client" is the app's real runner
 * (worldBatch/runner.ts submitShot / submitStills) writing into the same tables. Each test submits as the client,
 * then NEVER runs client code again — the page is closed — and lets the scheduler tick. No provider is called and
 * nothing is spent.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import {
  advanceJob,
  advanceJobs,
  assignPlan,
  MAX_FAILURES,
  RENDER_GIVE_UP_AFTER_MS,
  STILL_GRACE_MS,
  UNREPORTED_AFTER_MS,
  type AssignmentRow,
  type ProgressDeps,
  type ProgressJob,
} from "../../../supabase/functions/_shared/jobProgress";
import { BatchShotSchema, submitShot, submitStills, statusFromEnvelope, type BatchJobRow, type RunnerDeps } from "@/lib/worldBatch";
import { planAssign, type Assignment } from "@/lib/storyboard/media";
import { boxJobStatus, planStillCheck } from "@/lib/queries/boxJobs";
import { isUnfinished } from "./progress";
import { statusFromEnvelope as serverStatusFromEnvelope } from "../../../supabase/functions/_shared/jobProgress";

const T0 = Date.parse("2026-10-03T12:00:00.000Z");

/** The tables, the provider and the clock — everything the server touches. */
function world() {
  let clock = T0;
  let seq = 0;
  const id = (p: string) => `${p}_${++seq}`;
  const jobs = new Map<string, ProgressJob>();
  const assets = new Map<string, { id: string; project_id: string; shot_id: string | null; footage_role: string | null; metadata_json: Record<string, unknown>; path: string }>();
  const assignments: (AssignmentRow & { project_id: string })[] = [];
  const syncs: { project_id: string; performance_asset_id: string; song_asset_id: string | null; offset_seconds: number; drift_ppm: number; method: string; status: string }[] = [];
  const shots = new Set<string>(["shot_18", "shot_15"]);
  const entities = new Map<string, string[]>();
  /** What the provider would answer for each external job id. */
  const provider = new Map<string, Record<string, unknown>>();
  const calls = { status: 0, save: 0, clientAfterSubmit: 0 };
  let saveFails = 0;

  // ---- the client's own access to the tables (what the browser's runner deps do) --------------------------------
  const client: RunnerDeps = {
    userId: "user_1",
    sign: async (bucket, path) => `https://signed/${bucket}/${path}`,
    generateStills: async (body) => {
      // the server function: it files the pictures and writes them on the job's row before it answers
      const made = [0, 1].map((i) => {
        const a = { id: id("asset"), project_id: String(body.projectId), shot_id: null, footage_role: null, metadata_json: { bucket: "project-references" }, path: `u/p/worlds/${String(body.shotLabel)}_${i + 1}.png` };
        assets.set(a.id, a);
        return a;
      });
      const row = jobs.get(String(body.jobRowId));
      if (row) row.response_payload_json = { stills: made.map((a) => ({ path: a.path, assetId: a.id })), actualCostUsd: 0.14, recordedAt: new Date(clock).toISOString() };
      return { ok: true, stills: made.map((a) => ({ path: a.path })), actualCostUsd: 0.14 };
    },
    insertJob: async (row) => {
      const job: ProgressJob = { id: id("job"), user_id: "user_1", project_id: row.project_id, provider: row.provider, status: row.status, external_job_id: null, error_text: null, result_asset_id: null, request_payload_json: row.request_payload_json, response_payload_json: {}, created_at: new Date(clock).toISOString(), finalized_at: null, progress_failures: 0, progress_note: null };
      jobs.set(job.id, job);
      return job.id;
    },
    updateJob: async (jobId, patch) => {
      Object.assign(jobs.get(jobId)!, patch);
    },
    callProxy: async () => {
      const ext = id("ext");
      provider.set(ext, { status: "running" });
      return { ok: true, providerJobId: ext, status: "queued" };
    },
  };

  // ---- the server ---------------------------------------------------------------------------------------------
  const server: ProgressDeps = {
    now: () => new Date(clock),
    providerStatus: async (job) => {
      calls.status++;
      return provider.get(job.external_job_id!) ?? { status: "running" };
    },
    saveClip: async (job) => {
      calls.save++;
      if (saveFails > 0) {
        saveFails--;
        throw new Error("direct download from higgsfield CDN returned 503");
      }
      const prior = [...assets.values()].find((a) => a.metadata_json.provider_job_id === job.id);
      const a = prior ?? { id: id("asset"), project_id: job.project_id, shot_id: (job.request_payload_json?.shotId as string) ?? null, footage_role: null, metadata_json: { bucket: "project-clips", provider_job_id: job.id }, path: `u/p/${job.id}/clip.mp4` };
      assets.set(a.id, a);
      jobs.get(job.id)!.result_asset_id = a.id;
      return a.id;
    },
    updateJob: async (jobId, patch) => {
      Object.assign(jobs.get(jobId)!, patch);
    },
    shotExists: async (_p, shotId) => shots.has(shotId),
    assignmentsOf: async (shotId) => assignments.filter((a) => a.shot_id === shotId),
    applyAssignments: async (job, ops) => {
      for (const o of ops) {
        if (o.op === "update") assignments.find((a) => a.id === o.id)!.is_primary = o.is_primary;
        else assignments.push({ id: id("asg"), project_id: job.project_id, shot_id: o.shot_id, asset_id: o.asset_id, role: o.role, is_primary: o.is_primary, sort_order: o.sort_order });
      }
    },
    assetMeta: async (assetId) => assets.get(assetId)?.metadata_json ?? null,
    updateAsset: async (assetId, patch) => {
      const a = assets.get(assetId)!;
      if (patch.footage_role) a.footage_role = patch.footage_role;
      if (patch.metadata_json) a.metadata_json = patch.metadata_json;
    },
    syncOf: async (projectId, assetId) => syncs.find((s) => s.project_id === projectId && s.performance_asset_id === assetId) ?? null,
    insertSync: async (row) => {
      syncs.push(row);
    },
    addEntityPictures: async (_job, entityId, assetIds) => {
      entities.set(entityId, [...new Set([...(entities.get(entityId) ?? []), ...assetIds])]);
    },
  };

  /** One run of the scheduler: every unfinished job is handed to the server's code, as claim_provider_jobs does. */
  const tick = () => advanceJobs([...jobs.values()].filter((j) => !j.finalized_at), server);
  return {
    client,
    server,
    jobs,
    assets,
    assignments,
    syncs,
    shots,
    entities,
    provider,
    calls,
    tick,
    advance: (ms: number) => (clock += ms),
    failSaves: (n: number) => (saveFails = n),
    only: () => [...jobs.values()][jobs.size - 1],
  };
}

const ctx = (shotIds: Record<string, string> = { c018: "shot_18" }) => ({ projectId: "p1", runId: "storyboard", lookPresetId: "film_bar_v1", look: null, shotIds });
const clipShot = BatchShotSchema.parse({ id: "c018", route: "still_kling", aspect: "9:16", seconds: 5, prompt: "a black sedan on a wet street", motion: "the camera pushes in", still_path: "u/p/worlds/c018.png" });
const restageShot = BatchShotSchema.parse({ id: "c015", kind: "angle", route: "seedance_ref", aspect: "9:16", seconds: 4, source_path: "u/p/seedance/c015_src.mp4", source_seconds: 4, source_window: [46.2, 50.2], source_asset_id: "take_1", masterStart: 47.054, angle: "a medium shot, the camera pushing slowly toward him.", keep: ["his face"], still_path: "u/p/worlds/runway.png" });

describe("a clip job finishes with the page closed", () => {
  it("submit → the client is gone → the provider finishes → the clip is saved and on its shot", async () => {
    const w = world();
    // the director presses Generate clip; the submit returns; the storyboard is closed
    const submitted = await submitShot(clipShot, ctx(), w.client);
    const job = w.jobs.get(submitted.rowId)!;
    expect(job).toMatchObject({ status: "queued", external_job_id: submitted.providerJobId, finalized_at: null });
    expect(isUnfinished(job as never)).toBe(true);

    // minute 1: still rendering — the server asks, and waits
    w.advance(60_000);
    expect((await w.tick())[0]).toMatchObject({ state: "waiting", did: ["provider: running"] });
    expect(w.assignments).toHaveLength(0);

    // minute 4: the provider has it
    w.advance(180_000);
    w.provider.set(job.external_job_id!, { status: "completed", resultUrl: "https://cdn.example/clip.mp4" });
    const [report] = await w.tick();
    expect(report).toMatchObject({ state: "finished", did: ["provider: succeeded", "saved", "on its shot", "finished"] });

    // the director comes back: the result is there, read from the rows alone
    expect(job.status).toBe("succeeded");
    expect(job.result_asset_id).toBeTruthy();
    expect(job.finalized_at).toBeTruthy();
    expect((job.request_payload_json!.settings as Record<string, unknown>).attachedBy).toBe("server");
    expect(w.assignments).toEqual([expect.objectContaining({ shot_id: "shot_18", asset_id: job.result_asset_id, role: "generated_clip", is_primary: true })]);
    expect(boxJobStatus(job as unknown as BatchJobRow, T0)).toMatchObject({ kind: "clip", state: "done", message: "clip ready" });
    expect(isUnfinished(job as never)).toBe(false);
    // and the provenance the submit wrote is untouched
    expect(job.request_payload_json).toMatchObject({ shotId: "shot_18", referenceImagePath: "u/p/worlds/c018.png", settings: { batchRun: "storyboard", batchShotId: "c018", route: "still_kling", stillPath: "u/p/worlds/c018.png" } });
  });

  it("is safe to run again: nothing is saved or assigned twice", async () => {
    const w = world();
    const s = await submitShot(clipShot, ctx(), w.client);
    w.provider.set(s.providerJobId, { resultUrl: "https://cdn.example/clip.mp4" });
    await w.tick();
    await w.tick();
    await advanceJob(w.only(), w.server); // even handed a finished job directly
    expect(w.calls.save).toBe(1);
    expect(w.assignments).toHaveLength(1);
    expect([...w.assets.values()].filter((a) => a.metadata_json.provider_job_id)).toHaveLength(1);
  });

  it("a job interrupted between saving and attaching is picked up where it stopped", async () => {
    const w = world();
    const s = await submitShot(clipShot, ctx(), w.client);
    w.provider.set(s.providerJobId, { resultUrl: "https://cdn.example/clip.mp4" });
    // the worker dies after the clip is saved: the shot's footage cannot be written this once
    const real = w.server.applyAssignments;
    w.server.applyAssignments = async () => {
      throw new Error("could not put the clip on its shot: connection reset");
    };
    expect((await w.tick())[0]).toMatchObject({ state: "retry", note: expect.stringContaining("connection reset") });
    expect(w.only()).toMatchObject({ status: "succeeded", finalized_at: null, progress_failures: 1 });
    w.server.applyAssignments = real;
    expect((await w.tick())[0].state).toBe("finished");
    expect(w.calls.save).toBe(1); // not downloaded a second time
    expect(w.assignments).toHaveLength(1);
  });

  it("replaces what the shot showed, and keeps the earlier media on the shot", async () => {
    const w = world();
    w.assignments.push({ id: "old", project_id: "p1", shot_id: "shot_18", asset_id: "earlier_clip", role: "generated_clip", is_primary: true, sort_order: 1 });
    const s = await submitShot(clipShot, ctx(), w.client);
    w.provider.set(s.providerJobId, { resultUrl: "https://cdn.example/clip.mp4" });
    await w.tick();
    expect(w.assignments.map((a) => [a.asset_id === "earlier_clip" ? "earlier" : "new", a.is_primary, a.sort_order])).toEqual([
      ["earlier", false, 1],
      ["new", true, 2],
    ]);
  });

  it("a restaged take is filed as a take in sync on the song, then put on its shot as performance", async () => {
    const w = world();
    w.syncs.push({ project_id: "p1", performance_asset_id: "take_1", song_asset_id: "song_1", offset_seconds: 0.85, drift_ppm: 12, method: "manual", status: "confirmed" });
    const s = await submitShot(restageShot, ctx({ c015: "shot_15" }), w.client);
    w.provider.set(s.providerJobId, { resultUrl: "https://cdn.example/restaged.mp4" });
    const [report] = await w.tick();
    expect(report.did).toEqual(["provider: succeeded", "saved", "filed as a take in sync", "on its shot", "finished"]);
    const job = w.only();
    const asset = w.assets.get(job.result_asset_id!)!;
    expect(asset.footage_role).toBe("performance");
    expect(asset.metadata_json.derived_from).toEqual({ asset_id: "take_1", source_window: [46.2, 50.2], song_start: 47.054 });
    expect(asset.metadata_json.duration_seconds).toBe(4);
    // its first frame sits where the cut began on the song; the drift is the source take's
    expect(w.syncs[1]).toMatchObject({ performance_asset_id: job.result_asset_id, song_asset_id: "song_1", offset_seconds: 47.054, drift_ppm: 12, method: "derived", status: "confirmed" });
    expect(w.assignments[0]).toMatchObject({ shot_id: "shot_15", role: "performance", is_primary: true });
    await w.tick();
    expect(w.syncs).toHaveLength(2);
  });

  it("a failed render is recorded as failed, with the provider's reason, and finished", async () => {
    const w = world();
    const s = await submitShot(clipShot, ctx(), w.client);
    w.provider.set(s.providerJobId, { status: "failed", errorMessage: "content policy" });
    await w.tick();
    expect(w.only()).toMatchObject({ status: "failed", error_text: "content policy" });
    expect(w.only().finalized_at).toBeTruthy();
    expect(w.assignments).toHaveLength(0);
    expect(boxJobStatus(w.only() as unknown as BatchJobRow, T0)).toMatchObject({ state: "failed", message: "content policy" });
  });

  it("gives up honestly: a save that keeps failing, a render that never ends, a submit that never reported", async () => {
    const w = world();
    const s = await submitShot(clipShot, ctx(), w.client);
    w.provider.set(s.providerJobId, { resultUrl: "https://cdn.example/clip.mp4" });
    w.failSaves(99);
    for (let i = 0; i < MAX_FAILURES; i++) await w.tick();
    const job = w.only();
    // the render is paid for and stays on record as rendered; what failed is said
    expect(job).toMatchObject({ status: "succeeded", result_asset_id: null, progress_failures: MAX_FAILURES });
    expect(job.finalized_at).toBeTruthy();
    expect(job.error_text).toMatch(/not finished after 6 tries: direct download from higgsfield CDN returned 503/);
    expect(boxJobStatus(job as unknown as BatchJobRow, T0).state).toBe("failed");
    expect((job.response_payload_json as { resultUrl?: string }).resultUrl).toBe("https://cdn.example/clip.mp4");

    const w2 = world();
    await submitShot(clipShot, ctx(), w2.client);
    w2.advance(RENDER_GIVE_UP_AFTER_MS + 60_000);
    await w2.tick();
    expect(w2.only()).toMatchObject({ status: "failed", error_text: "the provider had not finished after 6 hours" });

    const w3 = world();
    // the write-ahead row exists, and the page died before the provider's answer was written on it
    await w3.client.insertJob({ project_id: "p1", provider: "higgsfield", status: "queued", request_payload_json: { mode: "image_to_video", shotId: "shot_18", settings: { batchRun: "storyboard", batchShotId: "c018" } } });
    expect((await w3.tick())[0].state).toBe("waiting");
    w3.advance(UNREPORTED_AFTER_MS + 1000);
    await w3.tick();
    expect(w3.only()).toMatchObject({ status: "failed", error_text: expect.stringContaining("never reported a provider job") });
  });

  it("a clip whose shot is gone is saved to the library and says so", async () => {
    const w = world();
    const s = await submitShot(clipShot, ctx(), w.client);
    w.shots.delete("shot_18"); // the shot was merged away while the clip rendered
    w.provider.set(s.providerJobId, { resultUrl: "https://cdn.example/clip.mp4" });
    const [report] = await w.tick();
    expect(report.note).toMatch(/no longer exists — the clip is in the project's library/);
    expect(w.only().result_asset_id).toBeTruthy();
    expect(w.assignments).toHaveLength(0);
    expect(boxJobStatus(w.only() as unknown as BatchJobRow, T0)).toMatchObject({ state: "done", message: expect.stringContaining("library") });
  });

  it("a Runs batch with no shot ends at saved", async () => {
    const w = world();
    const s = await submitShot(clipShot, ctx({}), w.client);
    w.provider.set(s.providerJobId, { resultUrl: "https://cdn.example/clip.mp4" });
    expect((await w.tick())[0].did).toEqual(["provider: succeeded", "saved", "finished"]);
  });

  it("one job that cannot move does not stop the others", async () => {
    const w = world();
    const a = await submitShot(clipShot, ctx(), w.client);
    const b = await submitShot(BatchShotSchema.parse({ ...clipShot, id: "c015" }), ctx({ c015: "shot_15" }), w.client);
    w.provider.set(a.providerJobId, { resultUrl: "https://cdn.example/a.mp4" });
    w.provider.set(b.providerJobId, { resultUrl: "https://cdn.example/b.mp4" });
    w.failSaves(1); // the first job's save fails this tick
    const reports = await w.tick();
    expect(reports.map((r) => r.state)).toEqual(["retry", "finished"]);
  });
});

describe("an image job finishes with the page closed", () => {
  const imageShot = BatchShotSchema.parse({ id: "c018", route: "still_kling", aspect: "9:16", prompt: "a black runway", stills: 2 });

  it("the pictures are on the job's row the moment they exist, whatever happens to the page", async () => {
    const w = world();
    // the page closes while the image request is in flight: the server call still files the pictures and writes them
    // on the row; nothing of the client's own finishing ever runs
    const dying: RunnerDeps = { ...w.client, updateJob: async () => new Promise<void>(() => undefined) };
    void submitStills(imageShot, { ...ctx(), selectStill: true }, dying);
    await new Promise((r) => setTimeout(r, 0));
    const job = w.only();
    expect(job.status).toBe("queued");
    expect((job.response_payload_json as { stills: unknown[] }).stills).toHaveLength(2);

    // inside the grace period the server leaves the job to the page that asked
    w.advance(30_000);
    expect((await w.tick())[0]).toMatchObject({ state: "waiting" });
    // after it, the server finishes: pictures on the shot, NOT selected, and the job says they are unchecked
    w.advance(STILL_GRACE_MS);
    const [report] = await w.tick();
    expect(report).toMatchObject({ state: "finished", did: ["pictures on the shot, unselected", "finished"] });
    expect(job).toMatchObject({ status: "succeeded" });
    expect((job.request_payload_json!.settings as Record<string, unknown>)).toMatchObject({ panelCheck: "pending", selectStill: true, stillPath: null, stillCostUsd: 0.14 });
    expect(w.assignments.map((a) => [a.shot_id, a.role, a.is_primary])).toEqual([
      ["shot_18", "generated_image", false],
      ["shot_18", "generated_image", false],
    ]);
    expect(boxJobStatus(job as unknown as BatchJobRow, T0)).toMatchObject({ kind: "image", state: "saving", message: expect.stringContaining("checking it now") });
  });

  it("an image the page itself finished is simply marked finished", async () => {
    const w = world();
    const r = await submitStills(imageShot, ctx(), w.client);
    expect(w.jobs.get(r.rowId)).toMatchObject({ status: "succeeded" });
    w.advance(STILL_GRACE_MS * 2);
    expect((await w.tick())[0].did).toEqual(["finished"]);
    expect(w.assignments).toHaveLength(0); // the page put them on the shot; the server adds nothing
  });

  it("an image request that never produced a picture is failed, not left drawing for ever", async () => {
    const w = world();
    await w.client.insertJob({ project_id: "p1", provider: "grok", status: "queued", request_payload_json: { mode: "still_only", shotId: "shot_18", settings: { batchRun: "storyboard", batchShotId: "c018" } } });
    w.advance(UNREPORTED_AFTER_MS + 1000);
    await w.tick();
    expect(w.only()).toMatchObject({ status: "failed", error_text: "the image request did not finish — no picture was recorded" });
  });

  it("pictures drawn for a continuity entity are kept with it", async () => {
    const w = world();
    const dying: RunnerDeps = { ...w.client, updateJob: async () => new Promise<void>(() => undefined) };
    void submitStills(BatchShotSchema.parse({ id: "ent_BLACK_RUNWAY", route: "still_kling", prompt: "an empty runway", stills: 2 }), { projectId: "p1", runId: "continuity", lookPresetId: "film_bar_v1", look: null, shotIds: {}, selectStill: false, entityId: "entity_1" }, dying);
    await new Promise((r) => setTimeout(r, 0));
    w.advance(STILL_GRACE_MS + 1000);
    const [report] = await w.tick();
    expect(report.did).toEqual(["pictures kept with their entity", "finished"]);
    expect(w.entities.get("entity_1")).toHaveLength(2);
  });
});

describe("the server's assignment is the app's assignment", () => {
  const existing: AssignmentRow[] = [
    { id: "a1", shot_id: "s1", asset_id: "x", role: "generated_clip", is_primary: true, sort_order: 1 },
    { id: "a2", shot_id: "s1", asset_id: "y", role: "generated_image", is_primary: false, sort_order: 2 },
    { id: "a3", shot_id: "s2", asset_id: "z", role: "generated_clip", is_primary: true, sort_order: 1 },
  ];
  const asApp = (rows: AssignmentRow[]): Assignment[] => rows.map((a) => ({ id: a.id, projectId: "p1", shotId: a.shot_id, assetId: a.asset_id, role: a.role as Assignment["role"], sourceIn: null, sourceOut: null, isPrimary: a.is_primary, sortOrder: a.sort_order, notes: null, createdAt: "", updatedAt: "" }));
  const normal = (ops: ReturnType<typeof planAssign>) =>
    ops.map((o) => (o.op === "update" ? { op: "update", id: o.id, is_primary: o.patch.is_primary } : o.op === "insert" ? { op: "insert", shot_id: o.shotId, asset_id: o.assetId, role: o.role, is_primary: o.isPrimary, sort_order: o.sortOrder } : o));

  it.each([
    ["a new clip, selected", { shotId: "s1", assetId: "new", role: "generated_clip", select: true }],
    ["a new image, unselected", { shotId: "s1", assetId: "new", role: "generated_image", select: false }],
    ["the same clip again", { shotId: "s1", assetId: "x", role: "generated_clip", select: true }],
    ["an unselected one, now selected", { shotId: "s1", assetId: "y", role: "generated_image", select: true }],
    ["a restaged take as performance", { shotId: "s2", assetId: "new", role: "performance", select: true }],
    ["on an empty shot", { shotId: "s9", assetId: "new", role: "generated_clip", select: true }],
  ] as const)("%s", (_name, input) => {
    expect(assignPlan({ assignments: existing, ...input })).toEqual(normal(planAssign({ assignments: asApp(existing), ...input, role: input.role as Assignment["role"] })));
  });

  it("reads a provider's answer the way the runner does", () => {
    for (const env of [{ resultUrl: "https://x/y.mp4" }, { status: "FAILED" }, { status: "nsfw" }, { status: "processing" }, {}, { resultUrl: "not a url", status: "completed" }]) {
      expect(serverStatusFromEnvelope(env)).toBe(statusFromEnvelope(env));
    }
  });
});

describe("the browser does not own progress", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

  it("the storyboard's job hook and the Runs page poll no provider, save no clip and assign no finished clip", () => {
    for (const file of ["src/lib/queries/boxJobs.ts", "src/pages/BatchRunsPage.tsx"]) {
      const src = read(file);
      expect(src, file).not.toMatch(/pollBatchJob|triggerServerIngest|fileRestagedClip|video-providers-job-status/);
      expect(src, file).toContain("useJobProgress");
    }
    // the page asks the server for a tick and reads the rows; that is all the progress module does
    const progress = read("src/lib/providerJobs/progress.ts");
    expect(progress).toContain('supabase.functions.invoke<TickReply>("provider-jobs-tick"');
    expect(progress).not.toMatch(/\.from\(|proxy-provider-call/);
  });

  it("the scheduler runs in the database, calls the function only when there is work, and re-runs no history", () => {
    const sql = read("supabase/migrations/20261003200000_provider_job_progress.sql");
    expect(sql).toContain("cron.schedule('provider-jobs-tick', '* * * * *', 'select public.kick_provider_jobs();')");
    expect(sql).toMatch(/perform net\.http_post\(/);
    expect(sql).toMatch(/if not exists \(\s*select 1\s*from public\.provider_jobs\s*where finalized_at is null/);
    // one worker at a time has a job
    expect(sql).toMatch(/for update skip locked/);
    expect(sql).toContain("grant execute on function public.claim_provider_jobs(uuid, int) to service_role;");
    // every job that was already over is finished as it stands
    expect(sql).toMatch(/set finalized_at = coalesce\(updated_at, created_at, now\(\)\)\s*where finalized_at is null\s*and \(status not in \('queued', 'running'\) or created_at < now\(\) - interval '1 day'\)/);
    // the scheduler's key is made in the database and readable by the service role only
    expect(sql).toContain("alter table public.job_runner_config enable row level security;");
    expect(sql).not.toMatch(/create policy[^;]*job_runner_config/);
  });

  it("the function refuses a caller that is neither the scheduler nor a signed-in user, and moves only that user's jobs", () => {
    const fn = read("supabase/functions/provider-jobs-tick/index.ts");
    expect(fn).toContain('return json(401, { ok: false, error: "bad_cron_key" })');
    expect(fn).toContain('return json(401, { ok: false, error: "missing_credentials" })');
    expect(fn).toContain('rpc("claim_provider_jobs", { p_user: userId, p_limit: CLAIM_LIMIT })');
    expect(read("supabase/config.toml")).toMatch(/\[functions\.provider-jobs-tick\]\nverify_jwt = false/);
  });

  it("what counts as unfinished is read from the row alone", () => {
    const row = (over: Record<string, unknown>) => ({ id: "j", status: "succeeded", external_job_id: "e", result_asset_id: "a", request_payload_json: { shotId: "s", settings: { attachedAt: "t" } }, ...over });
    expect(isUnfinished(row({}) as never)).toBe(false);
    expect(isUnfinished(row({ status: "running" }) as never)).toBe(true);
    expect(isUnfinished(row({ result_asset_id: null }) as never)).toBe(true);
    expect(isUnfinished(row({ request_payload_json: { shotId: "s", settings: {} } }) as never)).toBe(true);
    // the server said it is done with it — whatever state that is
    expect(isUnfinished(row({ status: "running", finalized_at: "2026-10-03T12:00:00Z" }) as never)).toBe(false);
    expect(isUnfinished(row({ status: "failed" }) as never)).toBe(false);
  });
});

describe("an image the server finished is checked when the storyboard is opened", () => {
  const candidates = [
    { path: "a.png", assetId: "asset_a" },
    { path: "b.png", assetId: "asset_b" },
  ];
  const stacked = { frac: 0.92, straight: 0.75, at: 0.5, axis: "row" as const };
  const fine = { frac: 0.2, straight: 0.05, at: 0.4, axis: "row" as const };

  it("selects the first picture that is one picture, when the shot was to show it", () => {
    expect(planStillCheck({ candidates, seams: [stacked, fine], select: true })).toMatchObject({ picked: "b.png", selectAssetId: "asset_b", removeAssetIds: ["asset_a"], error: null });
    // on a performance shot the image is the place: it is never what the shot shows
    expect(planStillCheck({ candidates, seams: [fine, fine], select: false })).toMatchObject({ picked: "a.png", selectAssetId: null, removeAssetIds: [] });
  });

  it("takes every stacked picture off the shot and fails the job when none is whole", () => {
    const plan = planStillCheck({ candidates, seams: [stacked, stacked], select: true });
    expect(plan).toMatchObject({ picked: null, selectAssetId: null, removeAssetIds: ["asset_a", "asset_b"] });
    expect(plan.error).toMatch(/every still came back as stacked panels/);
  });

  it("a picture that could not be measured is kept, exactly as the live check keeps it", () => {
    expect(planStillCheck({ candidates, seams: [null, null], select: true })).toMatchObject({ picked: "a.png", selectAssetId: "asset_a", error: null });
  });
});

