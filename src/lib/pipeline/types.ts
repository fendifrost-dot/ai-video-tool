/**
 * AVT Pipeline / Product OS — shared types.
 *
 * Lane G owns the orchestration contract. Other lanes plug in by producing
 * artifacts that match these kinds. This module does not import Architecture C
 * algorithms, provider clients, or edge proxies.
 */

export const PIPELINE_CONTRACT_VERSION = "1.1.0" as const;
export const PIPELINE_CONTRACT_VERSIONS = ["1.0.0", "1.1.0"] as const;
export type PipelineContractVersion = (typeof PIPELINE_CONTRACT_VERSIONS)[number];

/**
 * Sprint 2 / Lane G2 canonical lifecycle. Richer internal `StageStatus`
 * values project onto these six product states.
 */
export const G2_STAGE_STATES = [
  "queued",
  "running",
  "passed",
  "failed",
  "blocked",
  "retryable",
] as const;

export type G2StageState = (typeof G2_STAGE_STATES)[number];

/** Known review flags. Runs may carry additional keys. */
export const PIPELINE_REVIEW_KEYS = [
  "chestStillCleared",
  "stillRepairApproved",
  "masterCompositeAuthorized",
  "exportApproved",
] as const;

export type PipelineReviewKey = (typeof PIPELINE_REVIEW_KEYS)[number];

export const PIPELINE_STAGE_IDS = [
  "ingest",
  "generation",
  "keyframe_repair",
  "sleeve_garment_repair",
  "temporal_propagation",
  "original_master_reconstruction",
  "deterministic_branding",
  "automated_evaluation",
  "review_export",
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGE_IDS)[number];

export const STAGE_STATUSES = [
  "pending",
  "ready",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "blocked",
  "needs_review",
  "retrying",
  "cancelled",
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

export const TERMINAL_STAGE_STATUSES = ["succeeded", "failed", "skipped", "cancelled"] as const;

export type TerminalStageStatus = (typeof TERMINAL_STAGE_STATUSES)[number];

export const PIPELINE_RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "blocked",
  "needs_review",
  "cancelled",
] as const;

export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number];

export const ARTIFACT_KINDS = [
  "source_master",
  "scrub_proxy",
  "extract_manifest",
  "generation_clip",
  "generation_still",
  "source_still",
  "repaired_still_logo_chest",
  "repaired_still_sleeve_panel",
  "propagation_frames",
  "propagated_clip",
  "original_master_composite",
  "branded_composite",
  "evaluation_report",
  "review_scorecard",
  "export_package",
  /** Playable MP4 produced by Lane H. Lane G2 stores the pointer only. */
  "encoded_mp4",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const FAILURE_CLASSIFICATIONS = [
  "input",
  "dependency",
  "adapter",
  "gate",
  "timeout",
  "cancelled",
] as const;

export type FailureClassification = (typeof FAILURE_CLASSIFICATIONS)[number];

export type ArtifactRef = {
  id: string;
  kind: ArtifactKind;
  /** project_assets.id when the artifact is a persisted asset. */
  assetId?: string;
  bucket?: string;
  path?: string;
  lookId?: string;
  mimeType?: string;
  contentHash?: string;
  producedByStage: PipelineStageId | "seed";
  producedAt: string;
  /** Opaque lane-owned payload. Orchestrator stores, never interprets. */
  lanePayload?: Record<string, unknown>;
};

/**
 * Structural consume of Lane E2 evaluator JSON.
 * Orchestration stores this; it does not compute metrics or reopen goldens.
 */
export type ConsumedEvaluatorResult = {
  specVersion: string;
  verdict: "PASS" | "FAIL" | "UNSCORED" | "NOT_RUN";
  passCount: number | null;
  failCount: number | null;
  ownerLane: "E2" | "E";
  paidCalls: false;
  stillGoldensReopened: false;
  reportArtifactId?: string;
  /** Opaque bag from E2. Do not interpret as owned metrics. */
  summary: Record<string, unknown>;
};

/** Kind-based handoff from a passed stage to the next compatible stage. */
export type ArtifactHandoff = {
  id: string;
  fromStage: PipelineStageId;
  toStage: PipelineStageId;
  artifactIds: string[];
  kinds: ArtifactKind[];
  compatibility: "kinds_match";
  at: string;
};

export type ProvenanceRecord = {
  id: string;
  stageId: PipelineStageId;
  adapterId: string;
  attempt: number;
  source: "executed" | "imported_from_lane" | "seed" | "retry";
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  startedAt: string;
  finishedAt: string;
  /** Reproducibility metadata — model/version/prompt/hash/seed when a lane supplies them. */
  metadata: Record<string, unknown>;
};

export type StageFailure = {
  code: string;
  message: string;
  retryable: boolean;
  classification: FailureClassification;
  causeName?: string;
  details?: Record<string, unknown>;
  occurredAt: string;
  attempt: number;
};

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  retryableClassifications: FailureClassification[];
};

export type StageGate = {
  id: string;
  /** Review / run flag that must be true before this stage may run. */
  reviewKey?: string;
  /** Upstream stage that must be in one of these statuses. */
  requiresStage?: PipelineStageId;
  requiresStatuses?: StageStatus[];
  onFail: "blocked" | "needs_review";
  reason: string;
};

export type LaneSurface = {
  /** Repo-relative path. Lane G must not modify these unless a later issue grants it. */
  module: string;
  entrypoint: string;
  ownsInternals: false;
  paidCalls: boolean;
  notes: string;
};

export type StageDefinition = {
  id: PipelineStageId;
  label: string;
  /** Accepted input kinds (documentation + matching). */
  consumes: ArtifactKind[];
  /** Every listed kind must be present before execute. */
  requiredAll: ArtifactKind[];
  /** At least one listed kind must be present when non-empty. */
  requiredAny: ArtifactKind[];
  produces: ArtifactKind[];
  dependsOn: PipelineStageId[];
  gates: StageGate[];
  retryPolicy: RetryPolicy;
  laneSurfaces: LaneSurface[];
  /** Consume-only version pin (paint / reconstruct / eval owners bump their own). */
  stageVersion: string;
  /** When true, a seed artifact of a produced kind satisfies the stage without execution. */
  allowImportFromLane: boolean;
};

export type StageRecord = {
  stageId: PipelineStageId;
  status: StageStatus;
  /** G2 product lifecycle. Derived from `status` + retryability. */
  lifecycle: G2StageState;
  stageVersion: string;
  attempt: number;
  artifacts: ArtifactRef[];
  provenance: ProvenanceRecord[];
  failures: StageFailure[];
  lastError?: StageFailure;
  evaluatorResult: ConsumedEvaluatorResult | null;
  retryReason: string | null;
  nextRetryAt?: string | null;
  updatedAt: string;
};

export type PipelineRun = {
  contractVersion: typeof PIPELINE_CONTRACT_VERSION;
  id: string;
  projectId: string;
  status: PipelineRunStatus;
  createdAt: string;
  updatedAt: string;
  stages: Record<PipelineStageId, StageRecord>;
  artifacts: ArtifactRef[];
  reviews: Record<string, boolean>;
  seedArtifactIds: string[];
  paidCalls: false;
  catalogId?: string;
  handoffs: ArtifactHandoff[];
};

export type SeedArtifact = Omit<ArtifactRef, "id" | "producedAt"> & {
  id?: string;
  producedAt?: string;
};

export type PipelineClock = {
  now: () => string;
  createId: () => string;
};

export function isPipelineStageId(value: string): value is PipelineStageId {
  return (PIPELINE_STAGE_IDS as readonly string[]).includes(value);
}

export function isStageStatus(value: string): value is StageStatus {
  return (STAGE_STATUSES as readonly string[]).includes(value);
}

export function isTerminalStageStatus(status: StageStatus): status is TerminalStageStatus {
  return (TERMINAL_STAGE_STATUSES as readonly string[]).includes(status);
}

export function isArtifactKind(value: string): value is ArtifactKind {
  return (ARTIFACT_KINDS as readonly string[]).includes(value);
}

export function isG2StageState(value: string): value is G2StageState {
  return (G2_STAGE_STATES as readonly string[]).includes(value);
}

export function isPipelineContractVersion(value: string): value is PipelineContractVersion {
  return (PIPELINE_CONTRACT_VERSIONS as readonly string[]).includes(value);
}
