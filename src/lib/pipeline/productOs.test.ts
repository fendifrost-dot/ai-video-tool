import { describe, expect, it } from "vitest";
import { createStageAdapter } from "./adapters";
import { CHEST_STILL_REVIEW_KEY, CLEARED_CHEST_STILL, isClearedChestArtifact } from "./chest";
import { LANE_G_DEPLOY_NEEDS, LANE_G_WORK_ORDER } from "./ownership";
import {
  createClearedChestPipelineRun,
  runPipelineToPause,
  setPipelineReview,
} from "./orchestrator";
import {
  assertProductOsStageOrder,
  createProductOsAdapters,
  productOsGraphNodes,
} from "./productOs";
import { SLEEVE_STAGE_HOOK, TEMPORAL_STAGE_HOOK } from "./stageHooks";
import type { ArtifactRef, PipelineClock } from "./types";

function testClock(): PipelineClock {
  let t = Date.parse("2026-09-15T00:00:00.000Z");
  let n = 0;
  return {
    now: () => {
      t += 1000;
      return new Date(t).toISOString();
    },
    createId: () => {
      n += 1;
      return `id-${n}`;
    },
  };
}

function sleeveOut(): ArtifactRef {
  return {
    id: "out-sleeve",
    kind: "repaired_still_sleeve_panel",
    assetId: "asset-sleeve",
    producedByStage: "sleeve_garment_repair",
    producedAt: "2026-09-15T00:00:01.000Z",
  };
}

describe("Product OS chest graph", () => {
  it("orders stages with cleared chest before sleeve and temporal stubs", () => {
    const nodes = productOsGraphNodes();
    expect(assertProductOsStageOrder()).toEqual([
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
    expect(nodes.find((n) => n.stageId === "keyframe_repair")).toMatchObject({
      integration: "cleared_chest_1m",
      ownerLane: "G",
    });
    expect(nodes.find((n) => n.stageId === "sleeve_garment_repair")).toMatchObject({
      integration: "stub_hook",
      ownerLane: "B",
      status: SLEEVE_STAGE_HOOK.code,
    });
    expect(nodes.find((n) => n.stageId === "temporal_propagation")).toMatchObject({
      integration: "stub_hook",
      ownerLane: "C",
      status: TEMPORAL_STAGE_HOOK.code,
    });
    expect(nodes.find((n) => n.stageId === "generation")?.integration).toBe("import_only");
  });

  it("seeds the CLEARED 1m chest as a first-class succeeded stage", () => {
    const run = createClearedChestPipelineRun({}, testClock());
    expect(run.projectId).toBe(CLEARED_CHEST_STILL.projectId);
    expect(run.stages.ingest.status).toBe("succeeded");
    expect(run.stages.generation.status).toBe("skipped");
    expect(run.stages.keyframe_repair.status).toBe("succeeded");
    expect(run.stages.keyframe_repair.provenance[0]?.metadata?.gate).toBe("CLEARED");
    expect(run.reviews[CHEST_STILL_REVIEW_KEY]).toBe(true);
    expect(run.reviews.stillRepairApproved).toBe(false);
    expect(run.stages.sleeve_garment_repair.status).toBe("pending");
    const chest = run.artifacts.find((a) => a.kind === "repaired_still_logo_chest");
    expect(chest?.assetId).toBe(CLEARED_CHEST_STILL.assetId);
    expect(isClearedChestArtifact(chest!)).toBe(true);
  });

  it("hits the Lane B sleeve stub after a cleared chest, without authorizing temporal", async () => {
    const clock = testClock();
    let run = createClearedChestPipelineRun({}, clock);
    run = await runPipelineToPause(run, {}, clock);
    expect(run.stages.keyframe_repair.status).toBe("succeeded");
    expect(run.stages.sleeve_garment_repair.status).toBe("failed");
    expect(run.stages.sleeve_garment_repair.lastError?.code).toBe("sleeve_stage_stub");
    expect(run.stages.sleeve_garment_repair.lastError?.retryable).toBe(false);
    expect(run.stages.temporal_propagation.status).toBe("pending");
    expect(run.reviews.stillRepairApproved).toBe(false);
  });

  it("still requires human stillRepairApproved after sleeve is plugged", async () => {
    const clock = testClock();
    let run = createClearedChestPipelineRun({}, clock);
    run = await runPipelineToPause(
      run,
      {
        adapters: {
          sleeve_garment_repair: createStageAdapter("sleeve_garment_repair", async () => ({
            artifacts: [sleeveOut()],
            metadata: { adapter: "lane-b-fixture" },
          })),
        },
      },
      clock,
    );
    expect(run.stages.sleeve_garment_repair.status).toBe("succeeded");
    expect(run.stages.temporal_propagation.status).toBe("needs_review");
    expect(run.status).toBe("needs_review");

    run = setPipelineReview(run, { stillRepairApproved: true }, clock);
    run = await runPipelineToPause(run, {}, clock);
    expect(run.stages.temporal_propagation.status).toBe("failed");
    expect(run.stages.temporal_propagation.lastError?.code).toBe("temporal_stage_stub");
  });

  it("records work-order #77 and no edge redeploy", () => {
    expect(LANE_G_WORK_ORDER.issue).toBe(77);
    expect(LANE_G_WORK_ORDER.lineageIssue).toBe(51);
    expect(LANE_G_WORK_ORDER.parentIssue).toBe(50);
    expect(LANE_G_WORK_ORDER.chestReferenceAssetId).toBe(CLEARED_CHEST_STILL.assetId);
    expect(LANE_G_WORK_ORDER.chestGate).toBe("CLEARED");
    expect(LANE_G_DEPLOY_NEEDS.frontendPublish).toBe(false);
    expect([...LANE_G_DEPLOY_NEEDS.edgeRedeploy]).toEqual([]);
  });

  it("createProductOsAdapters keeps generation import-only", async () => {
    const adapters = createProductOsAdapters();
    await expect(
      adapters.generation.execute({
        stageId: "generation",
        definition: adapters.generation.definition,
        inputs: [],
        attempt: 1,
        projectId: "p",
        runId: "r",
        reviews: {},
      }),
    ).rejects.toMatchObject({ code: "paid_generation_forbidden" });
  });
});
