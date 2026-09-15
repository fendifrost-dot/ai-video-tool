import { describe, expect, it } from "vitest";
import {
  CANONICAL_HIDDEN_BOXES,
  CANONICAL_VISIBLE_UPPER_ARM_BOXES,
  DEFAULT_FLAT_SLEEVE_SOURCE_BBOX,
  LIVE_CHEST_RESERVED_QUAD_NORM,
  SEEDED_VISIBLE_SLEEVE_QUADS,
  SLEEVE_STILL_REPAIR_METHOD_VERSION,
  assessSleevePanelQuadPlacement,
  buildCanonicalHiddenMask,
  buildCanonicalVisibleMask,
  rasterizeReservedChestMask,
  repairVisibleSleevePanelsOnStill,
} from "./liveStill";
import {
  CREAM,
  LEFT_HIDDEN_SHOULDER_TO_CUFF_QUAD,
  LEFT_VISIBLE,
  LEFT_VISIBLE_QUAD,
  RIGHT_VISIBLE_QUAD,
  buildChestOutputSlot,
  buildCrossedArmsSleeveFixture,
} from "./fixtures";
import { SLEEVE_PANEL_CLAIM, SLEEVE_PANEL_CONTRACT_VERSION } from "./types";
import { pixelAt, rgbaFingerprint } from "./raster";
import { CHEST_REF_FRAME } from "@/lib/eval/chestCriteria";

function isNavy(rgba: readonly [number, number, number, number]): boolean {
  return rgba[2] > rgba[0] + 20 && rgba[2] > rgba[1] + 20 && rgba[0] < 80;
}

describe("Lane B live still adapter", () => {
  it("seeds visible-upper-arm quads that pass the canonical live mask", () => {
    const w = CHEST_REF_FRAME.width;
    const h = CHEST_REF_FRAME.height;
    const visible = buildCanonicalVisibleMask(w, h);
    const hidden = buildCanonicalHiddenMask(w, h);
    expect(CANONICAL_VISIBLE_UPPER_ARM_BOXES.left.y0).toBeGreaterThanOrEqual(0.47);
    expect(CANONICAL_VISIBLE_UPPER_ARM_BOXES.left.y1).toBeLessThanOrEqual(0.625);
    expect(CANONICAL_HIDDEN_BOXES.leftDistal.y0).toBeGreaterThanOrEqual(0.624);

    for (const side of ["left", "right"] as const) {
      const a = assessSleevePanelQuadPlacement(SEEDED_VISIBLE_SLEEVE_QUADS[side]);
      expect(a.ok).toBe(true);
      expect(a.warnings).toEqual([]);
    }
    expect(visible.width).toBe(w);
    expect(hidden.height).toBe(h);
    expect(DEFAULT_FLAT_SLEEVE_SOURCE_BBOX[2]).toBeGreaterThan(0);
  });

  it("rejects the runner's old face-high placeholder as off-corridor", () => {
    const oldLeft: [[number, number], [number, number], [number, number], [number, number]] = [
      [0.12, 0.38],
      [0.28, 0.36],
      [0.3, 0.48],
      [0.14, 0.5],
    ];
    const a = assessSleevePanelQuadPlacement(oldLeft);
    expect(a.ok).toBe(false);
    expect(a.warnings.join(" ")).toMatch(/corridor|face|shoulder/i);
  });

  it("rejects a shoulder→cuff quad on the live mask", () => {
    const fx = buildCrossedArmsSleeveFixture();
    expect(() =>
      repairVisibleSleevePanelsOnStill({
        still: fx.still,
        flatRef: fx.flatRef,
        panels: [{ side: "left", targetQuad: LEFT_HIDDEN_SHOULDER_TO_CUFF_QUAD }],
      }),
    ).toThrow(/sleeve_panel_geometry_rejected:left:hidden_geometry_unvalidated/);
  });

  it("repairs fixture visible arms via the live adapter when fixture masks are supplied", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const before = pixelAt(fx.still, LEFT_VISIBLE.x0 + 1, 24);
    const out = repairVisibleSleevePanelsOnStill({
      still: fx.still,
      flatRef: fx.flatRef,
      panels: [
        {
          side: "left",
          targetQuad: LEFT_VISIBLE_QUAD,
          sourceBboxNorm: fx.panels[0].sourceBboxNorm,
        },
        {
          side: "right",
          targetQuad: RIGHT_VISIBLE_QUAD,
          sourceBboxNorm: fx.panels[1].sourceBboxNorm,
        },
      ],
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
      chestBandQuadNorm: buildChestOutputSlot(true).chestBandQuadNorm,
      sourceStillId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
      chestOutputAssetId: "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
      chestRepairMethodVersion: "architecture_c_still_repair_1m",
    });

    expect(out.meta.repair_method_version).toBe(SLEEVE_STILL_REPAIR_METHOD_VERSION);
    expect(out.meta.contract_version).toBe(SLEEVE_PANEL_CONTRACT_VERSION);
    expect(out.meta.claim).toBe(SLEEVE_PANEL_CLAIM);
    expect(out.meta.hidden_shoulder_to_cuff_validated).toBe(false);
    expect(out.meta.consumed_chest_output).toBe(true);
    expect(out.output.claims.visibleGeometryRepaired).toBe(true);
    expect(isNavy(pixelAt(out.still, LEFT_VISIBLE.x0 + 1, 24))).toBe(true);
    expect(before[0]).toBeGreaterThan(200);
  });

  it("1c: live adapter with DEFAULT cream bbox still paints navy, not cream", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const out = repairVisibleSleevePanelsOnStill({
      still: fx.still,
      flatRef: fx.flatRef,
      panels: [
        { side: "left", targetQuad: LEFT_VISIBLE_QUAD },
        { side: "right", targetQuad: RIGHT_VISIBLE_QUAD },
      ],
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
    });
    expect(out.meta.repair_method_version).toBe("architecture_c_sleeve_still_1c");
    expect(out.meta.claim).toBe(SLEEVE_PANEL_CLAIM);
    expect(["navy_over_cream", "warp"]).toContain(out.meta.navy_fill_mode);
    expect(isNavy(pixelAt(out.still, LEFT_VISIBLE.x0 + 1, 24))).toBe(true);
  });

  it("leaves chest-reserved pixels byte-identical on the fixture", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const reservedX = 35;
    const reservedY = 25;
    const before = pixelAt(fx.still, reservedX, reservedY);
    const out = repairVisibleSleevePanelsOnStill({
      still: fx.still,
      flatRef: fx.flatRef,
      panels: [
        {
          side: "left",
          targetQuad: LEFT_VISIBLE_QUAD,
          sourceBboxNorm: fx.panels[0].sourceBboxNorm,
        },
        {
          side: "right",
          targetQuad: RIGHT_VISIBLE_QUAD,
          sourceBboxNorm: fx.panels[1].sourceBboxNorm,
        },
      ],
      visibleMask: fx.visibleMask,
      hiddenMask: fx.hiddenMask,
    });
    expect(pixelAt(out.still, reservedX, reservedY)).toEqual(before);
    expect(out.output.paintedMask.data[reservedY * out.still.width + reservedX]).toBe(0);
  });
});

describe("chest CLEARED windows survive sleeve live paint (720×1280 synthetic)", () => {
  it("does not paint C5 / C11 / reserved chest-band pixels", () => {
    const w = CHEST_REF_FRAME.width;
    const h = CHEST_REF_FRAME.height;
    const still: { width: number; height: number; data: Uint8Array } = {
      width: w,
      height: h,
      data: new Uint8Array(w * h * 4),
    };
    for (let i = 0; i < w * h; i++) {
      still.data[i * 4] = CREAM[0];
      still.data[i * 4 + 1] = CREAM[1];
      still.data[i * 4 + 2] = CREAM[2];
      still.data[i * 4 + 3] = 255;
    }
    const reserved = rasterizeReservedChestMask(w, h, LIVE_CHEST_RESERVED_QUAD_NORM);
    for (let i = 0; i < reserved.data.length; i++) {
      if (!reserved.data[i]) continue;
      still.data[i * 4] = 28;
      still.data[i * 4 + 1] = 32;
      still.data[i * 4 + 2] = 88;
    }

    const fx = buildCrossedArmsSleeveFixture();
    const sourceBefore = new Uint8Array(still.data);
    const out = repairVisibleSleevePanelsOnStill({
      still,
      flatRef: fx.flatRef,
      panels: [
        {
          side: "left",
          targetQuad: SEEDED_VISIBLE_SLEEVE_QUADS.left,
          sourceBboxNorm: fx.panels[0].sourceBboxNorm,
        },
        {
          side: "right",
          targetQuad: SEEDED_VISIBLE_SLEEVE_QUADS.right,
          sourceBboxNorm: fx.panels[1].sourceBboxNorm,
        },
      ],
      chestBandQuadNorm: LIVE_CHEST_RESERVED_QUAD_NORM,
    });

    expect(out.output.claims.visibleGeometryRepaired).toBe(true);
    expect(out.output.claims.hiddenShoulderToCuffValidated).toBe(false);
    expect(out.output.sides.every((s) => s.paintedPixelCount > 0)).toBe(true);

    let reservedChanged = 0;
    for (let i = 0; i < reserved.data.length; i++) {
      if (!reserved.data[i]) continue;
      const o = i * 4;
      if (
        out.still.data[o] !== sourceBefore[o] ||
        out.still.data[o + 1] !== sourceBefore[o + 1] ||
        out.still.data[o + 2] !== sourceBefore[o + 2]
      ) {
        reservedChanged++;
      }
    }
    expect(reservedChanged).toBe(0);

    const lockedWindows = [
      { x0: 330, x1: 380, y0: 738, y1: 755 },
      { x0: 389, x1: 392, y0: 746, y1: 748 },
      { x0: 0, x1: 719, y0: 0, y1: 599 },
      { x0: 0, x1: 719, y0: 800, y1: 1279 },
    ];
    let lockedChanged = 0;
    for (const box of lockedWindows) {
      for (let y = box.y0; y <= box.y1; y++) {
        for (let x = box.x0; x <= box.x1; x++) {
          const i = (y * w + x) * 4;
          if (
            out.still.data[i] !== sourceBefore[i] ||
            out.still.data[i + 1] !== sourceBefore[i + 1] ||
            out.still.data[i + 2] !== sourceBefore[i + 2]
          ) {
            lockedChanged++;
          }
        }
      }
    }
    expect(lockedChanged).toBe(0);
    expect(rgbaFingerprint({ width: w, height: h, data: sourceBefore })).not.toBe(
      rgbaFingerprint(out.still),
    );
  });
});
