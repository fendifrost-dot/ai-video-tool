import { describe, expect, it } from "vitest";
import { CANONICAL_QA_CLIP_SPEC, SECOND_QA_CLIP_SPEC } from "../clipSpec";
import { TEMPORAL_PROPAGATE_LIMITS, parseTemporalPropagateClip } from "../edgeDispatch";
import { canonicalFullClipCleanFixture } from "../fullClipFixture";
import { secondClipCleanFixture, translatingChunkSeamFixture } from "../portableFixture";
import { chunkCoversClip, planTemporalChunks, sliceClipForChunk } from "./chunking";
import { dispatchTemporalChunk, dispatchTemporalChunks } from "./chunkDispatch";
import {
  formatChunkedTemporalVideoQaSummary,
  runChunkedTemporalVideoQa,
  YELLOW_CHUNK_QUAD_RESET,
} from "./chunkReport";

describe("temporal chunk planner", () => {
  it("splits 241 frames at keyframe 47 into ≤24-frame windows that cover the clip", () => {
    const plans = planTemporalChunks({ frameCount: 241, canonicalIndex: 47 });
    expect(plans.length).toBeGreaterThan(1);
    expect(Math.max(...plans.map((p) => p.frameCount))).toBeLessThanOrEqual(
      TEMPORAL_PROPAGATE_LIMITS.maxFrames,
    );
    expect(plans.every((p) => p.localCanonicalIndex === 0)).toBe(true);
    expect(plans.some((p) => p.seedGlobalIndex === 47)).toBe(true);
    expect(chunkCoversClip(plans, 241)).toBe(true);
    expect(() => planTemporalChunks({ frameCount: 241, canonicalIndex: 47, maxFrames: 25 })).toThrow(
      /maxFrames/,
    );
  });

  it("reindexes each window so the seed is local 0 for the current proxy wire", () => {
    const fixture = canonicalFullClipCleanFixture();
    const plans = planTemporalChunks({
      frameCount: fixture.clip.frames.length,
      canonicalIndex: fixture.canonicalIndex,
    });
    const first = plans.find((p) => p.seedGlobalIndex === 47)!;
    const sliced = sliceClipForChunk(fixture.clip, first);
    expect(sliced.clip.frames[0]?.index).toBe(0);
    expect(sliced.toGlobal(0)).toBe(47);
    expect(sliced.clip.frames.length).toBeLessThanOrEqual(24);
  });
});

describe("chunked proxy dispatch + stitch", () => {
  it("dispatches every canonical window with explicitArm and paidCalls=false", () => {
    const fixture = canonicalFullClipCleanFixture();
    const report = runChunkedTemporalVideoQa(fixture, CANONICAL_QA_CLIP_SPEC);
    expect(report.verdict).toBe("PASS");
    expect(report.paidCalls).toBe(false);
    expect(report.grokPerFrame).toBe(false);
    expect(report.proxyMaxFrames).toBe(24);
    expect(report.maxWindowFrames).toBeLessThanOrEqual(24);
    expect(report.coversFullClip).toBe(true);
    expect(report.uniqueGlobalIndices).toBe(241);
    expect(report.minSeamIou).toBeGreaterThanOrEqual(0.95);
    expect(report.yellowContracts).toContain(YELLOW_CHUNK_QUAD_RESET);
    expect(formatChunkedTemporalVideoQaSummary(report)).toContain("frames=241");
    expect(TEMPORAL_PROPAGATE_LIMITS.maxFrames).toBe(24);
  }, 60_000);

  it("refuses a chunk without explicitArm and still rejects a 241-frame single POST", () => {
    const fixture = canonicalFullClipCleanFixture();
    const plans = planTemporalChunks({
      frameCount: fixture.clip.frames.length,
      canonicalIndex: fixture.canonicalIndex,
    });
    const denied = dispatchTemporalChunk({
      clip: fixture.clip,
      plan: plans[0]!,
      explicitArm: false,
    });
    expect(denied.result.ok).toBe(false);
    if (!denied.result.ok) {
      expect(denied.result.body.code).toBe("explicit_arm_required");
    }
    const parsed = parseTemporalPropagateClip({
      id: fixture.clip.id,
      fps: fixture.clip.fps,
      frames: fixture.clip.frames.map((f) => ({
        index: f.index,
        width: 2,
        height: 2,
        luma: [0, 0, 0, 0],
      })),
    });
    expect(parsed.ok).toBe(false);
  });

  it("scores a second-clip spec without assuming 76fe7438 / 241 / 59.94", () => {
    const fixture = secondClipCleanFixture();
    expect(fixture.clip.id).toBe(SECOND_QA_CLIP_SPEC.id);
    expect(fixture.clip.frames).toHaveLength(72);
    expect(fixture.clip.fps).toBe(24);
    expect(fixture.canonicalIndex).toBe(18);
    const report = runChunkedTemporalVideoQa(fixture, SECOND_QA_CLIP_SPEC);
    expect(report.verdict).toBe("PASS");
    expect(report.clipSpec.id).not.toBe(CANONICAL_QA_CLIP_SPEC.id);
    expect(report.uniqueGlobalIndices).toBe(72);
    expect(report.maxWindowFrames).toBeLessThanOrEqual(24);
    expect(report.paidCalls).toBe(false);
  }, 30_000);

  it("documents YELLOW: translating seams break because the proxy re-paints CLEARED quads", () => {
    const fixture = translatingChunkSeamFixture(30);
    const report = runChunkedTemporalVideoQa(fixture, {
      ...SECOND_QA_CLIP_SPEC,
      id: fixture.clip.id,
      frameCount: 30,
      fps: 24,
      keyframeIndex: 0,
      keyframeTimeSec: 0,
    });
    expect(report.paidCalls).toBe(false);
    expect(report.proxyMaxFrames).toBe(24);
    expect(report.chunkingInsufficientForTranslation).toBe(true);
    expect(report.minSeamIou).not.toBeNull();
    expect(report.minSeamIou!).toBeLessThan(0.85);
    expect(report.verdict).toBe("PASS");
    expect(TEMPORAL_PROPAGATE_LIMITS.maxFrames).toBe(24);
  }, 30_000);

  it("still dispatches overlapping windows independently (in-lib adapter, not Lovable)", () => {
    const fixture = secondClipCleanFixture();
    const plans = planTemporalChunks({
      frameCount: fixture.clip.frames.length,
      canonicalIndex: fixture.canonicalIndex,
    });
    const results = dispatchTemporalChunks({
      clip: fixture.clip,
      plans: plans.slice(0, 2),
      explicitArm: true,
    });
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.result.ok).toBe(true);
      if (!r.result.ok) continue;
      expect(r.result.body.paidCalls).toBe(false);
      expect(r.result.body.jobs).toHaveLength(3);
    }
  });
});
