import { describe, expect, it } from "vitest";
import { DEFAULT_FLOW_BREAK_THRESHOLDS, planReanchors, shouldReanchor } from "./flowBreak";

describe("shouldReanchor", () => {
  it("does not re-anchor when metrics are absent (pure cadence)", () => {
    expect(shouldReanchor({ index: 3 }).reanchor).toBe(false);
  });

  it("re-anchors on a scene cut", () => {
    const d = shouldReanchor({ index: 3, sceneCut: true });
    expect(d.reanchor).toBe(true);
    expect(d.reasons).toContain("scene_cut");
  });

  it("re-anchors on low flow confidence", () => {
    const d = shouldReanchor({ index: 3, confidence: 0.4 });
    expect(d.reanchor).toBe(true);
    expect(d.reasons.some((r) => r.startsWith("low_confidence"))).toBe(true);
  });

  it("does not re-anchor when confidence is above threshold", () => {
    expect(shouldReanchor({ index: 3, confidence: 0.9 }).reanchor).toBe(false);
  });

  it("re-anchors on a large rotation", () => {
    expect(shouldReanchor({ index: 3, rotationDeg: 40 }).reanchor).toBe(true);
    expect(shouldReanchor({ index: 3, rotationDeg: 10 }).reanchor).toBe(false);
  });

  it("re-anchors on heavy occlusion", () => {
    expect(shouldReanchor({ index: 3, occlusionRatio: 0.5 }).reanchor).toBe(true);
    expect(shouldReanchor({ index: 3, occlusionRatio: 0.1 }).reanchor).toBe(false);
  });

  it("accumulates multiple reasons", () => {
    const d = shouldReanchor({ index: 3, confidence: 0.2, rotationDeg: 50, occlusionRatio: 0.9 });
    expect(d.reasons).toHaveLength(3);
  });

  it("honors custom thresholds", () => {
    const strict = { ...DEFAULT_FLOW_BREAK_THRESHOLDS, minConfidence: 0.95 };
    expect(shouldReanchor({ index: 3, confidence: 0.9 }, strict).reanchor).toBe(true);
  });
});

describe("planReanchors", () => {
  it("returns sorted indices that break flow", () => {
    const metrics = [
      { index: 1, confidence: 0.9 },
      { index: 5, confidence: 0.3 },
      { index: 2, rotationDeg: 40 },
      { index: 4, occlusionRatio: 0.5 },
    ];
    const plan = planReanchors(metrics);
    expect(plan.reanchorAt).toEqual([2, 4, 5]);
    expect(plan.reasons[5]).toBeDefined();
  });

  it("skips frames already anchored (loop convergence)", () => {
    const metrics = [
      { index: 5, confidence: 0.3 },
      { index: 9, sceneCut: true },
    ];
    const plan = planReanchors(metrics, [5]);
    expect(plan.reanchorAt).toEqual([9]);
  });

  it("returns nothing when no metrics break", () => {
    const plan = planReanchors([{ index: 1, confidence: 0.99 }, { index: 2 }]);
    expect(plan.reanchorAt).toHaveLength(0);
  });
});
