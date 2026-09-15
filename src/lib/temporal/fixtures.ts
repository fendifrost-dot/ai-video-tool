/**
 * Static / synthetic clip + mask + anchor fixtures.
 * No live footage, no chest/sleeve assets, no provider calls.
 */

import type { BinaryMask, PropagationInput, SourceClip, SourceClipFrame } from "./contract";
import { translationTransform } from "./geometry";
import { paintRectMask } from "./mask";

const W = 16;
const H = 16;

function blankLuma(): Uint8Array {
  return new Uint8Array(W * H);
}

function paintRectLuma(
  luma: Uint8Array,
  x: number,
  y: number,
  rw: number,
  rh: number,
  value: number,
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + rw);
  const y1 = Math.min(H, y + rh);
  for (let yy = y0; yy < y1; yy++) {
    const row = yy * W;
    for (let xx = x0; xx < x1; xx++) luma[row + xx] = value;
  }
}

function frame(index: number, luma: Uint8Array): SourceClipFrame {
  return { index, width: W, height: H, luma };
}

function clip(id: string, frames: SourceClipFrame[]): SourceClip {
  return { id, fps: 24, frames };
}

export interface TranslatingSquareFixture extends PropagationInput {
  expectedDxPerFrame: number;
  expectedOrigin: { x: number; y: number; rw: number; rh: number };
}

/**
 * 5-frame 16×16 clip. A 4×4 bright square starts at (2,6) and translates
 * +2 px in x each frame. Canonical keyframe is frame 0 with a matching mask.
 */
export function translatingSquareFixture(): TranslatingSquareFixture {
  const origin = { x: 2, y: 6, rw: 4, rh: 4 };
  const frames: SourceClipFrame[] = [];
  for (let i = 0; i < 5; i++) {
    const luma = blankLuma();
    paintRectLuma(luma, origin.x + i * 2, origin.y, origin.rw, origin.rh, 220);
    frames.push(frame(i, luma));
  }
  const mask = paintRectMask(W, H, origin.x, origin.y, origin.rw, origin.rh);
  return {
    clip: clip("static-translating-square", frames),
    canonical: {
      index: 0,
      mask,
      quadNorm: [
        { x: origin.x / W, y: origin.y / H },
        { x: (origin.x + origin.rw) / W, y: origin.y / H },
        { x: (origin.x + origin.rw) / W, y: (origin.y + origin.rh) / H },
        { x: origin.x / W, y: (origin.y + origin.rh) / H },
      ],
    },
    anchors: [{ index: 0, kind: "keyframe" }],
    expectedDxPerFrame: 2,
    expectedOrigin: origin,
  };
}

/**
 * Same square, no motion. Used to prove identity transforms and IoU = 1.
 */
export function stationarySquareFixture(): PropagationInput {
  const origin = { x: 5, y: 5, rw: 4, rh: 4 };
  const frames: SourceClipFrame[] = [];
  for (let i = 0; i < 4; i++) {
    const luma = blankLuma();
    paintRectLuma(luma, origin.x, origin.y, origin.rw, origin.rh, 200);
    frames.push(frame(i, luma));
  }
  return {
    clip: clip("static-stationary-square", frames),
    canonical: {
      index: 1,
      mask: paintRectMask(W, H, origin.x, origin.y, origin.rw, origin.rh),
    },
    anchors: [{ index: 1, kind: "keyframe" }],
  };
}

/**
 * Frames 0–2: bright square at (2,6). Frames 3–4: inverted field (high luma
 * everywhere except a dark square). Block-match SAD collapses → scene cut.
 */
export function sceneCutFixture(): PropagationInput {
  const frames: SourceClipFrame[] = [];
  for (let i = 0; i < 5; i++) {
    const luma = blankLuma();
    if (i < 3) {
      paintRectLuma(luma, 2, 6, 4, 4, 220);
    } else {
      // Unrelated field: mid-gray wash + a bright blob far from the prior square.
      luma.fill(40);
      paintRectLuma(luma, 11, 1, 4, 4, 250);
    }
    frames.push(frame(i, luma));
  }
  return {
    clip: clip("static-scene-cut", frames),
    canonical: {
      index: 0,
      mask: paintRectMask(W, H, 2, 6, 4, 4),
    },
    anchors: [
      { index: 0, kind: "keyframe" },
      { index: 3, kind: "scene_cut" },
    ],
  };
}

/**
 * Canonical at frame 0. Frame 4 has a **known** +8 px translation supplied as
 * a manual anchor snap — no flow required for that frame.
 */
export function anchoredSnapFixture(): PropagationInput {
  const origin = { x: 1, y: 4, rw: 3, rh: 3 };
  const frames: SourceClipFrame[] = [];
  for (let i = 0; i < 5; i++) {
    const luma = blankLuma();
    paintRectLuma(luma, origin.x + i * 2, origin.y, origin.rw, origin.rh, 180);
    frames.push(frame(i, luma));
  }
  return {
    clip: clip("static-anchor-snap", frames),
    canonical: {
      index: 0,
      mask: paintRectMask(W, H, origin.x, origin.y, origin.rw, origin.rh),
    },
    anchors: [
      { index: 0, kind: "keyframe" },
      { index: 4, kind: "manual", transform: translationTransform(8, 0) },
    ],
  };
}

export function expectedTranslatedMask(
  origin: { x: number; y: number; rw: number; rh: number },
  frameIndex: number,
  dxPerFrame: number,
): BinaryMask {
  return paintRectMask(W, H, origin.x + frameIndex * dxPerFrame, origin.y, origin.rw, origin.rh);
}

export const FIXTURE_FRAME_SIZE = { width: W, height: H } as const;
