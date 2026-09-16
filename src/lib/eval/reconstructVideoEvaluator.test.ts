import { describe, expect, it } from "vitest";
import { evaluateChestStill } from "./chestVisualEvaluator";
import {
  RECONSTRUCT_VIDEO_EVAL_SPEC_VERSION,
  evaluateReconstructE2eResult,
  evaluateReconstructedClip,
  formatReconstructVideoSummary,
  reconstructVideoReportToJson,
} from "./reconstructVideoEvaluator";
import { runReconstructE2e } from "@/lib/reconstruct/e2e";
import { liveWiringFixturePack } from "@/lib/reconstruct/fixtures/liveWiringFixture";

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

describe("Lane E reconstructed-video evaluator", () => {
  it("PASSes the $0 CLEARED-lineage E2E fixture without reopening still goldens", () => {
    const e2e = runReconstructE2e({
      explicitArm: true,
      temporalPropagateResult: fixturePropagateJson(),
    });
    expect(e2e.ok).toBe(true);
    if (!e2e.ok) return;
    const report = evaluateReconstructedClip(e2e);
    expect(report.schemaVersion).toBe(RECONSTRUCT_VIDEO_EVAL_SPEC_VERSION);
    expect(report.verdict).toBe("PASS");
    expect(report.failCount).toBe(0);
    expect(report.paidCalls).toBe(false);
    expect(report.grokPerFrame).toBe(false);
    expect(report.sam3LiveFetch).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.escalate).toBeNull();
    expect(report.criteria.map((c) => c.id)).not.toContain(1);
    const json = reconstructVideoReportToJson(report);
    expect(json.verdict).toBe("PASS");
    expect(formatReconstructVideoSummary(report)).toBe(
      "RECONSTRUCT-1 PASS 9/9 frames=4 paidCalls=false grokPerFrame=false.",
    );
  });

  it("FAILs authorization-blocked E2E without escalating a still-gate reopen", () => {
    const e2e = runReconstructE2e({ allowFixtureTemporal: true });
    const report = evaluateReconstructE2eResult(e2e);
    expect(report.verdict).toBe("FAIL");
    expect(report.escalate).toBeNull();
    expect(report.paidCalls).toBe(false);
    expect(report.source).toBe("e2e_failed");
  });

  it("does not import or invoke the chest 11-point still evaluator on reconstructed frames", () => {
    expect(typeof evaluateChestStill).toBe("function");
    const e2e = runReconstructE2e({
      explicitArm: true,
      temporalPropagateResult: fixturePropagateJson(),
    });
    expect(e2e.ok).toBe(true);
    if (!e2e.ok) return;
    const report = evaluateReconstructedClip(e2e);
    expect(report.criteria.find((c) => c.id === "still_goldens_not_reopened")?.verdict).toBe(
      "PASS",
    );
    expect(report.notClaimed.some((n) => n.includes("chest Stage 1m"))).toBe(true);
    expect(report.notClaimed.some((n) => n.includes("sleeve Stage 1c"))).toBe(true);
  });
});
