/**
 * Product OS facade — cleared chest stage + sleeve/temporal hooks.
 *
 * Default adapters do not invoke the live query client (tests stay $0).
 * Production live chest repair uses createLiveProductOsAdapters().
 */

import {
  createDefaultAdapters,
  createImportOnlyGenerationHandler,
  createStageAdapter,
  type StageAdapter,
  type StageHandler,
} from "./adapters";
import { CLEARED_CHEST_STILL } from "./chest";
import { createChestRepairHandler, type ChestRepairClient } from "./chestAdapter";
import { STAGE_DEFINITION_LIST } from "./contract";
import { topologicalStages } from "./graph";
import {
  createSleeveRepairStubHandler,
  createTemporalPropagationStubHandler,
  SLEEVE_STAGE_HOOK,
  TEMPORAL_STAGE_HOOK,
} from "./stageHooks";
import type { PipelineStageId } from "./types";
import { PIPELINE_STAGE_IDS } from "./types";

export type ProductOsGraphNode = {
  stageId: PipelineStageId;
  integration: "cleared_chest_1m" | "stub_hook" | "import_only" | "scaffolding";
  ownerLane: "G" | "B" | "C" | null;
  status: string;
};

const NODE_META: Record<PipelineStageId, Omit<ProductOsGraphNode, "stageId">> = {
  ingest: { integration: "scaffolding", ownerLane: null, status: "scaffolding" },
  generation: { integration: "import_only", ownerLane: null, status: "import_only" },
  keyframe_repair: {
    integration: "cleared_chest_1m",
    ownerLane: "G",
    status: `CLEARED 11/11 ${CLEARED_CHEST_STILL.assetId}`,
  },
  sleeve_garment_repair: {
    integration: "stub_hook",
    ownerLane: "B",
    status: SLEEVE_STAGE_HOOK.code,
  },
  temporal_propagation: {
    integration: "stub_hook",
    ownerLane: "C",
    status: TEMPORAL_STAGE_HOOK.code,
  },
  original_master_reconstruction: {
    integration: "scaffolding",
    ownerLane: null,
    status: "gate_4_blocked",
  },
  deterministic_branding: { integration: "scaffolding", ownerLane: null, status: "scaffolding" },
  automated_evaluation: { integration: "scaffolding", ownerLane: null, status: "scaffolding" },
  review_export: { integration: "scaffolding", ownerLane: null, status: "scaffolding" },
};

export function productOsGraphNodes(): ProductOsGraphNode[] {
  return topologicalStages(STAGE_DEFINITION_LIST).map((stageId) => ({
    stageId,
    ...NODE_META[stageId],
  }));
}

export type ProductOsAdapterOptions = {
  chestClient?: ChestRepairClient;
  sleeveHandler?: StageHandler;
  temporalHandler?: StageHandler;
};

/** Safe defaults: import CLEARED chest / require bind; sleeve + temporal stubs. */
export function createProductOsAdapters(
  opts: ProductOsAdapterOptions = {},
): Record<PipelineStageId, StageAdapter> {
  return createDefaultAdapters({
    generation: createImportOnlyGenerationHandler(),
    keyframe_repair: createChestRepairHandler(
      opts.chestClient ? { client: opts.chestClient } : undefined,
    ),
    sleeve_garment_repair: opts.sleeveHandler ?? createSleeveRepairStubHandler(),
    temporal_propagation: opts.temporalHandler ?? createTemporalPropagationStubHandler(),
  });
}

export function productOsChestAdapter(client?: ChestRepairClient): StageAdapter {
  return createStageAdapter(
    "keyframe_repair",
    createChestRepairHandler(client ? { client } : undefined),
  );
}

export function assertProductOsStageOrder(): PipelineStageId[] {
  const ordered = topologicalStages(STAGE_DEFINITION_LIST);
  if (ordered.join(",") !== PIPELINE_STAGE_IDS.join(",")) {
    throw new Error("product_os_graph_order_mismatch");
  }
  return ordered;
}
