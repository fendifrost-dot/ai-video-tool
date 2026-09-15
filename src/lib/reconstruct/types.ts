/**
 * Isolated original-master reconstruction types (Lane D / #55).
 *
 * Do not import Architecture C still-repair or jacket-inpaint modules here.
 * This surface is the compositing contract other lanes may consume later.
 */

export type RgbaImage = {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major, length === width * height * 4. */
  data: Uint8Array;
};

/**
 * Inputs to the reconstruction stage.
 *
 * - `original` is the master of record (identity / scene / detail).
 * - `generated` is a full-frame transformation (e.g. Grok rerender). It is
 *   never the output master by itself.
 * - `segmentation` authorizes generated pixels (typically garment / transform
 *   region). Values in [0, 1], length === width * height.
 * - `repair` subtracts authorization (identity / face / hands / keep-original
 *   regions). Optional; omitted = no repair punch-out.
 */
export type ReconstructInput = {
  original: RgbaImage;
  generated: RgbaImage;
  segmentation: Float32Array;
  repair?: Float32Array;
};

export type ReconstructMetrics = {
  /** Fraction of pixels with authorized α > 0.5. */
  maskCoverage: number;
  /** Pixels whose RGB differs from the original master. */
  changedPixels: number;
  /** Pixels whose RGB is byte-identical to the original master. */
  preservedPixels: number;
  /** Count of pixels with authorized α === 0. */
  unauthorizedPixels: number;
  /**
   * True iff every unauthorized (α === 0) pixel is byte-identical to original.
   * This is the Lane D acceptance bit.
   */
  originalPixelsPreservedWhereUnauthorized: boolean;
};

export type ReconstructResult = ReconstructMetrics & {
  image: RgbaImage;
  /** Per-pixel authorized α after clamp(seg) − clamp(repair). */
  authorizedAlpha: Float32Array;
};
