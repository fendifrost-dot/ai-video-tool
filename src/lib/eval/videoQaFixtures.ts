/**
 * $0 synthetic video-QA fixtures. Unique-RGB originals so preservation is
 * exact byte equality. No live media, no paid calls, no still goldens.
 */

import { cloneRgba, fillRect, solidRgba } from "./pixelMath";
import type { PixelBox, RgbaImage } from "./types";
import type { VideoQaFrame, VideoQaInput } from "./videoQaTypes";

export const VIDEO_QA_FIXTURE_WIDTH = 16;
export const VIDEO_QA_FIXTURE_HEIGHT = 16;
export const VIDEO_QA_FIXTURE_FRAMES = 4;

export const GARMENT_RECT: PixelBox = { x0: 4, x1: 11, y0: 4, y1: 11 };
export const REPAIR_RECT: PixelBox = { x0: 6, x1: 9, y0: 6, y1: 8 };
/** Full-frame jump vs the small garment rect — XOR must exceed the provisional gate. */
export const JUMP_RECT: PixelBox = { x0: 0, x1: 15, y0: 0, y1: 15 };

const NAVY = [28, 32, 95] as const;
const FLICKER = [255, 255, 255] as const;

export function uniqueOriginal(
  index: number,
  width = VIDEO_QA_FIXTURE_WIDTH,
  height = VIDEO_QA_FIXTURE_HEIGHT,
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 13 + y * 7 + index * 31) & 255;
      data[i + 1] = (x * 3 + y * 17 + index * 17) & 255;
      data[i + 2] = (x * 29 + y * 5 + index * 13) & 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function rectAlpha(width: number, height: number, rect: PixelBox, edge = 0): Float32Array {
  const a = new Float32Array(width * height);
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const border = edge > 0 && (x === rect.x0 || x === rect.x1 || y === rect.y0 || y === rect.y1);
      a[y * width + x] = border ? edge : 1;
    }
  }
  return a;
}

function authorizedFromSegRepair(seg: Float32Array, repair: Float32Array): Float32Array {
  const out = new Float32Array(seg.length);
  for (let i = 0; i < seg.length; i++) {
    const v = seg[i]! - repair[i]!;
    out[i] = v > 0 ? (v > 1 ? 1 : v) : 0;
  }
  return out;
}

function stampRect(img: RgbaImage, rect: PixelBox, rgb: readonly [number, number, number]): void {
  fillRect(img, rect, rgb[0], rgb[1], rgb[2]);
}

function restoreOriginalWhere(
  original: RgbaImage,
  dest: RgbaImage,
  alpha: Float32Array,
  predicate: (a: number) => boolean,
): void {
  const n = original.width * original.height;
  for (let i = 0; i < n; i++) {
    if (!predicate(alpha[i]!)) continue;
    const p = i * 4;
    dest.data[p] = original.data[p]!;
    dest.data[p + 1] = original.data[p + 1]!;
    dest.data[p + 2] = original.data[p + 2]!;
    dest.data[p + 3] = 255;
  }
}

export type HappyPathOpts = {
  garment?: PixelBox;
  repair?: PixelBox;
  stamp?: readonly [number, number, number];
};

export function happyPathFrame(index: number, opts: HappyPathOpts = {}): VideoQaFrame {
  const width = VIDEO_QA_FIXTURE_WIDTH;
  const height = VIDEO_QA_FIXTURE_HEIGHT;
  const garment = opts.garment ?? GARMENT_RECT;
  const repair = opts.repair ?? REPAIR_RECT;
  const original = uniqueOriginal(index, width, height);
  const reconstructed = cloneRgba(original);
  stampRect(reconstructed, garment, opts.stamp ?? NAVY);
  const segmentationAlpha = rectAlpha(width, height, garment, 0.5);
  const repairAlpha = rectAlpha(width, height, repair);
  restoreOriginalWhere(original, reconstructed, repairAlpha, (a) => a > 0.5);
  const authorizedAlpha = authorizedFromSegRepair(segmentationAlpha, repairAlpha);
  restoreOriginalWhere(original, reconstructed, authorizedAlpha, (a) => a === 0);
  return {
    index,
    original,
    reconstructed,
    authorizedAlpha,
    repairAlpha,
    segmentationAlpha,
  };
}

export function happyPathFrames(count = VIDEO_QA_FIXTURE_FRAMES): VideoQaFrame[] {
  return Array.from({ length: count }, (_, i) => happyPathFrame(i));
}

/** Minimal ISO-BMFF ftyp stub — provenance only; E2 does not decode it. */
export function fixtureMp4Bytes(): Uint8Array {
  return new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31,
  ]);
}

export const FIXTURE_MP4_SHA256 = "e2-fixture-mp4-not-a-canonical-golden" as const;

export function happyPathMp4Input(): VideoQaInput {
  const bytes = fixtureMp4Bytes();
  return {
    paidCalls: false,
    artifact: {
      kind: "reconstructed_mp4",
      width: VIDEO_QA_FIXTURE_WIDTH,
      height: VIDEO_QA_FIXTURE_HEIGHT,
      fps: 24,
      mp4: {
        produced: true,
        artifactId: "fixture-reconstructed.mp4",
        path: "eval/fixtures/reconstructed.mp4",
        sha256: FIXTURE_MP4_SHA256,
        byteLength: bytes.length,
        mimeType: "video/mp4",
      },
      frames: happyPathFrames(),
    },
    provenance: {
      projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
      masterClipAssetId: "76fe7438-671d-4428-a7f6-17a45e98c16f",
      reconstructionVersion: "fixture",
      temporalJobCount: 1,
      source: "synthetic_fixture",
    },
  };
}

export function incompleteMp4Input(): VideoQaInput {
  const base = happyPathMp4Input();
  return {
    ...base,
    artifact: {
      ...base.artifact,
      frames: [],
    },
  };
}

export function outsideLeakInput(): VideoQaInput {
  const input = happyPathMp4Input();
  const frames = input.artifact.frames.map((f) => {
    const reconstructed = cloneRgba(f.reconstructed);
    reconstructed.data[0] = (reconstructed.data[0]! + 40) & 255;
    return { ...f, reconstructed };
  });
  return { ...input, artifact: { ...input.artifact, frames } };
}

export function maskJumpInput(): VideoQaInput {
  const frames = happyPathFrames().map((f, i) => {
    if (i < 2) return f;
    return happyPathFrame(i, { garment: JUMP_RECT });
  });
  const input = happyPathMp4Input();
  return { ...input, artifact: { ...input.artifact, frames } };
}

export function insideFlickerInput(): VideoQaInput {
  const frames = happyPathFrames().map((f, i) => {
    if (i % 2 === 0) return f;
    return happyPathFrame(i, { stamp: FLICKER });
  });
  const input = happyPathMp4Input();
  return { ...input, artifact: { ...input.artifact, frames } };
}

export function seamFlickerInput(): VideoQaInput {
  const width = VIDEO_QA_FIXTURE_WIDTH;
  const frames = happyPathFrames().map((f, i) => {
    const reconstructed = cloneRgba(f.reconstructed);
    const rgb = i % 2 === 0 ? NAVY : FLICKER;
    const rect = GARMENT_RECT;
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const border = x === rect.x0 || x === rect.x1 || y === rect.y0 || y === rect.y1;
        if (!border) continue;
        const p = (y * width + x) * 4;
        reconstructed.data[p] = rgb[0];
        reconstructed.data[p + 1] = rgb[1];
        reconstructed.data[p + 2] = rgb[2];
      }
    }
    return { ...f, reconstructed };
  });
  const input = happyPathMp4Input();
  return { ...input, artifact: { ...input.artifact, frames } };
}

export function repairCoverageJumpInput(): VideoQaInput {
  const frames = happyPathFrames().map((f, i) => {
    if (i < 2) return f;
    const width = VIDEO_QA_FIXTURE_WIDTH;
    const height = VIDEO_QA_FIXTURE_HEIGHT;
    const repairAlpha = rectAlpha(width, height, {
      x0: 0,
      x1: width - 1,
      y0: 0,
      y1: height - 1,
    });
    return { ...f, repairAlpha };
  });
  const input = happyPathMp4Input();
  return { ...input, artifact: { ...input.artifact, frames } };
}

export function sizeMismatchInput(): VideoQaInput {
  const input = happyPathMp4Input();
  const frames = [...input.artifact.frames];
  const bad = frames[1]!;
  frames[1] = {
    ...bad,
    reconstructed: solidRgba(8, 8, 0, 0, 0),
  };
  return { ...input, artifact: { ...input.artifact, frames } };
}
