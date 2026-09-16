/**
 * GREEN chunking: split a clip into ≤maxFrames windows for live proxy dispatch.
 * Does **not** raise TEMPORAL_PROPAGATE_LIMITS.maxFrames.
 *
 * Each window is reindexed so the seed/canonical is local index 0 — the current
 * temporal-propagate-proxy wire always uses canonicalIndex 0.
 */

import type { SourceClip, SourceClipFrame } from "../contract";
import { TEMPORAL_PROPAGATE_LIMITS } from "../edgeDispatch";

export const TEMPORAL_CHUNK_HELPER_VERSION = "1.0.0";
export const TEMPORAL_CHUNK_OVERLAP = 1;

export type ChunkDirection = "forward" | "backward";

export type TemporalChunkPlan = {
  chunkIndex: number;
  direction: ChunkDirection;
  /** Inclusive global frame index. For forward, equals seed. */
  globalStart: number;
  /** Inclusive global frame index. For backward, equals seed. */
  globalEnd: number;
  seedGlobalIndex: number;
  /** Proxy-compatible: always 0. */
  localCanonicalIndex: 0;
  frameCount: number;
};

export function planTemporalChunks(opts: {
  frameCount: number;
  canonicalIndex: number;
  maxFrames?: number;
  overlap?: number;
}): TemporalChunkPlan[] {
  const frameCount = Math.floor(opts.frameCount);
  const canonical = Math.floor(opts.canonicalIndex);
  const maxFrames = opts.maxFrames ?? TEMPORAL_PROPAGATE_LIMITS.maxFrames;
  const overlap = opts.overlap ?? TEMPORAL_CHUNK_OVERLAP;
  if (!(frameCount > 0)) throw new Error("planTemporalChunks: frameCount must be > 0");
  if (!(canonical >= 0 && canonical < frameCount)) {
    throw new Error("planTemporalChunks: canonicalIndex out of range");
  }
  if (!(maxFrames >= 1)) throw new Error("planTemporalChunks: maxFrames must be ≥ 1");
  if (maxFrames > TEMPORAL_PROPAGATE_LIMITS.maxFrames) {
    throw new Error(
      `planTemporalChunks: refusing to plan windows > proxy maxFrames ${TEMPORAL_PROPAGATE_LIMITS.maxFrames}`,
    );
  }
  if (!(overlap >= 0 && overlap < maxFrames)) {
    throw new Error("planTemporalChunks: overlap must be in [0, maxFrames)");
  }

  const span = maxFrames - 1;
  const out: TemporalChunkPlan[] = [];

  let seed = canonical;
  while (seed < frameCount) {
    const end = Math.min(seed + span, frameCount - 1);
    out.push({
      chunkIndex: out.length,
      direction: "forward",
      globalStart: seed,
      globalEnd: end,
      seedGlobalIndex: seed,
      localCanonicalIndex: 0,
      frameCount: end - seed + 1,
    });
    if (end >= frameCount - 1) break;
    seed = end;
  }

  seed = canonical;
  const backward: TemporalChunkPlan[] = [];
  while (seed > 0) {
    const start = Math.max(seed - span, 0);
    backward.push({
      chunkIndex: 0,
      direction: "backward",
      globalStart: start,
      globalEnd: seed,
      seedGlobalIndex: seed,
      localCanonicalIndex: 0,
      frameCount: seed - start + 1,
    });
    if (start <= 0) break;
    seed = start;
  }

  const plans = [...backward.reverse(), ...out].map((p, i) => ({ ...p, chunkIndex: i }));
  for (const p of plans) {
    if (p.frameCount > maxFrames) {
      throw new Error(`planTemporalChunks: window ${p.chunkIndex} has ${p.frameCount} frames`);
    }
  }
  return plans;
}

export function chunkCoversClip(plans: TemporalChunkPlan[], frameCount: number): boolean {
  const seen = new Set<number>();
  for (const p of plans) {
    for (let g = p.globalStart; g <= p.globalEnd; g++) seen.add(g);
  }
  if (seen.size !== frameCount) return false;
  for (let i = 0; i < frameCount; i++) if (!seen.has(i)) return false;
  return true;
}

function frameAt(clip: SourceClip, index: number): SourceClipFrame {
  const found = clip.frames.find((f) => f.index === index);
  if (!found) throw new Error(`sliceClipForChunk: missing global frame ${index}`);
  return found;
}

export function sliceClipForChunk(
  clip: SourceClip,
  plan: TemporalChunkPlan,
): {
  clip: SourceClip;
  toGlobal: (localIndex: number) => number;
} {
  const frames: SourceClipFrame[] = [];
  if (plan.direction === "forward") {
    for (let g = plan.globalStart; g <= plan.globalEnd; g++) {
      const src = frameAt(clip, g);
      frames.push({
        index: g - plan.seedGlobalIndex,
        width: src.width,
        height: src.height,
        luma: new Uint8Array(src.luma),
      });
    }
  } else {
    for (let g = plan.globalEnd; g >= plan.globalStart; g--) {
      const src = frameAt(clip, g);
      frames.push({
        index: plan.seedGlobalIndex - g,
        width: src.width,
        height: src.height,
        luma: new Uint8Array(src.luma),
      });
    }
  }
  frames.sort((a, b) => a.index - b.index);
  return {
    clip: {
      id: `${clip.id}#chunk-${plan.chunkIndex}`,
      fps: clip.fps,
      frames,
    },
    toGlobal: (localIndex: number) =>
      plan.direction === "forward"
        ? plan.seedGlobalIndex + localIndex
        : plan.seedGlobalIndex - localIndex,
  };
}
