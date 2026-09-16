/**
 * Lane C — generic temporal propagation I/O contract (v1).
 *
 * Isolated from chest/sleeve production, Fal/CC engines, and Grok proxies.
 * See ./CONTRACT.md for the human-readable shape.
 */

export const TEMPORAL_PROPAGATION_CONTRACT_VERSION = "1.0.0";

export type FrameIndex = number;

export interface Point2 {
  x: number;
  y: number;
}

/**
 * Affine 2×3, row-major:
 *   x' = a·x + b·y + tx
 *   y' = c·x + d·y + ty
 */
export type AffineMatrix = readonly [
  a: number,
  b: number,
  tx: number,
  c: number,
  d: number,
  ty: number,
];

export interface AffineTransform {
  kind: "affine";
  matrix: AffineMatrix;
}

/** TL, TR, BR, BL in normalized 0..1 image space. */
export type QuadNorm = readonly [Point2, Point2, Point2, Point2];

export interface BinaryMask {
  width: number;
  height: number;
  /** Row-major, 1 = repair region, 0 = outside. Length = width * height. */
  data: Uint8Array;
}

export interface SourceClipFrame {
  index: FrameIndex;
  width: number;
  height: number;
  /** Row-major luma 0–255. Length = width * height. */
  luma: Uint8Array;
}

export interface SourceClip {
  id: string;
  fps: number;
  frames: SourceClipFrame[];
}

export type AnchorKind = "keyframe" | "pose_change" | "scene_cut" | "manual";

export interface Anchor {
  index: FrameIndex;
  kind: AnchorKind;
  /**
   * Optional known transform from the canonical keyframe into this frame.
   * When present, the engine snaps to it instead of estimating flow for that frame.
   */
  transform?: AffineTransform;
}

export interface CanonicalKeyframe {
  index: FrameIndex;
  mask: BinaryMask;
  quadNorm?: QuadNorm;
}

/**
 * Target shape:
 *   source clip + canonical repaired keyframe/mask + anchors
 *     → temporally propagated repair masks/transforms
 */
export interface PropagationInput {
  clip: SourceClip;
  canonical: CanonicalKeyframe;
  anchors: Anchor[];
}

export type PropagationSource = "canonical" | "propagated" | "anchor_snap" | "hold";

export interface PropagatedFrame {
  index: FrameIndex;
  /** Transform mapping canonical keyframe pixel space → this frame. */
  transform: AffineTransform;
  mask: BinaryMask;
  quadNorm?: QuadNorm;
  /** 0..1 flow trust. Low values recommend a new keyframe. */
  confidence: number;
  source: PropagationSource;
  reanchorRecommended: boolean;
  reanchorReasons: string[];
}

export interface PropagationOutput {
  contractVersion: typeof TEMPORAL_PROPAGATION_CONTRACT_VERSION | string;
  clipId: string;
  canonicalIndex: FrameIndex;
  frames: PropagatedFrame[];
}

export interface PropagationThresholds {
  /** Re-anchor when forward-backward confidence falls below this. */
  minConfidence: number;
  /** Max SAD-per-pixel (0–255) before a match is treated as a scene cut. */
  maxSadPerPixel: number;
}

export const DEFAULT_PROPAGATION_THRESHOLDS: PropagationThresholds = {
  minConfidence: 0.6,
  maxSadPerPixel: 40,
};
