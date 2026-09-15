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

export { cloneMask, emptyMask, maskArea, maskBBox, maskIoU, paintRectMask, warpMask } from "./mask";

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
