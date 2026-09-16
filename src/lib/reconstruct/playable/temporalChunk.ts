/**
 * Proxy-shaped temporal chunking for Lane H.
 *
 * Live temporal-propagate-proxy keeps maxFrames=24 (YELLOW vs canonical
 * 241-frame master). This module does **not** raise that cap. Clips longer
 * than 24 frames are split into overlapping windows, propagated per chunk,
 * then stitched for reconstruct.
 *
 * Does not edit edgeDispatch, C2 QA metrics, or authorize constants.
 */

import { TEMPORAL_PROPAGATE_LIMITS } from "@/lib/temporal";
import type { SourceClip } from "@/lib/temporal";
import type { ConsumedTemporalJob } from "../adapters";
import { LIVE_PROXY_MAX_FRAMES } from "./contract";
import { propagatePlayableClip } from "./temporalFullClip";

/** Matches in-lib flow search radius so overlap can hop across chunk seams. */
export const PROXY_CHUNK_OVERLAP = 6;

export const YELLOW_EDGE_MAX_FRAMES_VS_CANONICAL =
  "edge_max_frames_24_vs_canonical_241" as const;

export type PlayableTemporalChunk = {
  chunkIndex: number;
  start: number;
  end: number;
  frameCount: number;
  canonicalIndex: number;
  reanchor: boolean;
};

export type PlayableTemporalPlan = {
  maxFrames: number;
  overlap: number;
  chunkCount: number;
  didChunk: boolean;
  raisedProxyMaxFrames: false;
  yellowContracts: Array<typeof YELLOW_EDGE_MAX_FRAMES_VS_CANONICAL>;
  chunks: PlayableTemporalChunk[];
};

export type PropagatePlayableChunkedResult = {
  jobs: ConsumedTemporalJob[];
  plan: PlayableTemporalPlan;
};

function uniqueSortedIndices(indices: number[]): number[] {
  return [...new Set(indices)].sort((a, b) => a - b);
}

/**
 * Plan ≤maxFrames windows covering every index. Overlap keeps hop support
 * at seams. The original keyframe is used as canonical when it sits in the
 * window; otherwise the chunk start is a re-anchor.
 */
export function planProxyTemporalChunks(input: {
  frameIndices: number[];
  keyframeIndex: number;
  maxFrames?: number;
  overlap?: number;
}): PlayableTemporalPlan {
  const maxFrames = input.maxFrames ?? LIVE_PROXY_MAX_FRAMES;
  const overlap = Math.max(0, Math.min(input.overlap ?? PROXY_CHUNK_OVERLAP, maxFrames - 1));
  const indices = uniqueSortedIndices(input.frameIndices);
  const yellowContracts: PlayableTemporalPlan["yellowContracts"] = [
    YELLOW_EDGE_MAX_FRAMES_VS_CANONICAL,
  ];

  if (indices.length === 0) {
    return {
      maxFrames,
      overlap,
      chunkCount: 0,
      didChunk: false,
      raisedProxyMaxFrames: false,
      yellowContracts,
      chunks: [],
    };
  }

  if (indices.length <= maxFrames) {
    const start = indices[0]!;
    const end = indices[indices.length - 1]! + 1;
    const canonicalIndex = indices.includes(input.keyframeIndex) ? input.keyframeIndex : start;
    return {
      maxFrames,
      overlap,
      chunkCount: 1,
      didChunk: false,
      raisedProxyMaxFrames: false,
      yellowContracts,
      chunks: [
        {
          chunkIndex: 0,
          start,
          end,
          frameCount: indices.length,
          canonicalIndex,
          reanchor: canonicalIndex !== input.keyframeIndex,
        },
      ],
    };
  }

  const stride = Math.max(1, maxFrames - overlap);
  const chunks: PlayableTemporalChunk[] = [];
  let pos = 0;
  while (pos < indices.length) {
    const endPos = Math.min(pos + maxFrames, indices.length);
    const slice = indices.slice(pos, endPos);
    const start = slice[0]!;
    const last = slice[slice.length - 1]!;
    const canonicalIndex = slice.includes(input.keyframeIndex) ? input.keyframeIndex : start;
    chunks.push({
      chunkIndex: chunks.length,
      start,
      end: last + 1,
      frameCount: slice.length,
      canonicalIndex,
      reanchor: canonicalIndex !== input.keyframeIndex,
    });
    if (endPos >= indices.length) break;
    pos += stride;
  }

  return {
    maxFrames,
    overlap,
    chunkCount: chunks.length,
    didChunk: true,
    raisedProxyMaxFrames: false,
    yellowContracts,
    chunks,
  };
}

export function sliceSourceClip(clip: SourceClip, start: number, end: number): SourceClip {
  const frames = clip.frames.filter((fr) => fr.index >= start && fr.index < end);
  if (frames.length === 0) {
    throw new Error(`playable_temporal_chunk_empty:${start}:${end}`);
  }
  return { ...clip, frames };
}

function jobKey(job: ConsumedTemporalJob): string {
  return `${job.kind}::${job.sourceAssetId}`;
}

/** First-write-wins stitch so the keyframe chunk keeps seam overlap. */
export function stitchConsumedJobs(jobLists: ConsumedTemporalJob[][]): ConsumedTemporalJob[] {
  const byKey = new Map<string, ConsumedTemporalJob>();
  for (const list of jobLists) {
    for (const job of list) {
      const key = jobKey(job);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { kind: job.kind, sourceAssetId: job.sourceAssetId, frames: [...job.frames] });
        continue;
      }
      const seen = new Set(existing.frames.map((fr) => fr.index));
      for (const fr of job.frames) {
        if (seen.has(fr.index)) continue;
        existing.frames.push(fr);
        seen.add(fr.index);
      }
    }
  }
  return [...byKey.values()].map((job) => ({
    ...job,
    frames: [...job.frames].sort((a, b) => a.index - b.index),
  }));
}

/**
 * Propagate in proxy-sized chunks and stitch. Never POSTs the proxy.
 * Never raises TEMPORAL_PROPAGATE_LIMITS.maxFrames.
 */
export function propagatePlayableClipChunked(input: {
  clip: SourceClip;
  canonicalIndex: number;
  maxFrames?: number;
  overlap?: number;
}): PropagatePlayableChunkedResult {
  const frameIndices = input.clip.frames.map((fr) => fr.index);
  const plan = planProxyTemporalChunks({
    frameIndices,
    keyframeIndex: input.canonicalIndex,
    maxFrames: input.maxFrames,
    overlap: input.overlap,
  });

  if (plan.maxFrames !== TEMPORAL_PROPAGATE_LIMITS.maxFrames && input.maxFrames === undefined) {
    throw new Error("playable_proxy_max_frames_drift");
  }

  const keyframeChunks = plan.chunks.filter((c) => !c.reanchor);
  const otherChunks = plan.chunks.filter((c) => c.reanchor);
  const ordered = [...keyframeChunks, ...otherChunks];

  const jobLists: ConsumedTemporalJob[][] = [];
  for (const chunk of ordered) {
    const sub = sliceSourceClip(input.clip, chunk.start, chunk.end);
    if (sub.frames.length > plan.maxFrames) {
      throw new Error(`playable_temporal_chunk_exceeds_max:${sub.frames.length}>${plan.maxFrames}`);
    }
    if (!sub.frames.some((fr) => fr.index === chunk.canonicalIndex)) {
      throw new Error(`playable_temporal_chunk_canonical_missing:${chunk.canonicalIndex}`);
    }
    jobLists.push(
      propagatePlayableClip({
        clip: sub,
        canonicalIndex: chunk.canonicalIndex,
      }),
    );
  }

  return { jobs: stitchConsumedJobs(jobLists), plan };
}
