/**
 * Plug-in stubs for lanes that have not yet filled Product OS handlers.
 * Lane G owns the hook contract only — not sleeve paint or temporal engines.
 */

import { importedArtifactsForStage, type StageHandler } from "./adapters";
import { PipelineError } from "./errors";

export const SLEEVE_STAGE_HOOK = {
  code: "sleeve_stage_stub",
  stageId: "sleeve_garment_repair" as const,
  ownerLane: "B" as const,
  fillIssue: 74,
  entrypoint: "src/lib/queries/architectureCStillRepair.ts",
  call: "callArchitectureCStillRepair({ stage: 'sleeve_panel' })",
  notes:
    "Lane G does not run sleeve paint. Lane B fills this handler after the CLEARED chest artifact.",
} as const;

export const TEMPORAL_STAGE_HOOK = {
  code: "temporal_stage_stub",
  stageId: "temporal_propagation" as const,
  ownerLane: "C" as const,
  fillIssue: 56,
  requiresReview: "stillRepairApproved" as const,
  entrypoint: "src/lib/queries/wardrobeVideoFrames.ts",
  call: "runLaneARoundtrip",
  notes:
    "Lane G does not run temporal propagation. CLEARED chest (chestStillCleared) does not skip human stillRepairApproved.",
} as const;

export function createSleeveRepairStubHandler(): StageHandler {
  return async (ctx) => {
    const imported = importedArtifactsForStage(ctx.definition, ctx.inputs);
    if (imported.length > 0) {
      return {
        artifacts: imported,
        metadata: { source: "imported_from_lane", hook: SLEEVE_STAGE_HOOK.code },
      };
    }
    throw new PipelineError(
      SLEEVE_STAGE_HOOK.code,
      "sleeve_garment_repair is a Lane B hook. Product OS will not invent sleeve paint.",
      {
        retryable: false,
        classification: "dependency",
        details: { ...SLEEVE_STAGE_HOOK },
      },
    );
  };
}

export function createTemporalPropagationStubHandler(): StageHandler {
  return async (ctx) => {
    const imported = importedArtifactsForStage(ctx.definition, ctx.inputs);
    if (imported.length > 0) {
      return {
        artifacts: imported,
        metadata: { source: "imported_from_lane", hook: TEMPORAL_STAGE_HOOK.code },
      };
    }
    throw new PipelineError(
      TEMPORAL_STAGE_HOOK.code,
      "temporal_propagation is a Lane C hook. CLEARED chest does not authorize temporal.",
      {
        retryable: false,
        classification: "dependency",
        details: { ...TEMPORAL_STAGE_HOOK },
      },
    );
  };
}
