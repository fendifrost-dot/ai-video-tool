/**
 * Lane E — Automated Visual Evaluation (chest still 11-point gate).
 *
 * Ownership: evaluator / metrics / diffs / crops / JSON PASS/FAIL + related tests.
 * Does not implement Architecture C paint or occlusion.
 */

export {
  CHEST_EVAL_SPEC_VERSION,
  type ChestVisualReport,
  type EvaluateChestStillInput,
} from "./types";
export {
  CANONICAL_BAND_QUAD_NORM,
  CHEST_CRITERION_DEFS,
  CHEST_REF_FRAME,
  GHOST_RATIO_PASS_CEILING,
} from "./chestCriteria";
export { evaluateChestStill, scoreMidLumaGhosts } from "./chestVisualEvaluator";
export {
  chestEvalReportToJson,
  formatChestEvalSummary,
  materializeChestEvalFiles,
  serializeChestEvalReport,
} from "./visualArtifacts";
export { decodePpm, encodeBmp24, encodePpm } from "./pixelMath";
export { STAGE1J_LIVE_VERIFIED } from "./stage1jEvidence";
export { STAGE1K_LIVE_VERIFIED } from "./stage1kEvidence";
