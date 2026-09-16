/**
 * Spec-driven synthetic luma fixtures for portable temporal QA.
 * Shares CLEARED quads (normalized) — no paint-owner imports.
 */

import type { BinaryMask, SourceClip, SourceClipFrame } from "./contract";
import type { TemporalQaClipSpec } from "./clipSpec";
import { SECOND_QA_CLIP_SPEC } from "./clipSpec";
import {
  CLEARED_CHEST_QUAD_NORM,
  CLEARED_SLEEVE_LEFT_QUAD_NORM,
  CLEARED_SLEEVE_RIGHT_QUAD_NORM,
} from "./canonicalLineage";
import { clearedChestAndSleeveQuadSet } from "./approvedQuad";
import { emptyMask, paintQuadMask } from "./mask";
import { FULL_CLIP_FIXTURE_VERSION, type CanonicalFullClipFixture } from "./fullClipFixture";

function blankLuma(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h);
}

function paintMaskLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  mask: BinaryMask,
  dx: number,
  value: number,
): void {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask.data[row + x] !== 1) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      luma[row + nx] = value;
    }
  }
}

function shiftMask(mask: BinaryMask, dx: number): BinaryMask {
  const out = emptyMask(mask.width, mask.height);
  for (let y = 0; y < mask.height; y++) {
    const row = y * mask.width;
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[row + x] !== 1) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= mask.width) continue;
      out.data[y * mask.width + nx] = 1;
    }
  }
  return out;
}

function unionMasks(masks: BinaryMask[], w: number, h: number): BinaryMask {
  const out = emptyMask(w, h);
  for (const mask of masks) {
    for (let i = 0; i < out.data.length; i++) {
      if (mask.data[i] === 1) out.data[i] = 1;
    }
  }
  return out;
}

export function buildPortableCleanFixture(spec: TemporalQaClipSpec): CanonicalFullClipFixture {
  const W = spec.qaRaster.width;
  const H = spec.qaRaster.height;
  const chestMask = paintQuadMask(W, H, CLEARED_CHEST_QUAD_NORM);
  const sleeveLeftMask = paintQuadMask(W, H, CLEARED_SLEEVE_LEFT_QUAD_NORM);
  const sleeveRightMask = paintQuadMask(W, H, CLEARED_SLEEVE_RIGHT_QUAD_NORM);
  const frames: SourceClipFrame[] = [];
  const sam3Masks: BinaryMask[] = [];
  const expectedDx: number[] = [];

  for (let i = 0; i < spec.frameCount; i++) {
    expectedDx.push(0);
    const luma = blankLuma(W, H);
    paintMaskLuma(luma, W, H, chestMask, 0, 220);
    paintMaskLuma(luma, W, H, sleeveLeftMask, 0, 200);
    paintMaskLuma(luma, W, H, sleeveRightMask, 0, 200);
    frames.push({ index: i, width: W, height: H, luma });
    sam3Masks.push(unionMasks([chestMask, sleeveLeftMask, sleeveRightMask], W, H));
  }

  const clip: SourceClip = { id: spec.id, fps: spec.fps, frames };
  return {
        fixtureVersion: FULL_CLIP_FIXTURE_VERSION,
    mode: "clean",
    clip,
    canonicalIndex: spec.keyframeIndex,
    expectedDx,
    chestMask,
    sleeveLeftMask,
    sleeveRightMask,
    sam3Masks,
    defects: [],
    approved: clearedChestAndSleeveQuadSet(),
  };
}

export function secondClipCleanFixture(): CanonicalFullClipFixture {
  return buildPortableCleanFixture(SECOND_QA_CLIP_SPEC);
}

/**
 * Short translating probe for the chunk-seam YELLOW:
 * luma follows +1 px / frame so a later window's quad-reset cannot match
 * the previous window's warped mask.
 */
export function translatingChunkSeamFixture(frameCount = 30): CanonicalFullClipFixture {
  const W = 80;
  const H = 128;
  const chestMask = paintQuadMask(W, H, CLEARED_CHEST_QUAD_NORM);
  const sleeveLeftMask = paintQuadMask(W, H, CLEARED_SLEEVE_LEFT_QUAD_NORM);
  const sleeveRightMask = paintQuadMask(W, H, CLEARED_SLEEVE_RIGHT_QUAD_NORM);
  const frames: SourceClipFrame[] = [];
  const sam3Masks: BinaryMask[] = [];
  const expectedDx: number[] = [];
  const canonicalIndex = 0;

  for (let i = 0; i < frameCount; i++) {
    expectedDx.push(Math.trunc(i / 3));
    const dx = Math.trunc(i / 3);
    const luma = blankLuma(W, H);
    paintMaskLuma(luma, W, H, chestMask, dx, 220);
    paintMaskLuma(luma, W, H, sleeveLeftMask, dx, 200);
    paintMaskLuma(luma, W, H, sleeveRightMask, dx, 200);
    frames.push({ index: i, width: W, height: H, luma });
    sam3Masks.push(
      unionMasks(
        [shiftMask(chestMask, dx), shiftMask(sleeveLeftMask, dx), shiftMask(sleeveRightMask, dx)],
        W,
        H,
      ),
    );
  }

  return {
        fixtureVersion: FULL_CLIP_FIXTURE_VERSION,
    mode: "clean",
    clip: { id: "temporal-qa-translating-seam-probe", fps: 24, frames },
    canonicalIndex,
    expectedDx,
    chestMask,
    sleeveLeftMask,
    sleeveRightMask,
    sam3Masks,
    defects: [],
    approved: clearedChestAndSleeveQuadSet(),
  };
}
