import { beforeEach, describe, expect, it, vi } from "vitest";

const cutCalls: [number, number][] = [];
let cutSeconds = 3.95;
/** Where the exact cut really starts (the frame showing at the moment asked for). */
let cutStartOffset = 0;
/** Whether this "browser" can cut to the frame; when not, the copied trim below is what it gets. */
let exact = true;
let trimPlan = { start: 0, seconds: 9 };
const uploads: string[] = [];

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/media/frames", () => ({
  openVideo: async () => ({
    read: async () => ({}),
    probe: { video: { codec: "avc1", width: 1080, height: 1920 } },
  }),
}));
vi.mock("@/lib/media/mp4Cut", () => ({
  canCutExact: async () => exact,
  cutVideoExact: async (_r: unknown, _t: unknown, start: number, seconds: number) => {
    cutCalls.push([start, seconds]);
    return {
      bytes: new Uint8Array([1, 2, 3]),
      start: start + cutStartOffset,
      seconds: cutSeconds,
      frames: 237,
      method: "exact",
      width: 1080,
      height: 1920,
    };
  },
}));
vi.mock("@/lib/media/mp4Trim", () => ({
  trimVideo: async (_r: unknown, _t: unknown, start: number, seconds: number) => {
    cutCalls.push([start, seconds]);
    return { bytes: new Uint8Array([9]), plan: trimPlan };
  },
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
import {
  dressBox,
  dressPieceOf,
  importFinishedDress,
  referenceUrl,
  type DressInput,
  type DressLookups,
  type ImportDeps,
} from "./dressSubmit";
import type { LiveJobRow } from "./dress";

/** The jobs table as the submit asks it: nothing running unless a test says so. */
let liveRows: LiveJobRow[] = [];
const lookups: DressLookups = { liveDressRows: async () => liveRows };
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
  cutStartOffset = 0;
  exact = true;
  trimPlan = { start: 0, seconds: 9 };
  liveRows = [];
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
    const r = await dressBox(input({ dryRun: true }), deps, lookups);
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
    const r = await dressBox(input(), deps, lookups);
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
    await expect(dressBox(input(), deps, lookups)).rejects.toThrow(
      /5 billed seconds, more than the 4 agreed/,
    );
    expect(uploads).toEqual([]);
    expect(rows).toEqual({});
    expect(proxied).toEqual([]);
  });

  it("never records Control Center's own job id as the provider's (it answers 404 to the status question)", async () => {
    const { deps, rows } = fakeDeps({ ok: true, jobId: "cc_job", status: "queued" });
    await expect(dressBox(input(), deps, lookups)).rejects.toThrow(/without a request id/);
    expect(rows.job_1).toMatchObject({ status: "failed" });
    expect(rows.job_1.external_job_id).toBeUndefined();
  });
});

describe("what the submit keeps and refuses", () => {
  it("keeps the provider's answer without its links", async () => {
    const { deps, rows } = fakeDeps({
      ok: true,
      jobId: "cc_job",
      providerJobId: "hf_req",
      status: "queued",
      providerMetadata: {
        request_id: "hf_req",
        status_url: "https://platform.higgsfield.ai/requests/hf_req/status",
        input: { video_url: "https://signed/project-clips/x.mp4" },
      },
    });
    await dressBox(input(), deps, lookups);
    const stored = JSON.stringify(rows.job_1.response_payload_json);
    expect(stored).not.toMatch(/https?:/);
    expect(stored).not.toContain("video_url");
    expect(rows.job_1.response_payload_json).toMatchObject({
      providerJobId: "hf_req",
      providerMetadata: { request_id: "hf_req" },
    });
    // the request keeps paths, never links
    expect(JSON.stringify(rows.job_1.request_payload_json)).not.toMatch(/https?:/);
  });

  it("refuses a second dress of the same stretch while the first runs, before anything is cut or sent", async () => {
    const plan = input().plan;
    liveRows = [
      {
        id: "j_live",
        status: "running",
        finalized_at: null,
        request_payload_json: {
          shotId: "shot_19",
          settings: {
            route: "genjutsu_swap",
            batchShotId: "c019",
            dress: {
              sourceAssetId: "take_1",
              window: [plan.window.start, plan.window.end],
              songStart: 1,
              sourceSeconds: plan.window.seconds,
              promptVersion: "dress-v1",
            },
          },
        },
      },
    ];
    const { deps, rows, proxied } = fakeDeps();
    await expect(dressBox(input(), deps, lookups)).rejects.toThrow(/already being dressed/);
    expect(cutCalls).toEqual([]);
    expect(uploads).toEqual([]);
    expect(rows).toEqual({});
    expect(proxied).toEqual([]);
  });

  it("a running dress of ANOTHER stretch of the same shot does not block (the shot may have moved)", async () => {
    liveRows = [
      {
        id: "j_live",
        status: "running",
        finalized_at: null,
        request_payload_json: {
          shotId: "shot_19",
          settings: {
            route: "genjutsu_swap",
            batchShotId: "c019",
            dress: {
              sourceAssetId: "take_1",
              window: [10, 14],
              songStart: 1,
              sourceSeconds: 4,
              promptVersion: "dress-v1",
            },
          },
        },
      },
    ];
    const { deps, rows } = fakeDeps();
    await dressBox(input(), deps, lookups);
    expect(rows.job_1).toBeTruthy();
  });

  it("a cut that does not cover the whole shot is refused after the cut, before upload", async () => {
    cutStartOffset = 0.3; // the first frame kept came out later than the window's start — past the shot's own in-point
    const plan = input().plan;
    cutStartOffset = plan.window.shotIn - plan.window.start + 0.1;
    const { deps, rows, proxied } = fakeDeps();
    await expect(dressBox(input(), deps, lookups)).rejects.toThrow(/does not cover the whole shot/);
    expect(uploads).toEqual([]);
    expect(rows).toEqual({});
    expect(proxied).toEqual([]);
  });

  it("without a frame-exact encoder the copied trim is sent when it bills the same, and refused when it bills more", async () => {
    exact = false;
    const plan = input().plan;
    // the sync frame half a second before the window: 4 + 0.5 → 4.5 s → 5 billed seconds: refused
    trimPlan = { start: plan.window.start - 0.5, seconds: plan.window.seconds + 0.5 };
    const { deps, rows, proxied } = fakeDeps();
    await expect(dressBox(input(), deps, lookups)).rejects.toThrow(
      /5 billed seconds, more than the 4 agreed.*Chrome/,
    );
    expect(cutCalls).toEqual([[plan.window.start, plan.window.seconds]]);
    expect(uploads).toEqual([]);
    expect(rows).toEqual({});
    expect(proxied).toEqual([]);
    // a sync frame 30 ms early: the window is exactly the 4 s minimum, so 4.03 s is a fifth billed second — refused too
    // (a copied trim at the minimum can only be sent when the sync frame sits on the window's start)
    cutCalls.length = 0;
    trimPlan = { start: plan.window.start - 0.03, seconds: plan.window.seconds + 0.03 };
    await expect(dressBox(input(), fakeDeps().deps, lookups)).rejects.toThrow(/5 billed seconds, more than the 4 agreed/);
    // the sync frame on the window's start: 4.00 s, 4 billed seconds — sent, and the record says where the cut starts
    cutCalls.length = 0;
    trimPlan = { start: plan.window.start, seconds: plan.window.seconds };
    const again = fakeDeps();
    const r = await dressBox(input(), again.deps, lookups);
    if (r.dryRun) throw new Error("expected a submit");
    expect(r.record.window[0]).toBeCloseTo(plan.window.start, 4);
    expect(r.record.sourceSeconds).toBeCloseTo(plan.window.seconds, 4);
    expect(r.record.billedSeconds).toBe(4);
    expect(uploads).toHaveLength(1);
  });
});

describe("a reference picture's link", () => {
  const sign = async (p: string) => `https://signed/wardrobe-refs/${p}`;
  it("is signed from a storage path, passed through when already https, refused on any other scheme", async () => {
    expect(await referenceUrl("65cf99cb/jacket.jpg", sign)).toBe(
      "https://signed/wardrobe-refs/65cf99cb/jacket.jpg",
    );
    expect(await referenceUrl("https://raw.githubusercontent.com/x/cap_side.jpg", sign)).toBe(
      "https://raw.githubusercontent.com/x/cap_side.jpg",
    );
    await expect(referenceUrl("http://example.com/cap.jpg", sign)).rejects.toThrow(/https link/);
    await expect(referenceUrl("ftp://example.com/cap.jpg", sign)).rejects.toThrow(/https link/);
    await expect(referenceUrl("data:image/png;base64,AAAA", sign)).rejects.toThrow(/https link/);
  });
});

describe("importing a finished swap is idempotent", () => {
  const base = {
    projectId: "p1",
    variationId: "v1",
    shot: { id: "shot_19", key: "c019" },
    parentTakeId: "take_1",
    parentSync: { id: "s1", offsetSeconds: 0.853, driftPpm: 0 },
    window: [72.673, 76.677] as [number, number],
    requestId: "71ff19f4-0944-43fa-8371-677c5f9557e8",
    resultUrl: "https://d3u0tzju9qaucj.cloudfront.net/a/b.mp4",
    outfit: null,
    references: [],
    prompt: "p",
    promptVersion: "recipe-71ff19f4",
  };
  function importDeps(existing: Record<string, string> = {}) {
    const inserted: Record<string, unknown>[] = [];
    const deps: ImportDeps = {
      userId: async () => "user_1",
      findJob: async (projectId, requestId) =>
        existing[`${projectId}:${requestId}`]
          ? { id: existing[`${projectId}:${requestId}`] }
          : null,
      insertJob: async (row) => {
        inserted.push(row);
        return `job_${inserted.length}`;
      },
    };
    return { deps, inserted };
  }

  it("inserts once, and a second import of the same request in the same project returns the first row", async () => {
    const { deps, inserted } = importDeps();
    const first = await importFinishedDress(base, deps);
    expect(first).toEqual({ id: "job_1", existed: false });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      user_id: "user_1",
      project_id: "p1",
      external_job_id: base.requestId,
      status: "succeeded",
    });
    const { deps: later } = importDeps({ "p1:71ff19f4-0944-43fa-8371-677c5f9557e8": "job_1" });
    expect(await importFinishedDress(base, later)).toEqual({ id: "job_1", existed: true });
  });

  it("the same request in another project is its own row", async () => {
    const { deps, inserted } = importDeps({ "p1:71ff19f4-0944-43fa-8371-677c5f9557e8": "job_1" });
    expect(await importFinishedDress({ ...base, projectId: "p2" }, deps)).toEqual({
      id: "job_1",
      existed: false,
    });
    expect(inserted).toHaveLength(1);
  });
});
