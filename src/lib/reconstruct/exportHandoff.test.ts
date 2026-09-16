import { describe, expect, it } from "vitest";
import { reconstructMasterClip } from "./adapters";
import { CANONICAL_MASTER_CLIP_ID, CANONICAL_PROJECT_ID } from "./canonicalLineage";
import {
  RECONSTRUCT_LANE_H_HANDOFF_VERSION,
  buildReconstructLaneHHandoff,
  durationSecFromFrameStream,
} from "./exportHandoff";
import { reconstructQaFixturePack } from "./fixtures/liveWiringFixture";
import { consumeSam3ForReconstruct } from "./sam3Consume";
import { runReconstructE2e } from "./e2e";

const SECOND_CLIP_ASSET_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("Lane H MP4 provenance v2", () => {
  it("derives dims/fps/duration from the reconstruct frame stream and leaves codec to Lane H", () => {
    const pack = reconstructQaFixturePack({ fps: 24, frameCount: 4 });
    const clip = reconstructMasterClip({
      originalFrames: pack.originalFrames,
      chestStill: pack.chestStill,
      sleeveStill: pack.sleeveStill,
      sam3: pack.sam3,
      temporalJobs: pack.temporalJobs,
      masterClipAssetId: pack.masterClipAssetId,
      fps: pack.fps,
    });
    const handoff = buildReconstructLaneHHandoff({ clip, fps: 24 });
    expect(handoff.schemaVersion).toBe(RECONSTRUCT_LANE_H_HANDOFF_VERSION);
    expect(handoff.paidCalls).toBe(false);
    expect(handoff.width).toBe(pack.width);
    expect(handoff.height).toBe(pack.height);
    expect(handoff.mp4.dims).toEqual({ width: pack.width, height: pack.height });
    expect(handoff.fps).toBe(24);
    expect(handoff.mp4.fps).toBe(24);
    expect(handoff.frameCount).toBe(4);
    expect(handoff.durationSec).toBe(durationSecFromFrameStream(4, 24));
    expect(handoff.durationSec).toBeCloseTo(4 / 24);
    expect(handoff.mp4.codecClaims.reconstructDoesNotChooseCodec).toBe(true);
    expect(handoff.mp4.codecClaims.videoCodec).toBeNull();
    expect(handoff.mp4.codecClaims.audioCodec).toBeNull();
    expect(handoff.mp4.codecClaims.container).toBeNull();
    expect(handoff.mp4.codecClaims.pixelFormat).toBe("rgba8");
    expect(handoff.mp4.reconstructDoesNotEncode).toBe(true);
    expect(handoff.audio.reconstructTouchesAudio).toBe(false);
  });

  it("carries SAM-3 consume provenance onto the Lane H handoff", () => {
    const pack = reconstructQaFixturePack();
    const sam3 = consumeSam3ForReconstruct({
      raw: { maskPath: "unused.png" },
      expectedWidth: pack.width,
      expectedHeight: pack.height,
    });
    expect(sam3.ok).toBe(true);
    if (!sam3.ok) return;
    const clip = reconstructMasterClip({
      originalFrames: pack.originalFrames,
      chestStill: pack.chestStill,
      sleeveStill: pack.sleeveStill,
      sam3: sam3.sam3,
      masterClipAssetId: pack.masterClipAssetId,
      fps: 24,
    });
    const handoff = buildReconstructLaneHHandoff({
      clip,
      sam3Provenance: sam3.provenance,
    });
    expect(handoff.sam3?.fallbackStatus).toBe("live_unavailable_used_fixture");
    expect(handoff.sam3?.liveFetchAttempted).toBe(false);
    expect(handoff.sam3?.checksum).toEqual(expect.any(String));
  });
});

describe("second-clip reconstruct QA fixtures", () => {
  it("accepts an alternate masterClipAssetId without clip-specific reconstruct code", () => {
    expect(SECOND_CLIP_ASSET_ID).not.toBe(CANONICAL_MASTER_CLIP_ID);
    const pack = reconstructQaFixturePack({
      masterClipAssetId: SECOND_CLIP_ASSET_ID,
      fps: 30,
      frameCount: 6,
    });
    expect(pack.masterClipAssetId).toBe(SECOND_CLIP_ASSET_ID);
    expect(pack.clipId).toBe(SECOND_CLIP_ASSET_ID);
    expect(pack.projectId).toBe(CANONICAL_PROJECT_ID);
    expect(pack.frameCount).toBe(6);
    expect(pack.fps).toBe(30);

    const clip = reconstructMasterClip({
      originalFrames: pack.originalFrames,
      chestStill: pack.chestStill,
      sleeveStill: pack.sleeveStill,
      sam3: pack.sam3,
      temporalJobs: pack.temporalJobs,
      masterClipAssetId: pack.masterClipAssetId,
      clipId: pack.clipId,
      projectId: pack.projectId,
      fps: pack.fps,
    });
    expect(clip.masterClipAssetId).toBe(SECOND_CLIP_ASSET_ID);
    expect(clip.clipId).toBe(SECOND_CLIP_ASSET_ID);
    expect(clip.frames).toHaveLength(6);
    expect(clip.fps).toBe(30);
    expect(clip.originalPixelsPreservedWhereUnauthorized).toBe(true);

    const handoff = buildReconstructLaneHHandoff({ clip });
    expect(handoff.masterClipAssetId).toBe(SECOND_CLIP_ASSET_ID);
    expect(handoff.fps).toBe(30);
    expect(handoff.durationSec).toBeCloseTo(6 / 30);
    expect(handoff.mp4.durationSec).toBe(handoff.durationSec);
  });

  it("threads alternate clip id through RECONSTRUCT-1 E2E", () => {
    const result = runReconstructE2e({
      explicitArm: true,
      allowFixtureTemporal: true,
      masterClipAssetId: SECOND_CLIP_ASSET_ID,
      fps: 24,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.masterClipAssetId).toBe(SECOND_CLIP_ASSET_ID);
    expect(result.clip.masterClipAssetId).toBe(SECOND_CLIP_ASSET_ID);
    expect(result.sam3Provenance.paidCalls).toBe(false);
    expect(result.sam3Provenance.liveFetchAttempted).toBe(false);
    expect(result.fps).toBe(24);
    expect(result.durationSec).toBeCloseTo(result.frameCount / 24);
  });
});
