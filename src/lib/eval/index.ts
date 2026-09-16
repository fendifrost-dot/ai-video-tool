/**
 * Lane E / E2 — Automated Visual Evaluation.
 *
 * Ownership: evaluator / metrics / diffs / crops / JSON PASS/FAIL + related tests.
 * Does not implement Architecture C paint, temporal core, pipeline OS, or finishing.
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
export { STAGE1L_LIVE_VERIFIED } from "./stage1lEvidence";
export { STAGE1M_LIVE_VERIFIED } from "./stage1mEvidence";
export { SLEEVE_STILL_1A_LIVE_VERIFIED } from "./sleeveStill1aEvidence";
export { SLEEVE_STILL_1B_LIVE_VERIFIED } from "./sleeveStill1bEvidence";
export { SLEEVE_STILL_1C_LIVE_VERIFIED } from "./sleeveStill1cEvidence";
export {
  RECONSTRUCT_VIDEO_EVAL_SPEC_VERSION,
  evaluateReconstructE2eResult,
  evaluateReconstructedClip,
  reconstructVideoReportToJson,
} from "./reconstructVideoEvaluator";
export {
  VIDEO_QA_SPEC_VERSION,
  type VideoQaInput,
  type VideoQaJson,
  type VideoQaReport,
} from "./videoQaTypes";
export { evaluateVideoQa } from "./videoQaEvaluator";
export { PRESERVATION_FAIL_ESCALATE, PRESERVATION_FAIL_ESCALATE_MESSAGE } from "./videoQaCriteria";
export {
  formatVideoQaSummary,
  materializeVideoQaFiles,
  serializeVideoQaReport,
  videoQaReportToJson,
} from "./videoQaArtifacts";
export {
  videoQaInputFromFrames,
  videoQaInputFromReconstructClip,
  videoQaInputFromReconstructE2e,
} from "./videoQaAdapter";
export {
  VIDEO_QA_FULLCLIP_HEIGHT,
  VIDEO_QA_FULLCLIP_MODULE_PATH,
  VIDEO_QA_FULLCLIP_WIDTH,
  VIDEO_QA_REAL_MEDIA_HOOK,
  fullClip720FromDecodedFrames,
  fullClip720Input,
  secondClipFullClipInput,
} from "./fixtures/fullClip720";
