/**
 * A dressed take is filed by the SERVER, with no page open: the real decision code (supabase/functions/_shared/
 * jobProgress.ts) and the real conform (dressConform.ts → mp4Retime.ts) over an in-memory copy of the tables. No
 * provider is called and nothing is spent.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import {
  advanceJob,
  dressedFrom,
  type AssignmentRow,
  type ProgressDeps,
  type ProgressJob,
} from "../../../supabase/functions/_shared/jobProgress";
import {
  conformDressedClip,
  dressResultUrl,
} from "../../../supabase/functions/_shared/dressConform";
import { mp4Durations } from "../../../supabase/functions/_shared/mp4Retime";
import { avcSampleDescription, writeMp4 } from "@/lib/media/mp4Trim";
import {
  dressJobSettings,
  dressRecordOf,
  planDressImport,
  DRESS_ROUTE,
  type DressRecord,
} from "./dress";
import { dressedSongStart } from "./dress";
import { boxJobStatus } from "@/lib/queries/boxJobs";

const T0 = Date.parse("2026-10-15T12:00:00.000Z");

/** What the object-swap hands back: 89 frames at 24 fps = 3.708 s. */
function swapOutput(): Uint8Array {
  const n = 89;
  return writeMp4({
    timescale: 12288,
    width: 720,
    height: 1280,
    stsd: avcSampleDescription(720, 1280, new Uint8Array([1, 0x64, 0, 0x1f, 0xff, 0xe1, 0, 0])),
    deltas: Array(n).fill(512),
    offsets: Array(n).fill(0),
    syncs: Array.from({ length: n }, (_, i) => i === 0),
    sizes: Array(n).fill(16),
    payload: new Uint8Array(16 * n).fill(7),
  });
}

/** The approved swap, as the parent files it (ids and the URL from the recipe; sync numbers illustrative). */
const APPROVED = {
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  variationId: "var_1",
  userId: "user_1",
  shot: { id: "shot_19", key: "c019" },
  parentTakeId: "master_take",
  parentSync: { id: "sync_master", offsetSeconds: 0.853, driftPpm: 0 },
  window: [72.673, 76.677] as [number, number],
  sourceSeconds: 4.004,
  cutAssetId: "cc76f6a3-5489-4e6f-98d2-8cf7efcdf03b",
  requestId: "71ff19f4-0944-43fa-8371-677c5f9557e8",
  resultUrl:
    "https://d3u0tzju9qaucj.cloudfront.net/45ee058b-986d-49f2-adc9-280bbafe42a2/88283b9f-4545-4c68-9d40-1f4f63d557f7.mp4",
  outfit: { id: "outfit_mastic", key: "mastic-beige-cap", name: "Mastic + beige cap", version: 2 },
  sceneId: "scene_3",
  references: [
    {
      pieceId: "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
      path: "65cf99cb/2a14a72b-e7de-4ecb-9c24-4142b672d175.jpg",
      angle: "front",
    },
    {
      pieceId: "07e6dcbe-5c56-4e2d-862e-3b22aca8d93d",
      path: "65cf99cb/cap_front.jpg",
      angle: "front",
    },
  ],
  prompt: "Replace only the man's jacket and cap …",
  promptVersion: "recipe-71ff19f4",
  batchRun: "storyboard",
};

function world(job: ProgressJob, opts: { conform?: boolean } = {}) {
  let seq = 0;
  const assets = new Map<
    string,
    { metadata_json: Record<string, unknown>; footage_role: string | null }
  >();
  const assignments: AssignmentRow[] = [
    {
      id: "asg_sel",
      shot_id: "shot_19",
      asset_id: "chosen_clip",
      role: "generated_clip",
      is_primary: true,
      sort_order: 1,
    },
  ];
  const syncs: {
    project_id: string;
    performance_asset_id: string;
    offset_seconds: number;
    drift_ppm: number;
    status: string;
    song_asset_id: string | null;
    method: string;
  }[] = [
    {
      project_id: job.project_id,
      performance_asset_id: "master_take",
      offset_seconds: 0.853,
      drift_ppm: 0,
      status: "confirmed",
      song_asset_id: "song",
      method: "auto",
    },
  ];
  const fetched: string[] = [];
  const jobs = new Map([[job.id, job]]);
  const deps: ProgressDeps = {
    now: () => new Date(T0 + 60_000),
    providerStatus: async () => ({ status: "running" }),
    saveClip: async (j) => {
      // the tick's saveClip: the URL the row carries, checked; the bytes conformed before they are stored
      const url = dressResultUrl(j.response_payload_json);
      if (!url) throw new Error("no safe URL");
      fetched.push(url);
      const d = dressedFrom(j)!;
      const meta: Record<string, unknown> = { bucket: "project-clips", provider_job_id: j.id };
      if (opts.conform !== false)
        Object.assign(meta, conformDressedClip(swapOutput(), d.sourceSeconds).meta);
      const id = `asset_${++seq}`;
      assets.set(id, { metadata_json: meta, footage_role: null });
      jobs.get(j.id)!.result_asset_id = id;
      return id;
    },
    updateJob: async (id, patch) => void Object.assign(jobs.get(id)!, patch),
    shotExists: async () => true,
    assignmentsOf: async (shotId) => assignments.filter((a) => a.shot_id === shotId),
    applyAssignments: async (_j, ops) => {
      for (const o of ops) {
        if (o.op === "update") assignments.find((a) => a.id === o.id)!.is_primary = o.is_primary;
        else
          assignments.push({
            id: `asg_${++seq}`,
            shot_id: o.shot_id,
            asset_id: o.asset_id,
            role: o.role,
            is_primary: o.is_primary,
            sort_order: o.sort_order,
          });
      }
    },
    assetMeta: async (id) => assets.get(id)?.metadata_json ?? null,
    updateAsset: async (id, patch) => {
      const a = assets.get(id)!;
      if (patch.footage_role) a.footage_role = patch.footage_role;
      if (patch.metadata_json) a.metadata_json = patch.metadata_json;
    },
    syncOf: async (p, a) =>
      syncs.find((s) => s.project_id === p && s.performance_asset_id === a) ?? null,
    insertSync: async (row) => void syncs.push({ ...row }),
  };
  return { deps, assets, assignments, syncs, fetched, jobs };
}

function importedJob(): ProgressJob {
  const row = planDressImport(APPROVED);
  return {
    id: "job_import",
    user_id: String(row.user_id),
    project_id: String(row.project_id),
    provider: String(row.provider),
    status: String(row.status),
    external_job_id: String(row.external_job_id),
    error_text: null,
    result_asset_id: null,
    request_payload_json: row.request_payload_json as Record<string, unknown>,
    response_payload_json: row.response_payload_json as Record<string, unknown>,
    created_at: new Date(T0).toISOString(),
    finalized_at: null,
    progress_failures: 0,
    progress_note: null,
  };
}

describe("importing the approved swap — no provider call, no spend", () => {
  it("plans a job row the server will pick up: succeeded, the request id, the result URL, the storyboard's run", () => {
    const row = planDressImport(APPROVED);
    expect(row).toMatchObject({
      provider: "higgsfield",
      status: "succeeded",
      external_job_id: APPROVED.requestId,
      project_id: APPROVED.projectId,
      variation_id: "var_1",
    });
    const settings = (row.request_payload_json as { settings: Record<string, unknown> }).settings;
    expect(settings).toMatchObject({
      batchRun: "storyboard",
      batchShotId: "c019",
      route: DRESS_ROUTE,
      sourceAssetId: "master_take",
    });
    const rec = dressRecordOf(settings.dress)!;
    expect(rec.window).toEqual([72.673, 76.677]);
    expect(rec.sourceSeconds).toBe(4.004);
    expect(rec.songStart).toBeCloseTo(73.526, 4);
    expect(rec.cutAssetId).toBe(APPROVED.cutAssetId);
    expect(rec.imported).toEqual({ requestId: APPROVED.requestId, resultUrl: APPROVED.resultUrl });
    expect(rec.billedSeconds).toBe(5);
  });

  it("refuses an import that is not whole", () => {
    expect(() => planDressImport({ ...APPROVED, window: [5, 5] })).toThrow();
    expect(() => planDressImport({ ...APPROVED, resultUrl: "http://x/y.mp4" })).toThrow(/https/);
    expect(() => planDressImport({ ...APPROVED, requestId: " " })).toThrow();
  });

  it("the server conforms it to 4.004 s, files it as a dressed take in sync, and puts it on its shot UNSELECTED", async () => {
    const job = importedJob();
    const w = world(job);
    const report = await advanceJob(job, w.deps);
    expect(report.state).toBe("finished");
    expect(report.did).toEqual([
      "saved",
      "filed as a dressed take in sync",
      "on its shot, unselected",
      "finished",
    ]);
    expect(w.fetched).toEqual([APPROVED.resultUrl]);
    const asset = w.assets.get(job.result_asset_id!)!;
    expect(asset.footage_role).toBe("performance");
    const meta = asset.metadata_json;
    expect(meta.output_duration).toBeCloseTo(89 / 24, 3);
    expect(meta.conformed_duration).toBeCloseTo(4.004, 3);
    expect(meta.duration_seconds).toBeCloseTo(4.004, 3);
    expect(meta.retime_ratio).toBeCloseTo(4.004 / (89 / 24), 4);
    expect(meta.derived_from).toMatchObject({
      asset_id: "master_take",
      source_window: [72.673, 76.677],
      method: "dressed",
      job_id: "job_import",
    });
    expect((meta.derived_from as { song_start: number }).song_start).toBeCloseTo(73.526, 4);
    // the sync maps the dressed take onto the song exactly like its parent over the window
    const sync = w.syncs.find((s) => s.performance_asset_id === job.result_asset_id)!;
    expect(sync).toMatchObject({
      method: "derived",
      status: "confirmed",
      song_asset_id: "song",
      drift_ppm: 0,
    });
    expect(sync.offset_seconds).toBeCloseTo(0.853 + 72.673, 4);
    // the director's chosen clip is still the one shown
    expect(w.assignments.find((a) => a.id === "asg_sel")!.is_primary).toBe(true);
    expect(w.assignments.find((a) => a.asset_id === job.result_asset_id)).toMatchObject({
      role: "performance",
      is_primary: false,
    });
  });

  it("is safe to run again: nothing is filed or synced twice", async () => {
    const job = importedJob();
    const w = world(job);
    await advanceJob(job, w.deps);
    const again = await advanceJob({ ...job, finalized_at: null }, w.deps);
    expect(again.state).toBe("finished");
    expect(w.syncs.filter((s) => s.performance_asset_id === job.result_asset_id)).toHaveLength(1);
    expect(w.assignments.filter((a) => a.asset_id === job.result_asset_id)).toHaveLength(1);
  });

  it("a clip that was not conformed is never filed in sync — the job is retried, with the reason", async () => {
    const job = importedJob();
    const w = world(job, { conform: false });
    const report = await advanceJob(job, w.deps);
    expect(report.state).toBe("retry");
    expect(report.note).toMatch(/without being conformed/);
    expect(w.syncs.some((s) => s.performance_asset_id === job.result_asset_id)).toBe(false);
  });
});

describe("a dress the tool submitted moves the same way", () => {
  it("queued → the provider finishes → conformed, filed and on the shot unselected", async () => {
    const record: DressRecord = {
      ...(dressRecordOf(
        (planDressImport(APPROVED).request_payload_json as { settings: { dress: unknown } })
          .settings.dress,
      ) as DressRecord),
      imported: null,
      window: [71.5, 75.45],
      sourceSeconds: 3.95,
      songStart: dressedSongStart(71.5, APPROVED.parentSync),
    };
    const job: ProgressJob = {
      ...importedJob(),
      id: "job_sub",
      status: "queued",
      request_payload_json: {
        shotId: "shot_19",
        settings: dressJobSettings({ batchRun: "storyboard", shotKey: "c019", record }),
      },
      response_payload_json: null,
    };
    const w = world(job);
    w.deps.providerStatus = async () => ({ status: "succeeded", resultUrl: APPROVED.resultUrl });
    const report = await advanceJob(job, w.deps);
    expect(report.did[0]).toBe("provider: succeeded");
    expect(report.state).toBe("finished");
    const meta = w.assets.get(job.result_asset_id!)!.metadata_json;
    expect(meta.conformed_duration).toBeCloseTo(3.95, 3);
    expect(
      w.syncs.find((s) => s.performance_asset_id === job.result_asset_id)!.offset_seconds,
    ).toBeCloseTo(72.353, 4);
  });

  it("dressedFrom reads only a whole dress record on the dress route", () => {
    const job = importedJob();
    expect(dressedFrom(job)).toMatchObject({
      sourceAssetId: "master_take",
      window: [72.673, 76.677],
      sourceSeconds: 4.004,
    });
    const s = (job.request_payload_json as { settings: Record<string, unknown> }).settings;
    expect(
      dressedFrom({ ...job, request_payload_json: { settings: { ...s, route: "seedance_ref" } } }),
    ).toBeNull();
    expect(
      dressedFrom({
        ...job,
        request_payload_json: {
          settings: { ...s, dress: { ...(s.dress as object), window: [3, 1] } },
        },
      }),
    ).toBeNull();
  });
});

describe("the server's own checks", () => {
  it("fetches a dressed result only from the provider's CDN, over https, never a private host", () => {
    expect(dressResultUrl({ resultUrl: APPROVED.resultUrl })).toBe(APPROVED.resultUrl);
    expect(dressResultUrl({ resultUrl: "https://cdn.higgsfield.ai/x.mp4" })).toBe(
      "https://cdn.higgsfield.ai/x.mp4",
    );
    expect(dressResultUrl({ resultUrl: "http://d3u0tzju9qaucj.cloudfront.net/x.mp4" })).toBeNull();
    expect(dressResultUrl({ resultUrl: "https://evil.example.com/x.mp4" })).toBeNull();
    expect(dressResultUrl({ resultUrl: "https://169.254.169.254/latest" })).toBeNull();
    expect(dressResultUrl({ resultUrl: "https://cloudfront.net.evil.com/x.mp4" })).toBeNull();
    expect(dressResultUrl(null)).toBeNull();
  });

  it("conforms to the source length and records what it measured", () => {
    const out = conformDressedClip(swapOutput(), 4.0);
    expect(mp4Durations(out.bytes).videoSeconds).toBeCloseTo(4.0, 3);
    expect(out.meta).toMatchObject({
      conform_method: "container_timescale",
      conformed_to: 4,
      audio_dropped: 0,
    });
    expect(out.meta.output_duration).toBeCloseTo(3.7083, 4);
  });
});

describe("the shot says what is happening", () => {
  it("a dress in progress is named as one", () => {
    const job = { ...importedJob(), status: "running", progress_note: null } as never;
    expect(boxJobStatus(job, T0).message).toMatch(/^dressing the take/);
  });
});
