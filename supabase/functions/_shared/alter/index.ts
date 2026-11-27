export {
  ALTER_ATTRIBUTION,
  ALTER_CLOSE,
  ALTER_OPENINGS,
  ALTER_PRESETS,
  AVT_PRESETS,
  getPreset,
  listPresets,
  presetGroups,
} from "./catalog.ts";
export { checkAlter, type AlterReport } from "./check.ts";
export { compositeMasked, compositeTargetFrame, muxOriginalAudioArgv } from "./composite.ts";
export {
  CHANGED_RANGE,
  GATE_PROVENANCE,
  IDENTITY_DISTANCE_MAX,
  LANDMARK_DISTANCE_WATCH,
  MOTION_GATED,
  MOTION_MIN,
  MOUTH_COVERAGE_MIN,
  MOUTH_LAG_OK,
  MOUTH_MAX_LAG,
  MOUTH_SHAPE_MAX,
  MOUTH_TIMING_MIN,
  RESTYLE_STRUCTURE_MAX,
  STRUCTURE_FLOOR,
} from "./gates.ts";
export {
  gateTrackScore,
  identityFails,
  opennessFromBox,
  scoreMouth,
  type MouthScore,
  type TrackScore,
} from "./mouth.ts";
export {
  ALTER_ROUTE,
  MAX_FACE_PICTURES,
  planAlter,
  planFinalize,
  type AlterCall,
  type AlterEditBody,
  type AlterPlan,
} from "./plan.ts";
export { buildAlterPrompt } from "./prompt.ts";
export { ALTER_TOOL_NAMES, ALTER_TOOLS } from "./toolDefs.ts";
export { runAlterTool } from "./tools.ts";
export {
  type AlterMode,
  type AlterPreset,
  type CheckMode,
  type GrayFrame,
  type MouthFrame,
  type RgbFrame,
} from "./types.ts";
