import { describe, expect, it } from "vitest";
import {
  LEFT_HIDDEN_SHOULDER_TO_CUFF_QUAD,
  LEFT_VISIBLE_QUAD,
  assessVisibleSleeveQuad,
  buildCrossedArmsSleeveFixture,
  poseLockStatement,
} from "./index";

describe("crossed-arms visible geometry lock", () => {
  it("states that hidden shoulder→cuff cannot be validated on this pose", () => {
    expect(poseLockStatement()).toMatch(/crossed arms/i);
    expect(poseLockStatement()).toMatch(/shoulder→cuff|shoulder->cuff|Hidden shoulder/i);
  });

  it("accepts the fixture visible-upper-arm quads", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const left = assessVisibleSleeveQuad({
      side: "left",
      targetQuadNorm: LEFT_VISIBLE_QUAD,
      width: fx.still.width,
      height: fx.still.height,
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
    });
    expect(left.ok).toBe(true);
    expect(left.reason).toBe("ok");
    expect(left.visibleFrac).toBeGreaterThanOrEqual(0.85);
    expect(left.hiddenFrac).toBeLessThanOrEqual(0.05);
    expect(left.centroidInVisible).toBe(true);
  });

  it("rejects a shoulder→cuff quad as hidden_geometry_unvalidated", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const bad = assessVisibleSleeveQuad({
      side: "left",
      targetQuadNorm: LEFT_HIDDEN_SHOULDER_TO_CUFF_QUAD,
      width: fx.still.width,
      height: fx.still.height,
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
    });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe("hidden_geometry_unvalidated");
    expect(bad.hiddenFrac).toBeGreaterThan(0.05);
  });
});
