/**
 * Lane H — reusable playable reconstruct contract.
 *
 * Clip-agnostic: a second project/clip fills PlayableClipSpec and uses the
 * same compose → encode → E2-hook path. Canonical Architecture C IDs are
 * one spec, not orchestration.
 *
 * Isolated. Does not edit logoComposite, sleeve paint, eval scoring,
 * temporal QA metrics, or pipeline Product OS.
 */

export const PLAYABLE_RECONSTRUCT_VERSION = "1.0.0" as const;
export const PLAYABLE_E2_HOOK_SCHEMA = "avt.reconstruct.playable.e2-hook.v1" as const;

/** Architecture C working raster (still 2aa1a44c / SAM-3 1h / chest 1m). */
export const PLAYABLE_WORKING_WIDTH = 720;
export const PLAYABLE_WORKING_HEIGHT = 1280;
export const PLAYABLE_WORKING_FPS = 24;

/**
 * Entire canonical Hero Frame clip window (~0:03).
 * keyframe t=0.785 → index 19 at 24 fps.
 */
export const CANONICAL_CLIP_DURATION_SEC = 3;
export const CANONICAL_CLIP_FRAME_COUNT = 72;
export const CANONICAL_CLIP_KEYFRAME_INDEX = 19;

/**
 * In-browser Hero Frame export uses a short window of the SAME 720×1280
 * pipeline. Not the 80×128 / 5-frame RECONSTRUCT-1 fixture.
 */
export const HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT = 8;
export const HERO_FRAME_PLAYABLE_EXPORT_KEYFRAME_INDEX = 2;

/**
 * Live WebCodecs sample of the committed **72-frame gate MP4**.
 * Same count as the UI compose window by memory budget (~29 MB RGBA),
 * **not** the 8-frame in-memory compose (false FAIL 6/9). Full 72-frame
 * decode remains the node/ffmpeg CI path.
 */
export const LIVE_PLAYABLE_DECODE_MAX_FRAMES = 8;

/** Must stay ≤ temporal search radius (6) or hops fail-match. */
export const PLAYABLE_DX_PER_FRAME = 2;

/**
 * Live `temporal-propagate-proxy` cap (YELLOW vs canonical 241-frame
 * master). Do not silently raise. In-lib `propagateRepair` has no cap;
 * a live-proxy path must chunk jobs to this width and stitch.
 */
export const LIVE_PROXY_MAX_FRAMES = 24;

export type PlayableMediaKind =
  | "canonical_720x1280_still_derived"
  | "ingested_frames"
  | "hero_frame_video_extract";

export type Sam3ConsumeSource = "intended_stage1h_evidence" | "caller_supplied" | "missing";

export type Sam3FallbackStatus = "none" | "rejected_not_used" | "not_applicable";

export type Sam3FailureBehavior =
  | "fail_closed_size_mismatch"
  | "fail_closed_missing_required"
  | "none";

/**
 * Catalog ids owned by Product OS (`src/lib/pipeline/catalog.ts`).
 * Playable copies the union so reconstruct does not import pipeline.
 */
export type PlayableCatalogId = "canonical-ysl-ice-on" | "ysl-ice-on-v2-edited-clip";

export type PlayableClipSpec = {
  projectId: string;
  masterClipAssetId: string;
  stillAssetId: string;
  garmentId?: string;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSec: number;
  keyframeIndex: number;
  keyframeId: string;
  keyframeTimeSec: number;
  dxPerFrame: number;
  /** Product OS catalog when this spec was bound from a catalog. */
  catalogId?: PlayableCatalogId;
  /**
   * Parent original master when `masterClipAssetId` is a generation_clip
   * (V2 edited_clip `f31bd0f2` → parent `76fe7438`).
   */
  parentMasterClipAssetId?: string;
};

export type Sam3Provenance = {
  source: Sam3ConsumeSource;
  evidenceId: string | null;
  sourceCommit: string | null;
  repairMethodVersion: string | null;
  liveFetch: false;
  fallbackStatus: Sam3FallbackStatus;
  failureBehavior: Sam3FailureBehavior;
  failure: { code: string; message: string } | null;
  width: number;
  height: number;
  outfitCoverage: number;
  repairCoverage: number;
};

export type PlayableAudioClaims = {
  present: boolean;
  preserved: boolean | null;
  sync: boolean | null;
  note: string;
};

export type PlayableMp4Claims = {
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  durationSec: number;
  codec: string;
  container: string;
  pixelFormat: string;
  audio: PlayableAudioClaims;
};

export type PlayableArtifactClaims = {
  playableVersion: typeof PLAYABLE_RECONSTRUCT_VERSION;
  mediaKind: PlayableMediaKind;
  lineage: PlayableClipSpec;
  sam3: Sam3Provenance;
  mp4: PlayableMp4Claims;
  masterClipAssetId: string;
  originalPixelsPreservedWhereUnauthorized: boolean;
  temporalJobCount: number;
  temporalFramesUsed: number;
  temporalChunking?: {
    maxFrames: number;
    chunkCount: number;
    didChunk: boolean;
    raisedProxyMaxFrames: false;
    yellowContracts: string[];
  };
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  provider: "none";
  edgeFunction: null;
};

export type PlayableE2Hook = {
  schemaVersion: typeof PLAYABLE_E2_HOOK_SCHEMA;
  scoringOwner: "lane_e2";
  scoringModules: "src/lib/eval/**";
  note: "Lane H emits this hook. Lane E2 owns scoring implementations.";
  artifact: PlayableArtifactClaims;
  composeSelfCheck: {
    originalPixelsPreservedWhereUnauthorized: boolean;
    frameCount: number;
    temporalJobsConsumed: number;
    sam3Consumed: boolean;
    paidCalls: false;
    grokPerFrame: false;
  };
  evaluatorInput: {
    mp4RelativePath: string;
    claimsRelativePath: string;
    hookRelativePath: string;
    masterClipAssetId: string;
    width: number;
    height: number;
    frameCount: number;
    fps: number;
  };
};
