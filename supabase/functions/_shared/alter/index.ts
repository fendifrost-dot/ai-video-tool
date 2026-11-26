export {
  ALTER_ATTRIBUTION,
  ALTER_CLOSE,
  ALTER_OPENINGS,
  ALTER_PRESETS,
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
  MOTION_MIN,
  MOUTH_TIMING_MIN,
  RESTYLE_STRUCTURE_MAX,
  STRUCTURE_FLOOR,
} from "./gates.ts";
export { identityFails, opennessFromBox, scoreMouth, type MouthScore } from "./mouth.ts";
export { planAlter, planFinalize, type AlterPlan } from "./plan.ts";
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
