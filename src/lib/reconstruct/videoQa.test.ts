import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_FULL_CLIP_FRAME_COUNT,
  CANONICAL_MASTER_FPS,
  CANONICAL_MASTER_HEIGHT,
  CANONICAL_MASTER_WIDTH,
} from "./canonicalLineage";
import { RECONSTRUCT_LANE_H_HANDOFF_VERSION } from "./exportHandoff";
import {
  LIVE_TEMPORAL_FRAME_COUNT,
  LIVE_TEMPORAL_RASTER,
  liveShapedTemporalJobs,
  realMediaFixturePack,
} from "./fixtures/liveWiringFixture";
import { uniqueOriginal, invertedGenerated, featheredRectMask } from "./fixtures/syntheticMaster";
import {
  RECONSTRUCT_VIDEO_QA_VERSION,
  formatReconstructVideoQaSummary,
  measureSeamLeaks,
  reconstructVideoQaToJson,
  runReconstructVideoQa,
} from "./videoQa";
import { reconstructOriginalMaster } from "./originalMasterReconstruct";

describe("Lane D2 reconstruction video QA", () => {
  it("preserves unauthorized original pixels on native 720×1280 translating temporal jobs", () => {
    const pack = realMediaFixturePack({
      width: CANONICAL_MASTER_WIDTH,
      height: CANONICAL_MASTER_HEIGHT,
      frameCount: 8,
      translateChest: true,
    });
    const report = runReconstructVideoQa({
      pack: { ...pack, source: "native_720x1280_translating" },
      expectedWidth: 720,
      expectedHeight: 1280,
      expectedFps: 24,
      source: "native_720x1280_translating",
    });
    expect(report.schemaVersion).toBe(RECONSTRUCT_VIDEO_QA_VERSION);
    expect(report.verdict).toBe("PASS");
    expect(report.failCount).toBe(0);
    expect(report.paidCalls).toBe(false);
    expect(report.grokPerFrame).toBe(false);
    expect(report.sam3LiveFetch).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.escalate).toBeNull();
    expect(report.width).toBe(720);
    expect(report.height).toBe(1280);
    expect(report.frameCount).toBe(8);
    expect(report.fps).toBe(24);
    expect(report.criteria.find((c) => c.id === "original_preserved_unauthorized")?.verdict).toBe(
      "PASS",
    );
    expect(report.criteria.find((c) => c.id === "seam_no_unauthorized_leak")?.verdict).toBe("PASS");
    expect(report.criteria.find((c) => c.id === "identity_repair_preserved")?.verdict).toBe("PASS");
    expect(report.criteria.find((c) => c.id === "background_corners_preserved")?.verdict).toBe(
      "PASS",
    );
    expect(report.laneHHandoff.schemaVersion).toBe(RECONSTRUCT_LANE_H_HANDOFF_VERSION);
    expect(report.laneHHandoff.exportOwnedBy).toBe("lane_h");
    expect(report.laneHHandoff.audio.reconstructTouchesAudio).toBe(false);
    expect(report.laneHHandoff.mp4.reconstructDoesNotEncode).toBe(true);
    expect(report.laneHHandoff.unauthorizedLeakCount).toBe(0);
  });

  it("runs a full-clip 24-frame 720×1280 reconstruct (1 s @ 24 fps)", () => {
    expect(CANONICAL_FULL_CLIP_FRAME_COUNT).toBe(24);
    const pack = realMediaFixturePack({
      width: CANONICAL_MASTER_WIDTH,
      height: CANONICAL_MASTER_HEIGHT,
      frameCount: CANONICAL_FULL_CLIP_FRAME_COUNT,
      fps: CANONICAL_MASTER_FPS,
      translateChest: true,
    });
    const report = runReconstructVideoQa({
      pack: { ...pack, source: "full_clip_720x1280_24" },
      source: "full_clip_720x1280_24",
    });
    expect(report.verdict).toBe("PASS");
    expect(report.frameCount).toBe(24);
    expect(report.width).toBe(720);
    expect(report.height).toBe(1280);
    expect(report.fps).toBe(24);
    expect(report.criteria.find((c) => c.id === "frame_continuity_unauthorized")?.verdict).toBe(
      "PASS",
    );
    expect(report.criteria.find((c) => c.id === "fps_passthrough")?.verdict).toBe("PASS");
    expect(report.criteria.find((c) => c.id === "audio_untouched")?.verdict).toBe("PASS");
    expect(report.laneHHandoff.frameIndices).toEqual([...Array(24).keys()]);
  });

  it("composites live-shaped 80×128 × 5 temporal jobs onto 720×1280 originals", () => {
    const pack = realMediaFixturePack({
      width: CANONICAL_MASTER_WIDTH,
      height: CANONICAL_MASTER_HEIGHT,
      frameCount: LIVE_TEMPORAL_FRAME_COUNT,
      temporalWidth: LIVE_TEMPORAL_RASTER.width,
      temporalHeight: LIVE_TEMPORAL_RASTER.height,
      translateChest: true,
    });
    expect(pack.temporalJobs[0]?.frames[0]?.width).toBe(80);
    expect(pack.temporalJobs[0]?.frames[0]?.height).toBe(128);
    expect(pack.originalFrames[0]?.image.width).toBe(720);
    const report = runReconstructVideoQa({
      pack: { ...pack, source: "live_shaped_80x128_onto_720x1280" },
      source: "live_shaped_80x128_onto_720x1280",
    });
    expect(report.verdict).toBe("PASS");
    expect(report.frameCount).toBe(5);
    expect(report.width).toBe(720);
    expect(report.height).toBe(1280);
    expect(report.criteria.find((c) => c.id === "temporal_masks_consumed")?.verdict).toBe("PASS");
    expect(liveShapedTemporalJobs()[0]?.frames).toHaveLength(5);
  });

  it("emits Lane H provenance JSON without encoding an MP4", () => {
    const pack = realMediaFixturePack({
      width: CANONICAL_MASTER_WIDTH,
      height: CANONICAL_MASTER_HEIGHT,
      frameCount: 3,
    });
    const report = runReconstructVideoQa({
      pack: { ...pack, source: "lane_h_handoff" },
      source: "lane_h_handoff",
    });
    const json = reconstructVideoQaToJson(report);
    expect(json.verdict).toBe("PASS");
    expect(json.paidCalls).toBe(false);
    const handoff = json.laneHHandoff as { mp4: { reconstructDoesNotEncode: boolean } };
    expect(handoff.mp4.reconstructDoesNotEncode).toBe(true);
    expect(formatReconstructVideoQaSummary(report)).toMatch(
      /RECONSTRUCT-1 D2 PASS 15\/15 720×1280 frames=3 fps=24 paidCalls=false grokPerFrame=false\./,
    );
  });

  it("soft seam at 720×1280 does not leak generated into α===0 neighbors", () => {
    const original = uniqueOriginal(720, 1280);
    const generated = invertedGenerated(original);
    const seg = featheredRectMask(720, 1280, { x0: 200, x1: 520, y0: 600, y1: 800 });
    const result = reconstructOriginalMaster({ original, generated, segmentation: seg });
    expect(result.originalPixelsPreservedWhereUnauthorized).toBe(true);
    const seam = measureSeamLeaks(original, result.image, result.authorizedAlpha);
    expect(seam.seamPixels).toBeGreaterThan(0);
    expect(seam.unauthorizedNeighborLeaks).toBe(0);
  });

  it("locks committed D2 evidence JSON as PASS 15/15 with Lane H handoff", () => {
    const raw = JSON.parse(
      readFileSync("docs/reconstruct/video-qa/preservation-720x1280.json", "utf8"),
    ) as {
      paidCalls: boolean;
      stillGoldensReopened: boolean;
      claims: { originalMasterPreservationOutsideTransformedRegions: string };
      runs: Array<{ name: string; verdict: string; passCount: number; failCount: number }>;
    };
    expect(raw.paidCalls).toBe(false);
    expect(raw.stillGoldensReopened).toBe(false);
    expect(raw.claims.originalMasterPreservationOutsideTransformedRegions).toBe("PASS");
    expect(raw.runs.map((r) => r.name)).toEqual([
      "native_720x1280_translating",
      "full_clip_720x1280_24",
      "live_shaped_80x128_onto_720x1280",
    ]);
    for (const run of raw.runs) {
      expect(run.verdict).toBe("PASS");
      expect(run.passCount).toBe(15);
      expect(run.failCount).toBe(0);
    }
  });
});
