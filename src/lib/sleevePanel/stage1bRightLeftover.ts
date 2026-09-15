/**
 * Stage 1b right-sleeve leftover fixture (live `a4dc7f47` class).
 *
 * Encodes the 1b FAIL #6: a ~0.23 navy / cream-majority source warped as-is
 * onto an already-dark right V2 ring (luma ~134) so mean luma rises, while
 * the cream left arm still drops. 1c must prefer product navy over cream
 * stripe so BOTH quads drop luma on lane-b-sleeve-live-v1.
 *
 * Does not import logoComposite / chest paint.
 */

import { CHEST_REF_FRAME } from "@/lib/eval/chestCriteria";
import {
  DEFAULT_FLAT_SLEEVE_SOURCE_BBOX,
  LIVE_CHEST_RESERVED_QUAD_NORM,
  SEEDED_VISIBLE_SLEEVE_QUADS,
  rasterizeReservedChestMask,
} from "./liveStill";
import { CREAM, NAVY } from "./fixtures";
import { navyFraction } from "./navyFill";
import {
  cloneRgba,
  cropNormBbox,
  createRgba,
  fillRect,
  invBilinear,
  quadNormToPts,
  rasterizeQuadMask,
  sampleNearest,
} from "./raster";
import type { QuadNorm, RgbaImage } from "./types";

/** Live 1b left-arm class — cream/white, luma ~202. */
export const LIVE_1B_LEFT_CREAM: readonly [number, number, number] = [220, 200, 185];

/**
 * Live 1b right V2 ring class — already dark (luma ~134), not product navy.
 * 1b cream-majority paste lightens this; 1c navy-over-cream must darken it.
 */
export const LIVE_1B_RIGHT_V2_RING: readonly [number, number, number] = [145, 130, 125];

/** Target navy fraction of the requested DEFAULT crop (live 1b ~0.23). */
export const STAGE1B_CREAM_MAJORITY_NAVY_FRACTION = 0.23;

function paintQuad(img: RgbaImage, quad: QuadNorm, rgb: readonly [number, number, number]): void {
  const mask = rasterizeQuadMask(img.width, img.height, quadNormToPts(quad, img.width, img.height));
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    const o = i * 4;
    img.data[o] = rgb[0];
    img.data[o + 1] = rgb[1];
    img.data[o + 2] = rgb[2];
    img.data[o + 3] = 255;
  }
}

export function buildCreamMajorityNavyStripeFlat(width = 200, height = 200): RgbaImage {
  const flat = createRgba(width, height, CREAM[0], CREAM[1], CREAM[2]);
  const [nx, ny, nw, nh] = DEFAULT_FLAT_SLEEVE_SOURCE_BBOX;
  const sx = Math.floor(nx * width);
  const sy = Math.floor(ny * height);
  const bw = Math.max(1, Math.ceil(nw * width));
  const bh = Math.max(1, Math.ceil(nh * height));
  const navyW = Math.max(1, Math.round(bw * STAGE1B_CREAM_MAJORITY_NAVY_FRACTION));
  fillRect(flat, sx, sy, sx + navyW, sy + bh, NAVY[0], NAVY[1], NAVY[2]);
  return flat;
}

export function buildStage1bRightLeftoverStill(
  width = CHEST_REF_FRAME.width,
  height = CHEST_REF_FRAME.height,
): RgbaImage {
  const still = createRgba(width, height, CREAM[0], CREAM[1], CREAM[2]);
  paintQuad(still, SEEDED_VISIBLE_SLEEVE_QUADS.left, LIVE_1B_LEFT_CREAM);
  paintQuad(still, SEEDED_VISIBLE_SLEEVE_QUADS.right, LIVE_1B_RIGHT_V2_RING);
  const reserved = rasterizeReservedChestMask(width, height, LIVE_CHEST_RESERVED_QUAD_NORM);
  for (let i = 0; i < reserved.data.length; i++) {
    if (!reserved.data[i]) continue;
    const o = i * 4;
    still.data[o] = NAVY[0];
    still.data[o + 1] = NAVY[1];
    still.data[o + 2] = NAVY[2];
    still.data[o + 3] = 255;
  }
  return still;
}

/**
 * Stage 1b leftover paint: warp the requested crop as-is (no navy-over-cream).
 * Used as a golden that must FAIL criterion 6 on the dark right ring.
 */
export function warpRequestedCropAsIs(
  still: RgbaImage,
  flat: RgbaImage,
  leftQuad: QuadNorm,
  rightQuad: QuadNorm,
): RgbaImage {
  const source = cropNormBbox(flat, DEFAULT_FLAT_SLEEVE_SOURCE_BBOX);
  const out = cloneRgba(still);
  for (const quad of [leftQuad, rightQuad]) {
    const pts = quadNormToPts(quad, out.width, out.height);
    const mask = rasterizeQuadMask(out.width, out.height, pts);
    const [tl, tr, br, bl] = pts;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const mi = y * out.width + x;
        if (!mask.data[mi]) continue;
        const uv = invBilinear(x + 0.5, y + 0.5, tl, tr, br, bl);
        if (!uv) continue;
        const [r, g, b, a] = sampleNearest(source, uv.u, uv.v);
        if (a < 8) continue;
        const di = mi * 4;
        out.data[di] = r;
        out.data[di + 1] = g;
        out.data[di + 2] = b;
        out.data[di + 3] = 255;
      }
    }
  }
  return out;
}

export function stage1bLeftoverRequestedNavyFraction(flat: RgbaImage): number {
  return navyFraction(cropNormBbox(flat, DEFAULT_FLAT_SLEEVE_SOURCE_BBOX));
}
