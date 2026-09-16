/**
 * Dispatch ≤24-frame chunks through the in-lib proxy adapter.
 * Live-shaped: explicitArm, paidCalls=false, canonical local index 0.
 * Does not edit Lovable edge source. Does not raise maxFrames.
 */

import { clearedChestAndSleeveQuadSet, type ApprovedQuadSet } from "../approvedQuad";
import type { SourceClip } from "../contract";
import {
  dispatchTemporalPropagate,
  sourceClipToWire,
  TEMPORAL_PROPAGATE_LIMITS,
  type TemporalPropagateDispatchResult,
  type TemporalPropagateJobResult,
} from "../edgeDispatch";
import { DEFAULT_SLEEVE_STILL_GATE } from "../livePrep";
import { sliceClipForChunk, type TemporalChunkPlan } from "./chunking";

export type TemporalChunkDispatch = {
  plan: TemporalChunkPlan;
  toGlobal: (localIndex: number) => number;
  result: TemporalPropagateDispatchResult;
};

export function dispatchTemporalChunk(opts: {
  clip: SourceClip;
  plan: TemporalChunkPlan;
  approved?: ApprovedQuadSet;
  explicitArm: boolean;
}): TemporalChunkDispatch {
  const sliced = sliceClipForChunk(opts.clip, opts.plan);
  if (sliced.clip.frames.length > TEMPORAL_PROPAGATE_LIMITS.maxFrames) {
    throw new Error("dispatchTemporalChunk: window exceeds proxy maxFrames");
  }
  const result = dispatchTemporalPropagate({
    clip: sourceClipToWire(sliced.clip),
    approved: opts.approved ?? clearedChestAndSleeveQuadSet(),
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
    explicitArm: opts.explicitArm === true,
  });
  return { plan: opts.plan, toGlobal: sliced.toGlobal, result };
}

export function dispatchTemporalChunks(opts: {
  clip: SourceClip;
  plans: TemporalChunkPlan[];
  approved?: ApprovedQuadSet;
  explicitArm: boolean;
}): TemporalChunkDispatch[] {
  return opts.plans.map((plan) =>
    dispatchTemporalChunk({
      clip: opts.clip,
      plan,
      approved: opts.approved,
      explicitArm: opts.explicitArm,
    }),
  );
}

export function assertChunkDispatchLocks(dispatches: TemporalChunkDispatch[]): {
  ok: boolean;
  paidCalls: false;
  grokPerFrame: false;
  maxWindowFrames: number;
  failed: string[];
} {
  const failed: string[] = [];
  let maxWindowFrames = 0;
  for (const d of dispatches) {
    maxWindowFrames = Math.max(maxWindowFrames, d.plan.frameCount);
    if (!d.result.ok) {
      failed.push(`chunk ${d.plan.chunkIndex}: ${d.result.body.code}`);
      continue;
    }
    if (d.result.body.paidCalls !== false) failed.push(`chunk ${d.plan.chunkIndex}: paidCalls`);
    if (d.result.body.grokPerFrame !== false) failed.push(`chunk ${d.plan.chunkIndex}: grokPerFrame`);
    for (const job of d.result.body.jobs) {
      if (job.frames.length > TEMPORAL_PROPAGATE_LIMITS.maxFrames) {
        failed.push(`chunk ${d.plan.chunkIndex} ${job.kind}: frames>${TEMPORAL_PROPAGATE_LIMITS.maxFrames}`);
      }
    }
  }
  return {
    ok: failed.length === 0,
    paidCalls: false,
    grokPerFrame: false,
    maxWindowFrames,
    failed,
  };
}

export type StitchedChunkFrame = {
  globalIndex: number;
  chunkIndex: number;
  localIndex: number;
  kind: TemporalPropagateJobResult["kind"];
  confidence: number;
  source: string;
  reanchorRecommended: boolean;
  reanchorReasons: string[];
  width: number;
  height: number;
  mask: number[];
};

export type ChunkSeam = {
  globalIndex: number;
  kind: TemporalPropagateJobResult["kind"];
  fromChunk: number;
  toChunk: number;
  iou: number;
};

function maskIoUArrays(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] === 1;
    const bv = b[i] === 1;
    if (av && bv) inter++;
    if (av || bv) union++;
  }
  return union === 0 ? 1 : inter / union;
}

/**
 * Map chunk-local proxy jobs back to global indices.
 * Overlap seeds: keep the previous window's propagated frame; skip the new
 * window's canonical (quad-reset) except to score the seam.
 */
export function stitchChunkDispatches(dispatches: TemporalChunkDispatch[]): {
  frames: StitchedChunkFrame[];
  seams: ChunkSeam[];
  kinds: TemporalPropagateJobResult["kind"][];
} {
  const frames: StitchedChunkFrame[] = [];
  const seams: ChunkSeam[] = [];
  const seen = new Map<string, StitchedChunkFrame>();
  const kinds: TemporalPropagateJobResult["kind"][] = [];

  for (const d of dispatches) {
    if (!d.result.ok) continue;
    for (const job of d.result.body.jobs) {
      if (!kinds.includes(job.kind)) kinds.push(job.kind);
      for (const fr of job.frames) {
        const globalIndex = d.toGlobal(fr.index);
        const stitched: StitchedChunkFrame = {
          globalIndex,
          chunkIndex: d.plan.chunkIndex,
          localIndex: fr.index,
          kind: job.kind,
          confidence: fr.confidence,
          source: fr.source,
          reanchorRecommended: fr.reanchorRecommended,
          reanchorReasons: [...fr.reanchorReasons],
          width: fr.width,
          height: fr.height,
          mask: fr.mask,
        };
        const key = `${job.kind}:${globalIndex}`;
        const prev = seen.get(key);
        if (prev) {
          seams.push({
            globalIndex,
            kind: job.kind,
            fromChunk: prev.chunkIndex,
            toChunk: d.plan.chunkIndex,
            iou: maskIoUArrays(prev.mask, stitched.mask),
          });
          continue;
        }
        seen.set(key, stitched);
        frames.push(stitched);
      }
    }
  }

  frames.sort((a, b) => a.kind.localeCompare(b.kind) || a.globalIndex - b.globalIndex);
  return { frames, seams, kinds };
}
