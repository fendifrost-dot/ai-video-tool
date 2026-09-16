export {
  CANONICAL_CLIP_DURATION_SEC,
  CANONICAL_CLIP_FRAME_COUNT,
  CANONICAL_CLIP_KEYFRAME_INDEX,
  HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT,
  LIVE_PROXY_MAX_FRAMES,
  PLAYABLE_E2_HOOK_SCHEMA,
  PLAYABLE_RECONSTRUCT_VERSION,
  PLAYABLE_WORKING_FPS,
  PLAYABLE_WORKING_HEIGHT,
  PLAYABLE_WORKING_WIDTH,
} from "./contract";
export type {
  PlayableArtifactClaims,
  PlayableClipSpec,
  PlayableE2Hook,
  PlayableMp4Claims,
  Sam3Provenance,
} from "./contract";

export { canonicalPlayableSpec, heroFramePlayableSpec } from "./spec";
export { consumeIntendedSam3, INTENDED_SAM3_EVIDENCE_ID } from "./sam3Consume";
export { buildPlayableMediaPack, buildStableOriginal, playableFrameAt } from "./mediaPack";
export { lumaFramesToSourceClip, propagatePlayableClip } from "./temporalFullClip";
export { runPlayableCompose } from "./compose";
export type { PlayableComposeResult } from "./compose";
export { encodePlayableMp4, ffmpegAvailable, probePlayableMp4 } from "./encodeMp4";
export { buildPlayableArtifactClaims, buildPlayableE2Hook, playableE2HookToJson } from "./e2Hook";
export { buildPlayableLaneHHandoff, RECONSTRUCT_LANE_H_HANDOFF_VERSION } from "./handoff";
export {
  PLAYABLE_MP4_RELATIVE_PATH,
  PLAYABLE_VIDEO_QA_ARTIFACT_ID,
  PLAYABLE_VIDEO_QA_RELATIVE_PATH,
  evaluatePlayableVideoQa,
  evaluatePlayableVideoQaFromE2e,
  persistPlayableVideoQaJson,
  playableComposeToReconstructE2e,
  playableMp4Ref,
} from "./videoQaPlug";
export {
  HERO_FRAME_PLAYABLE_EXPORT_VERSION,
  formatHeroFramePlayableExportCopy,
  heroFramePlayableExportEnabled,
  prepareHeroFramePlayableExport,
  runHeroFramePlayableExport,
  summarizePlayableCompose,
} from "./heroFrameExport";
