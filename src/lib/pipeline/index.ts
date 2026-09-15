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
  PIPELINE_REVIEW_KEYS,
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
  PipelineReviewKey,
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
export type {
  StageAdapter,
  StageExecutionContext,
  StageHandler,
  StageHandlerResult,
} from "./adapters";
export {
  advancePipeline,
  createClearedChestPipelineRun,
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
export { LANE_G_DEPLOY_NEEDS, LANE_G_WORK_ORDER } from "./ownership";
export {
  CHEST_STILL_REVIEW_KEY,
  CLEARED_CHEST_STILL,
  chestClearedProvenanceMetadata,
  clearedChestLanePayload,
  clearedChestSeedArtifacts,
  isClearedChestArtifact,
  isClearedChestAssetId,
} from "./chest";
export { chestArtifactFromClientResult, createChestRepairHandler } from "./chestAdapter";
export type {
  ChestRepairClient,
  ChestRepairClientInput,
  ChestRepairClientResult,
} from "./chestAdapter";
export {
  architectureCChestQueryClient,
  createBoundChestQueryAdapter,
  createLiveProductOsAdapters,
} from "./chestQueryAdapter";
export {
  SLEEVE_STAGE_HOOK,
  TEMPORAL_STAGE_HOOK,
  createSleeveRepairStubHandler,
  createTemporalPropagationStubHandler,
} from "./stageHooks";
export {
  assertProductOsStageOrder,
  createProductOsAdapters,
  productOsChestAdapter,
  productOsGraphNodes,
} from "./productOs";
export type { ProductOsAdapterOptions, ProductOsGraphNode } from "./productOs";
