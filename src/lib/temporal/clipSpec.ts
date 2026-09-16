/**
 * Portable clip identity for Lane C2 temporal QA.
 * Canonical master is 76fe7438; a second synthetic spec proves the runner
 * is not hardcoded to 241 / 59.94. No live pixels.
 */

import { CANONICAL_KEYFRAME_TIME_SEC } from "./canonicalLineage";
import {
  CANONICAL_CLIP_FRAME_COUNT,
  CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
  CANONICAL_CLIP_NATIVE_FPS,
  CANONICAL_CLIP_NATIVE_HEIGHT,
  CANONICAL_CLIP_NATIVE_WIDTH,
  CANONICAL_CLIP_PIXELS,
  CANONICAL_MASTER_CLIP_ID,
} from "./canonicalClip";

export type TemporalQaClipSpec = {
  id: string;
  frameCount: number;
  fps: number;
  keyframeIndex: number;
  keyframeTimeSec: number;
  nativeWidth: number;
  nativeHeight: number;
  qaRaster: { width: number; height: number };
  pixels: string;
  lineageNote: string;
};

export const CANONICAL_QA_CLIP_SPEC: TemporalQaClipSpec = {
  id: CANONICAL_MASTER_CLIP_ID,
  frameCount: CANONICAL_CLIP_FRAME_COUNT,
  fps: CANONICAL_CLIP_NATIVE_FPS,
  keyframeIndex: CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
  keyframeTimeSec: CANONICAL_KEYFRAME_TIME_SEC,
  nativeWidth: CANONICAL_CLIP_NATIVE_WIDTH,
  nativeHeight: CANONICAL_CLIP_NATIVE_HEIGHT,
  qaRaster: { width: 80, height: 128 },
  pixels: CANONICAL_CLIP_PIXELS,
  lineageNote: "canonical master 76fe7438 — IMG_5633 H.264 cloud copy metadata",
};

/**
 * Portability probe — not a production master.
 * Different id / duration / fps / keyframe so QA + chunking cannot assume 241@59.94.
 */
export const SECOND_QA_CLIP_SPEC: TemporalQaClipSpec = {
  id: "temporal-qa-second-clip-synthetic",
  frameCount: 72,
  fps: 24,
  keyframeIndex: 18,
  keyframeTimeSec: 0.75,
  nativeWidth: 720,
  nativeHeight: 1280,
  qaRaster: { width: 40, height: 64 },
  pixels: "synthetic_luma_stand_in_not_live_pixels",
  lineageNote:
    "portability probe — not a production master; proves QA/chunking is not hardcoded to 76fe7438",
};

export function keyframeIndexForSpec(spec: Pick<TemporalQaClipSpec, "keyframeTimeSec" | "fps">): number {
  return Math.round(spec.keyframeTimeSec * spec.fps);
}
