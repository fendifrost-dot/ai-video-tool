import { describe, expect, it } from "vitest";
import {
  CANONICAL_CLIP_FRAME_COUNT,
  CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
  CANONICAL_MASTER_CLIP_ID,
} from "../canonicalClip";
import { CLEARED_CHEST_ASSET_ID, CLEARED_SLEEVE_ASSET_ID } from "../canonicalLineage";
import {
  canonicalFullClipCleanFixture,
  canonicalFullClipDefectFixture,
  FULL_CLIP_DEFECT_WINDOWS,
} from "../fullClipFixture";
import { detectorHitAllWindows } from "./badFrames";
import {
  formatTemporalVideoQaSummary,
  runTemporalVideoQa,
  temporalVideoQaReportToJson,
} from "./report";
import { TEMPORAL_VIDEO_QA_SPEC_VERSION } from "./thresholds";

let cleanReport: ReturnType<typeof runTemporalVideoQa> | undefined;
function getCleanReport() {
  cleanReport ??= runTemporalVideoQa(canonicalFullClipCleanFixture());
  return cleanReport;
}

describe("Lane C2 temporal video QA — full canonical clip", () => {
  it(
    "PASSes the clean 241-frame stand-in with SAM-3 continuity and no paid calls",
    () => {
      const report = getCleanReport();
      expect(report.schemaVersion).toBe(TEMPORAL_VIDEO_QA_SPEC_VERSION);
      expect(report.lane).toBe("C2");
      expect(report.verdict).toBe("PASS");
      expect(report.failCount).toBe(0);
      expect(report.paidCalls).toBe(false);
      expect(report.grokPerFrame).toBe(false);
      expect(report.sam3LiveFetch).toBe(false);
      expect(report.stillGoldensReopened).toBe(false);
      expect(report.clip.id).toBe(CANONICAL_MASTER_CLIP_ID);
      expect(report.clip.canonicalIndex).toBe(CANONICAL_CLIP_KEYFRAME_FRAME_INDEX);
      expect(report.summary.frameCount).toBe(CANONICAL_CLIP_FRAME_COUNT);
      expect(report.summary.jobsScored).toBe(3);
      expect(report.summary.badFrameCount).toBe(0);
      expect(report.jobs.map((j) => j.kind)).toEqual(["chest", "sleeve_left", "sleeve_right"]);
      expect(report.jobs[0]?.sourceAssetId).toBe(CLEARED_CHEST_ASSET_ID);
      expect(report.jobs[1]?.sourceAssetId).toBe(CLEARED_SLEEVE_ASSET_ID);
      expect(report.summary.sam3Continuity.sam3LiveFetch).toBe(false);
      expect(report.summary.sam3Continuity.frameCount).toBe(241);
      expect(report.summary.sam3Continuity.minConsecutiveIou).toBeGreaterThan(0.6);
      expect(report.dispatchPath.edgeMaxFrames).toBe(24);
      expect(report.dispatchPath.fullClipFitsProxy).toBe(false);
      expect(report.yellowContracts).toContain("edge_max_frames_24_vs_canonical_241");
      expect(formatTemporalVideoQaSummary(report)).toContain("frames=241");
      expect(formatTemporalVideoQaSummary(report)).toContain("paidCalls=false");
    },
    60_000,
  );

  it(
    "auto-identifies injected occlusion / flicker / coverage / drift windows",
    () => {
      const report = runTemporalVideoQa(canonicalFullClipDefectFixture());
      expect(report.verdict).toBe("PASS");
      expect(report.paidCalls).toBe(false);
      expect(report.grokPerFrame).toBe(false);
      expect(report.summary.frameCount).toBe(241);
      expect(report.summary.badFrameCount).toBeGreaterThan(0);
      expect(report.summary.detectorHitAllInjectedWindows).toBe(true);
      expect(detectorHitAllWindows(report.badFrames, FULL_CLIP_DEFECT_WINDOWS, "chest")).toBe(
        true,
      );
      const chestReasons = new Set(
        report.badFrames.filter((f) => f.jobKind === "chest").flatMap((f) => f.reasons),
      );
      expect(chestReasons.has("sam3_discontinuity")).toBe(true);
      const json = temporalVideoQaReportToJson(report);
      expect(json.schemaVersion).toBe("temporal-video-qa-v1");
      expect(json.sam3LiveFetch).toBe(false);
      expect(Array.isArray(json.badFrames)).toBe(true);
    },
    60_000,
  );

  it("emits JSON evidence without reopening still goldens", () => {
    const report = getCleanReport();
    const json = temporalVideoQaReportToJson(report);
    expect(json.stillGoldensReopened).toBe(false);
    expect(json.notClaimed).toEqual(
      expect.arrayContaining([
        expect.stringContaining("live 1080×1920"),
        expect.stringContaining("sam3-segment-proxy"),
        expect.stringContaining("maxFrames remains 24"),
      ]),
    );
    const jobs = json.jobs as Array<{ kind: string; driftPx: number[] }>;
    expect(jobs[0]?.driftPx).toHaveLength(241);
  }, 60_000);
});
