import { describe, expect, it } from "vitest";
import {
  CANONICAL_CLIP_FRAME_COUNT,
  CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
  TEMPORAL_PROPAGATE_LIMITS,
} from "@/lib/temporal";
import { LIVE_PROXY_MAX_FRAMES } from "./contract";
import { lumaFramesToSourceClip } from "./temporalFullClip";
import {
  PROXY_CHUNK_OVERLAP,
  YELLOW_EDGE_MAX_FRAMES_VS_CANONICAL,
  planProxyTemporalChunks,
  propagatePlayableClipChunked,
  stitchConsumedJobs,
} from "./temporalChunk";

describe("planProxyTemporalChunks", () => {
  it("pins LIVE_PROXY_MAX_FRAMES to the C2 proxy lock and does not raise it", () => {
    expect(TEMPORAL_PROPAGATE_LIMITS.maxFrames).toBe(24);
    expect(LIVE_PROXY_MAX_FRAMES).toBe(TEMPORAL_PROPAGATE_LIMITS.maxFrames);
    expect(CANONICAL_CLIP_FRAME_COUNT).toBe(241);
    expect(CANONICAL_CLIP_KEYFRAME_FRAME_INDEX).toBe(47);
  });

  it("does not chunk a window that already fits in maxFrames", () => {
    const plan = planProxyTemporalChunks({
      frameIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      keyframeIndex: 2,
    });
    expect(plan.didChunk).toBe(false);
    expect(plan.chunkCount).toBe(1);
    expect(plan.chunks[0]?.frameCount).toBe(8);
    expect(plan.chunks[0]?.canonicalIndex).toBe(2);
    expect(plan.chunks[0]?.reanchor).toBe(false);
    expect(plan.raisedProxyMaxFrames).toBe(false);
    expect(plan.yellowContracts).toContain(YELLOW_EDGE_MAX_FRAMES_VS_CANONICAL);
  });

  it("chunks the 241-frame canonical duration into proxy windows ≤24", () => {
    const indices = Array.from({ length: CANONICAL_CLIP_FRAME_COUNT }, (_, i) => i);
    const plan = planProxyTemporalChunks({
      frameIndices: indices,
      keyframeIndex: CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
    });
    expect(plan.maxFrames).toBe(24);
    expect(plan.didChunk).toBe(true);
    expect(plan.raisedProxyMaxFrames).toBe(false);
    expect(plan.chunkCount).toBeGreaterThan(1);
    expect(Math.max(...plan.chunks.map((c) => c.frameCount))).toBeLessThanOrEqual(24);
    const covered = new Set<number>();
    for (const chunk of plan.chunks) {
      for (let i = chunk.start; i < chunk.end; i++) covered.add(i);
    }
    expect(covered.size).toBe(241);
    expect(plan.chunks.some((c) => c.canonicalIndex === 47 && !c.reanchor)).toBe(true);
  });
});

describe("stitchConsumedJobs", () => {
  it("first-write-wins on overlapping frame indices", () => {
    const stitched = stitchConsumedJobs([
      [
        {
          kind: "chest",
          sourceAssetId: "a",
          frames: [{ index: 0, width: 2, height: 2, mask: new Float32Array([1, 0, 0, 0]), confidence: 1 }],
        },
      ],
      [
        {
          kind: "chest",
          sourceAssetId: "a",
          frames: [
            { index: 0, width: 2, height: 2, mask: new Float32Array([0, 1, 0, 0]), confidence: 0.1 },
            { index: 1, width: 2, height: 2, mask: new Float32Array([0, 0, 1, 0]), confidence: 0.9 },
          ],
        },
      ],
    ]);
    expect(stitched).toHaveLength(1);
    expect(stitched[0]?.frames.map((f) => f.index)).toEqual([0, 1]);
    expect(stitched[0]?.frames[0]?.mask[0]).toBe(1);
  });
});

describe("propagatePlayableClipChunked", () => {
  it("propagates a 30-frame clip as ≤24-frame chunks and stitches full coverage", () => {
    const width = 32;
    const height = 48;
    const frames = Array.from({ length: 30 }, (_, index) => ({
      index,
      width,
      height,
      luma: new Uint8Array(width * height).fill((index * 7) % 180),
    }));
    const clip = lumaFramesToSourceClip("chunk-fixture", 24, frames);
    const { jobs, plan } = propagatePlayableClipChunked({
      clip,
      canonicalIndex: 5,
    });
    expect(plan.didChunk).toBe(true);
    expect(plan.maxFrames).toBe(24);
    expect(plan.overlap).toBe(PROXY_CHUNK_OVERLAP);
    expect(Math.max(...plan.chunks.map((c) => c.frameCount))).toBeLessThanOrEqual(24);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(job.frames.length).toBe(30);
      expect(job.frames.map((f) => f.index)).toEqual(frames.map((f) => f.index));
    }
  });
});
