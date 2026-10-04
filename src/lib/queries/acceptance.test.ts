import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { askOfJob, asksByAsset } from "./acceptance";

const job = (settings: Record<string, unknown> | null, result_asset_id: string | null = "clip") => ({ request_payload_json: settings ? { promptText: "…", settings } : { promptText: "…" }, result_asset_id });
const BASE = { batchRun: "storyboard", batchShotId: "s39", route: "seedance_ref", kind: "clip", estimateUsd: 3.7, lookPreset: "" };

describe("what a clip was asked for, off the job that made it", () => {
  it("a restaged take with a timed script: its beats, and that it came from a take", () => {
    const ask = askOfJob(job({ ...BASE, sourceAssetId: "take", sourceWindow: [154.75, 158.67], temporal: { mode: "timed_script", beats: 1, measured: false, asked: [{ id: "e1", offset: 1.9, kinds: ["lighting"], says: "light: the mirror ball comes alive" }] } }));
    expect(ask).toEqual({ asked: [{ id: "e1", offset: 1.9, kinds: ["lighting"], says: "light: the mirror ball comes alive" }], fromTake: true });
  });

  it("a clip made from a still as one state: no script, no take", () => {
    expect(askOfJob(job({ ...BASE, route: "kling_i2v" }))).toEqual({ asked: [], fromTake: false });
    // a source with no stretch of it recorded is not a restaging that can be held against a take
    expect(askOfJob(job({ ...BASE, sourceAssetId: "take", sourceWindow: null }))!.fromTake).toBe(false);
  });

  it("a job the storyboard did not start says nothing; a job with no result is not listed", () => {
    expect(askOfJob(job(null))).toBeNull();
    const asks = asksByAsset([job(BASE, "a"), job(BASE, null), job(null, "b")]);
    expect([...asks.keys()]).toEqual(["a"]);
  });
});
