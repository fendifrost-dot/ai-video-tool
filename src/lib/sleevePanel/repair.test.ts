import { describe, expect, it } from "vitest";
import {
  CREAM,
  LEFT_HIDDEN,
  LEFT_VISIBLE,
  NAVY,
  PINSTRIPE,
  buildChestOutputSlot,
  buildCrossedArmsSleeveFixture,
  LEFT_HIDDEN_SHOULDER_TO_CUFF_QUAD,
} from "./fixtures";
import { SLEEVE_PANEL_CONTRACT_VERSION } from "./types";
import { pixelAt, rgbaFingerprint } from "./raster";
import { repairVisibleSleevePanels } from "./repair";

function isNavy(rgba: readonly [number, number, number, number]): boolean {
  return rgba[2] > rgba[0] + 20 && rgba[2] > rgba[1] + 20 && rgba[0] < 80;
}

function isCream(rgba: readonly [number, number, number, number]): boolean {
  return rgba[0] > 180 && rgba[1] > 160 && rgba[2] > 130 && rgba[0] > rgba[2];
}

function isPinstripe(rgba: readonly [number, number, number, number]): boolean {
  return rgba[0] > 220 && rgba[1] > 210 && rgba[2] > 190;
}

describe("deterministic visible sleeve-panel repair", () => {
  it("builds a deterministic crossed-arms fixture", () => {
    const a = buildCrossedArmsSleeveFixture();
    const b = buildCrossedArmsSleeveFixture();
    expect(a.id).toBe("crossed_arms_visible_sleeve_v1");
    expect(a.fingerprints.still).toBe(b.fingerprints.still);
    expect(a.fingerprints.flat).toBe(b.fingerprints.flat);
    expect(a.fingerprints.still).toBe(rgbaFingerprint(b.still));
  });

  it("repairs visible upper-arm rings to the vertical flat-ref panel", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const beforeLeftStripe = pixelAt(fx.still, LEFT_VISIBLE.x0 + 1, 24);
    expect(isPinstripe(beforeLeftStripe)).toBe(true);

    const out = repairVisibleSleevePanels({
      contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
      still: fx.still,
      flatRef: fx.flatRef,
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
      panels: fx.panels,
      visibility: fx.visibility,
    });

    expect(out.claims.visibleGeometryRepaired).toBe(true);
    expect(out.claims.hiddenShoulderToCuffValidated).toBe(false);
    expect(out.consumedChestOutput).toBe(false);
    expect(out.sides).toHaveLength(2);
    expect(out.sides.every((s) => s.paintedPixelCount > 40)).toBe(true);

    // Former horizontal cream pinstripe row near the left edge becomes navy
    // (flat-ref vertical panel, u≈0).
    const afterEdge = pixelAt(out.still, LEFT_VISIBLE.x0 + 1, 24);
    expect(isNavy(afterEdge)).toBe(true);

    // Vertical pinstripe from the flat lands as a column (u≈0.5), not a row.
    const midU = Math.floor((LEFT_VISIBLE.x0 + LEFT_VISIBLE.x1) / 2);
    const edgeX = LEFT_VISIBLE.x0 + 1;
    const colHits = { stripe: 0, navy: 0 };
    for (let y = LEFT_VISIBLE.y0; y < LEFT_VISIBLE.y1; y++) {
      if (isPinstripe(pixelAt(out.still, midU, y))) colHits.stripe++;
      if (isNavy(pixelAt(out.still, edgeX, y))) colHits.navy++;
    }
    expect(colHits.stripe).toBeGreaterThan(8);
    expect(colHits.navy).toBeGreaterThan(4);

    // The old horizontal pinstripe row is no longer cream across the arm.
    let horizontalCream = 0;
    for (let x = LEFT_VISIBLE.x0; x < LEFT_VISIBLE.x1; x++) {
      if (isPinstripe(pixelAt(out.still, x, 24))) horizontalCream++;
    }
    expect(horizontalCream).toBeLessThan(6);
  });

  it("leaves hidden shoulder→cuff / distal forearm pixels untouched", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const sampleX = LEFT_HIDDEN.x0 + 4;
    const sampleY = LEFT_HIDDEN.y0 + 4;
    const before = pixelAt(fx.still, sampleX, sampleY);
    expect(isCream(before)).toBe(true);

    const out = repairVisibleSleevePanels({
      contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
      still: fx.still,
      flatRef: fx.flatRef,
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
      panels: fx.panels,
      visibility: fx.visibility,
    });

    expect(pixelAt(out.still, sampleX, sampleY)).toEqual(before);
    expect(out.paintedMask.data[sampleY * out.still.width + sampleX]).toBe(0);
    expect(out.claims.hiddenShoulderToCuffValidated).toBe(false);
  });

  it("rejects a shoulder→cuff quad instead of inventing hidden geometry", () => {
    const fx = buildCrossedArmsSleeveFixture();
    expect(() =>
      repairVisibleSleevePanels({
        contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
        still: fx.still,
        flatRef: fx.flatRef,
        visibleMask: fx.visibleMask,
        hiddenMask: fx.hiddenMask,
        panels: [
          {
            side: "left",
            targetQuadNorm: LEFT_HIDDEN_SHOULDER_TO_CUFF_QUAD,
            sourceBboxNorm: fx.panels[0].sourceBboxNorm,
          },
        ],
        visibility: fx.visibility,
      }),
    ).toThrow(/hidden_geometry_unvalidated/);
  });

  it("consumes a chest-output slot as a do-not-paint reserved mask", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const chest = buildChestOutputSlot(true);
    const reservedX = 35;
    const reservedY = 25;
    const beforeChest = pixelAt(fx.still, reservedX, reservedY);
    expect(isNavy(beforeChest)).toBe(true);

    const sloppyOverlap = structuredClone(fx.panels);
    sloppyOverlap[0] = {
      ...sloppyOverlap[0],
      targetQuadNorm: [
        [8 / 80, 16 / 64],
        [50 / 80, 16 / 64],
        [50 / 80, 36 / 64],
        [8 / 80, 36 / 64],
      ],
    };

    // Wide quad covers hidden + chest — reject on hidden first.
    expect(() =>
      repairVisibleSleevePanels({
        contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
        still: fx.still,
        flatRef: fx.flatRef,
        visibleMask: fx.visibleMask,
        hiddenMask: fx.hiddenMask,
        panels: sloppyOverlap,
        visibility: fx.visibility,
        chestOutput: chest,
      }),
    ).toThrow(/insufficient_visible_coverage|hidden_geometry_unvalidated|centroid_outside/);

    const out = repairVisibleSleevePanels({
      contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
      still: fx.still,
      flatRef: fx.flatRef,
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
      panels: fx.panels,
      visibility: fx.visibility,
      chestOutput: chest,
    });

    expect(out.consumedChestOutput).toBe(true);
    expect(pixelAt(out.still, reservedX, reservedY)).toEqual(beforeChest);
    expect(out.paintedMask.data[reservedY * out.still.width + reservedX]).toBe(0);
    expect(out.claims.hiddenShoulderToCuffValidated).toBe(false);
  });

  it("is byte-deterministic across two runs on the same fixture", () => {
    const fx1 = buildCrossedArmsSleeveFixture();
    const fx2 = buildCrossedArmsSleeveFixture();
    const a = repairVisibleSleevePanels({
      contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
      still: fx1.still,
      flatRef: fx1.flatRef,
      visibleMask: fx1.visibleMask,
      hiddenMask: fx1.hiddenMask,
      panels: fx1.panels,
      visibility: fx1.visibility,
    });
    const b = repairVisibleSleevePanels({
      contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
      still: fx2.still,
      flatRef: fx2.flatRef,
      visibleMask: fx2.visibleMask,
      hiddenMask: fx2.hiddenMask,
      panels: fx2.panels,
      visibility: fx2.visibility,
    });
    expect(rgbaFingerprint(a.still)).toBe(rgbaFingerprint(b.still));
  });

  it("does not mutate the input still buffer", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const before = rgbaFingerprint(fx.still);
    repairVisibleSleevePanels({
      contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
      still: fx.still,
      flatRef: fx.flatRef,
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
      panels: fx.panels,
      visibility: fx.visibility,
    });
    expect(rgbaFingerprint(fx.still)).toBe(before);
    expect(pixelAt(fx.still, LEFT_VISIBLE.x0 + 1, 24)).toEqual([...PINSTRIPE, 255]);
    expect(CREAM[0]).toBeGreaterThan(200);
    expect(NAVY[2]).toBeGreaterThan(NAVY[0]);
  });
});
