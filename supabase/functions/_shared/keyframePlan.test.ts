import { describe, expect, it } from "vitest";
import {
  assignSegments,
  clampCadence,
  DEFAULT_KEYFRAME_CADENCE,
  intermediateFrames,
  planKeyframes,
} from "./keyframePlan";

describe("clampCadence", () => {
  it("keeps values inside the locked 12–24 band", () => {
    expect(clampCadence(18)).toBe(18);
    expect(clampCadence(12)).toBe(12);
    expect(clampCadence(24)).toBe(24);
  });
  it("clamps out-of-band values to the band edges", () => {
    expect(clampCadence(4)).toBe(12);
    expect(clampCadence(99)).toBe(24);
  });
  it("falls back to the default for non-finite input", () => {
    expect(clampCadence(undefined)).toBe(DEFAULT_KEYFRAME_CADENCE);
    expect(clampCadence(NaN)).toBe(DEFAULT_KEYFRAME_CADENCE);
  });
});

describe("planKeyframes", () => {
  it("always includes the first and last frame", () => {
    const kf = planKeyframes({ frameCount: 50, cadenceFrames: 18 });
    expect(kf[0]).toBe(0);
    expect(kf[kf.length - 1]).toBe(49);
  });

  it("schedules a keyframe every cadence frames", () => {
    const kf = planKeyframes({ frameCount: 50, cadenceFrames: 12 });
    expect(kf).toContain(12);
    expect(kf).toContain(24);
    expect(kf).toContain(36);
  });

  it("folds forced anchors (pose changes / cuts) in, sorted + deduped", () => {
    const kf = planKeyframes({ frameCount: 50, cadenceFrames: 18, forcedAnchors: [7, 18, 40] });
    expect(kf).toContain(7);
    expect(kf).toContain(40);
    // 18 is both cadence and forced — appears once.
    expect(kf.filter((k) => k === 18)).toHaveLength(1);
    // sorted ascending
    expect([...kf].sort((a, b) => a - b)).toEqual(kf);
  });

  it("ignores out-of-range forced anchors", () => {
    const kf = planKeyframes({ frameCount: 20, cadenceFrames: 12, forcedAnchors: [-1, 25, 999] });
    expect(kf.every((k) => k >= 0 && k < 20)).toBe(true);
  });

  it("clamps cadence into the band", () => {
    // cadence 4 → clamped to 12
    const kf = planKeyframes({ frameCount: 40, cadenceFrames: 4 });
    expect(kf).toContain(12);
    expect(kf).not.toContain(4);
  });

  it("handles a single-frame clip", () => {
    expect(planKeyframes({ frameCount: 1 })).toEqual([0]);
  });

  it("rejects invalid frame counts", () => {
    expect(() => planKeyframes({ frameCount: 0 })).toThrow();
  });
});

describe("assignSegments", () => {
  it("brackets every frame between two keyframes and marks keyframes", () => {
    const kf = [0, 4, 8];
    const segs = assignSegments(kf, 9);
    expect(segs).toHaveLength(9);
    expect(segs[0]).toMatchObject({
      index: 0,
      isKeyframe: true,
      prevKeyframe: 0,
      nextKeyframe: 4,
      t: 0,
    });
    expect(segs[2]).toMatchObject({
      index: 2,
      isKeyframe: false,
      prevKeyframe: 0,
      nextKeyframe: 4,
    });
    expect(segs[2].t).toBeCloseTo(0.5);
    expect(segs[4]).toMatchObject({ index: 4, isKeyframe: true, prevKeyframe: 4, nextKeyframe: 8 });
    expect(segs[8]).toMatchObject({ index: 8, isKeyframe: true, prevKeyframe: 8, nextKeyframe: 8 });
  });

  it("computes t as the normalised position in the bracket", () => {
    const segs = assignSegments([0, 10], 11);
    expect(segs[0].t).toBe(0);
    expect(segs[5].t).toBeCloseTo(0.5);
    expect(segs[10].t).toBe(0);
  });

  it("picks the nearer keyframe as nearestKeyframe", () => {
    const segs = assignSegments([0, 10], 11);
    expect(segs[3].nearestKeyframe).toBe(0);
    expect(segs[7].nearestKeyframe).toBe(10);
  });

  it("requires keyframes to cover both ends", () => {
    expect(() => assignSegments([2, 8], 10)).toThrow(/frame 0/);
    expect(() => assignSegments([0, 5], 10)).toThrow(/final frame/);
  });

  it("integrates with planKeyframes end to end", () => {
    const kf = planKeyframes({ frameCount: 30, cadenceFrames: 12, forcedAnchors: [5] });
    const segs = assignSegments(kf, 30);
    // every frame accounted for, keyframes flagged
    expect(segs).toHaveLength(30);
    expect(segs.filter((s) => s.isKeyframe).map((s) => s.index)).toEqual(kf);
    // intermediates are the complement
    expect(intermediateFrames(segs)).toHaveLength(30 - kf.length);
  });
});
