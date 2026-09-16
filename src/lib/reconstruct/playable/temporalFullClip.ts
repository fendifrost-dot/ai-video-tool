/**
 * Consume in-lib temporal propagation for a full playable clip.
 *
 * Uses propagateRepair + approved CLEARED quads. Does not edit temporal
 * QA metrics, livePrep, or authorizeTemporalEdgeRequest.
 * Bypasses the edge 24-frame wire cap on purpose (Architecture C window).
 * Live proxy stays maxFrames=24 (YELLOW vs canonical 241) — chunk, don't raise.
 * Full-clip coverage is chunk ≤24 + stitch (propagatePlayableClipChunked).
 */

import {
  buildPropagationJobsFromApprovedSet,
  clearedChestAndSleeveQuadSet,
  propagateRepair,
  type ApprovedQuadSet,
  type SourceClip,
} from "@/lib/temporal";
import type { ConsumedTemporalJob } from "../adapters";

export type PlayableLumaFrame = {
  index: number;
  width: number;
  height: number;
  luma: Uint8Array;
};

export function lumaFramesToSourceClip(
  clipId: string,
  fps: number,
  frames: PlayableLumaFrame[],
): SourceClip {
  if (frames.length === 0) throw new Error("playable_temporal_empty_clip");
  const width = frames[0]!.width;
  const height = frames[0]!.height;
  return {
    id: clipId,
    fps,
    frames: frames.map((fr) => {
      if (fr.width !== width || fr.height !== height) {
        throw new Error("playable_temporal_size_mismatch");
      }
      if (fr.luma.length !== width * height) {
        throw new Error("playable_temporal_luma_size_mismatch");
      }
      return {
        index: fr.index,
        width: fr.width,
        height: fr.height,
        luma: fr.luma,
      };
    }),
  };
}

/**
 * Run CLEARED chest + sleeve propagation across every frame of `clip`.
 */
export function propagatePlayableClip(input: {
  clip: SourceClip;
  canonicalIndex: number;
  approved?: ApprovedQuadSet;
}): ConsumedTemporalJob[] {
  const approved = input.approved ?? clearedChestAndSleeveQuadSet();
  const jobs = buildPropagationJobsFromApprovedSet({
    clip: input.clip,
    canonicalIndex: input.canonicalIndex,
    approved,
  });
  return jobs.map((job) => {
    const out = propagateRepair(job.input);
    return {
      kind: job.kind,
      sourceAssetId: job.sourceAssetId,
      frames: out.frames.map((frame) => ({
        index: frame.index,
        width: frame.mask.width,
        height: frame.mask.height,
        mask: frame.mask.data,
        confidence: frame.confidence,
        reanchorRecommended: frame.reanchorRecommended,
      })),
    };
  });
}
