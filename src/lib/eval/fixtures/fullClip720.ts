/**
 * Synthetic FULL-CLIP 720×1280 fixture path for Lane H / C2 / D2 real-media probes.
 *
 * Not still goldens. Not live master bytes. E2 does not decode MP4 — hang decoded
 * rasters here and call evaluateVideoQa().
 *
 * Module path (stable hang point):
 *   src/lib/eval/fixtures/fullClip720.ts
 */

import { cloneRgba } from "../pixelMath";
import {
  fixtureMp4Bytes,
  happyPathFrame,
  happyPathFrames,
  scaleBoxFrom16,
  GARMENT_RECT,
  REPAIR_RECT,
} from "../videoQaFixtures";
import type { VideoQaFrame, VideoQaInput, VideoQaMp4Ref, VideoQaProvenance } from "../videoQaTypes";

/** Canonical Architecture C still/video raster. Shape only — not a frozen golden. */
export const VIDEO_QA_FULLCLIP_WIDTH = 720;
export const VIDEO_QA_FULLCLIP_HEIGHT = 1280;
export const VIDEO_QA_FULLCLIP_FRAMES = 8;
export const VIDEO_QA_FULLCLIP_FPS = 24;

export const VIDEO_QA_FULLCLIP_MODULE_PATH = "src/lib/eval/fixtures/fullClip720.ts" as const;

/** Alternate second-clip IDs — must not be required by evaluateVideoQa. */
export const SECOND_CLIP_PROJECT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
export const SECOND_CLIP_MASTER_ID = "f0e1d2c3-b4a5-9687-0f1e-2d3c4b5a6978";

export const CANONICAL_CLIP_PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";
export const CANONICAL_CLIP_MASTER_ID = "76fe7438-671d-4428-a7f6-17a45e98c16f";

export const VIDEO_QA_REAL_MEDIA_HOOK = {
  specVersion: "lane-e2-video-qa-v1" as const,
  modulePath: VIDEO_QA_FULLCLIP_MODULE_PATH,
  raster: { width: VIDEO_QA_FULLCLIP_WIDTH, height: VIDEO_QA_FULLCLIP_HEIGHT },
  fps: VIDEO_QA_FULLCLIP_FPS,
  syntheticFrameCount: VIDEO_QA_FULLCLIP_FRAMES,
  paidCalls: false as const,
  decodeMp4: false as const,
  stillGoldensLocked: true as const,
  entrypoints: {
    happy: "fullClip720Input",
    secondClip: "secondClipFullClipInput",
    hangDecodedFrames: "fullClip720FromDecodedFrames",
  },
} as const;

export const FULLCLIP_GARMENT = scaleBoxFrom16(
  GARMENT_RECT,
  VIDEO_QA_FULLCLIP_WIDTH,
  VIDEO_QA_FULLCLIP_HEIGHT,
);
export const FULLCLIP_REPAIR = scaleBoxFrom16(
  REPAIR_RECT,
  VIDEO_QA_FULLCLIP_WIDTH,
  VIDEO_QA_FULLCLIP_HEIGHT,
);

export function fullClip720Frames(count = VIDEO_QA_FULLCLIP_FRAMES): VideoQaFrame[] {
  return Array.from({ length: count }, (_, i) =>
    happyPathFrame(i, {
      width: VIDEO_QA_FULLCLIP_WIDTH,
      height: VIDEO_QA_FULLCLIP_HEIGHT,
      garment: FULLCLIP_GARMENT,
      repair: FULLCLIP_REPAIR,
    }),
  );
}

function mp4Ref(artifactId: string, path: string): VideoQaMp4Ref {
  const bytes = fixtureMp4Bytes();
  return {
    produced: true,
    artifactId,
    path,
    byteLength: bytes.length,
    mimeType: "video/mp4",
  };
}

export function fullClip720Input(provenance?: VideoQaProvenance): VideoQaInput {
  return {
    paidCalls: false,
    artifact: {
      kind: "reconstructed_mp4",
      width: VIDEO_QA_FULLCLIP_WIDTH,
      height: VIDEO_QA_FULLCLIP_HEIGHT,
      fps: VIDEO_QA_FULLCLIP_FPS,
      mp4: mp4Ref("fullclip-720x1280.mp4", "eval/fixtures/fullclip-720x1280.mp4"),
      frames: fullClip720Frames(),
    },
    provenance: provenance ?? {
      projectId: CANONICAL_CLIP_PROJECT_ID,
      masterClipAssetId: CANONICAL_CLIP_MASTER_ID,
      reconstructionVersion: "fixture-fullclip-720",
      temporalJobCount: 1,
      source: "synthetic_fullclip_720x1280",
    },
  };
}

/** Second existing clip — same raster math, different IDs. */
export function secondClipFullClipInput(): VideoQaInput {
  return fullClip720Input({
    projectId: SECOND_CLIP_PROJECT_ID,
    masterClipAssetId: SECOND_CLIP_MASTER_ID,
    reconstructionVersion: "fixture-fullclip-720-clip-b",
    temporalJobCount: 1,
    source: "synthetic_fullclip_second_clip",
  });
}

/**
 * Hang point for H / C2 / D2: swap in decoded 720×1280 rasters + α.
 * E2 still does not decode the MP4.
 */
export function fullClip720FromDecodedFrames(
  frames: VideoQaFrame[],
  mp4: VideoQaMp4Ref,
  provenance?: VideoQaProvenance,
): VideoQaInput {
  const first = frames[0];
  return {
    paidCalls: false,
    artifact: {
      kind: "reconstructed_mp4",
      width: first?.original.width ?? VIDEO_QA_FULLCLIP_WIDTH,
      height: first?.original.height ?? VIDEO_QA_FULLCLIP_HEIGHT,
      fps: VIDEO_QA_FULLCLIP_FPS,
      mp4,
      frames,
    },
    provenance,
  };
}

export function fullClip720LeakInput(provenance?: VideoQaProvenance): VideoQaInput {
  const input = fullClip720Input(provenance);
  const frames = input.artifact.frames.map((f) => {
    const reconstructed = cloneRgba(f.reconstructed);
    reconstructed.data[0] = (reconstructed.data[0]! + 40) & 255;
    return { ...f, reconstructed };
  });
  return { ...input, artifact: { ...input.artifact, frames } };
}

/** Tiny 16×16 sequence with no provenance — clip-id-agnostic baseline. */
export function anonymousClipInput(): VideoQaInput {
  return {
    paidCalls: false,
    artifact: {
      kind: "reconstructed_frames",
      frames: happyPathFrames(),
    },
  };
}
