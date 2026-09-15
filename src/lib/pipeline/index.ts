/**
 * Lane G — AVT Pipeline / Product OS.
 *
 * Orchestration contracts so other lanes plug in by artifact kind, not by
 * owning Architecture C / Grok / export internals.
 *
 * Shared surfaces this lane documents but does not modify: see
 * `STAGE_DEFINITIONS` in `./contract`.
 */

export {
  ARTIFACT_KINDS,
  FAILURE_CLASSIFICATIONS,
  PIPELINE_CONTRACT_VERSION,
  PIPELINE_RUN_STATUSES,
  PIPELINE_STAGE_IDS,
  STAGE_STATUSES,
  TERMINAL_STAGE_STATUSES,
  isArtifactKind,
  isPipelineStageId,
  isStageStatus,
  isTerminalStageStatus,
} from "./types";
export type {
  ArtifactKind,
  ArtifactRef,
  FailureClassification,
  LaneSurface,
  PipelineClock,
  PipelineRun,
  PipelineRunStatus,
  PipelineStageId,
  ProvenanceRecord,
  RetryPolicy,
  StageDefinition,
  StageFailure,
  StageGate,
  StageRecord,
  StageStatus,
} from "./types";

export { PipelineError, classifyUnknownError } from "./errors";
export {
  DEFAULT_RETRY_POLICY,
  computeBackoffMs,
  isRetryableClassification,
  isRetryableFailure,
  nextRetryAt,
  shouldRetry,
} from "./retry";
export { assertAcyclic, topologicalStages, upstreamClosure } from "./graph";
export {
  STAGE_DEFINITIONS,
  STAGE_DEFINITION_LIST,
  consumedKindsFor,
  getStageDefinition,
  paidCallSurfaces,
  producedKindsFor,
} from "./contract";
export {
  createDefaultAdapters,
  createImportOnlyGenerationHandler,
  createStageAdapter,
  importedArtifactsForStage,
  missingRequiredKinds,
} from "./adapters";
export type { StageAdapter, StageExecutionContext, StageHandler, StageHandlerResult } from "./adapters";
export {
  advancePipeline,
  createPipelineRun,
  retryFailedStage,
  runPipelineToPause,
  setPipelineReview,
} from "./orchestrator";
export type { AdvanceOptions, CreatePipelineRunInput, SeedArtifact } from "./orchestrator";
export {
  PIPELINE_METADATA_KEY,
  embedPipelineRun,
  parsePipelineRun,
  readEmbeddedPipelineRun,
  serializePipelineRun,
} from "./persistence";
