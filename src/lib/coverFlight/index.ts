export type {
  CoverAspect,
  CoverFlightCompileInput,
  CoverFlightCompileResult,
  CoverFlightValidation,
  FlightArrow,
  FlightGuides,
  PathKind,
  Point,
} from "./types";

export {
  buildPresetGuides,
  buildPresetPath,
  classifyCoverAspect,
  describeFlightPath,
  dist,
  MIN_PATH_LENGTH,
  nearestPathT,
  pathLength,
  placePresetArrows,
  pointAt,
  RECOMMENDED_ARROW_COUNT,
  simplifyPath,
  suggestPathKind,
  tangentAt,
  turningHint,
  validateFlightGuides,
} from "./geometry";

export {
  compileCoverFlightFromGuides,
  compileCoverFlightPrompt,
  COVER_FLIGHT_FLOW_SETTINGS,
  COVER_FLIGHT_PATH_PLACEHOLDER,
  COVER_FLIGHT_PROMPT_TEMPLATE,
  GOOGLE_FLOW_URL,
  normalizePathDescription,
  promptForbidsVisibleVehicle,
} from "./prompt";

export { containRect, drawFlightGuides, pointerToNorm, renderAnnotatedCover } from "./draw";
