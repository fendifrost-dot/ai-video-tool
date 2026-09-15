/**
 * Production bind: Product OS chest adapter → existing query client.
 *
 * This is the only pipeline module allowed to import
 * `src/lib/queries/architectureCStillRepair.ts`. It does not import paint,
 * placement, or the edge proxy.
 */

import type { ArchitectureCStillRepairInput } from "@/lib/queries/architectureCStillRepair";
import { callArchitectureCStillRepair } from "@/lib/queries/architectureCStillRepair";
import { createStageAdapter, type StageAdapter } from "./adapters";
import type {
  ChestRepairClient,
  ChestRepairClientInput,
  ChestRepairClientResult,
} from "./chestAdapter";
import { createChestRepairHandler } from "./chestAdapter";
import { createProductOsAdapters, type ProductOsAdapterOptions } from "./productOs";
import type { PipelineStageId } from "./types";

function asLogoZoneQuad(
  quad: ChestRepairClientInput["logoZoneQuad"],
): ArchitectureCStillRepairInput["logoZoneQuad"] | undefined {
  if (!quad || quad.length !== 4) return undefined;
  const mapped: NonNullable<ArchitectureCStillRepairInput["logoZoneQuad"]> = [
    [quad[0][0], quad[0][1]],
    [quad[1][0], quad[1][1]],
    [quad[2][0], quad[2][1]],
    [quad[3][0], quad[3][1]],
  ];
  return mapped;
}

/** Query-client wrapper. Always sends stage: logo_chest. Never sleeve_panel. */
export const architectureCChestQueryClient: ChestRepairClient = async (input) => {
  const result = await callArchitectureCStillRepair({
    projectId: input.projectId,
    stillAssetId: input.stillAssetId,
    wardrobeFeatureId: input.wardrobeFeatureId,
    stage: "logo_chest",
    logoZoneQuad: asLogoZoneQuad(input.logoZoneQuad),
  });
  const mapped: ChestRepairClientResult = {
    stage: result.stage,
    assetId: result.assetId,
    storedBucket: result.storedBucket,
    storedPath: result.storedPath,
    previewUrl: result.previewUrl,
    repair: result.repair,
    temporalTrackingEnabled: false,
    hardStop: result.hardStop,
  };
  return mapped;
};

export function createBoundChestQueryAdapter(): StageAdapter {
  return createStageAdapter(
    "keyframe_repair",
    createChestRepairHandler({ client: architectureCChestQueryClient }),
  );
}

/** Live Product OS: chest adapter calls callArchitectureCStillRepair (logo_chest). */
export function createLiveProductOsAdapters(
  opts: Omit<ProductOsAdapterOptions, "chestClient"> = {},
): Record<PipelineStageId, StageAdapter> {
  return createProductOsAdapters({
    ...opts,
    chestClient: architectureCChestQueryClient,
  });
}
