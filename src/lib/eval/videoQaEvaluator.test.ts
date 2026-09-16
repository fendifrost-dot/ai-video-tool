import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateChestStill } from "./chestVisualEvaluator";
import {
  evaluateReconstructedClip,
  RECONSTRUCT_VIDEO_EVAL_SPEC_VERSION,
} from "./reconstructVideoEvaluator";
import { evaluateVideoQa } from "./videoQaEvaluator";
import {
  formatVideoQaSummary,
  materializeVideoQaFiles,
  videoQaReportToJson,
} from "./videoQaArtifacts";
import { videoQaInputFromReconstructE2e } from "./videoQaAdapter";
import {
  happyPathMp4Input,
  incompleteMp4Input,
  insideFlickerInput,
  maskJumpInput,
  outsideLeakInput,
  repairCoverageJumpInput,
  seamFlickerInput,
  sizeMismatchInput,
  VIDEO_QA_FIXTURE_FRAMES,
} from "./videoQaFixtures";
import { VIDEO_QA_SPEC_VERSION } from "./videoQaTypes";
import { VIDEO_QA_CRITERION_ORDER } from "./videoQaCriteria";
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

describe("Lane E2 video-level QA", () => {
  it("PASSes a reconstructed MP4 fixture without reopening still goldens", () => {
    const report = evaluateVideoQa(happyPathMp4Input());
    expect(report.schemaVersion).toBe(VIDEO_QA_SPEC_VERSION);
    expect(report.verdict).toBe("PASS");
    expect(report.failCount).toBe(0);
    expect(report.paidCalls).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.blockingArtifactProducer).toBe(false);
    expect(report.claudeInvestigates).toBe("unexplained_only");
    expect(report.unexplained).toEqual([]);
    expect(report.escalate).toBeNull();
    expect(report.frameCount).toBe(VIDEO_QA_FIXTURE_FRAMES);
    expect(report.criteria.map((c) => c.id)).toEqual(VIDEO_QA_CRITERION_ORDER);
    expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("PASS");
    expect(report.criteria.find((c) => c.id === "still_goldens_not_reopened")?.verdict).toBe(
      "PASS",
    );
    expect(report.notClaimed.some((n) => n.includes("chest Stage 1m"))).toBe(true);
    expect(report.notClaimed.some((n) => n.includes("sleeve Stage 1c"))).toBe(true);
    expect(report.artifacts.crops.length).toBeGreaterThan(0);
    const json = videoQaReportToJson(report);
    expect(json.verdict).toBe("PASS");
    expect(json.paidCalls).toBe(false);
    expect(json.stillGoldensReopened).toBe(false);
    expect(formatVideoQaSummary(report)).toContain("PASS");
    const files = materializeVideoQaFiles(report);
    expect(ArrayBuffer.isView(files["report.json"])).toBe(true);
    expect(files["report.json"]!.byteLength).toBeGreaterThan(10);
    expect(Object.keys(files).some((k) => k.endsWith(".ppm"))).toBe(true);
  });

  it("returns INCOMPLETE when Lane H has produced MP4 but frames are not decoded yet", () => {
    const report = evaluateVideoQa(incompleteMp4Input());
    expect(report.verdict).toBe("INCOMPLETE");
    expect(report.blockingArtifactProducer).toBe(false);
    expect(report.awaiting).toContain("decoded_frames");
    expect(report.failCount).toBe(0);
    expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("SKIP");
  });

  it("returns INCOMPLETE not FAIL when reconstructed_mp4 is claimed but not produced", () => {
    const leak = outsideLeakInput();
    const report = evaluateVideoQa({
      ...leak,
      artifact: {
        ...leak.artifact,
        kind: "reconstructed_mp4",
        mp4: { produced: false },
      },
    });
    expect(report.verdict).toBe("INCOMPLETE");
    expect(report.failCount).toBe(0);
    expect(report.awaiting).toContain("mp4");
    expect(report.blockingArtifactProducer).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.escalate).toBeNull();
    expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("SKIP");
    expect(report.criteria.find((c) => c.id === "original_master_preservation")?.verdict).toBe(
      "SKIP",
    );
    expect(report.criteria.find((c) => c.id === "temporal_jitter_drift")?.verdict).toBe("SKIP");
    expect(report.criteria.find((c) => c.id === "unintended_outside_region_change")?.verdict).toBe(
      "SKIP",
    );
    expect(formatVideoQaSummary(report)).toMatch(/INCOMPLETE/);
    expect(formatVideoQaSummary(report)).toMatch(/fail=0/);
    expect(formatVideoQaSummary(report)).toMatch(/mp4=none/);
  });

  it("still FAILs frames-only leaks when no MP4 object is attached", () => {
    const leak = outsideLeakInput();
    const report = evaluateVideoQa({
      ...leak,
      artifact: {
        ...leak.artifact,
        kind: "reconstructed_frames",
        mp4: undefined,
      },
    });
    expect(report.verdict).toBe("FAIL");
    expect(report.awaiting).not.toContain("mp4");
    expect(report.criteria.find((c) => c.id === "original_master_preservation")?.verdict).toBe(
      "FAIL",
    );
    expect(report.stillGoldensReopened).toBe(false);
  });

  it("FAILs unintended outside-region change and escalates without reopening stills", () => {
    const report = evaluateVideoQa(outsideLeakInput());
    expect(report.verdict).toBe("FAIL");
    expect(report.criteria.find((c) => c.id === "unintended_outside_region_change")?.verdict).toBe(
      "FAIL",
    );
    expect(report.criteria.find((c) => c.id === "original_master_preservation")?.verdict).toBe(
      "FAIL",
    );
    expect(report.escalate?.kind).toBe("architectural_blocker");
    expect(report.escalate?.stillGoldensReopened).toBe(false);
    expect(report.unexplained).toEqual([]);
    expect(report.stillGoldensReopened).toBe(false);
  });

  it("FAILs mask discontinuity when the authorized region jumps", () => {
    const report = evaluateVideoQa(maskJumpInput());
    expect(report.verdict).toBe("FAIL");
    expect(report.criteria.find((c) => c.id === "mask_discontinuity")?.verdict).toBe("FAIL");
    expect(report.temporal.maskXorMax).toBeGreaterThan(0.25);
  });

  it("FAILs temporal jitter when the authorized interior flickers", () => {
    const report = evaluateVideoQa(insideFlickerInput());
    expect(report.verdict).toBe("FAIL");
    expect(report.criteria.find((c) => c.id === "temporal_jitter_drift")?.verdict).toBe("FAIL");
    expect(report.temporal.insideMeanAbsLumaDelta).toBeGreaterThan(40);
  });

  it("FAILs seam/edge instability when the mask perimeter oscillates", () => {
    const report = evaluateVideoQa(seamFlickerInput());
    expect(report.verdict).toBe("FAIL");
    expect(report.criteria.find((c) => c.id === "seam_edge_instability")?.verdict).toBe("FAIL");
  });

  it("FAILs per-frame repair coverage when punch-out coverage jumps", () => {
    const report = evaluateVideoQa(repairCoverageJumpInput());
    expect(report.verdict).toBe("FAIL");
    expect(report.criteria.find((c) => c.id === "per_frame_repair_coverage")?.verdict).toBe("FAIL");
  });

  it("records size mismatch as unexplained INCOMPLETE for Claude, not a visual FAIL", () => {
    const report = evaluateVideoQa(sizeMismatchInput());
    expect(report.verdict).toBe("INCOMPLETE");
    expect(report.unexplained.some((u) => u.includes("vs reconstructed"))).toBe(true);
    expect(report.claudeInvestigates).toBe("unexplained_only");
    expect(report.failCount).toBe(0);
  });

  it("does not import or invoke the chest 11-point still evaluator", () => {
    expect(typeof evaluateChestStill).toBe("function");
    const src = readFileSync(join(process.cwd(), "src/lib/eval/videoQaEvaluator.ts"), "utf8");
    expect(src).not.toMatch(/from ["'].*chestVisualEvaluator["']/);
    expect(src).not.toMatch(/\bimport\b[\s\S]*chestCriteria/);
    const report = evaluateVideoQa(happyPathMp4Input());
    expect(report.criteria.map((c) => c.id)).not.toContain(1);
    expect(report.criteria.find((c) => c.id === "still_goldens_not_reopened")?.verdict).toBe(
      "PASS",
    );
  });

  it("scores reconstruct E2E frames through the Lane H adapter with MP4 provenance", () => {
    const e2e = runReconstructE2e({
      explicitArm: true,
      temporalPropagateResult: fixturePropagateJson(),
    });
    expect(e2e.ok).toBe(true);
    if (!e2e.ok) return;
    const arch = evaluateReconstructedClip(e2e);
    expect(arch.schemaVersion).toBe(RECONSTRUCT_VIDEO_EVAL_SPEC_VERSION);
    const input = videoQaInputFromReconstructE2e(e2e, {
      produced: true,
      artifactId: "lane-h-reconstructed.mp4",
      path: "artifacts/reconstructed.mp4",
      mimeType: "video/mp4",
      byteLength: 24,
    });
    const report = evaluateVideoQa(input);
    expect(report.paidCalls).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.blockingArtifactProducer).toBe(false);
    expect(report.frameCount).toBe(e2e.frameCount);
    expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("PASS");
    expect(report.criteria.find((c) => c.id === "original_master_preservation")?.verdict).toBe(
      "PASS",
    );
    expect(report.unexplained).toEqual([]);
    expect(report.verdict).toBe("PASS");
  });

  it("runtime-rejects paidCalls !== false", () => {
    const input = happyPathMp4Input();
    const report = evaluateVideoQa({ ...input, paidCalls: true as unknown as false });
    expect(report.criteria.find((c) => c.id === "paid_calls_false")?.verdict).toBe("FAIL");
    expect(report.verdict).toBe("FAIL");
  });
});

describe("Lane E2 JSON contract", () => {
  it("emits a stable serializable report Lane H can persist", () => {
    const json = videoQaReportToJson(evaluateVideoQa(happyPathMp4Input()));
    expect(Object.keys(json)).toEqual([
      "schemaVersion",
      "verdict",
      "passCount",
      "failCount",
      "skipCount",
      "paidCalls",
      "stillGoldensReopened",
      "blockingArtifactProducer",
      "claudeInvestigates",
      "awaiting",
      "frameCount",
      "artifactKind",
      "mp4",
      "criteria",
      "perFrame",
      "temporal",
      "artifacts",
      "unexplained",
      "escalate",
      "notClaimed",
      "provenance",
    ]);
    expect(json.schemaVersion).toBe("lane-e2-video-qa-v1");
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    expect(json.criteria.every((c) => typeof c.id === "string")).toBe(true);
  });
});
