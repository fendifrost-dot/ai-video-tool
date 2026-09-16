export {
  CANONICAL_CLIP_DURATION_SEC,
  CANONICAL_CLIP_FRAME_COUNT,
  CANONICAL_CLIP_KEYFRAME_INDEX,
  HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT,
  LIVE_PLAYABLE_DECODE_MAX_FRAMES,
  LIVE_PLAYABLE_DECODE_FALLBACK_STEPS,
  LIVE_PLAYABLE_RGBA_BYTES_PER_FRAME,
  LIVE_PROXY_MAX_FRAMES,
  PLAYABLE_E2_HOOK_SCHEMA,
  PLAYABLE_RECONSTRUCT_VERSION,
  PLAYABLE_WORKING_FPS,
  PLAYABLE_WORKING_HEIGHT,
  PLAYABLE_WORKING_WIDTH,
  livePlayableDecodeTimeoutMs,
  livePlayableRgbaBudgetBytes,
  resolveLivePlayableDecodeLadder,
} from "./contract";
export type {
  PlayableArtifactClaims,
  PlayableCatalogId,
  PlayableClipSpec,
  PlayableE2Hook,
  PlayableMp4Claims,
  Sam3Provenance,
} from "./contract";

export { canonicalPlayableSpec, heroFramePlayableSpec } from "./spec";
export {
  CANONICAL_PLAYABLE_ARTIFACT_LAYOUT,
  CANONICAL_PLAYABLE_CATALOG_ID,
  SECOND_CLIP_PARENT_MASTER_ID,
  SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT,
  SECOND_CLIP_PLAYABLE_CATALOG_ID,
  SECOND_CLIP_PLAYABLE_CLIP_ID,
  SECOND_CLIP_PLAYABLE_FRAME_COUNT,
  SECOND_CLIP_PLAYABLE_KEYFRAME_INDEX,
  SECOND_CLIP_PLAYABLE_PROJECT_ID,
  livePlayableExportCleared,
  playableArtifactLayoutForCatalog,
  playablePortabilityDesign,
  playableSpecFromCatalog,
  secondClipPlayableSpec,
} from "./catalogBind";
export type { PlayableArtifactLayout } from "./catalogBind";
export { consumeIntendedSam3, INTENDED_SAM3_EVIDENCE_ID } from "./sam3Consume";
export { buildPlayableMediaPack, buildStableOriginal, playableFrameAt } from "./mediaPack";
export { lumaFramesToSourceClip, propagatePlayableClip } from "./temporalFullClip";
export {
  PROXY_CHUNK_OVERLAP,
  YELLOW_EDGE_MAX_FRAMES_VS_CANONICAL,
  planProxyTemporalChunks,
  propagatePlayableClipChunked,
  stitchConsumedJobs,
} from "./temporalChunk";
export { runPlayableCompose } from "./compose";
export type { PlayableComposeResult } from "./compose";
export { encodePlayableMp4, ffmpegAvailable, probePlayableMp4 } from "./encodeMp4";
export { decodePlayableMp4 } from "./decodeMp4";
export type {
  DecodePlayableMp4Result,
  DecodePlayableMp4Ok,
  DecodePlayableMp4Fail,
} from "./decodeMp4";
export { buildPlayableArtifactClaims, buildPlayableE2Hook, playableE2HookToJson } from "./e2Hook";
export { buildPlayableLaneHHandoff, RECONSTRUCT_LANE_H_HANDOFF_VERSION } from "./handoff";
export {
  PLAYABLE_MP4_BYTE_LENGTH,
  PLAYABLE_MP4_RELATIVE_PATH,
  PLAYABLE_MP4_SHA256,
  PLAYABLE_VIDEO_QA_ARTIFACT_ID,
  PLAYABLE_VIDEO_QA_RELATIVE_PATH,
  SECOND_CLIP_PLAYABLE_MP4_BYTE_LENGTH,
  SECOND_CLIP_PLAYABLE_MP4_SHA256,
  committedPlayableMp4Ref,
  committedSecondClipPlayableMp4Ref,
  evaluatePlayableVideoQa,
  evaluatePlayableVideoQaFromE2e,
  persistPlayableVideoQaJson,
  playableComposeToReconstructE2e,
  playableDecodedToVideoQaFrames,
  playableMp4Ref,
  playableMp4RefForLayout,
} from "./videoQaPlug";
export type { PlayableDecodedRgba, PlayableVideoQaResult } from "./videoQaPlug";
export {
  decodeCommittedPlayableMp4ForLive,
  decodePlayableMp4Browser,
  fetchPlayableMp4Bytes,
  formatPlayableBrowserDecodeNote,
  webCodecsVideoDecoderAvailable,
  committedPlayableMp4FetchCandidates,
  classifyLiveDecodeFailure,
  isRecoverableLiveDecodeFailure,
} from "./decodeMp4Browser";
export type {
  DecodePlayableMp4BrowserResult,
  DecodePlayableMp4BrowserOk,
  DecodePlayableMp4BrowserFail,
  LivePlayableDecodeFallbackReason,
} from "./decodeMp4Browser";
export {
  HERO_FRAME_PLAYABLE_EXPORT_VERSION,
  formatHeroFramePlayableExportCopy,
  heroFramePlayableExportEnabled,
  prepareHeroFramePlayableExport,
  runHeroFramePlayableExport,
  runHeroFramePlayableExportLive,
  summarizePlayableCompose,
  heroFrameDecodedFromRgba,
} from "./heroFrameExport";
export type {
  HeroFramePlayableExportOpts,
  HeroFramePlayableExportLiveOpts,
} from "./heroFrameExport";
