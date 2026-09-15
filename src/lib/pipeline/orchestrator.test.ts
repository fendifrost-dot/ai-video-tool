import { describe, expect, it } from "vitest";
import { createStageAdapter } from "./adapters";
import { PipelineError } from "./errors";
import {
  advancePipeline,
  createPipelineRun,
  retryFailedStage,
  runPipelineToPause,
  setPipelineReview,
} from "./orchestrator";
import {
  embedPipelineRun,
  parsePipelineRun,
  readEmbeddedPipelineRun,
  serializePipelineRun,
} from "./persistence";
import type { ArtifactRef, PipelineClock, PipelineStageId } from "./types";

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

function seed(kind: ArtifactRef["kind"], extras: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    id: extras.id ?? `seed-${kind}`,
    kind,
    producedByStage: extras.producedByStage ?? "seed",
    producedAt: extras.producedAt ?? "2026-09-15T00:00:00.000Z",
    assetId: extras.assetId ?? `asset-${kind}`,
    ...extras,
  };
}

function handler(stageId: PipelineStageId, kind: ArtifactRef["kind"]) {
  return createStageAdapter(stageId, async () => ({
    artifacts: [
      {
        id: `out-${kind}`,
        kind,
        producedByStage: stageId,
        producedAt: "2026-09-15T00:00:01.000Z",
        assetId: `asset-${kind}`,
      },
    ],
    metadata: { adapter: "test-fixture", paidCalls: false },
  }));
}

describe("createPipelineRun import / skip", () => {
  it("imports every stage when seed already has produced artifacts", () => {
    const run = createPipelineRun(
      {
        projectId: "proj-1",
        seedArtifacts: [
          seed("source_master"),
          seed("generation_still"),
          seed("repaired_still_logo_chest"),
          seed("repaired_still_sleeve_panel"),
          seed("propagation_frames"),
          seed("original_master_composite"),
          seed("branded_composite"),
          seed("evaluation_report"),
          seed("export_package"),
        ],
      },
      testClock(),
    );
    expect(run.status).toBe("succeeded");
    expect(run.stages.ingest.status).toBe("succeeded");
    expect(run.stages.ingest.provenance[0]?.source).toBe("imported_from_lane");
    expect(run.stages.review_export.status).toBe("succeeded");
  });

  it("skips generation when a source still already satisfies keyframe repair", () => {
    const run = createPipelineRun(
      {
        projectId: "proj-1",
        seedArtifacts: [seed("source_master"), seed("source_still")],
      },
      testClock(),
    );
    expect(run.stages.ingest.status).toBe("succeeded");
    expect(run.stages.generation.status).toBe("skipped");
    expect(run.stages.keyframe_repair.status).toBe("pending");
  });

  it("does not invoke paid generation when only a master is seeded", async () => {
    const run = createPipelineRun(
      { projectId: "proj-1", seedArtifacts: [seed("source_master")] },
      testClock(),
    );
    const next = await runPipelineToPause(run, {}, testClock());
    expect(next.stages.generation.status).toBe("failed");
    expect(next.stages.generation.lastError?.code).toBe("paid_generation_forbidden");
    expect(next.stages.generation.lastError?.classification).toBe("gate");
  });
});

describe("gates, retry, and plug-in handlers", () => {
  it("holds temporal propagation at needs_review until the still is approved", async () => {
    const clock = testClock();
    let run = createPipelineRun(
      {
        projectId: "proj-1",
        seedArtifacts: [seed("source_master"), seed("source_still")],
      },
      clock,
    );
    run = await runPipelineToPause(
      run,
      {
        adapters: {
          keyframe_repair: handler("keyframe_repair", "repaired_still_logo_chest"),
          sleeve_garment_repair: handler("sleeve_garment_repair", "repaired_still_sleeve_panel"),
        },
      },
      clock,
    );
    expect(run.stages.keyframe_repair.status).toBe("succeeded");
    expect(run.stages.sleeve_garment_repair.status).toBe("succeeded");
    expect(run.stages.temporal_propagation.status).toBe("needs_review");
    expect(run.status).toBe("needs_review");

    run = setPipelineReview(run, { stillRepairApproved: true }, clock);
    run = await runPipelineToPause(
      run,
      {
        adapters: {
          temporal_propagation: handler("temporal_propagation", "propagation_frames"),
        },
      },
      clock,
    );
    expect(run.stages.temporal_propagation.status).toBe("succeeded");
    expect(run.stages.original_master_reconstruction.status).toBe("blocked");
    expect(run.status).toBe("blocked");
  });

  it("retries a retryable adapter failure then succeeds", async () => {
    const clock = testClock();
    let attempts = 0;
    const flaky = createStageAdapter("keyframe_repair", async () => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error("transient fal");
        err.name = "FalRunError";
        throw err;
      }
      return {
        artifacts: [seed("repaired_still_logo_chest", { producedByStage: "keyframe_repair" })],
      };
    });
    let run = createPipelineRun(
      { projectId: "proj-1", seedArtifacts: [seed("source_master"), seed("source_still")] },
      clock,
    );
    run = await advancePipeline(run, { adapters: { keyframe_repair: flaky } }, clock);
    expect(run.stages.keyframe_repair.status).toBe("retrying");
    expect(run.stages.keyframe_repair.failures).toHaveLength(1);
    expect(run.stages.keyframe_repair.nextRetryAt).toBeTruthy();

    run = await retryFailedStage(run, "keyframe_repair", { adapters: { keyframe_repair: flaky } }, clock);
    expect(run.stages.keyframe_repair.status).toBe("succeeded");
    expect(run.stages.keyframe_repair.attempt).toBe(2);
    expect(run.stages.keyframe_repair.provenance.some((p) => p.source === "executed")).toBe(true);
    expect(attempts).toBe(2);
  });

  it("does not retry missing inputs", async () => {
    const clock = testClock();
    let run = createPipelineRun({ projectId: "proj-1", seedArtifacts: [seed("source_master")] }, clock);
    // Force keyframe_repair ready without its still by skipping generation via a fixture that fails closed.
    run = {
      ...run,
      stages: {
        ...run.stages,
        generation: { ...run.stages.generation, status: "skipped" },
        keyframe_repair: { ...run.stages.keyframe_repair, status: "pending" },
      },
    };
    run = await advancePipeline(run, {}, clock);
    expect(run.stages.keyframe_repair.status).toBe("failed");
    expect(run.stages.keyframe_repair.lastError?.classification).toBe("input");
    expect(run.stages.keyframe_repair.lastError?.retryable).toBe(false);
  });

  it("blocks downstream when an upstream stage fails terminally", async () => {
    const clock = testClock();
    const boom = createStageAdapter("keyframe_repair", async () => {
      throw new PipelineError("repair_broke", "lane fixture failed", {
        retryable: false,
        classification: "adapter",
      });
    });
    let run = createPipelineRun(
      { projectId: "proj-1", seedArtifacts: [seed("source_master"), seed("source_still")] },
      clock,
    );
    run = await runPipelineToPause(run, { adapters: { keyframe_repair: boom } }, clock);
    expect(run.stages.keyframe_repair.status).toBe("failed");
    run = await advancePipeline(run, {}, clock);
    expect(run.stages.sleeve_garment_repair.status).toBe("blocked");
    expect(run.stages.sleeve_garment_repair.lastError?.classification).toBe("dependency");
  });
});

describe("persistence", () => {
  it("round-trips a run document", () => {
    const run = createPipelineRun(
      {
        projectId: "proj-1",
        seedArtifacts: [seed("source_master"), seed("source_still")],
        reviews: { stillRepairApproved: false },
      },
      testClock(),
    );
    const parsed = parsePipelineRun(serializePipelineRun(run));
    expect(parsed.id).toBe(run.id);
    expect(parsed.stages.generation.status).toBe("skipped");
    const embedded = embedPipelineRun({ extract_status: "ready" }, parsed);
    expect(readEmbeddedPipelineRun(embedded)?.projectId).toBe("proj-1");
  });

  it("rejects an unsupported contract version", () => {
    const run = createPipelineRun({ projectId: "proj-1" }, testClock());
    expect(() => parsePipelineRun({ ...run, contractVersion: "0.0.0" })).toThrow(
      /pipeline_document_unsupported/,
    );
  });
});
