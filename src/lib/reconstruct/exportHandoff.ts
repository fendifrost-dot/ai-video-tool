/**
 * Lane H export handoff — reconstruct correctness + provenance claims.
 *
 * Lane D2 owns reconstructed frame RGBA and original-master preservation.
 * Lane H owns MP4 mux / encode / review artifact. This module does not
 * import `src/lib/export/**`.
 */

import {
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_MASTER_FPS,
  CANONICAL_PROJECT_ID,
} from "./canonicalLineage";
import type { ReconstructClipResult } from "./adapters";

export const RECONSTRUCT_LANE_H_HANDOFF_VERSION = "reconstruct-lane-h-handoff-v1" as const;

export const RECONSTRUCT_LANE_H_PROVENANCE_CLAIMS = [
  "original_pixels_preserved_where_unauthorized",
  "generated_is_not_master",
  "resolution_matches_reconstructed_frames",
  "fps_passthrough_metadata",
  "audio_passthrough_untouched_by_reconstruct",
] as const;

export type ReconstructLaneHHandoff = {
  schemaVersion: typeof RECONSTRUCT_LANE_H_HANDOFF_VERSION;
  ownedBy: "lane_d2_reconstruct";
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
    provenanceClaims: typeof RECONSTRUCT_LANE_H_PROVENANCE_CLAIMS;
  };
};

export type ReconstructLaneHHandoffInput = {
  clip: ReconstructClipResult;
  fps?: number;
  unauthorizedLeakCount: number;
};

export function buildReconstructLaneHHandoff(
  input: ReconstructLaneHHandoffInput,
): ReconstructLaneHHandoff {
  const { clip } = input;
  const width = clip.width;
  const height = clip.height;
  return {
    schemaVersion: RECONSTRUCT_LANE_H_HANDOFF_VERSION,
    ownedBy: "lane_d2_reconstruct",
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
    fps: input.fps ?? CANONICAL_MASTER_FPS,
    frameCount: clip.frames.length,
    frameIndices: clip.frames.map((f) => f.index),
    originalPixelsPreservedWhereUnauthorized: clip.originalPixelsPreservedWhereUnauthorized,
    unauthorizedLeakCount: input.unauthorizedLeakCount,
    audio: {
      reconstructTouchesAudio: false,
      passthrough: true,
      muxOwnedBy: "lane_h",
    },
    mp4: {
      reconstructDoesNotEncode: true,
      reconstructProvides: "frame_rgba_sequence",
      provenanceClaims: RECONSTRUCT_LANE_H_PROVENANCE_CLAIMS,
    },
  };
}
