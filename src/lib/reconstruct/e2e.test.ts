import { describe, expect, it } from "vitest";
import { liveWiringFixturePack } from "./fixtures/liveWiringFixture";
import {
  RECONSTRUCT_E2E_VERSION,
  consumeTemporalJobsFromPropagateResult,
  packFromTemporalJobs,
  runReconstructE2e,
} from "./e2e";
import {
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID,
  CLEARED_CHEST_ASSET_ID,
} from "./canonicalLineage";

function fixturePropagateJson() {
  const pack = liveWiringFixturePack();
  return {
    ok: true,
    paidCalls: false,
    grokPerFrame: false,
    jobs: pack.temporalJobs.map((job) => ({
      kind: job.kind,
      sourceAssetId: job.sourceAssetId,
      frames: job.frames.map((fr) => ({
        index: fr.index,
        width: fr.width,
        height: fr.height,
        mask: Array.from(fr.mask),
        confidence: fr.confidence,
        reanchorRecommended: fr.reanchorRecommended === true,
      })),
    })),
  };
}

describe("consumeTemporalJobsFromPropagateResult", () => {
  it("parses live-shaped job JSON without importing temporal authorize", () => {
    const consumed = consumeTemporalJobsFromPropagateResult(fixturePropagateJson());
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    expect(consumed.jobs).toHaveLength(3);
    expect(consumed.jobs.map((j) => j.kind)).toEqual(["chest", "sleeve_left", "sleeve_right"]);
    expect(consumed.jobs[0]?.sourceAssetId).toBe(CLEARED_CHEST_ASSET_ID);
  });

  it("rejects empty jobs", () => {
    const consumed = consumeTemporalJobsFromPropagateResult({ ok: true, jobs: [] });
    expect(consumed.ok).toBe(false);
  });
});

describe("runReconstructE2e", () => {
  it("refuses without explicitArm", () => {
    const result = runReconstructE2e({ allowFixtureTemporal: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.paidCalls).toBe(false);
    expect(result.grokPerFrame).toBe(false);
    expect(result.code).toBe("explicit_arm_required");
  });

  it("refuses live path without temporal jobs (no silent fixture)", () => {
    const result = runReconstructE2e({ explicitArm: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("temporal_jobs_required");
  });

  it("reconstructs the $0 fixture pack when allowFixtureTemporal", () => {
    const result = runReconstructE2e({ explicitArm: true, allowFixtureTemporal: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.e2eVersion).toBe(RECONSTRUCT_E2E_VERSION);
    expect(result.source).toBe("fixture_temporal_jobs");
    expect(result.paidCalls).toBe(false);
    expect(result.grokPerFrame).toBe(false);
    expect(result.sam3LiveFetch).toBe(false);
    expect(result.edgeFunction).toBeNull();
    expect(result.projectId).toBe(CANONICAL_PROJECT_ID);
    expect(result.masterClipAssetId).toBe(CANONICAL_MASTER_CLIP_ID);
    expect(result.clip.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(result.clip.frames.some((f) => f.temporalUsed)).toBe(true);
  });

  it("composes live-shaped temporal JSON onto original-master stand-in frames", () => {
    const result = runReconstructE2e({
      explicitArm: true,
      temporalPropagateResult: fixturePropagateJson(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("live_temporal_jobs");
    expect(result.paidCalls).toBe(false);
    expect(result.clip.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(result.temporalJobCount).toBe(3);
    expect(result.frameCount).toBe(4);
  });
});

describe("packFromTemporalJobs", () => {
  it("sizes unique original frames to the temporal raster", () => {
    const consumed = consumeTemporalJobsFromPropagateResult(fixturePropagateJson());
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    const pack = packFromTemporalJobs(consumed.jobs);
    expect(pack.width).toBe(32);
    expect(pack.height).toBe(24);
    expect(pack.originalFrames).toHaveLength(4);
  });
});
