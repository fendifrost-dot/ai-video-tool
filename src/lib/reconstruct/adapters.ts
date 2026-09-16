/**
 * Lane D adapters — consume CLEARED chest/sleeve stills + temporal outputs
 * + a caller-supplied SAM-3 mask, then reconstruct onto the original master.
 *
 * Isolated. Does not import logoComposite, sleevePanel paint, or temporal
 * authorize constants. Does not fetch SAM-3 (CC / sam3-segment-proxy).
 */

import {
  CANONICAL_LINEAGE,
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_QUAD_TUPLE,
  CLEARED_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_LEFT_QUAD_TUPLE,
  CLEARED_SLEEVE_RIGHT_QUAD_TUPLE,
  type QuadTuple,
} from "./canonicalLineage";
import { reconstructOriginalMaster } from "./originalMasterReconstruct";
import type { ReconstructResult, RgbaImage } from "./types";

export const RECONSTRUCT_ADAPTER_VERSION = "1.1.0";

/** This lane never live-fetches SAM-3. Masks are fixture or caller-supplied. */
export const SAM3_LIVE_FETCH = false as const;

export type Sam3MaskSource = "fixture" | "caller_supplied" | "unavailable_fallback_fixture";

export interface ConsumedSam3Mask {
  width: number;
  height: number;
  /** [0,1] garment / outfit authorization. Length = width * height. */
  outfitAlpha: Float32Array;
  /** Identity / face / hands punch-out. Optional. */
  repairAlpha?: Float32Array;
  source: Sam3MaskSource;
  liveFetch: false;
}

/**
 * Structural temporal frame — matches Lane C serialized masks without
 * importing src/lib/temporal (authorize constants stay untouched).
 */
export interface ConsumedTemporalFrame {
  index: number;
  width: number;
  height: number;
  mask: Float32Array | Uint8Array | ArrayLike<number>;
  confidence: number;
  reanchorRecommended?: boolean;
}

export interface ConsumedTemporalJob {
  kind: string;
  sourceAssetId: string;
  frames: ConsumedTemporalFrame[];
}

export interface ClearedStillImage {
  assetId: string;
  image: RgbaImage;
}

export interface MasterClipFrame {
  index: number;
  image: RgbaImage;
}

export interface ReconstructClipInput {
  originalFrames: MasterClipFrame[];
  /** When omitted, generated frames are original + stamped CLEARED stills. */
  generatedFrames?: MasterClipFrame[];
  chestStill: ClearedStillImage;
  sleeveStill: ClearedStillImage;
  sam3: ConsumedSam3Mask;
  temporalJobs?: ConsumedTemporalJob[];
  projectId?: string;
  masterClipAssetId?: string;
  clipId?: string;
  /** Passthrough for Lane H duration/fps claims. Reconstruct does not restamp fps. */
  fps?: number;
}

export interface ReconstructClipFrameResult {
  index: number;
  temporalUsed: boolean;
  result: ReconstructResult;
}

export interface ReconstructClipResult {
  adapterVersion: typeof RECONSTRUCT_ADAPTER_VERSION;
  clipId: string;
  projectId: string;
  masterClipAssetId: string;
  chestAssetId: string;
  sleeveAssetId: string;
  frames: ReconstructClipFrameResult[];
  originalPixelsPreservedWhereUnauthorized: boolean;
  paidCalls: false;
  sam3LiveFetch: false;
  grokPerFrame: false;
  provider: "none";
  width: number;
  height: number;
  fps: number | null;
}

export const TEMPORAL_MASK_MIN_CONFIDENCE = 0.6;

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function pointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return false;
  const u = (dot11 * dot02 - dot01 * dot12) / denom;
  const v = (dot00 * dot12 - dot01 * dot02) / denom;
  return u >= 0 && v >= 0 && u + v <= 1;
}

/** Rasterize a TL→TR→BR→BL normalized quad to α in [0, 1]. */
export function fillConvexQuad(width: number, height: number, quad: QuadTuple): Float32Array {
  const out = new Float32Array(width * height);
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = (x + 0.5) / width;
      const py = (y + 0.5) / height;
      const inside =
        pointInTriangle(px, py, x0, y0, x1, y1, x2, y2) ||
        pointInTriangle(px, py, x0, y0, x2, y2, x3, y3);
      if (inside) out[y * width + x] = 1;
    }
  }
  return out;
}

function sampleStill(still: RgbaImage, x: number, y: number, destW: number, destH: number): number {
  const sx = Math.min(still.width - 1, Math.max(0, Math.floor((x + 0.5) * (still.width / destW))));
  const sy = Math.min(
    still.height - 1,
    Math.max(0, Math.floor((y + 0.5) * (still.height / destH))),
  );
  return (sy * still.width + sx) * 4;
}

/** Copy still RGB onto dest where mask > 0.5. Dest starts as a copy of original. */
export function stampStillIntoFrame(dest: RgbaImage, still: RgbaImage, mask: Float32Array): void {
  const { width, height } = dest;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if ((mask[i] ?? 0) <= 0.5) continue;
      const dp = i * 4;
      const sp = sampleStill(still, x, y, width, height);
      dest.data[dp] = still.data[sp]!;
      dest.data[dp + 1] = still.data[sp + 1]!;
      dest.data[dp + 2] = still.data[sp + 2]!;
      dest.data[dp + 3] = 255;
    }
  }
}

export function cloneRgba(image: RgbaImage): RgbaImage {
  return { width: image.width, height: image.height, data: new Uint8Array(image.data) };
}

/**
 * Generated transformation = original master with CLEARED chest + sleeve
 * stills stamped into the documented quads. Never a Grok full rerender.
 */
export function buildGeneratedFromClearedStills(input: {
  original: RgbaImage;
  chestStill: RgbaImage;
  sleeveStill: RgbaImage;
  chestQuad?: QuadTuple;
  sleeveLeftQuad?: QuadTuple;
  sleeveRightQuad?: QuadTuple;
  /** Pre-rasterized quads — reuse across a clip so 720×1280 is not re-filled per frame. */
  chestMask?: Float32Array;
  sleeveLeftMask?: Float32Array;
  sleeveRightMask?: Float32Array;
}): RgbaImage {
  const generated = cloneRgba(input.original);
  const { width, height } = generated;
  stampStillIntoFrame(
    generated,
    input.chestStill,
    input.chestMask ?? fillConvexQuad(width, height, input.chestQuad ?? CLEARED_CHEST_QUAD_TUPLE),
  );
  stampStillIntoFrame(
    generated,
    input.sleeveStill,
    input.sleeveLeftMask ??
      fillConvexQuad(width, height, input.sleeveLeftQuad ?? CLEARED_SLEEVE_LEFT_QUAD_TUPLE),
  );
  stampStillIntoFrame(
    generated,
    input.sleeveStill,
    input.sleeveRightMask ??
      fillConvexQuad(width, height, input.sleeveRightQuad ?? CLEARED_SLEEVE_RIGHT_QUAD_TUPLE),
  );
  return generated;
}

function maskValue(mask: ArrayLike<number>, i: number): number {
  const v = mask[i];
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return v > 1 ? clamp01(v / 255) : clamp01(v);
}

function asFloatMask(mask: ArrayLike<number>, length: number): Float32Array {
  if (mask instanceof Float32Array && mask.length === length) return mask;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = maskValue(mask, i);
  return out;
}

/**
 * Nearest-neighbor α resize so live temporal rasters (e.g. 80×128) can
 * authorize original-master frames (720×1280) without inventing geometry.
 * Does not feather or dilate.
 */
export function scaleAlphaNearest(
  src: Float32Array,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): Float32Array {
  if (srcW === destW && srcH === destH) return src;
  if (srcW < 1 || srcH < 1 || destW < 1 || destH < 1) {
    throw new Error("reconstruct_alpha_size_mismatch:scale");
  }
  const out = new Float32Array(destW * destH);
  for (let y = 0; y < destH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * (srcH / destH)));
    for (let x = 0; x < destW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * (srcW / destW)));
      out[y * destW + x] = src[sy * srcW + sx]!;
    }
  }
  return out;
}

export function mergeAuthorization(input: {
  width: number;
  height: number;
  sam3: ConsumedSam3Mask;
  temporalJobs?: ConsumedTemporalJob[];
  frameIndex: number;
}): { segmentation: Float32Array; repair: Float32Array; temporalUsed: boolean } {
  const n = input.width * input.height;
  if (input.sam3.outfitAlpha.length !== n) {
    throw new Error("reconstruct_alpha_size_mismatch:sam3_outfit");
  }
  if (input.sam3.repairAlpha && input.sam3.repairAlpha.length !== n) {
    throw new Error("reconstruct_alpha_size_mismatch:sam3_repair");
  }

  const segmentation = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    segmentation[i] = clamp01(input.sam3.outfitAlpha[i]!);
  }

  let temporalUsed = false;
  for (const job of input.temporalJobs ?? []) {
    const frame = job.frames.find((f) => f.index === input.frameIndex);
    if (!frame) continue;
    const expected = frame.width * frame.height;
    if (frame.mask.length !== expected) {
      throw new Error("reconstruct_alpha_size_mismatch:temporal_mask");
    }
    const trusted =
      frame.reanchorRecommended !== true && frame.confidence >= TEMPORAL_MASK_MIN_CONFIDENCE;
    if (!trusted) continue;
    temporalUsed = true;
    const native = asFloatMask(frame.mask, expected);
    const aligned =
      frame.width === input.width && frame.height === input.height
        ? native
        : scaleAlphaNearest(native, frame.width, frame.height, input.width, input.height);
    for (let i = 0; i < n; i++) {
      const t = aligned[i]!;
      if (t > segmentation[i]!) segmentation[i] = t;
    }
  }

  const repair = new Float32Array(n);
  if (input.sam3.repairAlpha) {
    for (let i = 0; i < n; i++) {
      repair[i] = clamp01(input.sam3.repairAlpha[i]!);
    }
  }

  return { segmentation, repair, temporalUsed };
}

export function reconstructMasterClip(input: ReconstructClipInput): ReconstructClipResult {
  if (!input.originalFrames.length) {
    throw new Error("reconstruct_size_mismatch:empty_clip");
  }

  const generatedByIndex = new Map<number, RgbaImage>();
  for (const g of input.generatedFrames ?? []) {
    generatedByIndex.set(g.index, g.image);
  }

  const width = input.originalFrames[0]!.image.width;
  const height = input.originalFrames[0]!.image.height;
  const chestMask = fillConvexQuad(width, height, CLEARED_CHEST_QUAD_TUPLE);
  const sleeveLeftMask = fillConvexQuad(width, height, CLEARED_SLEEVE_LEFT_QUAD_TUPLE);
  const sleeveRightMask = fillConvexQuad(width, height, CLEARED_SLEEVE_RIGHT_QUAD_TUPLE);

  const frames: ReconstructClipFrameResult[] = [];
  let allPreserved = true;

  for (const src of input.originalFrames) {
    if (src.image.width !== width || src.image.height !== height) {
      throw new Error("reconstruct_size_mismatch:clip_frame");
    }
    const generated =
      generatedByIndex.get(src.index) ??
      buildGeneratedFromClearedStills({
        original: src.image,
        chestStill: input.chestStill.image,
        sleeveStill: input.sleeveStill.image,
        chestMask,
        sleeveLeftMask,
        sleeveRightMask,
      });

    const { segmentation, repair, temporalUsed } = mergeAuthorization({
      width: src.image.width,
      height: src.image.height,
      sam3: input.sam3,
      temporalJobs: input.temporalJobs,
      frameIndex: src.index,
    });

    const result = reconstructOriginalMaster({
      original: src.image,
      generated,
      segmentation,
      repair,
    });
    if (!result.originalPixelsPreservedWhereUnauthorized) allPreserved = false;
    frames.push({ index: src.index, temporalUsed, result });
  }

  return {
    adapterVersion: RECONSTRUCT_ADAPTER_VERSION,
    clipId: input.clipId ?? "original-master-reconstruct",
    projectId: input.projectId ?? CANONICAL_PROJECT_ID,
    masterClipAssetId: input.masterClipAssetId ?? CANONICAL_MASTER_CLIP_ID,
    chestAssetId: input.chestStill.assetId,
    sleeveAssetId: input.sleeveStill.assetId,
    frames,
    originalPixelsPreservedWhereUnauthorized: allPreserved,
    paidCalls: false,
    sam3LiveFetch: false,
    grokPerFrame: false,
    provider: "none",
    width,
    height,
    fps: typeof input.fps === "number" && Number.isFinite(input.fps) && input.fps > 0 ? input.fps : null,
  };
}

export function defaultClearedStillRefs(): {
  chestAssetId: string;
  sleeveAssetId: string;
  lineage: typeof CANONICAL_LINEAGE;
} {
  return {
    chestAssetId: CLEARED_CHEST_ASSET_ID,
    sleeveAssetId: CLEARED_SLEEVE_ASSET_ID,
    lineage: CANONICAL_LINEAGE,
  };
}
