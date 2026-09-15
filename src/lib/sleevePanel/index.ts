/**
 * Lane B public surface — visible sleeve-panel repair + mask/geometry contract.
 *
 * Isolated engine + live still adapter. Chest paint (logoComposite) stays out.
 */

export {
  CROSSED_ARMS_POSE,
  CROSSED_ARMS_VISIBILITY,
  SLEEVE_PANEL_CLAIM,
  SLEEVE_PANEL_CONTRACT_VERSION,
} from "./types";
export type {
  BinaryMask,
  NormBbox,
  Point,
  QuadNorm,
  QuadPts,
  RgbaImage,
  SleeveSide,
  UnvalidatedSleeveRegion,
  ValidatedSleeveRegion,
  VisibilityManifest,
} from "./types";

export {
  CHEST_OUTPUT_SLOT_KIND,
  assertSleevePanelContract,
  defaultVisibilityManifest,
  parseChestOutputSlot,
  sleevePanelClaimsNeverValidateHidden,
} from "./contract";
export type {
  ChestOutputConsumptionSlot,
  SleeveNavyFillMode,
  SleevePanelSideResult,
  SleevePanelStageInput,
  SleevePanelStageOutput,
  VisibleSleevePanelSpec,
} from "./contract";

export {
  HIDDEN_COVERAGE_MAX,
  VISIBLE_COVERAGE_MIN,
  assessVisibleSleeveQuad,
  poseLockStatement,
} from "./visibleGeometry";
export type { VisibleQuadAssessment } from "./visibleGeometry";

export { repairVisibleSleevePanels } from "./repair";

export {
  NAVY_CROP_MIN_FRACTION,
  NAVY_MAJORITY_FRACTION,
  PRODUCT_NAVY_FALLBACK,
  findVerticalNavyBbox,
  isSleeveCreamOrWhite,
  isSleeveProductNavy,
  navyFraction,
  preferProductNavyOverCream,
  resolveNavyPanelSource,
} from "./navyFill";
export type { NavyFillMode, NavyPanelSource } from "./navyFill";

export {
  CANONICAL_HIDDEN_BOXES,
  CANONICAL_VISIBLE_UPPER_ARM_BOXES,
  DEFAULT_FLAT_SLEEVE_SOURCE_BBOX,
  LIVE_CHEST_RESERVED_QUAD_NORM,
  SEEDED_VISIBLE_SLEEVE_QUADS,
  SLEEVE_STILL_REPAIR_METHOD_VERSION,
  assessSleevePanelQuadPlacement,
  buildCanonicalHiddenMask,
  buildCanonicalVisibleMask,
  buildChestOutputSlotFromLive,
  rasterizeReservedChestMask,
  repairVisibleSleevePanelsOnStill,
} from "./liveStill";
export {
  CANONICAL_CLEAN_STILL_ASSET_ID,
  PREFERRED_CHEST_OUTPUT_ASSET_ID,
  SLEEVE_LIVE_EXPECTED_METHOD,
  SLEEVE_LIVE_SCORECARD_VERSION,
  evaluateSleeveStillLive,
  formatSleeveLiveSummary,
  pixelTargetQuadToNorm,
  scoreC11Outside,
  scoreC5Forearm,
  scoreChestReserved,
  scoreSleeveGeometry,
  scoreSleeveIdentity,
  scoreVisibleRepair,
  sleeveLiveEvidenceCrops,
} from "./liveScore";
export type {
  SleeveCriterionResult,
  SleeveGate,
  SleeveLiveIdentityInput,
  SleeveLiveScore,
} from "./liveScore";
export type {
  SleevePanelLiveInput,
  SleevePanelLiveMeta,
  SleevePanelLiveResult,
  SleeveQuadPlacementAssessment,
} from "./liveStill";

export {
  DEFAULT_PANELS,
  FLAT_PANEL_BBOX,
  LEFT_HIDDEN_SHOULDER_TO_CUFF_QUAD,
  LEFT_VISIBLE_QUAD,
  RIGHT_VISIBLE_QUAD,
  buildChestOutputSlot,
  buildCrossedArmsSleeveFixture,
  buildCrossedArmsStill,
  buildFlatSleeveRef,
  buildHiddenMask,
  buildVisibleMask,
} from "./fixtures";
export {
  LIVE_1B_LEFT_CREAM,
  LIVE_1B_RIGHT_V2_RING,
  STAGE1B_CREAM_MAJORITY_NAVY_FRACTION,
  buildCreamMajorityNavyStripeFlat,
  buildStage1bRightLeftoverStill,
  stage1bLeftoverRequestedNavyFraction,
  warpRequestedCropAsIs,
} from "./stage1bRightLeftover";
