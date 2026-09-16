import type {
  Anchor,
  BinaryMask,
  CanonicalKeyframe,
  PropagationInput,
  QuadNorm,
  SourceClip,
} from "./contract.ts";

export class PropagationContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PropagationContractError";
    this.code = code;
  }
}

function assertFiniteSize(width: number, height: number, label: string): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new PropagationContractError(
      "invalid_size",
      `${label}: width/height must be positive integers`,
    );
  }
}

function assertMask(mask: BinaryMask, width: number, height: number, label: string): void {
  assertFiniteSize(mask.width, mask.height, label);
  if (mask.width !== width || mask.height !== height) {
    throw new PropagationContractError(
      "mask_size_mismatch",
      `${label}: mask ${mask.width}x${mask.height} != frame ${width}x${height}`,
    );
  }
  if (mask.data.length !== width * height) {
    throw new PropagationContractError(
      "mask_length_mismatch",
      `${label}: data.length ${mask.data.length} != ${width * height}`,
    );
  }
  for (let i = 0; i < mask.data.length; i++) {
    const v = mask.data[i]!;
    if (v !== 0 && v !== 1) {
      throw new PropagationContractError("mask_not_binary", `${label}: data[${i}]=${v} is not 0|1`);
    }
  }
}

function assertQuad(quad: QuadNorm, label: string): void {
  if (quad.length !== 4) {
    throw new PropagationContractError("invalid_quad", `${label}: quad must have 4 corners`);
  }
  for (let i = 0; i < 4; i++) {
    const p = quad[i]!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new PropagationContractError("invalid_quad", `${label}: corner ${i} is not finite`);
    }
    if (p.x < -1e-6 || p.x > 1 + 1e-6 || p.y < -1e-6 || p.y > 1 + 1e-6) {
      throw new PropagationContractError("invalid_quad", `${label}: corner ${i} outside [0,1]`);
    }
  }
}

function assertClip(clip: SourceClip): {
  width: number;
  height: number;
  byIndex: Map<number, (typeof clip.frames)[number]>;
} {
  if (!clip.id || typeof clip.id !== "string") {
    throw new PropagationContractError("invalid_clip", "clip.id is required");
  }
  if (!Number.isFinite(clip.fps) || clip.fps <= 0) {
    throw new PropagationContractError("invalid_clip", "clip.fps must be a positive number");
  }
  if (!Array.isArray(clip.frames) || clip.frames.length === 0) {
    throw new PropagationContractError("empty_clip", "clip.frames must be non-empty");
  }

  const byIndex = new Map<number, (typeof clip.frames)[number]>();
  let width = 0;
  let height = 0;

  for (const frame of clip.frames) {
    if (!Number.isInteger(frame.index) || frame.index < 0) {
      throw new PropagationContractError(
        "invalid_frame_index",
        `frame.index ${frame.index} is not a non-negative integer`,
      );
    }
    if (byIndex.has(frame.index)) {
      throw new PropagationContractError("duplicate_frame", `duplicate frame index ${frame.index}`);
    }
    assertFiniteSize(frame.width, frame.height, `frame ${frame.index}`);
    if (frame.luma.length !== frame.width * frame.height) {
      throw new PropagationContractError(
        "luma_length_mismatch",
        `frame ${frame.index}: luma.length ${frame.luma.length} != ${frame.width * frame.height}`,
      );
    }
    if (width === 0) {
      width = frame.width;
      height = frame.height;
    } else if (frame.width !== width || frame.height !== height) {
      throw new PropagationContractError(
        "inconsistent_frame_size",
        `frame ${frame.index}: ${frame.width}x${frame.height} != ${width}x${height}`,
      );
    }
    byIndex.set(frame.index, frame);
  }

  return { width, height, byIndex };
}

function assertCanonical(
  canonical: CanonicalKeyframe,
  width: number,
  height: number,
  byIndex: Map<number, unknown>,
): void {
  if (!Number.isInteger(canonical.index) || !byIndex.has(canonical.index)) {
    throw new PropagationContractError(
      "canonical_missing",
      `canonical.index ${canonical.index} is not in the clip`,
    );
  }
  assertMask(canonical.mask, width, height, "canonical.mask");
  if (canonical.quadNorm) assertQuad(canonical.quadNorm, "canonical.quadNorm");
}

function assertAnchors(anchors: Anchor[], byIndex: Map<number, unknown>): void {
  if (!Array.isArray(anchors)) {
    throw new PropagationContractError("invalid_anchors", "anchors must be an array");
  }
  const kinds = new Set(["keyframe", "pose_change", "scene_cut", "manual"]);
  for (const a of anchors) {
    if (!Number.isInteger(a.index) || !byIndex.has(a.index)) {
      throw new PropagationContractError(
        "anchor_out_of_range",
        `anchor index ${a.index} is not in the clip`,
      );
    }
    if (!kinds.has(a.kind)) {
      throw new PropagationContractError(
        "invalid_anchor_kind",
        `anchor kind ${String(a.kind)} is not allowed`,
      );
    }
    if (a.transform) {
      if (a.transform.kind !== "affine" || a.transform.matrix.length !== 6) {
        throw new PropagationContractError(
          "invalid_anchor_transform",
          `anchor ${a.index}: transform must be affine 2x3`,
        );
      }
      for (const n of a.transform.matrix) {
        if (!Number.isFinite(n)) {
          throw new PropagationContractError(
            "invalid_anchor_transform",
            `anchor ${a.index}: non-finite matrix`,
          );
        }
      }
    }
  }
}

export function validatePropagationInput(input: PropagationInput): {
  width: number;
  height: number;
  sortedIndices: number[];
  byIndex: Map<number, SourceClip["frames"][number]>;
} {
  const { width, height, byIndex } = assertClip(input.clip);
  assertCanonical(input.canonical, width, height, byIndex);
  assertAnchors(input.anchors, byIndex);
  const sortedIndices = [...byIndex.keys()].sort((a, b) => a - b);
  return { width, height, sortedIndices, byIndex };
}
