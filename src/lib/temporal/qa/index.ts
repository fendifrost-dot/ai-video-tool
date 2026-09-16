export {
  DEFAULT_TEMPORAL_QA_THRESHOLDS,
  TEMPORAL_VIDEO_QA_SPEC_VERSION,
  type TemporalQaThresholds,
} from "./thresholds";

export {
  maskCentroid,
  maskSupportCoverage,
  scorePropagationFrames,
  summarizeCoverage,
  summarizeDrift,
  summarizeFlicker,
  summarizeOcclusion,
  type CoverageSummary,
  type DriftSummary,
  type FlickerSummary,
  type MaskCentroid,
  type OcclusionSummary,
  type TemporalFrameMetrics,
} from "./metrics";

export {
  scoreSam3Continuity,
  unionMaskList,
  type Sam3ContinuitySummary,
  type Sam3FrameContinuity,
} from "./sam3Continuity";

export {
  detectorHitAllWindows,
  identifyBadFrames,
  reasonsForFrame,
  type TemporalBadFrame,
  type TemporalBadFrameReason,
} from "./badFrames";

export {
  TEMPORAL_DISPATCH_LOCK_VERSION,
  TEMPORAL_QA_YELLOW_CONTRACTS,
  YELLOW_E2_CONSUMER_SCHEMA,
  YELLOW_EDGE_MAX_FRAMES,
  YELLOW_LIVE_NATIVE_PIXELS,
  YELLOW_SAM3_LIVE_FETCH,
  inspectTemporalDispatchLock,
  type TemporalDispatchLockReport,
  type TemporalQaYellowContract,
} from "./dispatchLock";

export {
  formatTemporalVideoQaSummary,
  runTemporalVideoQa,
  temporalVideoQaReportToJson,
  type TemporalQaJobReport,
  type TemporalVideoQaReport,
  type TemporalVideoQaVerdict,
} from "./report";

export {
  TEMPORAL_CHUNK_HELPER_VERSION,
  TEMPORAL_CHUNK_OVERLAP,
  chunkCoversClip,
  planTemporalChunks,
  sliceClipForChunk,
  type ChunkDirection,
  type TemporalChunkPlan,
} from "./chunking";

export {
  assertChunkDispatchLocks,
  dispatchTemporalChunk,
  dispatchTemporalChunks,
  stitchChunkDispatches,
  type ChunkSeam,
  type StitchedChunkFrame,
  type TemporalChunkDispatch,
} from "./chunkDispatch";

export {
  TEMPORAL_CHUNKED_QA_SPEC_VERSION,
  TEMPORAL_CHUNK_YELLOW_CONTRACTS,
  YELLOW_CHUNKING_INSUFFICIENT_FOR_TRANSLATION,
  YELLOW_CHUNK_QUAD_RESET,
  chunkedTemporalVideoQaToJson,
  formatChunkedTemporalVideoQaSummary,
  runChunkedTemporalVideoQa,
  type TemporalChunkedQaReport,
} from "./chunkReport";
