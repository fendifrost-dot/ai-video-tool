/**
 * Which money pays for a job, and when a job may move from the API balance to plan credits.
 * Nothing here calls a provider; nothing is spent.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import {
  BatchShotSchema,
  SUBSCRIPTION_ROUTING,
  billingOf,
  decideAfterApiRefusal,
  describeBilling,
  isConfirmedInsufficientFunds,
  planRun,
  shotState,
  submitShot,
  type BatchJobRow,
  type RunnerDeps,
} from "@/lib/worldBatch";
import { advanceJob, RUNNER_GIVE_UP_AFTER_MS, type ProgressDeps, type ProgressJob } from "../../../supabase/functions/_shared/jobProgress";

const NOW = "2026-10-04T02:00:00.000Z";
const ON = { enabled: true, verifiedRoutes: ["seedance_ref"] };
const ANGLE = BatchShotSchema.parse({
  id: "c035", kind: "angle", route: "seedance_ref", source_path: "u/p/seedance/c035_src.mp4", source_trim: [0, 4],
  source_window: [66.885, 68.853], masterStart: 63.9987, angle: "a low hero angle", keep: ["navy cap"],
});
const CTX = { projectId: "proj", runId: "r1", lookPresetId: "film_bar_v1", look: null, now: () => new Date(NOW) };

function deps(over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    userId: "user-1",
    sign: vi.fn(async (bucket, path) => `https://signed/${bucket}/${path}`),
    generateStills: vi.fn(async () => ({ ok: true, stills: [{ path: "a.png" }] })),
    insertJob: vi.fn(async () => "row-1"),
    updateJob: vi.fn(async () => undefined),
    callProxy: vi.fn(async () => ({ ok: true, providerJobId: "job-abc", status: "queued" })),
    ...over,
  };
}

describe("the switch is off until verified", () => {
  it("ships disabled with no verified operation", () => {
    expect(SUBSCRIPTION_ROUTING).toEqual({ enabled: false, verifiedRoutes: [] });
  });
});

describe("what counts as a lack of funds", () => {
  it("only the provider's explicit words", () => {
    expect(isConfirmedInsufficientFunds("higgsfield", "403 not_enough_credits")).toBe(true);
    expect(isConfirmedInsufficientFunds("higgsfield", "Insufficient balance for this request")).toBe(true);
  });
  it("never an arbitrary error, a rate limit, a quota word or another provider", () => {
    for (const e of ["504 gateway timeout", "429 rate limit — quota exceeded", "content refused (nsfw)", "balance check unavailable", "Control Center proxy failed"]) {
      expect(isConfirmedInsufficientFunds("higgsfield", e)).toBe(false);
    }
    expect(isConfirmedInsufficientFunds("runway", "You do not have enough credits")).toBe(false);
  });
});

describe("after the API refuses", () => {
  const base = { provider: "higgsfield", route: "seedance_ref", errorText: "403 not_enough_credits", accepted: false, now: NOW };
  it("stays failed while routing is off (the default)", () => {
    expect(decideAfterApiRefusal(base)).toMatchObject({ action: "stay_failed" });
  });
  it("moves a confirmed refusal of a verified operation, and records why", () => {
    expect(decideAfterApiRefusal({ ...base, routing: ON })).toEqual({
      action: "move_to_subscription",
      billing: { route: "subscription", source: "higgsfield_plan_credits", estimateUsd: null, switchedFrom: "api", switchReason: "403 not_enough_credits", switchedAt: NOW },
    });
  });
  it("substitutes nothing: an unverified operation is refused, not sent as something else", () => {
    const d = decideAfterApiRefusal({ ...base, route: "still_kling", routing: ON });
    expect(d).toMatchObject({ action: "stay_failed" });
    expect((d as { why: string }).why).toContain("nothing was substituted");
  });
  it("never moves a job the API accepted, and never on another kind of error", () => {
    expect(decideAfterApiRefusal({ ...base, routing: ON, accepted: true })).toMatchObject({ action: "stay_failed" });
    expect(decideAfterApiRefusal({ ...base, routing: ON, errorText: "502 bad gateway" })).toMatchObject({ action: "stay_failed" });
  });
});

describe("the runner records the route on the row", () => {
  it("an API job says so before the money moves", async () => {
    const d = deps();
    await submitShot(ANGLE, CTX, d);
    const row = (d.insertJob as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.request_payload_json.settings.billing).toEqual({ route: "api", source: "higgsfield_api_balance", estimateUsd: 2.22 });
  });
  it("routing off: an empty balance is a failure, exactly as before", async () => {
    const d = deps({ callProxy: vi.fn(async () => { throw new Error("403 not_enough_credits"); }) });
    await expect(submitShot(ANGLE, CTX, d)).rejects.toThrow("c035: 403 not_enough_credits");
    expect((d.updateJob as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(["row-1", { status: "failed", error_text: "403 not_enough_credits" }]);
  });
  it("routing on: the SAME row is parked for the subscription runner — one row, one provider call, no second submit", async () => {
    const d = deps({ callProxy: vi.fn(async () => { throw new Error("403 not_enough_credits"); }) });
    const out = await submitShot(ANGLE, { ...CTX, subscriptionRouting: ON }, d);
    expect(out).toMatchObject({ rowId: "row-1", providerJobId: "", awaitingRunner: true });
    expect(d.insertJob).toHaveBeenCalledTimes(1);
    expect(d.callProxy).toHaveBeenCalledTimes(1);
    const [id, patch] = (d.updateJob as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe("row-1");
    expect(patch.status).toBe("queued");
    expect(patch.request_payload_json.settings.billing).toMatchObject({ route: "subscription", source: "higgsfield_plan_credits", switchedFrom: "api" });
    expect(patch.request_payload_json.settings.billing.inputs).toEqual({ sourceUrl: "https://signed/project-clips/u/p/seedance/c035_src.mp4", stillUrl: null, expiresAt: "2026-10-05T01:00:00.000Z" });
    // the request itself is unchanged: same model, same duration, same references
    expect(patch.request_payload_json).toMatchObject({ modelVariant: "seedance-2.5-reference", mode: "reference_to_video" });
  });
  it("routing on: any other error still fails and is not moved", async () => {
    const d = deps({ callProxy: vi.fn(async () => { throw new Error("504 upstream timeout"); }) });
    await expect(submitShot(ANGLE, { ...CTX, subscriptionRouting: ON }, d)).rejects.toThrow("504");
    expect((d.updateJob as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ status: "failed" });
  });
});

describe("a parked job is never submitted twice", () => {
  const parked: BatchJobRow = {
    id: "row-1", provider: "higgsfield", status: "queued", external_job_id: null, error_text: null, result_asset_id: null, created_at: NOW,
    request_payload_json: { settings: { batchRun: "r1", batchShotId: "c035", route: "seedance_ref", kind: "angle", estimateUsd: 3.698, lookPreset: "x", billing: { route: "subscription", source: "higgsfield_plan_credits" } } },
    response_payload_json: {},
  };
  it("the run sees it as running and skips it", () => {
    expect(shotState(ANGLE, [parked]).state).toBe("running");
    const plan = planRun([ANGLE], [parked]);
    expect(plan.submit).toHaveLength(0);
    expect(plan.skip[0].why).toBe("already running in this run");
  });
  it("its billing reads back in words", () => {
    expect(describeBilling(billingOf(parked))).toBe("plan credits — credits not yet known");
    expect(describeBilling({ route: "subscription", source: "higgsfield_plan_credits", actualCredits: 24, switchedFrom: "api" })).toBe("plan credits — 24 credits (moved from the API: balance empty)");
    expect(describeBilling({ route: "api", source: "higgsfield_api_balance", estimateUsd: 2.22 })).toBe("API balance — about $2.22");
    expect(describeBilling(null)).toContain("API balance");
  });
});

describe("the server leaves a plan-credit job to its runner", () => {
  const T0 = Date.parse(NOW);
  function server(job: ProgressJob, at = T0) {
    const calls = { status: 0, save: 0, patches: [] as Record<string, unknown>[] };
    const d = {
      now: () => new Date(at),
      providerStatus: async () => { calls.status++; return {}; },
      saveClip: async () => { calls.save++; return "asset_x"; },
      updateJob: async (_id: string, patch: Record<string, unknown>) => { calls.patches.push(patch); },
      shotExists: async () => true,
      assignmentsOf: async () => [],
      applyAssignments: async () => undefined,
      assetMeta: async () => ({}),
      updateAsset: async () => undefined,
      syncOf: async () => null,
      insertSync: async () => undefined,
    } as unknown as ProgressDeps;
    return { d, calls };
  }
  const job = (over: Partial<ProgressJob> = {}, billing: Record<string, unknown> = {}): ProgressJob => ({
    id: "j1", user_id: "u", project_id: "p", provider: "higgsfield", status: "queued", external_job_id: null, error_text: null, result_asset_id: null,
    request_payload_json: { settings: { batchRun: "r1", batchShotId: "c035", route: "seedance_ref", billing: { route: "subscription", source: "higgsfield_plan_credits", ...billing } } },
    response_payload_json: {}, created_at: NOW, finalized_at: null, progress_failures: 0, progress_note: null, ...over,
  });

  it("does not ask Control Center, does not fail it after ten minutes, and says what it is waiting for", async () => {
    const { d, calls } = server(job(), T0 + 30 * 60_000);
    const r = await advanceJob(job(), d);
    expect(r.state).toBe("waiting");
    expect(r.note).toContain("waiting for the subscription runner");
    expect(calls.status).toBe(0);
    expect(calls.patches.some((p) => p.status === "failed")).toBe(false);
  });
  it("a submit the runner began and never recorded is flagged, never failed (a failed row would be retried and charged twice)", async () => {
    const j = job({}, { runner: { submitStartedAt: NOW } });
    const { d, calls } = server(j, T0 + RUNNER_GIVE_UP_AFTER_MS + 1);
    const r = await advanceJob(j, d);
    expect(r.state).toBe("finished");
    expect(r.note).toContain("it is not resubmitted");
    expect(calls.patches.some((p) => "status" in p)).toBe(false);
  });
  it("rendered with its link recorded: the server fetches and stores it itself, then puts it on its shot", async () => {
    const j = job({ status: "succeeded", external_job_id: "hf_plan_1", response_payload_json: { resultUrl: "https://cdn.example/clip.mp4" }, request_payload_json: { shotId: "shot_1", settings: { batchRun: "storyboard", batchShotId: "c035", route: "still_kling", billing: { route: "subscription", source: "higgsfield_plan_credits" } } } });
    const { d, calls } = server(j);
    const r = await advanceJob(j, d);
    expect(calls.save).toBe(1);
    expect(r.did).toEqual(expect.arrayContaining(["saved from the recorded link", "on its shot"]));
  });
  it("a link that is not https is not fetched", async () => {
    const j = job({ status: "succeeded", external_job_id: "hf_plan_1", response_payload_json: { resultUrl: "http://10.0.0.1/x" } });
    const { d, calls } = server(j);
    expect((await advanceJob(j, d)).state).toBe("waiting");
    expect(calls.save).toBe(0);
  });
  it("rendered but not yet saved: waits for the runner instead of fetching through Control Center", async () => {
    const j = job({ status: "succeeded", external_job_id: "hf_plan_1" });
    const { d, calls } = server(j);
    const r = await advanceJob(j, d);
    expect(r.state).toBe("waiting");
    expect(calls.save).toBe(0);
  });
  it("saved by the runner: the server puts it on its shot like any other clip", async () => {
    const j = job({ status: "succeeded", external_job_id: "hf_plan_1", result_asset_id: "asset_9", request_payload_json: { shotId: "shot_1", settings: { batchRun: "storyboard", batchShotId: "c035", route: "still_kling", billing: { route: "subscription", source: "higgsfield_plan_credits" } } } });
    const { d } = server(j);
    const r = await advanceJob(j, d);
    expect(r.did).toContain("on its shot");
    expect(r.state).toBe("finished");
  });
});
