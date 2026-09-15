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
