export {
  DEFAULT_PROPAGATION_THRESHOLDS,
  TEMPORAL_PROPAGATION_CONTRACT_VERSION,
  type AffineMatrix,
  type AffineTransform,
  type Anchor,
  type AnchorKind,
  type BinaryMask,
  type CanonicalKeyframe,
  type FrameIndex,
  type Point2,
  type PropagatedFrame,
  type PropagationInput,
  type PropagationOutput,
  type PropagationSource,
  type PropagationThresholds,
  type QuadNorm,
  type SourceClip,
  type SourceClipFrame,
} from "./contract";

export {
  almostEqualMatrix,
  applyAffine,
  applyAffineToQuad,
  composeAffine,
  IDENTITY_MATRIX,
  identityTransform,
  invertAffine,
  translationOf,
  translationTransform,
  warpQuadNorm,
} from "./geometry";

export {
  cloneMask,
  emptyMask,
  maskArea,
  maskBBox,
  maskIoU,
  paintQuadMask,
  paintRectMask,
  warpMask,
} from "./mask";

export { estimateTranslation } from "./flow";
export type { TranslationEstimate } from "./flow";

export { propagateRepair } from "./propagate";
export { PropagationContractError, validatePropagationInput } from "./validate";

export {
  anchoredSnapFixture,
  expectedTranslatedMask,
  FIXTURE_FRAME_SIZE,
  sceneCutFixture,
  stationarySquareFixture,
  translatingSquareFixture,
} from "./fixtures";
export type { TranslatingSquareFixture } from "./fixtures";

export {
  CANONICAL_KEYFRAME_ID,
  CANONICAL_KEYFRAME_TIME_SEC,
  CANONICAL_LINEAGE,
  CANONICAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_GATE,
  CLEARED_CHEST_GATE_SCORE,
  CLEARED_CHEST_QUAD_NORM,
  CLEARED_CHEST_QUAD_TUPLE,
  CLEARED_CHEST_REPAIR_METHOD_VERSION,
  CLEARED_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_CLAIM,
  CLEARED_SLEEVE_EVIDENCE,
  CLEARED_SLEEVE_GATE,
  CLEARED_SLEEVE_GATE_SCORE,
  CLEARED_SLEEVE_LEFT_QUAD_NORM,
  CLEARED_SLEEVE_LEFT_QUAD_TUPLE,
  CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
  CLEARED_SLEEVE_RIGHT_QUAD_NORM,
  CLEARED_SLEEVE_RIGHT_QUAD_TUPLE,
  quadNormToTuple,
  tupleToQuadNorm,
} from "./canonicalLineage";
export type { CanonicalLineage, QuadTuple } from "./canonicalLineage";

export {
  PENDING_SLEEVE_SLOTS,
  clearedChestAndSleeveQuadSet,
  clearedChestApprovedQuad,
  clearedChestQuadSet,
  clearedSleeveLeftApprovedQuad,
  clearedSleeveRightApprovedQuad,
  gatedApprovedQuads,
} from "./approvedQuad";
export type {
  ApprovedQuad,
  ApprovedQuadKind,
  ApprovedQuadSet,
  RepairGateStatus,
  ReservedSleeveSlot,
} from "./approvedQuad";

export {
  DEFAULT_SLEEVE_STILL_GATE,
  TEMPORAL_LIVE_ACTIVATION_ARMED,
  TEMPORAL_LIVE_DEPLOY_NOTES,
  TEMPORAL_LIVE_PREP_CONTRACT_VERSION,
  armedActivationForCanonicalLineage,
  defaultActivationForCanonicalLineage,
  evaluateTemporalLiveActivation,
} from "./livePrep";
export type {
  ActivationWaitToken,
  SleeveStillGate,
  TemporalLiveActivationDecision,
  TemporalLiveActivationInput,
} from "./livePrep";

export {
  TEMPORAL_JOB_PROVIDER_NONE,
  approvedQuadToPropagationInput,
  buildPropagationJobsFromApprovedSet,
  cloneClipFrames,
} from "./quadAdapter";
export type { BuildJobsOptions, PropagationJobSpec } from "./quadAdapter";

export { prepareHeroFrameTemporalHook } from "./heroFrameHook";
export type { HeroFrameTemporalHookInput, HeroFrameTemporalHookResult } from "./heroFrameHook";

export {
  TEMPORAL_EDGE_ADAPTER_VERSION,
  authorizeTemporalEdgeRequest,
  buildTemporalEdgeRequest,
} from "./edgeAdapter";
export type {
  TemporalEdgeAuthorization,
  TemporalEdgeRejectCode,
  TemporalEdgeRequest,
} from "./edgeAdapter";

export {
  CLEARED_CHEST_FIXTURE_DX_PER_FRAME,
  CLEARED_CHEST_FIXTURE_FRAME_COUNT,
  CLEARED_CHEST_FIXTURE_SIZE,
  clearedChestApprovedSet,
  clearedChestTranslatingFixture,
  expectedChestQuadAtFrame,
  expectedChestTranslation,
} from "./clearedChestFixture";

export {
  TEMPORAL_EDGE_DISPATCH_VERSION,
  TEMPORAL_PROPAGATE_LIMITS,
  dispatchTemporalPropagate,
  parseTemporalPropagateClip,
  sourceClipToWire,
} from "./edgeDispatch";
export type {
  TemporalPropagateDispatchResult,
  TemporalPropagateJobResult,
  TemporalPropagateSerializedFrame,
  TemporalPropagateWireBody,
  TemporalPropagateWireClip,
  TemporalPropagateWireFrame,
} from "./edgeDispatch";
