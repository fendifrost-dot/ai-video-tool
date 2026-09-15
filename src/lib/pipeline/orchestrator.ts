import { importedArtifactsForStage, missingRequiredKinds, type StageAdapter } from "./adapters";
import {
  CHEST_STILL_REVIEW_KEY,
  CLEARED_CHEST_STILL,
  chestClearedProvenanceMetadata,
  clearedChestSeedArtifacts,
  isClearedChestArtifact,
} from "./chest";
import { STAGE_DEFINITION_LIST, getStageDefinition } from "./contract";
import { classifyUnknownError } from "./errors";
import { topologicalStages } from "./graph";
import { createProductOsAdapters } from "./productOs";
import { nextRetryAt, shouldRetry } from "./retry";
import type {
  ArtifactRef,
  PipelineClock,
  PipelineRun,
  PipelineRunStatus,
  PipelineStageId,
  StageRecord,
  StageStatus,
} from "./types";
import { PIPELINE_CONTRACT_VERSION, PIPELINE_STAGE_IDS } from "./types";

export type SeedArtifact = Omit<ArtifactRef, "id" | "producedAt"> & {
  id?: string;
  producedAt?: string;
};

export type CreatePipelineRunInput = {
  projectId: string;
  seedArtifacts?: SeedArtifact[];
  reviews?: Record<string, boolean>;
};

export type AdvanceOptions = {
  adapters?: Partial<Record<PipelineStageId, StageAdapter>>;
  /** Ignore nextRetryAt (used by an explicit retry command). */
  ignoreBackoff?: boolean;
};

const defaultClock = (): PipelineClock => {
  let n = 0;
  return {
    now: () => new Date().toISOString(),
    createId: () => {
      n += 1;
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
      return `pl_${n}_${Date.now()}`;
    },
  };
};

function emptyStage(stageId: PipelineStageId, now: string): StageRecord {
  return {
    stageId,
    status: "pending",
    attempt: 0,
    artifacts: [],
    provenance: [],
    failures: [],
    nextRetryAt: null,
    updatedAt: now,
  };
}

function allArtifacts(run: PipelineRun): ArtifactRef[] {
  return run.artifacts;
}

function deriveRunStatus(run: PipelineRun): PipelineRunStatus {
  const statuses = PIPELINE_STAGE_IDS.map((id) => run.stages[id].status);
  if (statuses.some((s) => s === "running" || s === "retrying")) return "running";
  if (statuses.some((s) => s === "needs_review")) return "needs_review";
  if (statuses.some((s) => s === "blocked")) return "blocked";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.every((s) => s === "succeeded" || s === "skipped")) return "succeeded";
  if (statuses.some((s) => s === "cancelled")) return "cancelled";
  return statuses.some((s) => s === "ready") ? "running" : "pending";
}

function dependencyMet(run: PipelineRun, dep: PipelineStageId): boolean {
  const status = run.stages[dep].status;
  return status === "succeeded" || status === "skipped";
}

function evaluateGates(
  run: PipelineRun,
  stageId: PipelineStageId,
):
  | { ok: true }
  | { ok: false; status: Extract<StageStatus, "blocked" | "needs_review">; reason: string } {
  const def = getStageDefinition(stageId);
  for (const gate of def.gates) {
    if (gate.requiresStage) {
      const status = run.stages[gate.requiresStage].status;
      const allowed = gate.requiresStatuses ?? ["succeeded"];
      if (!allowed.includes(status)) {
        return { ok: false, status: gate.onFail, reason: gate.reason };
      }
    }
    if (gate.reviewKey && run.reviews[gate.reviewKey] !== true) {
      return { ok: false, status: gate.onFail, reason: gate.reason };
    }
  }
  return { ok: true };
}

function canSkipStage(run: PipelineRun, stageId: PipelineStageId): boolean {
  const available = allArtifacts(run);
  const downstream = STAGE_DEFINITION_LIST.filter((d) => d.dependsOn.includes(stageId));
  if (downstream.length === 0) return false;
  return downstream.every((d) => missingRequiredKinds(d, available).length === 0);
}

function markImportedStages(run: PipelineRun, clock: PipelineClock): PipelineRun {
  const next: PipelineRun = { ...run, stages: { ...run.stages } };
  for (const stageId of topologicalStages(STAGE_DEFINITION_LIST)) {
    const def = getStageDefinition(stageId);
    const record = next.stages[stageId];
    if (record.status !== "pending") continue;
    const imported = importedArtifactsForStage(def, allArtifacts(next));
    if (imported.length > 0 && def.allowImportFromLane) {
      const now = clock.now();
      next.stages[stageId] = {
        ...record,
        status: "succeeded",
        artifacts: imported,
        updatedAt: now,
        provenance: [
          ...record.provenance,
          {
            id: clock.createId(),
            stageId,
            adapterId: `contract:${stageId}`,
            attempt: 0,
            source: "imported_from_lane",
            inputArtifactIds: next.seedArtifactIds,
            outputArtifactIds: imported.map((a) => a.id),
            startedAt: now,
            finishedAt: now,
            metadata:
              stageId === "keyframe_repair" && imported.some(isClearedChestArtifact)
                ? chestClearedProvenanceMetadata()
                : { source: "imported_from_lane" },
          },
        ],
      };
      continue;
    }
    if (canSkipStage(next, stageId)) {
      const now = clock.now();
      next.stages[stageId] = {
        ...record,
        status: "skipped",
        updatedAt: now,
        provenance: [
          ...record.provenance,
          {
            id: clock.createId(),
            stageId,
            adapterId: `contract:${stageId}`,
            attempt: 0,
            source: "seed",
            inputArtifactIds: next.seedArtifactIds,
            outputArtifactIds: [],
            startedAt: now,
            finishedAt: now,
            metadata: { reason: "downstream_already_satisfied" },
          },
        ],
      };
    }
  }
  next.status = deriveRunStatus(next);
  next.updatedAt = clock.now();
  return applyClearedChestReview(next);
}

function applyClearedChestReview(run: PipelineRun): PipelineRun {
  if (run.reviews[CHEST_STILL_REVIEW_KEY] === true) return run;
  const cleared = run.artifacts.some(isClearedChestArtifact);
  if (!cleared) return run;
  return {
    ...run,
    reviews: { ...run.reviews, [CHEST_STILL_REVIEW_KEY]: true },
  };
}

export function createPipelineRun(
  input: CreatePipelineRunInput,
  clock: PipelineClock = defaultClock(),
): PipelineRun {
  const now = clock.now();
  const seed: ArtifactRef[] = (input.seedArtifacts ?? []).map((a) => ({
    ...a,
    id: a.id ?? clock.createId(),
    producedAt: a.producedAt ?? now,
  }));

  const stages = {} as PipelineRun["stages"];
  for (const id of PIPELINE_STAGE_IDS) {
    stages[id] = emptyStage(id, now);
  }

  const run: PipelineRun = {
    contractVersion: PIPELINE_CONTRACT_VERSION,
    id: clock.createId(),
    projectId: input.projectId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    stages,
    artifacts: seed,
    reviews: { ...input.reviews },
    seedArtifactIds: seed.map((a) => a.id),
  };

  return markImportedStages(run, clock);
}

/** Product OS run already holding the CLEARED Stage 1m chest artifact. */
export function createClearedChestPipelineRun(
  input: Partial<CreatePipelineRunInput> = {},
  clock: PipelineClock = defaultClock(),
): PipelineRun {
  return createPipelineRun(
    {
      projectId: input.projectId ?? CLEARED_CHEST_STILL.projectId,
      seedArtifacts: input.seedArtifacts ?? clearedChestSeedArtifacts(),
      reviews: {
        [CHEST_STILL_REVIEW_KEY]: true,
        stillRepairApproved: false,
        ...input.reviews,
      },
    },
    clock,
  );
}

export function setPipelineReview(
  run: PipelineRun,
  reviews: Record<string, boolean>,
  clock: PipelineClock = defaultClock(),
): PipelineRun {
  const next: PipelineRun = {
    ...run,
    reviews: { ...run.reviews, ...reviews },
    stages: { ...run.stages },
    updatedAt: clock.now(),
  };
  for (const id of PIPELINE_STAGE_IDS) {
    const status = next.stages[id].status;
    if (status === "blocked" || status === "needs_review") {
      next.stages[id] = { ...next.stages[id], status: "pending", updatedAt: clock.now() };
    }
  }
  next.status = deriveRunStatus(next);
  return next;
}

function defaultAdapters(): Record<PipelineStageId, StageAdapter> {
  return createProductOsAdapters();
}

function resolveAdapters(
  overrides?: Partial<Record<PipelineStageId, StageAdapter>>,
): Record<PipelineStageId, StageAdapter> {
  return { ...defaultAdapters(), ...overrides };
}

function nextActionableStage(run: PipelineRun): PipelineStageId | null {
  for (const stageId of topologicalStages(STAGE_DEFINITION_LIST)) {
    const status = run.stages[stageId].status;
    if (status === "pending" || status === "ready" || status === "retrying") return stageId;
  }
  return null;
}

async function executeStage(
  run: PipelineRun,
  stageId: PipelineStageId,
  adapters: Record<PipelineStageId, StageAdapter>,
  clock: PipelineClock,
  ignoreBackoff: boolean,
): Promise<PipelineRun> {
  const def = getStageDefinition(stageId);
  const record = run.stages[stageId];
  const now = clock.now();

  if (record.status === "retrying" && record.nextRetryAt && !ignoreBackoff) {
    if (Date.parse(record.nextRetryAt) > Date.parse(now)) {
      return run;
    }
  }

  for (const dep of def.dependsOn) {
    if (!dependencyMet(run, dep)) {
      const depStatus = run.stages[dep].status;
      if (depStatus === "failed") {
        return {
          ...run,
          stages: {
            ...run.stages,
            [stageId]: {
              ...record,
              status: "blocked",
              updatedAt: now,
              lastError: {
                code: "upstream_failed",
                message: `Stage ${stageId} blocked because ${dep} failed.`,
                retryable: false,
                classification: "dependency",
                occurredAt: now,
                attempt: record.attempt,
              },
            },
          },
          updatedAt: now,
          status: "blocked",
        };
      }
      return run;
    }
  }

  const gate = evaluateGates(run, stageId);
  if (!gate.ok) {
    const gated: PipelineRun = {
      ...run,
      stages: {
        ...run.stages,
        [stageId]: { ...record, status: gate.status, updatedAt: now },
      },
      updatedAt: now,
    };
    gated.status = deriveRunStatus(gated);
    return gated;
  }

  if (canSkipStage(run, stageId) && record.status === "pending") {
    return markImportedStages(run, clock);
  }

  const adapter = adapters[stageId];
  const inputs = allArtifacts(run);
  const validation = adapter.validateInputs(inputs);
  if (!validation.ok) {
    const failure = {
      code: "missing_inputs",
      message: `Stage ${stageId} missing inputs: ${validation.missing.join(", ")}`,
      retryable: false,
      classification: "input" as const,
      details: { missing: validation.missing },
      occurredAt: now,
      attempt: record.attempt,
    };
    const next: PipelineRun = {
      ...run,
      stages: {
        ...run.stages,
        [stageId]: {
          ...record,
          status: "failed",
          lastError: failure,
          failures: [...record.failures, failure],
          updatedAt: now,
        },
      },
      updatedAt: now,
    };
    next.status = deriveRunStatus(next);
    return next;
  }

  const attempt = record.attempt + 1;
  const running: PipelineRun = {
    ...run,
    status: "running",
    updatedAt: now,
    stages: {
      ...run.stages,
      [stageId]: { ...record, status: "running", attempt, updatedAt: now },
    },
  };

  try {
    const startedAt = clock.now();
    const result = await adapter.execute({
      stageId,
      definition: def,
      inputs,
      attempt,
      projectId: running.projectId,
      runId: running.id,
      reviews: running.reviews,
    });
    const finishedAt = clock.now();
    const stamped = result.artifacts.map((a) => ({
      ...a,
      id: a.id || clock.createId(),
      producedByStage: a.producedByStage ?? stageId,
      producedAt: a.producedAt || finishedAt,
    }));
    const provenance = {
      id: clock.createId(),
      stageId,
      adapterId: adapter.id,
      attempt,
      source: "executed" as const,
      inputArtifactIds: inputs.map((a) => a.id),
      outputArtifactIds: stamped.map((a) => a.id),
      startedAt,
      finishedAt,
      metadata: result.metadata ?? {},
    };
    const next: PipelineRun = {
      ...running,
      artifacts: [
        ...running.artifacts,
        ...stamped.filter((a) => !running.artifacts.some((x) => x.id === a.id)),
      ],
      stages: {
        ...running.stages,
        [stageId]: {
          ...running.stages[stageId],
          status: "succeeded",
          artifacts: stamped,
          provenance: [...record.provenance, provenance],
          nextRetryAt: null,
          updatedAt: finishedAt,
        },
      },
      updatedAt: finishedAt,
    };
    next.status = deriveRunStatus(next);
    if (stageId === "keyframe_repair") return applyClearedChestReview(next);
    return next;
  } catch (error) {
    const failedAt = clock.now();
    const failure = classifyUnknownError(error, attempt, failedAt);
    const retry = shouldRetry(failure, attempt, def.retryPolicy);
    const status: StageStatus = retry ? "retrying" : "failed";
    const next: PipelineRun = {
      ...running,
      stages: {
        ...running.stages,
        [stageId]: {
          ...running.stages[stageId],
          status,
          lastError: failure,
          failures: [...record.failures, failure],
          nextRetryAt: retry ? nextRetryAt(attempt, def.retryPolicy, failedAt) : null,
          updatedAt: failedAt,
        },
      },
      updatedAt: failedAt,
    };
    next.status = deriveRunStatus(next);
    return next;
  }
}

export async function advancePipeline(
  run: PipelineRun,
  options: AdvanceOptions = {},
  clock: PipelineClock = defaultClock(),
): Promise<PipelineRun> {
  const adapters = resolveAdapters(options.adapters);
  const stageId = nextActionableStage(run);
  if (!stageId) return { ...run, status: deriveRunStatus(run), updatedAt: clock.now() };
  return executeStage(run, stageId, adapters, clock, options.ignoreBackoff === true);
}

export async function runPipelineToPause(
  run: PipelineRun,
  options: AdvanceOptions & { maxSteps?: number } = {},
  clock: PipelineClock = defaultClock(),
): Promise<PipelineRun> {
  const maxSteps = options.maxSteps ?? PIPELINE_STAGE_IDS.length * 4;
  let current = run;
  for (let i = 0; i < maxSteps; i++) {
    const before = current;
    current = await advancePipeline(current, options, clock);
    if (
      current.status === "succeeded" ||
      current.status === "failed" ||
      current.status === "blocked" ||
      current.status === "needs_review" ||
      current.status === "cancelled"
    ) {
      return current;
    }
    if (current === before) return { ...current, status: deriveRunStatus(current) };
    const actionable = nextActionableStage(current);
    if (!actionable) return { ...current, status: deriveRunStatus(current) };
    if (current.stages[actionable].status === "retrying" && !options.ignoreBackoff) {
      return current;
    }
  }
  return current;
}

export async function retryFailedStage(
  run: PipelineRun,
  stageId: PipelineStageId,
  options: AdvanceOptions = {},
  clock: PipelineClock = defaultClock(),
): Promise<PipelineRun> {
  const record = run.stages[stageId];
  if (record.status !== "failed" && record.status !== "retrying") return run;
  const reset: PipelineRun = {
    ...run,
    stages: {
      ...run.stages,
      [stageId]: { ...record, status: "retrying", nextRetryAt: null, updatedAt: clock.now() },
    },
  };
  return executeStage(reset, stageId, resolveAdapters(options.adapters), clock, true);
}
