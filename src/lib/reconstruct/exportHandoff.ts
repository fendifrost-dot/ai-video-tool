/**
 * Lane H MP4 provenance — reconstruct frame-stream claims.
 *
 * Reconstruct owns ordered RGBA frames + dims/fps/duration derived from that
 * stream. Lane H owns container, video/audio codec, and mux. This module
 * does not import `src/lib/export/**` and does not encode.
 */

import { CANONICAL_MASTER_CLIP_ID, CANONICAL_PROJECT_ID } from "./canonicalLineage";
import type { ReconstructClipResult } from "./adapters";
import type { Sam3ConsumeProvenance } from "./sam3Consume";

export const RECONSTRUCT_LANE_H_HANDOFF_VERSION = "reconstruct-lane-h-handoff-v2" as const;

export const RECONSTRUCT_LANE_H_PROVENANCE_CLAIMS = [
  "original_pixels_preserved_where_unauthorized",
  "generated_is_not_master",
  "dims_from_reconstruct_frame_stream",
  "fps_from_reconstruct_frame_stream",
  "duration_from_frame_count_over_fps",
  "codec_not_chosen_by_reconstruct",
  "audio_passthrough_untouched_by_reconstruct",
] as const;

export type ReconstructLaneHCodecClaims = {
  reconstructDoesNotChooseCodec: true;
  /** Reconstruct emits this pixel format; Lane H maps it into a video codec. */
  pixelFormat: "rgba8";
  videoCodec: null;
  audioCodec: null;
  container: null;
};

export type ReconstructLaneHHandoff = {
  schemaVersion: typeof RECONSTRUCT_LANE_H_HANDOFF_VERSION;
  ownedBy: "lane_d_reconstruct";
  exportOwnedBy: "lane_h";
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  stillGoldensReopened: false;
  projectId: string;
  masterClipAssetId: string;
  clipId: string;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSec: number;
  frameIndices: number[];
  originalPixelsPreservedWhereUnauthorized: boolean;
  unauthorizedLeakCount: number;
  audio: {
    reconstructTouchesAudio: false;
    passthrough: true;
    muxOwnedBy: "lane_h";
  };
  mp4: {
    reconstructDoesNotEncode: true;
    reconstructProvides: "frame_rgba_sequence";
    dims: { width: number; height: number };
    fps: number;
    durationSec: number;
    frameCount: number;
    codecClaims: ReconstructLaneHCodecClaims;
    provenanceClaims: typeof RECONSTRUCT_LANE_H_PROVENANCE_CLAIMS;
  };
  sam3?: Pick<
    Sam3ConsumeProvenance,
    "source" | "fallbackStatus" | "liveFetchAttempted" | "paidCalls" | "failure"
  > & { checksum: string | null };
};

export type ReconstructLaneHHandoffInput = {
  clip: ReconstructClipResult;
  fps?: number;
  unauthorizedLeakCount?: number;
  sam3Provenance?: Sam3ConsumeProvenance;
};

export function durationSecFromFrameStream(frameCount: number, fps: number): number {
  if (!(fps > 0) || !(frameCount >= 0)) return 0;
  return frameCount / fps;
}

export function buildReconstructLaneHHandoff(
  input: ReconstructLaneHHandoffInput,
): ReconstructLaneHHandoff {
  const { clip } = input;
  const width = clip.width;
  const height = clip.height;
  const fps =
    input.fps ??
    (clip.fps && clip.fps > 0 ? clip.fps : 24);
  const frameCount = clip.frames.length;
  const durationSec = durationSecFromFrameStream(frameCount, fps);
  const sam3 = input.sam3Provenance;
  return {
    schemaVersion: RECONSTRUCT_LANE_H_HANDOFF_VERSION,
    ownedBy: "lane_d_reconstruct",
    exportOwnedBy: "lane_h",
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    stillGoldensReopened: false,
    projectId: clip.projectId || CANONICAL_PROJECT_ID,
    masterClipAssetId: clip.masterClipAssetId || CANONICAL_MASTER_CLIP_ID,
    clipId: clip.clipId,
    width,
    height,
    fps,
    frameCount,
    durationSec,
    frameIndices: clip.frames.map((f) => f.index),
    originalPixelsPreservedWhereUnauthorized: clip.originalPixelsPreservedWhereUnauthorized,
    unauthorizedLeakCount: input.unauthorizedLeakCount ?? 0,
    audio: {
      reconstructTouchesAudio: false,
      passthrough: true,
      muxOwnedBy: "lane_h",
    },
    mp4: {
      reconstructDoesNotEncode: true,
      reconstructProvides: "frame_rgba_sequence",
      dims: { width, height },
      fps,
      durationSec,
      frameCount,
      codecClaims: {
        reconstructDoesNotChooseCodec: true,
        pixelFormat: "rgba8",
        videoCodec: null,
        audioCodec: null,
        container: null,
      },
      provenanceClaims: RECONSTRUCT_LANE_H_PROVENANCE_CLAIMS,
    },
    sam3: sam3
      ? {
          source: sam3.source,
          fallbackStatus: sam3.fallbackStatus,
          liveFetchAttempted: sam3.liveFetchAttempted,
          paidCalls: sam3.paidCalls,
          failure: sam3.failure,
          checksum: sam3.mask?.checksum ?? null,
        }
      : undefined,
  };
}
