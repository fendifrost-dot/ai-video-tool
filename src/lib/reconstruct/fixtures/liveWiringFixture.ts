/**
 * $0 synthetic fixtures for Lane D original-master live wiring.
 *
 * No live chest/sleeve bytes, no SAM-3 fetch, no paid Grok.
 * Original pixels are unique per (x, y, frame) so preservation is exact RGB.
 *
 * Live-shaped temporal rasters (80×128 × 5, +2 px chest translation) are
 * copied from Lane C's published fixture sizes — not imported from temporal.
 */

import {
  CANONICAL_FULL_CLIP_FRAME_COUNT,
  CANONICAL_MASTER_FPS,
  CANONICAL_MASTER_HEIGHT,
  CANONICAL_MASTER_WIDTH,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_QUAD_TUPLE,
  CLEARED_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_LEFT_QUAD_TUPLE,
  CLEARED_SLEEVE_RIGHT_QUAD_TUPLE,
} from "../canonicalLineage";
import type { ConsumedSam3Mask, ConsumedTemporalJob, MasterClipFrame } from "../adapters";
import { fillConvexQuad } from "../adapters";
import {
  FIXTURE_HEIGHT,
  FIXTURE_WIDTH,
  invertedGenerated,
  rectMask,
  uniqueOriginal,
  type Rect,
} from "./syntheticMaster";
import type { RgbaImage } from "../types";

export const LIVE_WIRING_FRAME_COUNT = 4;

/** Copied from Lane C `clearedChestTranslatingFixture` — do not import temporal. */
export const LIVE_TEMPORAL_RASTER = { width: 80, height: 128 } as const;
export const LIVE_TEMPORAL_FRAME_COUNT = 5;
export const LIVE_TEMPORAL_DX_PER_FRAME = 2;

export const CHEST_STILL_RGB = [20, 32, 80] as const;
export const SLEEVE_STILL_RGB = [18, 28, 72] as const;

/**
 * Identity punch-out inside the SAM-3 garment band (y 0.48–0.64).
 * Do not reuse 32×24 `IDENTITY_RECT` pixel coords on 720×1280 — that box
 * sits in the upper frame and misses the authorized region.
 */
export const FIXTURE_IDENTITY_NORM = {
  x0: 0.42,
  x1: 0.55,
  y0: 0.5,
  y1: 0.56,
} as const;

export function fixtureIdentityRect(width: number, height: number): Rect {
  return {
    x0: Math.floor(FIXTURE_IDENTITY_NORM.x0 * width),
    x1: Math.ceil(FIXTURE_IDENTITY_NORM.x1 * width),
    y0: Math.floor(FIXTURE_IDENTITY_NORM.y0 * height),
    y1: Math.ceil(FIXTURE_IDENTITY_NORM.y1 * height),
  };
}

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
    repairAlpha: rectMask(width, height, fixtureIdentityRect(width, height)),
    source: "fixture",
    liveFetch: false,
  };
}

/** Integer-pixel +x slide of a binary/α mask. Used to emulate translating temporal output. */
export function translateAlpha(
  mask: Float32Array,
  width: number,
  height: number,
  dx: number,
): Float32Array {
  if (dx === 0) return mask;
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const sx = x - dx;
      if (sx >= 0 && sx < width) out[row + x] = mask[row + sx]!;
    }
  }
  return out;
}

export function fixtureTemporalJobs(
  width = FIXTURE_WIDTH,
  height = FIXTURE_HEIGHT,
  frameCount = LIVE_WIRING_FRAME_COUNT,
  options?: { translateChest?: boolean; dxPerFrame?: number },
): ConsumedTemporalJob[] {
  const chestMask = fillConvexQuad(width, height, CLEARED_CHEST_QUAD_TUPLE);
  const leftMask = fillConvexQuad(width, height, CLEARED_SLEEVE_LEFT_QUAD_TUPLE);
  const rightMask = fillConvexQuad(width, height, CLEARED_SLEEVE_RIGHT_QUAD_TUPLE);
  const translateChest = options?.translateChest === true;
  const dxPerFrame = options?.dxPerFrame ?? 0;
  const last = frameCount - 1;

  const framesFor = (
    kind: "chest" | "sleeve",
    base: Float32Array,
  ): ConsumedTemporalJob["frames"] => {
    const frames: ConsumedTemporalJob["frames"] = [];
    for (let index = 0; index < frameCount; index++) {
      const mask =
        kind === "chest" && translateChest
          ? translateAlpha(base, width, height, index * dxPerFrame)
          : base;
      const lowConfidenceLast = kind === "chest" && !translateChest && index === last;
      frames.push({
        index,
        width,
        height,
        mask,
        confidence: lowConfidenceLast ? 0.2 : 1,
        reanchorRecommended: lowConfidenceLast,
      });
    }
    return frames;
  };

  return [
    {
      kind: "chest",
      sourceAssetId: CLEARED_CHEST_ASSET_ID,
      frames: framesFor("chest", chestMask),
    },
    {
      kind: "sleeve_left",
      sourceAssetId: CLEARED_SLEEVE_ASSET_ID,
      frames: framesFor("sleeve", leftMask),
    },
    {
      kind: "sleeve_right",
      sourceAssetId: CLEARED_SLEEVE_ASSET_ID,
      frames: framesFor("sleeve", rightMask),
    },
  ];
}

/** Live temporal-propagate JSON shape: 80×128 × 5, chest +2 px/frame. */
export function liveShapedTemporalJobs(): ConsumedTemporalJob[] {
  return fixtureTemporalJobs(
    LIVE_TEMPORAL_RASTER.width,
    LIVE_TEMPORAL_RASTER.height,
    LIVE_TEMPORAL_FRAME_COUNT,
    { translateChest: true, dxPerFrame: LIVE_TEMPORAL_DX_PER_FRAME },
  );
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

export function realMediaFixturePack(options?: {
  width?: number;
  height?: number;
  frameCount?: number;
  fps?: number;
  translateChest?: boolean;
  dxPerFrame?: number;
  temporalWidth?: number;
  temporalHeight?: number;
}) {
  const width = options?.width ?? CANONICAL_MASTER_WIDTH;
  const height = options?.height ?? CANONICAL_MASTER_HEIGHT;
  const frameCount = options?.frameCount ?? CANONICAL_FULL_CLIP_FRAME_COUNT;
  const fps = options?.fps ?? CANONICAL_MASTER_FPS;
  const temporalWidth = options?.temporalWidth ?? width;
  const temporalHeight = options?.temporalHeight ?? height;
  const translateChest = options?.translateChest ?? true;
  const dxPerFrame =
    options?.dxPerFrame ??
    (temporalWidth === LIVE_TEMPORAL_RASTER.width
      ? LIVE_TEMPORAL_DX_PER_FRAME
      : Math.max(
          1,
          Math.round(LIVE_TEMPORAL_DX_PER_FRAME * (temporalWidth / LIVE_TEMPORAL_RASTER.width)),
        ));

  const originalFrames: MasterClipFrame[] = [];
  for (let i = 0; i < frameCount; i++) {
    originalFrames.push({ index: i, image: uniqueOriginalFrame(i, width, height) });
  }
  return {
    width,
    height,
    fps,
    frameCount,
    originalFrames,
    chestStill: { assetId: CLEARED_CHEST_ASSET_ID, image: flatStill(CHEST_STILL_RGB, width, height) },
    sleeveStill: {
      assetId: CLEARED_SLEEVE_ASSET_ID,
      image: flatStill(SLEEVE_STILL_RGB, width, height),
    },
    sam3: fixtureSam3Mask(width, height),
    temporalJobs: fixtureTemporalJobs(temporalWidth, temporalHeight, frameCount, {
      translateChest,
      dxPerFrame,
    }),
  };
}

export function rgbaToArray(image: RgbaImage): number[] {
  return Array.from(image.data);
}
