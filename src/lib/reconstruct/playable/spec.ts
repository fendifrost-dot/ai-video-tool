/**
 * Default PlayableClipSpec instances. A second clip/project supplies its
 * own spec — compose/encode do not branch on these IDs.
 */

import {
  CANONICAL_KEYFRAME_ID,
  CANONICAL_KEYFRAME_TIME_SEC,
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID,
} from "../canonicalLineage";
import {
  CANONICAL_CLIP_DURATION_SEC,
  CANONICAL_CLIP_FRAME_COUNT,
  CANONICAL_CLIP_KEYFRAME_INDEX,
  HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT,
  HERO_FRAME_PLAYABLE_EXPORT_KEYFRAME_INDEX,
  PLAYABLE_DX_PER_FRAME,
  PLAYABLE_WORKING_FPS,
  PLAYABLE_WORKING_HEIGHT,
  PLAYABLE_WORKING_WIDTH,
  type PlayableClipSpec,
} from "./contract";

export const CANONICAL_GARMENT_ID = "0feb028f-dc4d-45dc-82ac-e4bbd16054b0";

export function canonicalPlayableSpec(overrides: Partial<PlayableClipSpec> = {}): PlayableClipSpec {
  return {
    projectId: CANONICAL_PROJECT_ID,
    masterClipAssetId: CANONICAL_MASTER_CLIP_ID,
    stillAssetId: CANONICAL_STILL_ASSET_ID,
    garmentId: CANONICAL_GARMENT_ID,
    width: PLAYABLE_WORKING_WIDTH,
    height: PLAYABLE_WORKING_HEIGHT,
    fps: PLAYABLE_WORKING_FPS,
    frameCount: CANONICAL_CLIP_FRAME_COUNT,
    durationSec: CANONICAL_CLIP_DURATION_SEC,
    keyframeIndex: CANONICAL_CLIP_KEYFRAME_INDEX,
    keyframeId: CANONICAL_KEYFRAME_ID,
    keyframeTimeSec: CANONICAL_KEYFRAME_TIME_SEC,
    dxPerFrame: PLAYABLE_DX_PER_FRAME,
    ...overrides,
  };
}

/** Same 720×1280 pipeline, short window for Hero Frame / unit tests. */
export function heroFramePlayableSpec(overrides: Partial<PlayableClipSpec> = {}): PlayableClipSpec {
  const frameCount = overrides.frameCount ?? HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT;
  const fps = overrides.fps ?? PLAYABLE_WORKING_FPS;
  return canonicalPlayableSpec({
    frameCount,
    durationSec: frameCount / fps,
    keyframeIndex: HERO_FRAME_PLAYABLE_EXPORT_KEYFRAME_INDEX,
    ...overrides,
  });
}
