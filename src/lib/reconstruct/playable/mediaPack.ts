/**
 * Build a 720×1280 playable media pack.
 *
 * Original RGB is unique per (x,y) and stable across frames so unauthorized
 * pixels are byte-provable. Real still 2aa1a44c band-crop pixels are embedded
 * at the documented chest location. Luma carries a translating chest blob
 * (dx ≤ temporal search radius) so in-lib propagateRepair has signal.
 *
 * This is the $0 working raster at Architecture C still resolution.
 * It is not the 80×128 / 5-frame RECONSTRUCT-1 fixture.
 */

import { embedArchitectureCBandCropInFrame } from "@/lib/garment/fixtures/architectureCStillBandCrop";
import {
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_QUAD_TUPLE,
  CLEARED_SLEEVE_ASSET_ID,
} from "../canonicalLineage";
import { fillConvexQuad, type ClearedStillImage, type MasterClipFrame } from "../adapters";
import { uniqueOriginal } from "../fixtures/syntheticMaster";
import { CHEST_STILL_RGB, SLEEVE_STILL_RGB, flatStill } from "../fixtures/liveWiringFixture";
import type { RgbaImage } from "../types";
import type { PlayableClipSpec, PlayableMediaKind } from "./contract";
import { PLAYABLE_WORKING_HEIGHT, PLAYABLE_WORKING_WIDTH } from "./contract";

export type PlayableMediaFrame = {
  index: number;
  timeSec: number;
  image: RgbaImage;
  luma: Uint8Array;
};

export type PlayableMediaPack = {
  spec: PlayableClipSpec;
  mediaKind: PlayableMediaKind;
  originalFrames: MasterClipFrame[];
  lumaFrames: { index: number; width: number; height: number; luma: Uint8Array }[];
  chestStill: ClearedStillImage;
  sleeveStill: ClearedStillImage;
  hasAudio: false;
};

function cloneRgba(image: RgbaImage): RgbaImage {
  return { width: image.width, height: image.height, data: new Uint8Array(image.data) };
}

function embedBandCrop(dest: RgbaImage, crop: RgbaImage): void {
  const originX = 190;
  const originY = 660;
  for (let y = 0; y < crop.height; y++) {
    const dy = originY + y;
    if (dy < 0 || dy >= dest.height) continue;
    for (let x = 0; x < crop.width; x++) {
      const dx = originX + x;
      if (dx < 0 || dx >= dest.width) continue;
      const si = (y * crop.width + x) * 4;
      const di = (dy * dest.width + dx) * 4;
      dest.data[di] = crop.data[si]!;
      dest.data[di + 1] = crop.data[si + 1]!;
      dest.data[di + 2] = crop.data[si + 2]!;
      dest.data[di + 3] = 255;
    }
  }
}

function rgbToLuma(image: RgbaImage): Uint8Array {
  const luma = new Uint8Array(image.width * image.height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = Math.round(
      0.299 * image.data[p]! + 0.587 * image.data[p + 1]! + 0.114 * image.data[p + 2]!,
    );
  }
  return luma;
}

function paintTranslatingChestLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  chestMask: Float32Array,
  dx: number,
  value: number,
): void {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if ((chestMask[row + x] ?? 0) <= 0.5) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      luma[row + nx] = value;
    }
  }
}

function chestStillFromBandCrop(width: number, height: number): RgbaImage {
  if (width === PLAYABLE_WORKING_WIDTH && height === PLAYABLE_WORKING_HEIGHT) {
    const embedded = embedArchitectureCBandCropInFrame();
    return { width: embedded.width, height: embedded.height, data: embedded.data };
  }
  return flatStill(CHEST_STILL_RGB, width, height);
}

/**
 * One original frame + luma at spec resolution.
 * Original RGB is identical across frames (stable master) except we do not
 * mutate RGB for the translating luma — luma is a separate temporal signal.
 */
export function playableFrameAt(
  spec: PlayableClipSpec,
  index: number,
  stableOriginal: RgbaImage,
  chestMask: Float32Array,
): PlayableMediaFrame {
  const image = cloneRgba(stableOriginal);
  const luma = rgbToLuma(image);
  const dx = (index - spec.keyframeIndex) * spec.dxPerFrame;
  paintTranslatingChestLuma(luma, spec.width, spec.height, chestMask, dx, 220);
  return {
    index,
    timeSec: spec.fps > 0 ? index / spec.fps : 0,
    image,
    luma,
  };
}

export function buildStableOriginal(spec: PlayableClipSpec): RgbaImage {
  const base = uniqueOriginal(spec.width, spec.height);
  if (spec.width === PLAYABLE_WORKING_WIDTH && spec.height === PLAYABLE_WORKING_HEIGHT) {
    const cropFrame = embedArchitectureCBandCropInFrame();
    embedBandCrop(base, {
      width: 450,
      height: 101,
      data: cropWindow(cropFrame, 190, 660, 450, 101),
    });
  }
  return base;
}

function cropWindow(
  src: { width: number; height: number; data: Uint8Array },
  x0: number,
  y0: number,
  w: number,
  h: number,
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * src.width + (x0 + x)) * 4;
      const di = (y * w + x) * 4;
      out[di] = src.data[si]!;
      out[di + 1] = src.data[si + 1]!;
      out[di + 2] = src.data[si + 2]!;
      out[di + 3] = 255;
    }
  }
  return out;
}

export function buildPlayableMediaPack(
  spec: PlayableClipSpec,
  mediaKind: PlayableMediaKind = "canonical_720x1280_still_derived",
): PlayableMediaPack {
  if (spec.frameCount < 1) throw new Error("playable_empty_clip");
  if (spec.keyframeIndex < 0 || spec.keyframeIndex >= spec.frameCount) {
    throw new Error("playable_keyframe_out_of_range");
  }
  const chestMask = fillConvexQuad(spec.width, spec.height, CLEARED_CHEST_QUAD_TUPLE);
  const stable = buildStableOriginal(spec);
  const originalFrames: MasterClipFrame[] = [];
  const lumaFrames: PlayableMediaPack["lumaFrames"] = [];
  for (let i = 0; i < spec.frameCount; i++) {
    const fr = playableFrameAt(spec, i, stable, chestMask);
    originalFrames.push({ index: fr.index, image: fr.image });
    lumaFrames.push({
      index: fr.index,
      width: spec.width,
      height: spec.height,
      luma: fr.luma,
    });
  }
  return {
    spec,
    mediaKind,
    originalFrames,
    lumaFrames,
    chestStill: {
      assetId: CLEARED_CHEST_ASSET_ID,
      image: chestStillFromBandCrop(spec.width, spec.height),
    },
    sleeveStill: {
      assetId: CLEARED_SLEEVE_ASSET_ID,
      image: flatStill(SLEEVE_STILL_RGB, spec.width, spec.height),
    },
    hasAudio: false,
  };
}
