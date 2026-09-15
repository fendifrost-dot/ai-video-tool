import { describe, expect, it } from "vitest";
import { TEMPORAL_PROPAGATION_CONTRACT_VERSION, type PropagatedFrame } from "./contract";
import {
  anchoredSnapFixture,
  expectedTranslatedMask,
  sceneCutFixture,
  stationarySquareFixture,
  translatingSquareFixture,
} from "./fixtures";
import { estimateTranslation } from "./flow";
import { translationOf } from "./geometry";
import { maskIoU, paintRectMask, warpMask } from "./mask";
import { propagateRepair } from "./propagate";

function assertContractShape(frame: PropagatedFrame): void {
  expect(Number.isInteger(frame.index)).toBe(true);
  expect(frame.transform.kind).toBe("affine");
  expect(frame.transform.matrix).toHaveLength(6);
  expect(frame.mask.data.length).toBe(frame.mask.width * frame.mask.height);
  expect(frame.confidence).toBeGreaterThanOrEqual(0);
  expect(frame.confidence).toBeLessThanOrEqual(1);
  expect(["canonical", "propagated", "anchor_snap", "hold"]).toContain(frame.source);
  expect(typeof frame.reanchorRecommended).toBe("boolean");
  expect(Array.isArray(frame.reanchorReasons)).toBe(true);
}

describe("temporal propagation I/O contract", () => {
  it("emits contractVersion 1.0.0 and one output frame per clip frame", () => {
    const input = translatingSquareFixture();
    const out = propagateRepair(input);
    expect(out.contractVersion).toBe(TEMPORAL_PROPAGATION_CONTRACT_VERSION);
    expect(out.contractVersion).toBe("1.0.0");
    expect(out.clipId).toBe(input.clip.id);
    expect(out.canonicalIndex).toBe(0);
    expect(out.frames).toHaveLength(input.clip.frames.length);
    out.frames.forEach(assertContractShape);
  });
});

describe("static translating-square fixture", () => {
  it("estimates +2 px translation between consecutive frames", () => {
    const input = translatingSquareFixture();
    const est = estimateTranslation(
      input.clip.frames[0]!,
      input.clip.frames[1]!,
      input.canonical.mask,
    );
    expect(est.matched).toBe(true);
    expect(est.dx).toBe(2);
    expect(est.dy).toBe(0);
    expect(est.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("warps the canonical mask to the expected rectangle each frame", () => {
    const input = translatingSquareFixture();
    const out = propagateRepair(input);
    for (const frame of out.frames) {
      const expected = expectedTranslatedMask(
        input.expectedOrigin,
        frame.index,
        input.expectedDxPerFrame,
      );
      expect(maskIoU(frame.mask, expected)).toBeGreaterThan(0.99);
      expect(translationOf(frame.transform)).toEqual({
        dx: frame.index * input.expectedDxPerFrame,
        dy: 0,
      });
      if (frame.index === 0) {
        expect(frame.source).toBe("canonical");
        expect(frame.confidence).toBe(1);
        expect(frame.reanchorRecommended).toBe(false);
      } else {
        expect(frame.source).toBe("propagated");
        expect(frame.reanchorRecommended).toBe(false);
      }
    }
  });

  it("propagates the canonical quad along the same translation", () => {
    const input = translatingSquareFixture();
    const out = propagateRepair(input);
    const last = out.frames[out.frames.length - 1]!;
    expect(last.quadNorm).toBeDefined();
    expect(last.quadNorm![0].x).toBeCloseTo((2 + 8) / 16);
    expect(last.quadNorm![0].y).toBeCloseTo(6 / 16);
  });
});

describe("static stationary-square fixture", () => {
  it("holds identity transforms on both sides of a mid-clip canonical", () => {
    const out = propagateRepair(stationarySquareFixture());
    expect(out.canonicalIndex).toBe(1);
    expect(out.frames.map((f) => f.index)).toEqual([0, 1, 2, 3]);
    for (const frame of out.frames) {
      expect(translationOf(frame.transform)).toEqual({ dx: 0, dy: 0 });
      expect(frame.reanchorRecommended).toBe(false);
      expect(maskIoU(frame.mask, out.frames[1]!.mask)).toBe(1);
    }
    expect(out.frames[1]!.source).toBe("canonical");
  });
});

describe("static scene-cut fixture", () => {
  it("recommends a re-anchor at and after the declared cut", () => {
    const out = propagateRepair(sceneCutFixture());
    const before = out.frames.filter((f) => f.index < 3);
    const after = out.frames.filter((f) => f.index >= 3);
    for (const frame of before) {
      expect(frame.reanchorRecommended).toBe(false);
      expect(frame.source === "canonical" || frame.source === "propagated").toBe(true);
    }
    expect(after.length).toBe(2);
    for (const frame of after) {
      expect(frame.reanchorRecommended).toBe(true);
      expect(frame.reanchorReasons).toContain("scene_cut");
      expect(frame.source).toBe("hold");
    }
  });
});

describe("static anchor-snap fixture", () => {
  it("snaps the manual-anchor frame to the supplied transform", () => {
    const out = propagateRepair(anchoredSnapFixture());
    const snapped = out.frames.find((f) => f.index === 4)!;
    expect(snapped.source).toBe("anchor_snap");
    expect(translationOf(snapped.transform)).toEqual({ dx: 8, dy: 0 });
    expect(snapped.confidence).toBe(1);
    const expected = paintRectMask(16, 16, 1 + 8, 4, 3, 3);
    expect(maskIoU(snapped.mask, expected)).toBeGreaterThan(0.99);
  });
});

describe("warpMask", () => {
  it("translates a rectangle without changing area", () => {
    const src = paintRectMask(16, 16, 2, 2, 3, 3);
    const dest = warpMask(src, { kind: "affine", matrix: [1, 0, 4, 0, 1, 1] });
    const expected = paintRectMask(16, 16, 6, 3, 3, 3);
    expect(maskIoU(dest, expected)).toBe(1);
  });
});
