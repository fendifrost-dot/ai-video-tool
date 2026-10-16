import { describe, expect, it } from "vitest";
import type { MediaAsset } from "@/lib/storyboard/media";
import {
  PLATE_MOTION_MODEL,
  PLATE_MOTION_ROUTE,
  animatePlate,
  composePlateMotionRequest,
  findLivePlateJob,
  planPlateMotion,
  plateMotionSettings,
} from "./plateMotion";

const asset = (over: Partial<MediaAsset>): MediaAsset => ({
  id: "a",
  assetType: "generated_image",
  footageRole: null,
  bucket: "project-references",
  path: "u/p/worlds/plate_x_1.png",
  playback: null,
  name: "plate_x_1.png",
  mime: "image/png",
  isVideo: false,
  isImage: true,
  durationSeconds: null,
  shotId: null,
  sourceTool: "xai",
  providerJobId: null,
  createdAt: "2026-10-15T00:00:00Z",
  plate: { kind: "still", sceneTitle: "79th & Lafayette", shotLabel: "plate_x", usable: true, stillAssetId: null },
  ...over,
});

describe("planPlateMotion", () => {
  it("animates a realism still and prices five seconds of Kling; a moving plate is not animated again", () => {
    const still = asset({ id: "still-1" });
    const r = planPlateMotion({ still, assets: [still] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.seconds).toBe(5);
    expect(r.plan.cost.usd).toBeCloseTo(0.35, 3);
    expect(r.plan.model).toBe(PLATE_MOTION_MODEL);
    expect(r.plan.existing).toEqual([]);
    const video = asset({ id: "v1", isImage: false, isVideo: true, bucket: "project-clips", path: "u/p/j/generated_higgsfield_x.mp4", plate: { kind: "video", sceneTitle: "79th & Lafayette", shotLabel: "plate_x", usable: true, stillAssetId: "still-1" } });
    expect(planPlateMotion({ still: video, assets: [still, video] })).toMatchObject({ ok: false, why: expect.stringMatching(/realism plate/) });
    const again = planPlateMotion({ still, assets: [still, video] });
    expect(again.ok && again.plan.existing.map((a) => a.id)).toEqual(["v1"]);
    expect(planPlateMotion({ still: null, assets: [] })).toMatchObject({ ok: false, why: expect.stringMatching(/no plate/) });
  });
});

describe("the request and the job's settings", () => {
  it("is image-to-video of the still with a locked-off camera, no shot on the job, and the still named for the server", () => {
    const req = composePlateMotionRequest({ prompt: "P", stillUrl: "https://x/still.png", seconds: 5, projectId: "proj" });
    expect(req.endpoint).toBe("video-providers-higgsfield-model");
    expect(req.body).toEqual({ promptText: "P", mode: "image_to_video", modelVariant: PLATE_MOTION_MODEL, referenceImageUrl: "https://x/still.png", duration: 5, avt_project_id: "proj" });
    const s = plateMotionSettings({ still: asset({ id: "still-1" }), seconds: 5, prompt: "P" });
    expect(s.route).toBe(PLATE_MOTION_ROUTE);
    expect(s.plate).toEqual({ still_asset_id: "still-1", still_path: "u/p/worlds/plate_x_1.png", scene_title: "79th & Lafayette", shot_label: "plate_x" });
    expect(String(s.prompt)).not.toMatch(/^$/);
  });

  it("finds a running animation of the same still and ignores other jobs", () => {
    const rows = [
      { id: "1", status: "running", finalized_at: null, request_payload_json: { settings: { route: PLATE_MOTION_ROUTE, plate: { still_asset_id: "still-1" } } } },
      { id: "2", status: "running", finalized_at: null, request_payload_json: { settings: { route: "dressed", plate: { still_asset_id: "still-1" } } } },
      { id: "3", status: "succeeded", finalized_at: "x", request_payload_json: { settings: { route: PLATE_MOTION_ROUTE, plate: { still_asset_id: "still-2" } } } },
    ];
    expect(findLivePlateJob(rows, "still-1")?.id).toBe("1");
    expect(findLivePlateJob(rows, "still-2")).toBeNull();
  });
});

describe("animatePlate", () => {
  const plan = () => {
    const r = planPlateMotion({ still: asset({ id: "still-1" }), assets: [] });
    if (!r.ok) throw new Error(r.why);
    return r.plan;
  };

  it("a dry run sends nothing and names the links instead of signing them", async () => {
    const r = await animatePlate({ projectId: "proj", variationId: null, plan: plan(), dryRun: true });
    expect(r.dryRun).toBe(true);
    if (!r.dryRun) return;
    expect(r.request.body.referenceImageUrl).toMatch(/^<signed project-references\//);
    expect(r.settings.route).toBe(PLATE_MOTION_ROUTE);
  });

  it("refuses a second animation of a still that is already running — nothing inserted, nothing sent", async () => {
    const calls: string[] = [];
    const deps = {
      userId: "u",
      sign: async () => "https://signed",
      generateStills: async () => ({ ok: false }),
      insertJob: async () => {
        calls.push("insert");
        return "row";
      },
      updateJob: async () => {
        calls.push("update");
      },
      callProxy: async () => {
        calls.push("proxy");
        return {};
      },
    };
    const lookups = { livePlateRows: async () => [{ id: "1", status: "queued", finalized_at: null, request_payload_json: { settings: { route: PLATE_MOTION_ROUTE, plate: { still_asset_id: "still-1" } } } }] };
    await expect(animatePlate({ projectId: "proj", variationId: null, plan: plan() }, deps, lookups)).rejects.toThrow(/already being animated/);
    expect(calls).toEqual([]);
  });
});
