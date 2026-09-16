/**
 * Full canonical-duration synthetic luma clip (241 frames @ 59.94 fps).
 * Stand-in for master 76fe7438 — no live 1080×1920 pixels, no providers.
 */

import type { BinaryMask, SourceClip, SourceClipFrame } from "./contract";
import {
  CANONICAL_CLIP_FRAME_COUNT,
  CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
  CANONICAL_CLIP_NATIVE_FPS,
  CANONICAL_MASTER_CLIP_ID,
} from "./canonicalClip";
import {
  CLEARED_CHEST_QUAD_NORM,
  CLEARED_SLEEVE_LEFT_QUAD_NORM,
  CLEARED_SLEEVE_RIGHT_QUAD_NORM,
} from "./canonicalLineage";
import { clearedChestAndSleeveQuadSet } from "./approvedQuad";
import { emptyMask, paintQuadMask } from "./mask";

export const FULL_CLIP_QA_RASTER = { width: 80, height: 128 } as const;
/** Clean full-clip is stationary so sleeve quads stay on-raster at 80×128. */
export const FULL_CLIP_DX_PERIOD = Number.POSITIVE_INFINITY;
export const FULL_CLIP_FIXTURE_VERSION = "1.0.0";

export type FullClipDefectKind = "occlusion" | "flicker" | "coverage_hole" | "drift_jump";

export interface InjectedDefectWindow {
  kind: FullClipDefectKind;
  start: number;
  end: number;
}

export const FULL_CLIP_DEFECT_WINDOWS: readonly InjectedDefectWindow[] = [
  { kind: "occlusion", start: 100, end: 115 },
  { kind: "flicker", start: 150, end: 154 },
  { kind: "coverage_hole", start: 190, end: 198 },
  { kind: "drift_jump", start: 210, end: 240 },
];

const W = FULL_CLIP_QA_RASTER.width;
const H = FULL_CLIP_QA_RASTER.height;

function blankLuma(): Uint8Array {
  return new Uint8Array(W * H);
}

function paintMaskLuma(
  luma: Uint8Array,
  mask: BinaryMask,
  dx: number,
  value: number,
): void {
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (mask.data[row + x] !== 1) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= W) continue;
      luma[row + nx] = value;
    }
  }
}

function zeroMaskRegion(luma: Uint8Array, mask: BinaryMask, dx: number): void {
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (mask.data[row + x] !== 1) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= W) continue;
      luma[row + nx] = 0;
    }
  }
}

function paintOccluderOverMask(luma: Uint8Array, mask: BinaryMask, dx: number): void {
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (mask.data[row + x] !== 1) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= W) continue;
      luma[row + nx] = 12;
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

function unionMasks(masks: BinaryMask[]): BinaryMask {
  const first = masks[0];
  if (!first) return emptyMask(W, H);
  const out = emptyMask(first.width, first.height);
  for (const mask of masks) {
    for (let i = 0; i < out.data.length; i++) {
      if (mask.data[i] === 1) out.data[i] = 1;
    }
  }
  return out;
}

/** Integer translation of the garment luma relative to the canonical keyframe. */
export function expectedDxAtFrame(
  _index: number,
  _canonicalIndex = CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
  _period = FULL_CLIP_DX_PERIOD,
): number {
  return 0;
}

function inWindow(index: number, start: number, end: number): boolean {
  return index >= start && index <= end;
}

function defectAt(
  index: number,
  windows: readonly InjectedDefectWindow[],
  kind: FullClipDefectKind,
): boolean {
  return windows.some((w) => w.kind === kind && inWindow(index, w.start, w.end));
}

export interface CanonicalFullClipFixture {
  fixtureVersion: typeof FULL_CLIP_FIXTURE_VERSION;
  mode: "clean" | "defects";
  clip: SourceClip;
  canonicalIndex: number;
  expectedDx: number[];
  chestMask: BinaryMask;
  sleeveLeftMask: BinaryMask;
  sleeveRightMask: BinaryMask;
  sam3Masks: BinaryMask[];
  defects: readonly InjectedDefectWindow[];
  approved: ReturnType<typeof clearedChestAndSleeveQuadSet>;
}

function buildFullClipFixture(mode: "clean" | "defects"): CanonicalFullClipFixture {
  const defects = mode === "defects" ? FULL_CLIP_DEFECT_WINDOWS : [];
  const chestMask = paintQuadMask(W, H, CLEARED_CHEST_QUAD_NORM);
  const sleeveLeftMask = paintQuadMask(W, H, CLEARED_SLEEVE_LEFT_QUAD_NORM);
  const sleeveRightMask = paintQuadMask(W, H, CLEARED_SLEEVE_RIGHT_QUAD_NORM);
  const canonicalIndex = CANONICAL_CLIP_KEYFRAME_FRAME_INDEX;
  const expectedDx: number[] = [];
  const frames: SourceClipFrame[] = [];
  const sam3Masks: BinaryMask[] = [];

  for (let i = 0; i < CANONICAL_CLIP_FRAME_COUNT; i++) {
    const baseDx = expectedDxAtFrame(i, canonicalIndex);
    expectedDx.push(baseDx);
    const paintDx =
      defectAt(i, defects, "drift_jump") ? baseDx + 8 : baseDx;
    const flickerDx = defectAt(i, defects, "flicker") && i % 2 === 1 ? paintDx + 3 : paintDx;

    const luma = blankLuma();
    const skipChest =
      defectAt(i, defects, "coverage_hole") || defectAt(i, defects, "occlusion");
    if (!skipChest) {
      paintMaskLuma(luma, chestMask, flickerDx, 220);
    } else if (defectAt(i, defects, "occlusion")) {
      paintOccluderOverMask(luma, chestMask, paintDx);
    }
    paintMaskLuma(luma, sleeveLeftMask, paintDx, 200);
    paintMaskLuma(luma, sleeveRightMask, paintDx, 200);

    if (skipChest && defectAt(i, defects, "coverage_hole")) {
      zeroMaskRegion(luma, chestMask, paintDx);
    }

    frames.push({ index: i, width: W, height: H, luma });

    if (defectAt(i, defects, "occlusion")) {
      sam3Masks.push(emptyMask(W, H));
    } else {
      const shifted = [
        shiftMask(chestMask, flickerDx),
        shiftMask(sleeveLeftMask, paintDx),
        shiftMask(sleeveRightMask, paintDx),
      ];
      if (defectAt(i, defects, "coverage_hole")) {
        sam3Masks.push(unionMasks([shifted[1]!, shifted[2]!]));
      } else {
        sam3Masks.push(unionMasks(shifted));
      }
    }
  }

  return {
    fixtureVersion: FULL_CLIP_FIXTURE_VERSION,
    mode,
    clip: {
      id: CANONICAL_MASTER_CLIP_ID,
      fps: CANONICAL_CLIP_NATIVE_FPS,
      frames,
    },
    canonicalIndex,
    expectedDx,
    chestMask,
    sleeveLeftMask,
    sleeveRightMask,
    sam3Masks,
    defects,
    approved: clearedChestAndSleeveQuadSet(),
  };
}

export function canonicalFullClipCleanFixture(): CanonicalFullClipFixture {
  return buildFullClipFixture("clean");
}

export function canonicalFullClipDefectFixture(): CanonicalFullClipFixture {
  return buildFullClipFixture("defects");
}
