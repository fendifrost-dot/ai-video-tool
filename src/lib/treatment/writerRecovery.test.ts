import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A writer call lost in transit (the gateway's idle timeout, seen live on Interrupted Broadcast · candidate 3: the
 * run succeeded and was paid for, the page got a 504 and wrote nothing) is recovered from the run's own row.
 */
const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  reads: 0,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    functions: { invoke: async () => ({ data: null, error: new Error("lost") }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => {
                  db.reads += 1;
                  return { data: db.rows.shift() ?? null, error: null };
                },
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

import { recoverWriterRun } from "./api";

const body = { avt_variation_id: "v1", write_text: false, concept: "The director's text." };
const fast = { waitMs: 100, everyMs: 10 };
const noSleep = async () => {};

beforeEach(() => {
  db.rows = [];
  db.reads = 0;
});

describe("a lost writer call is recovered from its run", () => {
  it("waits while the run is running, then returns a finished run in the reply's shape with the director's text kept", async () => {
    db.rows = [
      { id: "r1", status: "running" },
      { id: "r1", status: "succeeded", model: "m", clips_json: [{ key: "c001" }], beats_json: [{ id: "b01" }], allocation_json: { byShot: {} }, coverage_json: { ok: true }, missing_json: [], usage_json: { prompt_tokens: 1, completion_tokens: 1 }, actual_cost_usd: "0.0287", estimated_cost_usd: "0.0205" },
    ];
    const got = await recoverWriterRun(body, new Date(), "lost (504)", fast, noSleep);
    expect(db.reads).toBe(2);
    expect(got).toMatchObject({ ok: true, recovered: "lost (504)", runId: "r1", model: "m", actualCostUsd: 0.0287, estimatedCostUsd: 0.0205, coverage: { ok: true } });
    expect((got!.treatment as { concept: string; clips: unknown[] }).concept).toBe("The director's text.");
    expect((got!.treatment as { clips: unknown[] }).clips).toEqual([{ key: "c001" }]);
  });

  it("a run that failed says so with the run's own reason; no row means nothing to recover", async () => {
    db.rows = [{ id: "r1", status: "failed", error_text: "the model refused" }];
    await expect(recoverWriterRun(body, new Date(), "lost", fast, noSleep)).rejects.toThrow(/lost — the run then failed: the model refused/);
    expect(await recoverWriterRun(body, new Date(), "lost", fast, noSleep)).toBeNull();
  });

  it("gives up after the wait, and never recovers what the reply alone would have held", async () => {
    db.rows = Array.from({ length: 50 }, () => ({ id: "r1", status: "running" }));
    expect(await recoverWriterRun(body, new Date(), "lost", { waitMs: 0, everyMs: 0 }, noSleep)).toBeNull();
    expect(await recoverWriterRun({ ...body, write_text: true }, new Date(), "lost", fast, noSleep)).toBeNull();
    expect(await recoverWriterRun({ ...body, avt_variation_id: null }, new Date(), "lost", fast, noSleep)).toBeNull();
  });
});
