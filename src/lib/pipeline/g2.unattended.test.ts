import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStageAdapter } from "./adapters";
import {
  CANONICAL_YSL_ICE_ON,
  SECOND_EXISTING_V2_EDITED_CLIP,
  bindCatalog,
  createBoundPipelineRun,
  secondClipPortabilityDesign,
} from "./catalog";
import { CLEARED_CHEST_STILL } from "./chest";
import {
  ENCODE_CONTRACT,
  EVALUATOR_CONTRACT,
  consumeEvaluatorReport,
  createConsumedEncodeHandler,
  createConsumedEvaluatorHandler,
} from "./consumedContracts";
import { STAGE_DEFINITION_LIST } from "./contract";
import { nextCompatibleStages } from "./handoff";
import { G2_REQUIRED_STATES, lifecycleFromStatus } from "./lifecycle";
import { LANE_G2_DEPLOY_NEEDS, LANE_G2_WORK_ORDER } from "./ownership";
import { parsePipelineRun, serializePipelineRun } from "./persistence";
import { CLEARED_SLEEVE_STILL } from "./sleeve";
import { STAGE_VERSIONS } from "./stageVersion";
import { runUnattendedPipeline, stageGraphSnapshot } from "./unattended";
import type { ArtifactRef, PipelineClock } from "./types";

function testClock(): PipelineClock {
  let t = Date.parse("2026-09-16T00:00:00.000Z");
  let n = 0;
  return {
    now: () => {
      t += 1000;
      return new Date(t).toISOString();
    },
    createId: () => {
      n += 1;
      return `g2-${n}`;
    },
  };
}

function reportArtifact(): ArtifactRef {
  return {
    id: "eval-report-1",
    kind: "evaluation_report",
    producedByStage: "automated_evaluation",
    producedAt: "2026-09-16T00:00:01.000Z",
    lanePayload: {
      schemaVersion: EVALUATOR_CONTRACT.specVersion,
      verdict: "PASS",
      passCount: 9,
      failCount: 0,
      paidCalls: false,
      stillGoldensReopened: false,
      source: "fixture_temporal_jobs",
      frameCount: 5,
    },
  };
}

function encodedMp4(): ArtifactRef {
  return {
    id: "encode-1",
    kind: "encoded_mp4",
    assetId: "lane-h-pointer-not-owned",
    mimeType: "video/mp4",
    producedByStage: "review_export",
    producedAt: "2026-09-16T00:00:02.000Z",
    lanePayload: { ownerLane: "H", paidCalls: false, notClaimed: ENCODE_CONTRACT.notClaimed },
  };
}

describe("G2 lifecycle + stage graph", () => {
  it("exposes the six required product states", () => {
    expect([...G2_REQUIRED_STATES]).toEqual([
      "queued",
      "running",
      "passed",
      "failed",
      "blocked",
      "retryable",
    ]);
    expect(lifecycleFromStatus("pending")).toBe("queued");
    expect(lifecycleFromStatus("succeeded")).toBe("passed");
    expect(lifecycleFromStatus("skipped")).toBe("passed");
    expect(lifecycleFromStatus("retrying")).toBe("retryable");
    expect(lifecycleFromStatus("needs_review")).toBe("blocked");
    expect(LANE_G2_WORK_ORDER.issue).toBe(109);
    expect(LANE_G2_WORK_ORDER.parentIssue).toBe(102);
    expect(LANE_G2_WORK_ORDER.paidCalls).toBe(false);
    expect(LANE_G2_DEPLOY_NEEDS.frontendPublish).toBe(false);
    expect([...LANE_G2_DEPLOY_NEEDS.edgeRedeploy]).toEqual([]);
  });

  it("pins a consume-only stage version on every contract stage", () => {
    for (const def of STAGE_DEFINITION_LIST) {
      expect(def.stageVersion).toBe(STAGE_VERSIONS[def.id]);
      expect(def.stageVersion.length).toBeGreaterThan(0);
    }
    const snap = stageGraphSnapshot();
    expect(snap.order).toEqual([
      "ingest",
      "generation",
      "keyframe_repair",
      "sleeve_garment_repair",
      "temporal_propagation",
      "original_master_reconstruction",
      "deterministic_branding",
      "automated_evaluation",
      "review_export",
    ]);
    expect(nextCompatibleStages("keyframe_repair")).toEqual(["sleeve_garment_repair"]);
    expect(nextCompatibleStages("sleeve_garment_repair")).toEqual(["temporal_propagation"]);
  });
});

describe("G2 unattended canonical catalog", () => {
  it("advances CLEARED chest+sleeve without per-stage dispatch, then blocks on still review", async () => {
    const clock = testClock();
    const run = createBoundPipelineRun({ catalog: CANONICAL_YSL_ICE_ON }, clock);
    expect(run.paidCalls).toBe(false);
    expect(run.catalogId).toBe("canonical-ysl-ice-on");
    expect(run.projectId).toBe(CLEARED_CHEST_STILL.projectId);
    expect(run.stages.keyframe_repair.lifecycle).toBe("passed");
    expect(run.stages.sleeve_garment_repair.lifecycle).toBe("passed");
    expect(run.stages.sleeve_garment_repair.stageVersion).toBe("architecture_c_sleeve_still_1c");
    expect(run.stages.keyframe_repair.stageVersion).toBe("architecture_c_still_repair_1m");
    expect(run.handoffs.some((h) => h.fromStage === "keyframe_repair" && h.toStage === "sleeve_garment_repair")).toBe(
      true,
    );

    const result = await runUnattendedPipeline(run, {}, clock);
    expect(result.paidCalls).toBe(false);
    expect(result.pauseReason).toBe("blocked");
    expect(result.lifecycles.temporal_propagation).toBe("blocked");
    expect(result.run.stages.temporal_propagation.retryReason).toMatch(/still/i);
    expect(result.run.reviews.stillRepairApproved).toBe(false);
    expect(result.lifecycles.sleeve_garment_repair).toBe("passed");
    expect(result.run.artifacts.some((a) => a.assetId === CLEARED_SLEEVE_STILL.assetId)).toBe(true);
  });

  it("hands artifacts through remaining stages when reviews + E2/H contracts are imported", async () => {
    const clock = testClock();
    let run = createBoundPipelineRun(
      {
        catalog: CANONICAL_YSL_ICE_ON,
        reviews: {
          stillRepairApproved: true,
          masterCompositeAuthorized: true,
          exportApproved: true,
        },
        extraSeedArtifacts: [
          {
            kind: "propagation_frames",
            producedByStage: "temporal_propagation",
            lanePayload: { source: "imported_from_lane", paidCalls: false },
          },
          {
            kind: "original_master_composite",
            producedByStage: "original_master_reconstruction",
            lanePayload: { source: "imported_from_lane", e2eVersion: "1.0.0" },
          },
          {
            kind: "branded_composite",
            producedByStage: "deterministic_branding",
          },
          reportArtifact(),
          encodedMp4(),
        ],
      },
      clock,
    );
    const result = await runUnattendedPipeline(
      run,
      {
        adapters: {
          automated_evaluation: createStageAdapter(
            "automated_evaluation",
            createConsumedEvaluatorHandler(),
          ),
          review_export: createStageAdapter("review_export", createConsumedEncodeHandler()),
        },
      },
      clock,
    );
    expect(result.pauseReason).toBe("passed_complete");
    expect(result.run.status).toBe("succeeded");
    expect(result.lifecycles.automated_evaluation).toBe("passed");
    expect(result.run.stages.automated_evaluation.evaluatorResult?.verdict).toBe("PASS");
    expect(result.run.stages.automated_evaluation.evaluatorResult?.stillGoldensReopened).toBe(false);
    expect(result.run.stages.automated_evaluation.evaluatorResult?.paidCalls).toBe(false);
    expect(result.run.artifacts.some((a) => a.kind === "encoded_mp4")).toBe(true);
    expect(result.run.paidCalls).toBe(false);
  });
});

describe("G2 second-clip portability", () => {
  it("binds the existing V2 edited clip through the same graph with no clip-specific orchestrator branch", async () => {
    const design = secondClipPortabilityDesign();
    expect(design.paidCalls).toBe(false);
    expect(design.catalogs).toEqual(["canonical-ysl-ice-on", "ysl-ice-on-v2-edited-clip"]);
    expect(design.sharedModules).toContain("src/lib/pipeline/orchestrator.ts");
    expect(design.idAwareModules).toContain("src/lib/pipeline/catalog.ts");

    const clock = testClock();
    const bound = bindCatalog({ catalog: SECOND_EXISTING_V2_EDITED_CLIP });
    expect(bound.projectId).toBe(CANONICAL_YSL_ICE_ON.projectId);
    expect(bound.seedArtifacts.some((a) => a.assetId === SECOND_EXISTING_V2_EDITED_CLIP.clipId)).toBe(
      true,
    );
    expect(bound.seedArtifacts.some((a) => a.assetId === CANONICAL_YSL_ICE_ON.clipId)).toBe(true);

    const run = createBoundPipelineRun({ catalog: SECOND_EXISTING_V2_EDITED_CLIP }, clock);
    expect(run.catalogId).toBe("ysl-ice-on-v2-edited-clip");
    expect(run.stages.ingest.lifecycle).toBe("passed");
    expect(run.stages.generation.lifecycle).toBe("passed");
    expect(run.stages.keyframe_repair.lifecycle).toBe("queued");
    expect(run.projectId).not.toBe("");
    expect(run.seedArtifactIds).not.toEqual(
      createBoundPipelineRun({ catalog: CANONICAL_YSL_ICE_ON }, testClock()).seedArtifactIds,
    );

    const result = await runUnattendedPipeline(run, {}, clock);
    expect(result.paidCalls).toBe(false);
    expect(result.graph.map((n) => n.stageId)).toEqual(stageGraphSnapshot().order);
    expect(result.lifecycles.keyframe_repair === "failed" || result.lifecycles.keyframe_repair === "queued").toBe(
      true,
    );
  });

  it("keeps clip ids out of the shared orchestration modules", () => {
    const root = process.cwd();
    for (const rel of [
      "src/lib/pipeline/orchestrator.ts",
      "src/lib/pipeline/unattended.ts",
      "src/lib/pipeline/handoff.ts",
      "src/lib/pipeline/lifecycle.ts",
      "src/lib/pipeline/graph.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).not.toContain("76fe7438");
      expect(src).not.toContain("9ed83c01");
      expect(src).not.toContain("f31bd0f2");
      expect(src).not.toContain("fdb86b18");
      expect(src).not.toContain("src/lib/eval/");
      expect(src).not.toContain("src/lib/reconstruct/");
      expect(src).not.toContain("sleevePanel");
      expect(src).not.toContain("logoComposite");
    }
  });
});

describe("G2 consumed E2 / H contracts", () => {
  it("stores E2 report JSON without inventing metrics", () => {
    const consumed = consumeEvaluatorReport({
      schemaVersion: "lane-e-reconstruct-video-v1",
      verdict: "PASS",
      passCount: 9,
      failCount: 0,
      paidCalls: false,
      stillGoldensReopened: false,
      frameCount: 5,
    });
    expect(consumed.verdict).toBe("PASS");
    expect(consumed.ownerLane).toBe("E2");
    expect(consumed.paidCalls).toBe(false);
    expect(consumed.stillGoldensReopened).toBe(false);
    expect(consumeEvaluatorReport("nope").verdict).toBe("UNSCORED");
  });

  it("migrates a 1.0.0 pipeline document to 1.1.0 G2 fields", () => {
    const clock = testClock();
    const run = createBoundPipelineRun({ catalog: CANONICAL_YSL_ICE_ON }, clock);
    const legacy = JSON.parse(serializePipelineRun(run)) as Record<string, unknown>;
    legacy.contractVersion = "1.0.0";
    for (const id of Object.keys(run.stages)) {
      const stages = legacy.stages as Record<string, Record<string, unknown>>;
      delete stages[id]!.lifecycle;
      delete stages[id]!.stageVersion;
      delete stages[id]!.evaluatorResult;
      delete stages[id]!.retryReason;
    }
    delete legacy.handoffs;
    delete legacy.paidCalls;
    const migrated = parsePipelineRun(legacy);
    expect(migrated.contractVersion).toBe("1.1.0");
    expect(migrated.paidCalls).toBe(false);
    expect(migrated.stages.keyframe_repair.lifecycle).toBe("passed");
    expect(migrated.stages.keyframe_repair.stageVersion).toBe("architecture_c_still_repair_1m");
  });
});
