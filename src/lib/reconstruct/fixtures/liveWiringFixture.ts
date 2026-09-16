/**
 * $0 synthetic fixtures for Lane D original-master live wiring.
 *
 * No live chest/sleeve bytes, no SAM-3 fetch, no paid Grok.
 * Original pixels are unique per (x, y, frame) so preservation is exact RGB.
 */

import { CLEARED_CHEST_ASSET_ID, CLEARED_SLEEVE_ASSET_ID } from "../canonicalLineage";
import type { ConsumedSam3Mask, ConsumedTemporalJob, MasterClipFrame } from "../adapters";
import { fillConvexQuad } from "../adapters";
import {
  CLEARED_CHEST_QUAD_TUPLE,
  CLEARED_SLEEVE_LEFT_QUAD_TUPLE,
  CLEARED_SLEEVE_RIGHT_QUAD_TUPLE,
} from "../canonicalLineage";
import {
  FIXTURE_HEIGHT,
  FIXTURE_WIDTH,
  IDENTITY_RECT,
  invertedGenerated,
  rectMask,
  uniqueOriginal,
} from "./syntheticMaster";
import type { RgbaImage } from "../types";

export const LIVE_WIRING_FRAME_COUNT = 4;

export const CHEST_STILL_RGB = [20, 32, 80] as const;
export const SLEEVE_STILL_RGB = [18, 28, 72] as const;

export function uniqueOriginalFrame(
  frame: number,
  width = FIXTURE_WIDTH,
  height = FIXTURE_HEIGHT,
): RgbaImage {
  const base = uniqueOriginal(width, height);
  if (frame === 0) return base;
  const data = new Uint8Array(base.data);
  for (let p = 0; p < data.length; p += 4) {
    data[p] = (data[p]! + frame * 31) & 255;
    data[p + 1] = (data[p + 1]! + frame * 17) & 255;
    data[p + 2] = (data[p + 2]! + frame * 13) & 255;
  }
  return { width, height, data };
}

export function flatStill(
  rgb: readonly [number, number, number],
  width = FIXTURE_WIDTH,
  height = FIXTURE_HEIGHT,
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < data.length; p += 4) {
    data[p] = rgb[0];
    data[p + 1] = rgb[1];
    data[p + 2] = rgb[2];
    data[p + 3] = 255;
  }
  return { width, height, data };
}

/** SAM-3 stand-in: garment band covering chest + visible sleeves; identity punch-out. */
export function fixtureSam3Mask(width = FIXTURE_WIDTH, height = FIXTURE_HEIGHT): ConsumedSam3Mask {
  const outfitAlpha = new Float32Array(width * height);
  const y0 = Math.floor(height * 0.48);
  const y1 = Math.ceil(height * 0.64);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      outfitAlpha[y * width + x] = 1;
    }
  }
  return {
    width,
    height,
    outfitAlpha,
    repairAlpha: rectMask(width, height, IDENTITY_RECT),
    source: "fixture",
    liveFetch: false,
  };
}

export function fixtureTemporalJobs(
  width = FIXTURE_WIDTH,
  height = FIXTURE_HEIGHT,
): ConsumedTemporalJob[] {
  const chestMask = fillConvexQuad(width, height, CLEARED_CHEST_QUAD_TUPLE);
  const leftMask = fillConvexQuad(width, height, CLEARED_SLEEVE_LEFT_QUAD_TUPLE);
  const rightMask = fillConvexQuad(width, height, CLEARED_SLEEVE_RIGHT_QUAD_TUPLE);

  const framesFor = (
    mask: Float32Array,
    lowConfidenceLast: boolean,
  ): ConsumedTemporalJob["frames"] =>
    [0, 1, 2, 3].map((index) => ({
      index,
      width,
      height,
      mask,
      confidence: lowConfidenceLast && index === 3 ? 0.2 : 1,
      reanchorRecommended: lowConfidenceLast && index === 3,
    }));

  return [
    {
      kind: "chest",
      sourceAssetId: CLEARED_CHEST_ASSET_ID,
      frames: framesFor(chestMask, true),
    },
    {
      kind: "sleeve_left",
      sourceAssetId: CLEARED_SLEEVE_ASSET_ID,
      frames: framesFor(leftMask, false),
    },
    {
      kind: "sleeve_right",
      sourceAssetId: CLEARED_SLEEVE_ASSET_ID,
      frames: framesFor(rightMask, false),
    },
  ];
}

export function liveWiringFixturePack() {
  const originalFrames: MasterClipFrame[] = [];
  for (let i = 0; i < LIVE_WIRING_FRAME_COUNT; i++) {
    originalFrames.push({ index: i, image: uniqueOriginalFrame(i) });
  }
  return {
    width: FIXTURE_WIDTH,
    height: FIXTURE_HEIGHT,
    originalFrames,
    chestStill: { assetId: CLEARED_CHEST_ASSET_ID, image: flatStill(CHEST_STILL_RGB) },
    sleeveStill: { assetId: CLEARED_SLEEVE_ASSET_ID, image: flatStill(SLEEVE_STILL_RGB) },
    sam3: fixtureSam3Mask(),
    temporalJobs: fixtureTemporalJobs(),
    invertedOnFrame0: invertedGenerated(originalFrames[0]!.image),
  };
}

export function rgbaToArray(image: RgbaImage): number[] {
  return Array.from(image.data);
}
