import { describe, expect, it } from "vitest";
import type { MediaAsset } from "@/lib/storyboard/media";
import { RECIPE } from "./pixels";
import { compositeMetadata, compositePaths } from "./file";
import type { RenderResult } from "./render";

const asset = (id: string, over: Partial<MediaAsset> = {}): MediaAsset => ({
  id,
  assetType: "generated_clip",
  footageRole: "performance",
  bucket: "project-clips",
  path: `u/p/${id}.mp4`,
  playback: null,
  name: id,
  mime: "video/mp4",
  isVideo: true,
  isImage: false,
  durationSeconds: 4.955,
  shotId: null,
  sourceTool: "higgsfield",
  providerJobId: null,
  createdAt: "2026-10-15T07:00:00Z",
  ...over,
});
const render: RenderResult = {
  bytes: new Uint8Array(10),
  frames: 119,
  alphaFrames: 119,
  seconds: 4.9551,
  width: 720,
  height: 1280,
  fps: 24,
  colr: "bt709",
  recipe: RECIPE,
  seed: 7,
};

describe("filing a composite", () => {
  it("records where it came from so the storyboard reads it as a take made from the dressed take", () => {
    const dressed = asset("f540b6be-0000-4000-8000-000000000000", {
      derivedFrom: {
        assetId: "take",
        songStart: 82.025,
        sourceWindow: [81.17, 86.13],
        method: "dressed",
      },
    });
    const plate = asset("50fa1ce3-0000-4000-8000-000000000000", {
      isVideo: false,
      isImage: true,
      path: "u/p/worlds/plate_x.png",
    });
    const meta = compositeMetadata({
      dressed,
      plate,
      plateFrom: "scene",
      matte: {
        model: "veed/video-background-removal",
        requestId: "req1",
        bytes: new Uint8Array(3),
        frames: 119,
        estimateUsd: 0.089,
        url: "https://v3b.fal.media/files/a.mp4",
      },
      render,
      songStart: 82.025,
      mattePath: "u/p/mattes/x_alpha.mp4",
      madeAt: "2026-10-16T00:00:00Z",
    });
    expect(meta).toMatchObject({
      bucket: "project-clips",
      duration_seconds: 4.9551,
      colr: "bt709",
      derived_from: {
        asset_id: dressed.id,
        source_window: [0, 4.9551],
        song_start: 82.025,
        method: "composite",
      },
      composite: {
        version: 1,
        seed: 7,
        dressed_asset_id: dressed.id,
        take_asset_id: "take",
        plate_asset_id: plate.id,
        plate_from: "scene",
        matte: {
          model: "veed/video-background-removal",
          request_id: "req1",
          path: "u/p/mattes/x_alpha.mp4",
          source_url_host: "v3b.fal.media",
        },
      },
    });
    expect((meta.composite as { recipe: { version: string } }).recipe.version).toBe(
      "plate-composite-v1-2026-10-15",
    );
  });

  it("names one render's files the same every time, under the caller's own folder", () => {
    const a = compositePaths({
      userId: "u1",
      projectId: "p1",
      name: "storyboard_c047_composite",
      dressedId: "f540b6be-aaaa",
      plateId: "50fa1ce3-bbbb",
      seed: 7,
    });
    const b = compositePaths({
      userId: "u1",
      projectId: "p1",
      name: "storyboard_c047_composite",
      dressedId: "f540b6be-aaaa",
      plateId: "50fa1ce3-bbbb",
      seed: 7,
    });
    expect(a).toEqual(b);
    expect(a.path).toBe("u1/p1/composites/storyboard_c047_composite_f540b6be_50fa1ce3_7.mp4");
    expect(a.mattePath).toBe(
      "u1/p1/mattes/storyboard_c047_composite_f540b6be_50fa1ce3_7_alpha.mp4",
    );
    expect(
      compositePaths({
        userId: "u1",
        projectId: "p1",
        name: "storyboard_c047_composite",
        dressedId: "f540b6be-aaaa",
        plateId: "50fa1ce3-bbbb",
        seed: 8,
      }).path,
    ).not.toBe(a.path);
  });
});
