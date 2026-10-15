import { beforeEach, describe, expect, it, vi } from "vitest";

const cutCalls: [number, number][] = [];
let cutSeconds = 3.95;
const uploads: string[] = [];

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/media/frames", () => ({
  openVideo: async () => ({
    read: async () => ({}),
    probe: { video: { codec: "avc1", width: 1080, height: 1920 } },
  }),
}));
vi.mock("@/lib/media/mp4Cut", () => ({
  canCutExact: async () => true,
  cutVideoExact: async (_r: unknown, _t: unknown, start: number, seconds: number) => {
    cutCalls.push([start, seconds]);
    return {
      bytes: new Uint8Array([1, 2, 3]),
      start,
      seconds: cutSeconds,
      frames: 237,
      method: "exact",
      width: 1080,
      height: 1920,
    };
  },
}));
vi.mock("@/lib/media/mp4Trim", () => ({
  trimVideo: async () => ({ bytes: new Uint8Array(), plan: { start: 0, seconds: 9 } }),
}));
vi.mock("@/lib/storage", () => ({
  buildStoragePath: (...s: string[]) => s.join("/"),
  signedUrl: async (bucket: string, path: string) => `https://signed/${bucket}/${path}`,
  uploadBytesToBucket: async (_b: string, path: string) => void uploads.push(path),
}));
vi.mock("@/lib/providerJobs/progress", () => ({ nudgeJobProgress: async () => null }));
vi.mock("@/lib/worldBatch/browserDeps", () => ({
  browserRunnerDeps: async () => {
    throw new Error("not in tests");
  },
}));

import type { RunnerDeps } from "@/lib/worldBatch";
import { planDress, type DressPiece } from "./dress";
import { dressBox, dressPieceOf, type DressInput } from "./dressSubmit";
import type { MediaAsset, TakeSync } from "./media";

const jacket: DressPiece = dressPieceOf({
  id: "j",
  label: "Saint Laurent Track Jacket",
  feature_type: "wardrobe_outerwear",
  storage_path: "a/jacket.jpg",
  reference_images: [{ storage_path: "a/jacket.jpg", angle: "front" }],
  dimensions_description: "mastic cotton, one navy chest stripe",
});
const take = {
  id: "take_1",
  bucket: "project-clips",
  path: "u/p/take.mov",
  durationSeconds: 200,
} as MediaAsset;
const sync = {
  id: "sync_1",
  performanceAssetId: "take_1",
  offsetSeconds: 0.853,
  driftPpm: 0,
  status: "confirmed",
} as TakeSync;

function input(over: Partial<DressInput> = {}): DressInput {
  const p = planDress({ shotIn: 72, shotOut: 73.75, takeSeconds: 200, pieces: [jacket] });
  if (!p.ok) throw new Error(p.why);
  return {
    projectId: "p1",
    variationId: "v1",
    shot: { id: "shot_19", key: "c019" },
    take,
    sync,
    plan: p.plan,
    outfit: { id: "o1", key: "mastic", name: "Mastic", version: 2 },
    sceneId: "sc1",
    maxBilledSeconds: p.plan.cost.billedSeconds,
    ...over,
  };
}

function fakeDeps(
  answer: Record<string, unknown> = {
    ok: true,
    jobId: "cc_job",
    providerJobId: "hf_req",
    status: "queued",
  },
) {
  const rows: Record<string, Record<string, unknown>> = {};
  const proxied: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: RunnerDeps = {
    userId: "u",
    sign: async (bucket, path) => `https://signed/${bucket}/${path}`,
    generateStills: async () => ({ ok: false }),
    insertJob: async (row) => {
      rows.job_1 = { ...row };
      return "job_1";
    },
    updateJob: async (id, patch) => void Object.assign(rows[id], patch),
    callProxy: async (endpoint, body) => {
      proxied.push({ endpoint, body });
      return answer;
    },
  };
  return { deps, rows, proxied };
}

beforeEach(() => {
  cutCalls.length = 0;
  uploads.length = 0;
  cutSeconds = 3.95;
});

describe("dressPieceOf", () => {
  it("reads a wardrobe row: the product photo, every angle, the construction words", () => {
    expect(jacket).toEqual({
      id: "j",
      label: "Saint Laurent Track Jacket",
      featureType: "wardrobe_outerwear",
      storagePath: "a/jacket.jpg",
      images: [{ storagePath: "a/jacket.jpg", angle: "front" }],
      construction: "mastic cotton, one navy chest stripe",
    });
    expect(
      dressPieceOf({
        id: "x",
        label: "Cap",
        feature_type: "wardrobe_accessory",
        storage_path: "c.jpg",
      }).images,
    ).toEqual([{ storagePath: "c.jpg", angle: "front" }]);
  });
});

describe("dressBox — dryRun", () => {
  it("returns the exact request and record, and cuts, uploads, records and sends nothing", async () => {
    const { deps, rows, proxied } = fakeDeps();
    const r = await dressBox(input({ dryRun: true }), deps);
    if (!r.dryRun) throw new Error("expected a dry run");
    expect(cutCalls).toEqual([]);
    expect(uploads).toEqual([]);
    expect(rows).toEqual({});
    expect(proxied).toEqual([]);
    expect(r.request.endpoint).toBe("video-providers-higgsfield-model");
    expect(r.request.body).toMatchObject({
      mode: "video_to_video",
      modelVariant: "genjutsu-object-swap",
      resolution: "720p",
      duration: 4,
      referenceImageUrls: ["<signed wardrobe-refs/a/jacket.jpg>"],
    });
    expect(r.record).toMatchObject({
      sourceAssetId: "take_1",
      syncId: "sync_1",
      billedSeconds: 4,
      estimateUsd: 2.724,
      outfit: { id: "o1", version: 2 },
      promptVersion: "dress-v1",
    });
    expect(r.settings).toMatchObject({
      batchRun: "storyboard",
      batchShotId: "c019",
      route: "genjutsu_swap",
    });
  });
});

describe("dressBox — submit (no real provider)", () => {
  it("cuts the window with handles, uploads it, writes the job BEFORE the call, and records the provider's request id", async () => {
    const { deps, rows, proxied } = fakeDeps();
    const r = await dressBox(input(), deps);
    if (r.dryRun) throw new Error("expected a submit");
    const plan = input().plan;
    expect(cutCalls).toEqual([[plan.window.start, plan.window.seconds]]);
    expect(uploads[0]).toMatch(/^u\/p1\/dress\/storyboard_c019_\d+_src\.mp4$/);
    expect(proxied[0].body).toMatchObject({
      referenceVideoUrl: expect.stringContaining("https://signed/project-clips/u/p1/dress/"),
      referenceImageUrls: ["https://signed/wardrobe-refs/a/jacket.jpg"],
    });
    expect(rows.job_1).toMatchObject({
      provider: "higgsfield",
      status: "queued",
      external_job_id: "hf_req",
      variation_id: "v1",
    });
    const settings = rows.job_1.request_payload_json as {
      shotId: string;
      settings: { dress: { sourceSeconds: number; window: number[] } };
    };
    expect(settings.shotId).toBe("shot_19");
    expect(settings.settings.dress.sourceSeconds).toBe(3.95);
    expect(settings.settings.dress.window[0]).toBe(plan.window.start);
    expect(r).toMatchObject({ providerJobId: "hf_req", estimateUsd: 2.724 });
  });

  it("refuses a cut that would bill more than was agreed, before anything is uploaded or sent", async () => {
    cutSeconds = 4.2;
    const { deps, rows, proxied } = fakeDeps();
    await expect(dressBox(input(), deps)).rejects.toThrow(
      /5 billed seconds, more than the 4 agreed/,
    );
    expect(uploads).toEqual([]);
    expect(rows).toEqual({});
    expect(proxied).toEqual([]);
  });

  it("never records Control Center's own job id as the provider's (it answers 404 to the status question)", async () => {
    const { deps, rows } = fakeDeps({ ok: true, jobId: "cc_job", status: "queued" });
    await expect(dressBox(input(), deps)).rejects.toThrow(/without a request id/);
    expect(rows.job_1).toMatchObject({ status: "failed" });
    expect(rows.job_1.external_job_id).toBeUndefined();
  });
});
