/**
 * Narrow adapter: approved repair quads → propagateRepair inputs.
 * One job per CLEARED quad. No providers. No chest/sleeve paint.
 */

import type { PropagationInput, SourceClip, SourceClipFrame } from "./contract.ts";
import { gatedApprovedQuads, type ApprovedQuad, type ApprovedQuadSet } from "./approvedQuad.ts";
import { paintQuadMask } from "./mask.ts";
import { PropagationContractError } from "./validate.ts";

export const TEMPORAL_JOB_PROVIDER_NONE = "none" as const;

export interface PropagationJobSpec {
  kind: ApprovedQuad["kind"];
  keyframeId: string;
  sourceAssetId: string;
  repairMethodVersion: string;
  input: PropagationInput;
  provider: typeof TEMPORAL_JOB_PROVIDER_NONE;
  grokPerFrame: false;
  paidCalls: false;
}

export interface BuildJobsOptions {
  clip: SourceClip;
  canonicalIndex?: number;
  approved: ApprovedQuadSet;
}

function assertClipSize(clip: SourceClip): { width: number; height: number } {
  const first = clip.frames[0];
  if (!first) {
    throw new PropagationContractError("empty_clip", "clip.frames must be non-empty");
  }
  return { width: first.width, height: first.height };
}

export function approvedQuadToPropagationInput(
  quad: ApprovedQuad,
  clip: SourceClip,
  canonicalIndex = 0,
): PropagationInput {
  if (quad.gate !== "CLEARED") {
    throw new PropagationContractError(
      "quad_not_cleared",
      `${quad.kind} gate is ${quad.gate}; only CLEARED quads may enter propagateRepair`,
    );
  }
  const { width, height } = assertClipSize(clip);
  return {
    clip,
    canonical: {
      index: canonicalIndex,
      mask: paintQuadMask(width, height, quad.quadNorm),
      quadNorm: quad.quadNorm,
    },
    anchors: [{ index: canonicalIndex, kind: "keyframe" }],
  };
}

/**
 * Build in-memory propagation jobs for every CLEARED approved quad.
 * Sleeve PENDING slots are omitted — they are not guessed.
 */
export function buildPropagationJobsFromApprovedSet(opts: BuildJobsOptions): PropagationJobSpec[] {
  const quads = gatedApprovedQuads(opts.approved);
  const canonicalIndex = opts.canonicalIndex ?? 0;
  return quads.map((quad) => ({
    kind: quad.kind,
    keyframeId: quad.keyframeId,
    sourceAssetId: quad.sourceAssetId,
    repairMethodVersion: quad.repairMethodVersion,
    input: approvedQuadToPropagationInput(quad, opts.clip, canonicalIndex),
    provider: TEMPORAL_JOB_PROVIDER_NONE,
    grokPerFrame: false,
    paidCalls: false,
  }));
}

export function cloneClipFrames(frames: SourceClipFrame[]): SourceClipFrame[] {
  return frames.map((fr) => ({ ...fr, luma: new Uint8Array(fr.luma) }));
}
