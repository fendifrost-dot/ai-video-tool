/**
 * Static crossed-arms sleeve fixtures.
 *
 * Synthetic stills encode the canonical pose constraint (arms crossed):
 * visible upper-arm segments exist; shoulder→cuff / cuff is hidden.
 * No production bytes, no network, no paid generation.
 */

import {
  defaultVisibilityManifest,
  type ChestOutputConsumptionSlot,
  type VisibleSleevePanelSpec,
} from "./contract";
import { SLEEVE_PANEL_CONTRACT_VERSION } from "./types";
import { createMask, createRgba, fillMaskRect, fillRect, rgbaFingerprint } from "./raster";
import type { BinaryMask, NormBbox, QuadNorm, RgbaImage } from "./types";

export const FIXTURE_STILL_W = 80;
export const FIXTURE_STILL_H = 64;
export const FIXTURE_FLAT_W = 40;
export const FIXTURE_FLAT_H = 64;

export const CREAM: readonly [number, number, number] = [210, 190, 155];
export const NAVY: readonly [number, number, number] = [28, 32, 88];
export const PINSTRIPE: readonly [number, number, number] = [236, 228, 210];
export const BG: readonly [number, number, number] = [18, 18, 22];

/** Inclusive-exclusive pixel boxes on the 80×64 still. */
export const LEFT_VISIBLE = { x0: 8, y0: 16, x1: 24, y1: 36 } as const;
export const RIGHT_VISIBLE = { x0: 56, y0: 16, x1: 72, y1: 36 } as const;
export const LEFT_HIDDEN = { x0: 8, y0: 36, x1: 24, y1: 52 } as const;
export const RIGHT_HIDDEN = { x0: 56, y0: 36, x1: 72, y1: 52 } as const;
export const CHEST_RESERVED = { x0: 30, y0: 22, x1: 50, y1: 29 } as const;

export const LEFT_VISIBLE_QUAD: QuadNorm = [
  [LEFT_VISIBLE.x0 / FIXTURE_STILL_W, LEFT_VISIBLE.y0 / FIXTURE_STILL_H],
  [LEFT_VISIBLE.x1 / FIXTURE_STILL_W, LEFT_VISIBLE.y0 / FIXTURE_STILL_H],
  [LEFT_VISIBLE.x1 / FIXTURE_STILL_W, LEFT_VISIBLE.y1 / FIXTURE_STILL_H],
  [LEFT_VISIBLE.x0 / FIXTURE_STILL_W, LEFT_VISIBLE.y1 / FIXTURE_STILL_H],
];

export const RIGHT_VISIBLE_QUAD: QuadNorm = [
  [RIGHT_VISIBLE.x0 / FIXTURE_STILL_W, RIGHT_VISIBLE.y0 / FIXTURE_STILL_H],
  [RIGHT_VISIBLE.x1 / FIXTURE_STILL_W, RIGHT_VISIBLE.y0 / FIXTURE_STILL_H],
  [RIGHT_VISIBLE.x1 / FIXTURE_STILL_W, RIGHT_VISIBLE.y1 / FIXTURE_STILL_H],
  [RIGHT_VISIBLE.x0 / FIXTURE_STILL_W, RIGHT_VISIBLE.y1 / FIXTURE_STILL_H],
];

/** Claims a full shoulder→cuff run — must be rejected. */
export const LEFT_HIDDEN_SHOULDER_TO_CUFF_QUAD: QuadNorm = [
  [LEFT_VISIBLE.x0 / FIXTURE_STILL_W, 0.12],
  [LEFT_VISIBLE.x1 / FIXTURE_STILL_W, 0.12],
  [LEFT_VISIBLE.x1 / FIXTURE_STILL_W, 0.86],
  [LEFT_VISIBLE.x0 / FIXTURE_STILL_W, 0.86],
];

export const FLAT_PANEL_BBOX: NormBbox = [
  8 / FIXTURE_FLAT_W,
  6 / FIXTURE_FLAT_H,
  10 / FIXTURE_FLAT_W,
  22 / FIXTURE_FLAT_H,
];

export const DEFAULT_PANELS: VisibleSleevePanelSpec[] = [
  { side: "left", targetQuadNorm: LEFT_VISIBLE_QUAD, sourceBboxNorm: FLAT_PANEL_BBOX },
  { side: "right", targetQuadNorm: RIGHT_VISIBLE_QUAD, sourceBboxNorm: FLAT_PANEL_BBOX },
];

function paintRect(
  img: RgbaImage,
  box: { x0: number; y0: number; x1: number; y1: number },
  rgb: readonly [number, number, number],
): void {
  fillRect(img, box.x0, box.y0, box.x1, box.y1, rgb[0], rgb[1], rgb[2]);
}

/**
 * Crossed-arms still:
 *   - cream torso + visible upper arms
 *   - V2 defect: horizontal navy ring + horizontal cream pinstripe on each visible arm
 *   - hidden distal forearm/cuff remains cream (must stay unpainted)
 *   - chest band navy reserved for a later chest-output slot
 */
export function buildCrossedArmsStill(): RgbaImage {
  const still = createRgba(FIXTURE_STILL_W, FIXTURE_STILL_H, BG[0], BG[1], BG[2]);
  fillRect(still, 28, 10, 52, 55, CREAM[0], CREAM[1], CREAM[2]);
  paintRect(still, LEFT_VISIBLE, CREAM);
  paintRect(still, RIGHT_VISIBLE, CREAM);
  paintRect(still, LEFT_HIDDEN, CREAM);
  paintRect(still, RIGHT_HIDDEN, CREAM);

  // Horizontal defect rings (continuation of the chest band onto the sleeve).
  fillRect(still, LEFT_VISIBLE.x0, 22, LEFT_VISIBLE.x1, 29, NAVY[0], NAVY[1], NAVY[2]);
  fillRect(still, RIGHT_VISIBLE.x0, 22, RIGHT_VISIBLE.x1, 29, NAVY[0], NAVY[1], NAVY[2]);
  fillRect(
    still,
    LEFT_VISIBLE.x0,
    24,
    LEFT_VISIBLE.x1,
    26,
    PINSTRIPE[0],
    PINSTRIPE[1],
    PINSTRIPE[2],
  );
  fillRect(
    still,
    RIGHT_VISIBLE.x0,
    24,
    RIGHT_VISIBLE.x1,
    26,
    PINSTRIPE[0],
    PINSTRIPE[1],
    PINSTRIPE[2],
  );

  paintRect(still, CHEST_RESERVED, NAVY);
  return still;
}

/** Flat-ref vertical navy panel with a vertical cream pinstripe. */
export function buildFlatSleeveRef(): RgbaImage {
  const flat = createRgba(FIXTURE_FLAT_W, FIXTURE_FLAT_H, CREAM[0], CREAM[1], CREAM[2]);
  fillRect(flat, 8, 6, 18, 58, NAVY[0], NAVY[1], NAVY[2]);
  fillRect(flat, 12, 6, 14, 58, PINSTRIPE[0], PINSTRIPE[1], PINSTRIPE[2]);
  return flat;
}

export function buildVisibleMask(): BinaryMask {
  const mask = createMask(FIXTURE_STILL_W, FIXTURE_STILL_H);
  fillMaskRect(mask, LEFT_VISIBLE.x0, LEFT_VISIBLE.y0, LEFT_VISIBLE.x1, LEFT_VISIBLE.y1, 1);
  fillMaskRect(mask, RIGHT_VISIBLE.x0, RIGHT_VISIBLE.y0, RIGHT_VISIBLE.x1, RIGHT_VISIBLE.y1, 1);
  return mask;
}

export function buildHiddenMask(): BinaryMask {
  const mask = createMask(FIXTURE_STILL_W, FIXTURE_STILL_H);
  fillMaskRect(mask, LEFT_HIDDEN.x0, LEFT_HIDDEN.y0, LEFT_HIDDEN.x1, LEFT_HIDDEN.y1, 1);
  fillMaskRect(mask, RIGHT_HIDDEN.x0, RIGHT_HIDDEN.y0, RIGHT_HIDDEN.x1, RIGHT_HIDDEN.y1, 1);
  fillMaskRect(mask, 4, 16, 8, 52, 1);
  fillMaskRect(mask, 72, 16, 76, 52, 1);
  return mask;
}

export function buildChestReservedMask(): BinaryMask {
  const mask = createMask(FIXTURE_STILL_W, FIXTURE_STILL_H);
  fillMaskRect(mask, CHEST_RESERVED.x0, CHEST_RESERVED.y0, CHEST_RESERVED.x1, CHEST_RESERVED.y1, 1);
  return mask;
}

export function buildChestOutputSlot(withReservedMask = true): ChestOutputConsumptionSlot {
  return {
    kind: "chest_output_ref",
    contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
    stage: "logo_chest",
    sourceStillId: "fixture-crossed-arms-visible-sleeve",
    chestOutputAssetId: "fixture-chest-output-reserved",
    repairMethodVersion: "architecture_c_still_repair_opaque_ref",
    reservedMask: withReservedMask ? buildChestReservedMask() : null,
    chestBandQuadNorm: [
      [CHEST_RESERVED.x0 / FIXTURE_STILL_W, CHEST_RESERVED.y0 / FIXTURE_STILL_H],
      [CHEST_RESERVED.x1 / FIXTURE_STILL_W, CHEST_RESERVED.y0 / FIXTURE_STILL_H],
      [CHEST_RESERVED.x1 / FIXTURE_STILL_W, CHEST_RESERVED.y1 / FIXTURE_STILL_H],
      [CHEST_RESERVED.x0 / FIXTURE_STILL_W, CHEST_RESERVED.y1 / FIXTURE_STILL_H],
    ],
  };
}

export type CrossedArmsSleeveFixture = {
  id: "crossed_arms_visible_sleeve_v1";
  still: RgbaImage;
  flatRef: RgbaImage;
  visibleMask: BinaryMask;
  hiddenMask: BinaryMask;
  panels: VisibleSleevePanelSpec[];
  visibility: ReturnType<typeof defaultVisibilityManifest>;
  fingerprints: { still: string; flat: string };
};

export function buildCrossedArmsSleeveFixture(): CrossedArmsSleeveFixture {
  const still = buildCrossedArmsStill();
  const flatRef = buildFlatSleeveRef();
  return {
    id: "crossed_arms_visible_sleeve_v1",
    still,
    flatRef,
    visibleMask: buildVisibleMask(),
    hiddenMask: buildHiddenMask(),
    panels: DEFAULT_PANELS,
    visibility: defaultVisibilityManifest(),
    fingerprints: {
      still: rgbaFingerprint(still),
      flat: rgbaFingerprint(flatRef),
    },
  };
}
