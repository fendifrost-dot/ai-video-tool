/**
 * Frozen canonical master-clip metadata for Lane C2 temporal video QA.
 * Copied from documented IMG_5633 / asset 76fe7438 evidence — not imported
 * from reconstruct owners (collision policy). No live pixels.
 */

import { CANONICAL_KEYFRAME_TIME_SEC } from "./canonicalLineage";

/** Original master clip (player / Lane D master). */
export const CANONICAL_MASTER_CLIP_ID = "76fe7438-671d-4428-a7f6-17a45e98c16f";

/** Native raster of the H.264 cloud copy (not ingested by this QA lane). */
export const CANONICAL_CLIP_NATIVE_WIDTH = 1080;
export const CANONICAL_CLIP_NATIVE_HEIGHT = 1920;
export const CANONICAL_CLIP_NATIVE_FPS = 59.94;
export const CANONICAL_CLIP_FRAME_COUNT = 241;
export const CANONICAL_CLIP_DURATION_SEC = 4.0207;

/**
 * Frame index of keyframe `v2-still-0.785` on the native 59.94 fps timeline.
 * round(0.785 * 59.94) = 47.
 */
export const CANONICAL_CLIP_KEYFRAME_FRAME_INDEX = Math.round(
  CANONICAL_KEYFRAME_TIME_SEC * CANONICAL_CLIP_NATIVE_FPS,
);

export const CANONICAL_CLIP_PIXELS = "synthetic_luma_stand_in_not_live_1080x1920" as const;

export const CANONICAL_CLIP_META = {
  id: CANONICAL_MASTER_CLIP_ID,
  nativeWidth: CANONICAL_CLIP_NATIVE_WIDTH,
  nativeHeight: CANONICAL_CLIP_NATIVE_HEIGHT,
  nativeFps: CANONICAL_CLIP_NATIVE_FPS,
  frameCount: CANONICAL_CLIP_FRAME_COUNT,
  durationSec: CANONICAL_CLIP_DURATION_SEC,
  keyframeTimeSec: CANONICAL_KEYFRAME_TIME_SEC,
  keyframeFrameIndex: CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
  pixels: CANONICAL_CLIP_PIXELS,
} as const;

export type CanonicalClipMeta = typeof CANONICAL_CLIP_META;
