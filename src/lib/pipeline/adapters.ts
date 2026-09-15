import { PipelineError } from "./errors";
import { getStageDefinition } from "./contract";
import { PIPELINE_STAGE_IDS, type ArtifactKind, type ArtifactRef, type PipelineStageId, type StageDefinition } from "./types";

export type StageHandlerResult = {
  artifacts: ArtifactRef[];
  metadata?: Record<string, unknown>;
};

export type StageExecutionContext = {
  stageId: PipelineStageId;
  definition: StageDefinition;
  inputs: ArtifactRef[];
  attempt: number;
};

export type StageHandler = (ctx: StageExecutionContext) => Promise<StageHandlerResult>;

export type StageAdapter = {
  readonly id: string;
  readonly stageId: PipelineStageId;
  readonly definition: StageDefinition;
  validateInputs(artifacts: ArtifactRef[]): { ok: boolean; missing: ArtifactKind[] };
  execute(ctx: StageExecutionContext): Promise<StageHandlerResult>;
};

export function missingRequiredKinds(
  definition: StageDefinition,
  artifacts: ArtifactRef[],
): ArtifactKind[] {
  const missingAll = definition.requiredAll.filter((kind) => !artifacts.some((a) => a.kind === kind));
  const anyOk =
    definition.requiredAny.length === 0 ||
    definition.requiredAny.some((kind) => artifacts.some((a) => a.kind === kind));
  if (anyOk) return missingAll;
  return [...missingAll, ...definition.requiredAny];
}

export function importedArtifactsForStage(
  definition: StageDefinition,
  available: ArtifactRef[],
): ArtifactRef[] {
  if (!definition.allowImportFromLane) return [];
  return available.filter((a) => definition.produces.includes(a.kind));
}

/**
 * Default adapter: consume another lane's already-produced artifacts.
 * Inject a handler only when a lane is ready to plug in. Handlers must not
 * call paid Grok / V3 generation from this lane.
 */
export function createStageAdapter(stageId: PipelineStageId, handler?: StageHandler): StageAdapter {
  const definition = getStageDefinition(stageId);
  return {
    id: `contract:${stageId}`,
    stageId,
    definition,
    validateInputs(artifacts) {
      const missing = missingRequiredKinds(definition, artifacts);
      return { ok: missing.length === 0, missing };
    },
    async execute(ctx) {
      if (handler) {
        return handler(ctx);
      }

      const imported = importedArtifactsForStage(definition, ctx.inputs);
      if (imported.length > 0) {
        return {
          artifacts: imported,
          metadata: { source: "imported_from_lane", adapterId: `contract:${stageId}` },
        };
      }

      throw new PipelineError(
        "stage_not_plugged_in",
        `${stageId} has no lane handler and no imported artifact of kinds [${definition.produces.join(", ")}].`,
        {
          retryable: false,
          classification: "dependency",
          details: { produces: definition.produces, consumes: definition.consumes },
        },
      );
    },
  };
}

export function createDefaultAdapters(
  handlers?: Partial<Record<PipelineStageId, StageHandler>>,
): Record<PipelineStageId, StageAdapter> {
  const adapters = {} as Record<PipelineStageId, StageAdapter>;
  for (const id of PIPELINE_STAGE_IDS) {
    adapters[id] = createStageAdapter(id, handlers?.[id]);
  }
  return adapters;
}

/**
 * Production default: generation is import-only. Other lanes may attach a
 * consume-existing handler; this lane must not wire paid Grok / V3 entrypoints.
 */
export function createImportOnlyGenerationHandler(): StageHandler {
  return async (ctx) => {
    const imported = importedArtifactsForStage(ctx.definition, ctx.inputs);
    if (imported.length === 0) {
      throw new PipelineError(
        "paid_generation_forbidden",
        "Lane G must not execute generation. Import a completed generation_clip or generation_still.",
        { retryable: false, classification: "gate" },
      );
    }
    return {
      artifacts: imported,
      metadata: { source: "imported_from_lane", paidCalls: false },
    };
  };
}
