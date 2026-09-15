/**
 * Synthetic luma clip whose bright region follows the CLEARED chest quad.
 * Proves approved-quad propagation without per-frame Grok or live footage.
 */

import type { PropagationInput, SourceClip, SourceClipFrame } from "./contract";
import { CLEARED_CHEST_QUAD_NORM, CANONICAL_KEYFRAME_ID } from "./canonicalLineage";
import { clearedChestQuadSet } from "./approvedQuad";
import { paintQuadMask } from "./mask";
import { translationTransform } from "./geometry";

export const CLEARED_CHEST_FIXTURE_SIZE = { width: 80, height: 128 } as const;
export const CLEARED_CHEST_FIXTURE_DX_PER_FRAME = 2;
export const CLEARED_CHEST_FIXTURE_FRAME_COUNT = 5;

const W = CLEARED_CHEST_FIXTURE_SIZE.width;
const H = CLEARED_CHEST_FIXTURE_SIZE.height;

function blankLuma(): Uint8Array {
  return new Uint8Array(W * H);
}

function paintMaskLuma(luma: Uint8Array, mask: { data: Uint8Array }, dx: number, value: number): void {
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

function frame(index: number, luma: Uint8Array): SourceClipFrame {
  return { index, width: W, height: H, luma };
}

/**
 * 5-frame 80×128 clip. The CLEARED chest-band luma translates +2 px in x
 * each frame. Canonical keyframe is frame 0 with the live 1m quad.
 */
export function clearedChestTranslatingFixture(): PropagationInput & {
  expectedDxPerFrame: number;
  keyframeId: typeof CANONICAL_KEYFRAME_ID;
} {
  const canonicalMask = paintQuadMask(W, H, CLEARED_CHEST_QUAD_NORM);
  const frames: SourceClipFrame[] = [];
  for (let i = 0; i < CLEARED_CHEST_FIXTURE_FRAME_COUNT; i++) {
    const luma = blankLuma();
    paintMaskLuma(luma, canonicalMask, i * CLEARED_CHEST_FIXTURE_DX_PER_FRAME, 220);
    frames.push(frame(i, luma));
  }
  const clip: SourceClip = {
    id: "live-prep-cleared-chest-quad",
    fps: 24,
    frames,
  };
  return {
    clip,
    canonical: {
      index: 0,
      mask: canonicalMask,
      quadNorm: CLEARED_CHEST_QUAD_NORM,
    },
    anchors: [{ index: 0, kind: "keyframe" }],
    expectedDxPerFrame: CLEARED_CHEST_FIXTURE_DX_PER_FRAME,
    keyframeId: CANONICAL_KEYFRAME_ID,
  };
}

/** Same clip metadata used by the Hero Frame hook / job adapter. */
export function clearedChestApprovedSet() {
  return clearedChestQuadSet();
}

export function expectedChestQuadAtFrame(frameIndex: number) {
  const dx = (frameIndex * CLEARED_CHEST_FIXTURE_DX_PER_FRAME) / W;
  return CLEARED_CHEST_QUAD_NORM.map((p) => ({ x: p.x + dx, y: p.y }));
}

export function expectedChestTranslation(frameIndex: number) {
  return translationTransform(frameIndex * CLEARED_CHEST_FIXTURE_DX_PER_FRAME, 0);
}
