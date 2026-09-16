/**
 * Product OS chest (logo_chest) stage adapter.
 *
 * Calls the existing Architecture C still-repair **query client** when a live
 * run is requested. Does not import paint / placement / proxy internals.
 */

import { importedArtifactsForStage } from "./adapters";
import type { StageExecutionContext, StageHandler, StageHandlerResult } from "./adapters";
import {
  CHEST_STILL_REVIEW_KEY,
  CLEARED_CHEST_STILL,
  chestClearedProvenanceMetadata,
  isClearedChestArtifact,
} from "./chest";
import { PipelineError } from "./errors";
import type { ArtifactRef } from "./types";

export type ChestRepairClientInput = {
  projectId: string;
  stillAssetId: string;
  wardrobeFeatureId: string;
  stage: "logo_chest";
  logoZoneQuad?: readonly (readonly [number, number])[];
};

export type ChestRepairClientResult = {
  stage: string;
  assetId: string;
  storedBucket: string;
  storedPath: string;
  previewUrl: string | null;
  repair: Record<string, unknown>;
  temporalTrackingEnabled: false;
  hardStop: string;
};

export type ChestRepairClient = (input: ChestRepairClientInput) => Promise<ChestRepairClientResult>;

function pickStill(artifacts: ArtifactRef[]): ArtifactRef | undefined {
  return (
    artifacts.find((a) => a.kind === "source_still") ??
    artifacts.find((a) => a.kind === "generation_still")
  );
}

function asQuad(value: unknown): readonly (readonly [number, number])[] | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  if (
    !value.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((n) => typeof n === "number" && Number.isFinite(n)),
    )
  ) {
    return undefined;
  }
  return value as readonly (readonly [number, number])[];
}

function repairMethodVersion(repair: Record<string, unknown>): string | null {
  const v = repair.repair_method_version;
  return typeof v === "string" ? v : null;
}

function isRetryableChestQueryMessage(message: string): boolean {
  return /WORKER_RESOURCE_LIMIT|\b546\b|http_5\d\d/i.test(message);
}

export function chestArtifactFromClientResult(
  result: ChestRepairClientResult,
  producedAt: string,
): ArtifactRef {
  if (result.temporalTrackingEnabled !== false) {
    throw new PipelineError(
      "chest_temporal_enabled",
      "Architecture C still-first hard stop: temporalTrackingEnabled must stay false on chest output.",
      { retryable: false, classification: "gate" },
    );
  }
  if (result.stage !== "logo_chest") {
    throw new PipelineError(
      "chest_stage_mismatch",
      `Chest adapter expected stage logo_chest, got ${result.stage}.`,
      { retryable: false, classification: "adapter", details: { stage: result.stage } },
    );
  }
  const version = repairMethodVersion(result.repair);
  const cleared = result.assetId === CLEARED_CHEST_STILL.assetId;
  return {
    id: `chest-${result.assetId}`,
    kind: "repaired_still_logo_chest",
    assetId: result.assetId,
    bucket: result.storedBucket,
    path: result.storedPath,
    mimeType: "image/png",
    producedByStage: "keyframe_repair",
    producedAt,
    lanePayload: {
      stage: result.stage,
      repairMethodVersion: version,
      gate: cleared ? CLEARED_CHEST_STILL.gate : "UNSCORED",
      score: cleared ? CLEARED_CHEST_STILL.score : undefined,
      temporalTrackingEnabled: result.temporalTrackingEnabled,
      hardStop: result.hardStop,
      previewUrl: result.previewUrl,
      repair: result.repair,
      [CHEST_STILL_REVIEW_KEY]: cleared,
    },
  };
}

function importChestResult(existing: ArtifactRef[]): StageHandlerResult {
  const cleared = existing.find(isClearedChestArtifact);
  const chosen = cleared ?? existing[0];
  return {
    artifacts: [chosen],
    metadata: cleared
      ? chestClearedProvenanceMetadata()
      : { source: "imported_from_lane", gate: chosen.lanePayload?.gate ?? "imported" },
  };
}

/**
 * keyframe_repair handler: prefer the CLEARED 1m artifact; otherwise call the
 * still-repair query client with stage logo_chest.
 */
export function createChestRepairHandler(opts?: { client?: ChestRepairClient }): StageHandler {
  return async (ctx: StageExecutionContext) => {
    const imported = importedArtifactsForStage(ctx.definition, ctx.inputs);
    if (imported.length > 0) return importChestResult(imported);

    if (!opts?.client) {
      throw new PipelineError(
        "chest_query_client_required",
        "Chest stage has a source still but no query client. Bind createBoundChestQueryAdapter() / createLiveProductOsAdapters() to call callArchitectureCStillRepair.",
        {
          retryable: false,
          classification: "dependency",
          details: {
            bind: "src/lib/pipeline/chestQueryAdapter.ts",
            entrypoint: "callArchitectureCStillRepair",
            stage: "logo_chest",
          },
        },
      );
    }

    const still = pickStill(ctx.inputs);
    if (!still?.assetId) {
      throw new PipelineError(
        "chest_still_missing",
        "Chest adapter needs a source_still or generation_still with assetId.",
        { retryable: false, classification: "input" },
      );
    }

    const wardrobeFeatureId =
      typeof still.lanePayload?.wardrobeFeatureId === "string"
        ? still.lanePayload.wardrobeFeatureId
        : undefined;
    if (!wardrobeFeatureId) {
      throw new PipelineError(
        "chest_wardrobe_feature_missing",
        "Chest adapter needs wardrobeFeatureId on the still artifact payload (catalog binding). No clip-specific default.",
        { retryable: false, classification: "input" },
      );
    }
    const logoZoneQuad = asQuad(still.lanePayload?.logoZoneQuad);

    let result: ChestRepairClientResult;
    try {
      result = await opts.client({
        projectId: ctx.projectId,
        stillAssetId: still.assetId,
        wardrobeFeatureId,
        stage: "logo_chest",
        logoZoneQuad,
      });
    } catch (error) {
      if (error instanceof PipelineError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = isRetryableChestQueryMessage(message);
      throw new PipelineError("chest_query_failed", message, {
        retryable,
        classification: retryable ? "timeout" : "adapter",
        details: { stillAssetId: still.assetId, stage: "logo_chest" },
        cause: error,
      });
    }

    const artifact = chestArtifactFromClientResult(result, still.producedAt);
    const cleared = isClearedChestArtifact(artifact);
    return {
      artifacts: [artifact],
      metadata: {
        source: "executed",
        adapterId: "product-os:keyframe_repair",
        paidCalls: false,
        ...(cleared ? chestClearedProvenanceMetadata() : { gate: "UNSCORED" }),
      },
    };
  };
}
