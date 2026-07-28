import { describe, expect, it } from "vitest";
import { planLaneAKeyframeIndices } from "./wardrobeVideoFrames";
// Mirror-parity: the client planner must agree with the authoritative
// server planner in _shared/keyframePlan.ts (same cadence band + rules).
import { planKeyframes } from "../../../supabase/functions/_shared/keyframePlan";

describe("planLaneAKeyframeIndices", () => {
  it("always includes first and last frame", () => {
    const kf = planLaneAKeyframeIndices(50, 18);
    expect(kf[0]).toBe(0);
    expect(kf[kf.length - 1]).toBe(49);
  });

  it("schedules a keyframe every cadence frames", () => {
    const kf = planLaneAKeyframeIndices(50, 12);
    expect(kf).toContain(12);
    expect(kf).toContain(24);
    expect(kf).toContain(36);
  });

  it("folds in forced anchors, sorted + deduped", () => {
    const kf = planLaneAKeyframeIndices(50, 18, [7, 18, 40]);
    expect(kf).toContain(7);
    expect(kf).toContain(40);
    expect(kf.filter((k: number) => k === 18)).toHaveLength(1);
    expect([...kf].sort((a, b) => a - b)).toEqual(kf);
  });

  it("clamps cadence into the locked 12–24 band", () => {
    expect(planLaneAKeyframeIndices(40, 4)).toContain(12);
    expect(planLaneAKeyframeIndices(40, 4)).not.toContain(4);
  });

  it("handles a single-frame clip", () => {
    expect(planLaneAKeyframeIndices(1)).toEqual([0]);
  });

  it("rejects invalid frame counts", () => {
    expect(() => planLaneAKeyframeIndices(0)).toThrow();
  });

  it("matches the authoritative server planner across sizes/cadences/anchors", () => {
    const cases: Array<[number, number, number[]]> = [
      [50, 18, []],
      [50, 12, [7, 40]],
      [30, 24, [5, 5, 29]],
      [40, 4, []], // clamps to 12 on both sides
      [1, 18, []],
    ];
    for (const [n, cadence, anchors] of cases) {
      expect(planLaneAKeyframeIndices(n, cadence, anchors)).toEqual(
        planKeyframes({ frameCount: n, cadenceFrames: cadence, forcedAnchors: anchors }),
      );
    }
  });
});
