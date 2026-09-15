import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getStageDefinition } from "./contract";
import { CLEARED_CHEST_STILL, isClearedChestArtifact } from "./chest";
import {
  createChestRepairHandler,
  type ChestRepairClient,
  type ChestRepairClientResult,
} from "./chestAdapter";
import type { StageExecutionContext } from "./adapters";
import type { ArtifactRef } from "./types";
import { PipelineError } from "./errors";

function still(extras: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    id: "seed-source_still",
    kind: "source_still",
    assetId: CLEARED_CHEST_STILL.cleanStillAssetId,
    producedByStage: "seed",
    producedAt: CLEARED_CHEST_STILL.createdAtUtc,
    lanePayload: {
      wardrobeFeatureId: CLEARED_CHEST_STILL.wardrobeFeatureId,
      logoZoneQuad: CLEARED_CHEST_STILL.requestedBandQuadNorm,
    },
    ...extras,
  };
}

function chest(extras: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    id: "seed-repaired_still_logo_chest",
    kind: "repaired_still_logo_chest",
    assetId: CLEARED_CHEST_STILL.assetId,
    bucket: CLEARED_CHEST_STILL.storedBucket,
    path: CLEARED_CHEST_STILL.storedPath,
    producedByStage: "keyframe_repair",
    producedAt: CLEARED_CHEST_STILL.createdAtUtc,
    lanePayload: {
      repairMethodVersion: CLEARED_CHEST_STILL.repairMethodVersion,
      gate: "CLEARED",
    },
    ...extras,
  };
}

function ctx(inputs: ArtifactRef[]): StageExecutionContext {
  return {
    stageId: "keyframe_repair",
    definition: getStageDefinition("keyframe_repair"),
    inputs,
    attempt: 1,
    projectId: CLEARED_CHEST_STILL.projectId,
    runId: "run-1",
    reviews: {},
  };
}

function okResult(overrides: Partial<ChestRepairClientResult> = {}): ChestRepairClientResult {
  return {
    stage: "logo_chest",
    assetId: "fresh-unscored-chest",
    storedBucket: "project-references",
    storedPath: "path/fresh.png",
    previewUrl: null,
    repair: { repair_method_version: CLEARED_CHEST_STILL.repairMethodVersion },
    temporalTrackingEnabled: false,
    hardStop: "Still-first gate only.",
    ...overrides,
  };
}

describe("chest repair adapter", () => {
  it("imports the CLEARED 1m artifact without calling the query client", async () => {
    const client = vi.fn(async () => okResult());
    const handler = createChestRepairHandler({ client });
    const result = await handler(ctx([still(), chest()]));
    expect(client).not.toHaveBeenCalled();
    expect(result.artifacts[0]?.assetId).toBe(CLEARED_CHEST_STILL.assetId);
    expect(result.metadata?.gate).toBe("CLEARED");
    expect(isClearedChestArtifact(result.artifacts[0]!)).toBe(true);
  });

  it("calls the query client with stage logo_chest only", async () => {
    const calls: Parameters<ChestRepairClient>[0][] = [];
    const client: ChestRepairClient = async (input) => {
      calls.push(input);
      return okResult({ assetId: CLEARED_CHEST_STILL.assetId });
    };
    const handler = createChestRepairHandler({ client });
    const result = await handler(ctx([still()]));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      projectId: CLEARED_CHEST_STILL.projectId,
      stillAssetId: CLEARED_CHEST_STILL.cleanStillAssetId,
      wardrobeFeatureId: CLEARED_CHEST_STILL.wardrobeFeatureId,
      stage: "logo_chest",
    });
    expect(calls[0]?.stage).toBe("logo_chest");
    expect(result.artifacts[0]?.kind).toBe("repaired_still_logo_chest");
    expect(result.metadata?.gate).toBe("CLEARED");
  });

  it("marks a non-canonical live output UNSCORED", async () => {
    const handler = createChestRepairHandler({
      client: async () => okResult(),
    });
    const result = await handler(ctx([still()]));
    expect(result.artifacts[0]?.assetId).toBe("fresh-unscored-chest");
    expect(result.metadata?.gate).toBe("UNSCORED");
    expect(result.artifacts[0]?.lanePayload?.temporalTrackingEnabled).toBe(false);
  });

  it("fails closed when no client is bound", async () => {
    const handler = createChestRepairHandler();
    await expect(handler(ctx([still()]))).rejects.toMatchObject({
      code: "chest_query_client_required",
    });
  });

  it("rejects a sleeve_panel result from the chest adapter", async () => {
    const handler = createChestRepairHandler({
      client: async () => okResult({ stage: "sleeve_panel" }),
    });
    await expect(handler(ctx([still()]))).rejects.toBeInstanceOf(PipelineError);
    await expect(handler(ctx([still()]))).rejects.toMatchObject({ code: "chest_stage_mismatch" });
  });

  it("classifies WORKER_RESOURCE_LIMIT as retryable", async () => {
    const handler = createChestRepairHandler({
      client: async () => {
        throw new Error("http_546: WORKER_RESOURCE_LIMIT");
      },
    });
    await expect(handler(ctx([still()]))).rejects.toMatchObject({
      code: "chest_query_failed",
      retryable: true,
      classification: "timeout",
    });
  });
});

describe("pipeline chest bind isolation", () => {
  it("binds the query client without importing paint modules", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/pipeline/chestQueryAdapter.ts"), "utf8");
    expect(src).toContain("callArchitectureCStillRepair");
    expect(src).toContain('stage: "logo_chest"');
    expect(src).not.toContain("logoComposite");
    expect(src).not.toContain("placementEngine");
    expect(src).not.toContain("sleevePanel");
    expect(src).not.toContain("architecture-c-still-repair-proxy");
  });
});
