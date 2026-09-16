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
  G2_STAGE_STATES,
  PIPELINE_CONTRACT_VERSION,
  PIPELINE_CONTRACT_VERSIONS,
  PIPELINE_REVIEW_KEYS,
  PIPELINE_RUN_STATUSES,
  PIPELINE_STAGE_IDS,
  STAGE_STATUSES,
  TERMINAL_STAGE_STATUSES,
  isArtifactKind,
  isG2StageState,
  isPipelineContractVersion,
  isPipelineStageId,
  isStageStatus,
  isTerminalStageStatus,
} from "./types";
export type {
  ArtifactHandoff,
  ArtifactKind,
  ArtifactRef,
  ConsumedEncodeProvenance,
  ConsumedEncodeStatus,
  ConsumedEvaluatorResult,
  FailureClassification,
  G2StageState,
  LaneSurface,
  PipelineClock,
  PipelineContractVersion,
  PipelineReviewKey,
  PipelineRun,
  PipelineRunStatus,
  PipelineStageId,
  ProvenanceRecord,
  RetryPolicy,
  SeedArtifact,
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
export type { AdvanceOptions, CreatePipelineRunInput } from "./orchestrator";
export {
  PIPELINE_METADATA_KEY,
  embedPipelineRun,
  parsePipelineRun,
  readEmbeddedPipelineRun,
  serializePipelineRun,
} from "./persistence";
export { LANE_G2_DEPLOY_NEEDS, LANE_G2_WORK_ORDER, LANE_G_DEPLOY_NEEDS, LANE_G_WORK_ORDER } from "./ownership";
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
  SLEEVE_STILL_REVIEW_KEY,
  CLEARED_SLEEVE_STILL,
  clearedSleeveLanePayload,
  clearedSleeveSeedArtifact,
  isClearedSleeveArtifact,
  isClearedSleeveAssetId,
  sleeveClearedProvenanceMetadata,
} from "./sleeve";
export {
  G2_REQUIRED_STATES,
  isPassedLifecycle,
  isPauseLifecycle,
  lifecycleFromStatus,
  retryReasonFrom,
} from "./lifecycle";
export { STAGE_VERSIONS, stageVersionFor } from "./stageVersion";
export {
  applyHandoffs,
  artifactsForHandoff,
  buildHandoffs,
  kindsCompatible,
  nextCompatibleStages,
  stageInputsSatisfied,
} from "./handoff";
export {
  ENCODE_CONTRACT,
  EVALUATOR_CONTRACT,
  E2_RECONSTRUCT_VIDEO_SPEC_VERSION,
  E2_VIDEO_QA_SPEC_VERSION,
  VIDEO_QA_CONTRACT,
  consumeEncodeProvenance,
  consumeEvaluatorReport,
  consumeVideoQaReport,
  createConsumedEncodeHandler,
  createConsumedEvaluatorHandler,
  createConsumedVideoQaHandler,
  createLaneHEncodeStubHandler,
  evaluatorResultFromArtifact,
  isEncodedMp4,
  isVideoQaReport,
} from "./consumedContracts";
export {
  AUTO_REVIEW_DO_NOT_SET,
  PRODUCT_SAFE_AUTO_REVIEW,
  productSafeAutoReviews,
  seedsHaveClearedChestAndSleeve,
} from "./autoReviews";
export {
  fixtureDownstreamSeeds,
  fixtureGraphSeeds,
  fixtureStillSeeds,
  fixtureVideoQaLanePayload,
} from "./fixtureSeeds";
export type { FixtureSeedOpts } from "./fixtureSeeds";
export {
  CANONICAL_YSL_ICE_ON,
  CLIP_CATALOGS,
  SECOND_EXISTING_V2_EDITED_CLIP,
  bindCatalog,
  catalogById,
  createBoundPipelineRun,
  portableBinding,
  secondClipPortabilityDesign,
} from "./catalog";
export type { BindCatalogInput, ClipCatalog, ClipCatalogId } from "./catalog";
export {
  createCatalogPipelineRun,
  runUnattendedPipeline,
  stageGraphSnapshot,
} from "./unattended";
export type { UnattendedPauseReason, UnattendedResult } from "./unattended";
export {
  assertProductOsStageOrder,
  createProductOsAdapters,
  productOsChestAdapter,
  productOsGraphNodes,
} from "./productOs";
export type { ProductOsAdapterOptions, ProductOsGraphNode } from "./productOs";
