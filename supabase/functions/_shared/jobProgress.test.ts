import { describe, expect, it } from "vitest";
import { advanceJob, filePlateVideo, plateMotionFrom, restagedFrom, type ProgressDeps, type ProgressJob } from "./jobProgress";

const job = (over: Partial<ProgressJob> = {}): ProgressJob => ({
  id: "job-1",
  user_id: "u",
  project_id: "p",
  provider: "higgsfield",
  status: "succeeded",
  external_job_id: "ext-1",
  error_text: null,
  result_asset_id: null,
  request_payload_json: {
    promptText: "P",
    mode: "image_to_video",
    modelVariant: "kling-2.5-turbo-pro-i2v",
    settings: {
      route: "plate_motion",
      version: "plate-motion-v1-2026-10-16",
      plate: { still_asset_id: "still-1", still_path: "u/p/worlds/plate_x_1.png", scene_title: "79th & Lafayette", shot_label: "plate_x" },
      model: "kling-2.5-turbo-pro-i2v",
      seconds: 5,
      prompt: "P",
    },
  },
  response_payload_json: null,
  created_at: "2026-10-16T00:00:00Z",
  finalized_at: null,
  progress_failures: 0,
  progress_note: null,
  ...over,
});

function deps(over: Partial<ProgressDeps> = {}) {
  const calls: string[] = [];
  const patches: Record<string, unknown>[] = [];
  const assets: Record<string, Record<string, unknown>> = { "asset-1": { bucket: "project-clips", provider_job_id: "job-1", duration_seconds: 5.04 } };
  const d: ProgressDeps = {
    now: () => new Date("2026-10-16T01:00:00Z"),
    providerStatus: async () => ({ status: "succeeded" }),
    saveClip: async () => {
      calls.push("saveClip");
      return "asset-1";
    },
    updateJob: async (_id, patch) => {
      patches.push(patch as Record<string, unknown>);
    },
    shotExists: async () => {
      calls.push("shotExists");
      return true;
    },
    assignmentsOf: async () => {
      calls.push("assignmentsOf");
      return [];
    },
    applyAssignments: async () => {
      calls.push("applyAssignments");
    },
    assetMeta: async (id) => assets[id] ?? null,
    updateAsset: async (id, patch) => {
      calls.push(`updateAsset:${id}`);
      if (patch.metadata_json) assets[id] = patch.metadata_json;
      if (patch.footage_role) assets[id] = { ...assets[id], footage_role: patch.footage_role };
    },
    syncOf: async () => null,
    insertSync: async () => {
      calls.push("insertSync");
    },
    dressOwnership: async () => [],
    ...over,
  };
  return { d, calls, patches, assets };
}

describe("a restaging filed as an ALTERNATE (a montage or an extra angle)", () => {
  const restagedJob = (alternate: boolean) =>
    job({
      result_asset_id: null,
      request_payload_json: {
        promptText: "P",
        shotId: "shot-1",
        settings: { route: "seedance_ref", sourceAssetId: "take-1", masterStart: 82.025, sourceWindow: [1, 5], sourceSeconds: 4, ...(alternate ? { alternate: true, variant: { version: "montage-v1-2026-10-16" } } : {}) },
      },
    });

  it("lands on its shot UNSELECTED when the job says alternate, selected when it does not", async () => {
    for (const alternate of [true, false]) {
      const ops: unknown[] = [];
      const { d, calls } = deps({
        applyAssignments: async (_job, planned) => {
          ops.push(...planned);
        },
        assetMeta: async () => ({ bucket: "project-clips", duration_seconds: 4 }),
      });
      const r = await advanceJob(restagedJob(alternate), d);
      expect(r.state).toBe("finished");
      expect(calls).toContain("saveClip");
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ op: "insert", shot_id: "shot-1", asset_id: "asset-1", role: "performance", is_primary: !alternate });
      expect(r.did).toContain(alternate ? "on its shot, unselected" : "on its shot");
    }
  });
});

describe("plateMotionFrom", () => {
  it("reads a moving-plate job and nothing else", () => {
    expect(plateMotionFrom(job())).toEqual({
      stillAssetId: "still-1",
      stillPath: "u/p/worlds/plate_x_1.png",
      sceneTitle: "79th & Lafayette",
      shotLabel: "plate_x",
      model: "kling-2.5-turbo-pro-i2v",
      seconds: 5,
      prompt: "P",
      version: "plate-motion-v1-2026-10-16",
      event: null,
    });
    expect(plateMotionFrom(job({ request_payload_json: { settings: { route: "dressed" } } }))).toBeNull();
    expect(plateMotionFrom(job({ request_payload_json: { settings: { route: "plate_motion", plate: {} } } }))).toBeNull();
    expect(plateMotionFrom(job({ request_payload_json: { settings: { route: "plate_motion", plate: { still_asset_id: 7 } } } }))).toBeNull();
  });

  it("bounds what the browser wrote: a length is positive and under ten minutes, strings are cut short", () => {
    const base = job().request_payload_json!.settings as Record<string, unknown>;
    const withSeconds = (seconds: unknown) => plateMotionFrom(job({ request_payload_json: { settings: { ...base, seconds } } }))!.seconds;
    expect(withSeconds(-5)).toBeNull();
    expect(withSeconds(1e9)).toBeNull();
    expect(withSeconds(10)).toBe(10);
    const long = plateMotionFrom(job({ request_payload_json: { settings: { ...base, prompt: "x".repeat(10_000), event: "e".repeat(1000), plate: { ...(base.plate as object), scene_title: "y".repeat(1000) } } } }))!;
    expect(long.prompt!.length).toBe(4000);
    expect(long.sceneTitle!.length).toBe(400);
    expect(long.event!.length).toBe(400);
    expect(plateMotionFrom(job({ request_payload_json: { settings: { ...base, event: 42 } } }))!.event).toBeNull();
  });
});

describe("a finished moving plate", () => {
  it("is saved, filed as a plate of its scene naming its still, never put on a shot, and finished", async () => {
    const { d, calls, patches, assets } = deps();
    const r = await advanceJob(job(), d);
    expect(r.state).toBe("finished");
    expect(r.did).toEqual(["saved", "filed as a moving plate of the scene", "finished"]);
    expect(calls).toEqual(["saveClip", "updateAsset:asset-1"]);
    expect(assets["asset-1"]).toMatchObject({
      bucket: "project-clips",
      lane: "world_plate_video",
      usable: true,
      scene_title: "79th & Lafayette",
      shot_label: "plate_x",
      plate_motion: { still_asset_id: "still-1", still_path: "u/p/worlds/plate_x_1.png", model: "kling-2.5-turbo-pro-i2v", seconds: 5, provider_job_id: "job-1" },
    });
    expect(assets["asset-1"].footage_role).toBeUndefined();
    expect(assets["asset-1"].derived_from).toBeUndefined();
    const attached = patches.find((p) => p.request_payload_json);
    expect((attached?.request_payload_json as { settings: { attachedAt: string } }).settings.attachedAt).toBe("2026-10-16T01:00:00.000Z");
    expect(patches.at(-1)?.finalized_at).toBe("2026-10-16T01:00:00.000Z");
  });

  it("is not filed twice: a job already attached only finishes", async () => {
    const { d, calls } = deps();
    const j = job({ result_asset_id: "asset-1", request_payload_json: { ...job().request_payload_json, settings: { ...(job().request_payload_json!.settings as object), attachedAt: "x" } } });
    const r = await advanceJob(j, d);
    expect(r.state).toBe("finished");
    expect(calls).toEqual([]);
  });

  it("a plate job that somehow carries a shot is still never assigned to it", async () => {
    const { d, calls } = deps();
    const r = await advanceJob(job({ request_payload_json: { ...job().request_payload_json, shotId: "shot-9" } }), d);
    expect(r.state).toBe("finished");
    expect(calls).not.toContain("applyAssignments");
    expect(calls).not.toContain("assignmentsOf");
  });

  it("filePlateVideo keeps the clip's own length when it has one and fills it in when it has none", async () => {
    const { d, assets } = deps();
    const plate = plateMotionFrom(job())!;
    await filePlateVideo(job({ result_asset_id: "asset-1" }), plate, d);
    expect(assets["asset-1"].duration_seconds).toBe(5.04);
    assets["asset-2"] = { bucket: "project-clips" };
    await filePlateVideo(job({ result_asset_id: "asset-2" }), plate, d);
    expect(assets["asset-2"].duration_seconds).toBe(5);
    await expect(filePlateVideo(job({ result_asset_id: "gone" }), plate, d)).rejects.toThrow(/record/);
  });
});

describe("a restaged clip is filed at the length it was asked for", () => {
  const job = (payload: Record<string, unknown>) =>
    ({ id: "j", user_id: "u", project_id: "p", provider: "higgsfield", status: "completed", external_job_id: null, error_text: null, result_asset_id: "a", response_payload_json: null, created_at: "", finalized_at: null, request_payload_json: payload }) as unknown as Parameters<typeof restagedFrom>[0];
  it("a 10 s continuous take made from a 4 s take is 10 s, not 4 s", () => {
    const r = restagedFrom(job({ duration: 10, settings: { route: "seedance_ref", sourceAssetId: "t", masterStart: 53.8, sourceSeconds: 4 } }));
    expect(r?.seconds).toBe(10);
  });
  it("a lip-sync keeps its clip's own length; no asked length falls back to the source's", () => {
    expect(restagedFrom(job({ settings: { route: "lipsync", sourceAssetId: "c", masterStart: 58, sourceSeconds: 4.04 } }))?.seconds).toBe(4.04);
    expect(restagedFrom(job({ settings: { route: "seedance_ref", sourceAssetId: "t", masterStart: 58, sourceSeconds: 4 } }))?.seconds).toBe(4);
  });
});
