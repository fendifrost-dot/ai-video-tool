import {
  DEFAULT_PROPAGATION_THRESHOLDS,
  TEMPORAL_PROPAGATION_CONTRACT_VERSION,
  type Anchor,
  type AffineTransform,
  type BinaryMask,
  type PropagatedFrame,
  type PropagationInput,
  type PropagationOutput,
  type PropagationSource,
  type PropagationThresholds,
} from "./contract";
import { estimateTranslation } from "./flow";
import { composeAffine, identityTransform, warpQuadNorm } from "./geometry";
import { cloneMask, warpMask } from "./mask";
import { validatePropagationInput } from "./validate";

function hopReasons(
  estimate: { matched: boolean; confidence: number; sadPerPixel: number },
  thresholds: PropagationThresholds,
  extra: string[],
): { reanchorRecommended: boolean; reanchorReasons: string[]; source: PropagationSource } {
  const reasons: string[] = [];
  const push = (r: string): void => {
    if (!reasons.includes(r)) reasons.push(r);
  };
  for (const r of extra) push(r);
  if (!estimate.matched || !Number.isFinite(estimate.sadPerPixel)) {
    push("failed_match");
  } else if (estimate.sadPerPixel > thresholds.maxSadPerPixel) {
    push("scene_cut");
  }
  if (estimate.confidence < thresholds.minConfidence) {
    push(`low_confidence(${estimate.confidence.toFixed(2)}<${thresholds.minConfidence})`);
  }
  const failed = reasons.includes("failed_match") || reasons.includes("scene_cut");
  return {
    reanchorRecommended: reasons.length > 0,
    reanchorReasons: reasons,
    source: failed ? "hold" : "propagated",
  };
}

function emitFrame(args: {
  index: number;
  transform: AffineTransform;
  canonicalMask: BinaryMask;
  canonicalQuad: PropagationInput["canonical"]["quadNorm"];
  width: number;
  height: number;
  confidence: number;
  source: PropagationSource;
  reanchorRecommended: boolean;
  reanchorReasons: string[];
}): PropagatedFrame {
  const mask =
    args.source === "canonical"
      ? cloneMask(args.canonicalMask)
      : warpMask(args.canonicalMask, args.transform);
  const quadNorm = args.canonicalQuad
    ? args.source === "canonical"
      ? args.canonicalQuad
      : warpQuadNorm(args.transform, args.canonicalQuad, args.width, args.height)
    : undefined;
  return {
    index: args.index,
    transform: args.transform,
    mask,
    quadNorm,
    confidence: args.confidence,
    source: args.source,
    reanchorRecommended: args.reanchorRecommended,
    reanchorReasons: args.reanchorReasons,
  };
}

function anchorsByIndex(anchors: Anchor[]): Map<number, Anchor[]> {
  const map = new Map<number, Anchor[]>();
  for (const a of anchors) {
    const list = map.get(a.index) ?? [];
    list.push(a);
    map.set(a.index, list);
  }
  return map;
}

function extraAnchorReasons(list: Anchor[] | undefined): string[] {
  if (!list) return [];
  const reasons: string[] = [];
  for (const a of list) {
    if (a.kind === "scene_cut") reasons.push("scene_cut");
    if (a.kind === "pose_change") reasons.push("pose_change");
  }
  return reasons;
}

function snapTransform(list: Anchor[] | undefined): AffineTransform | null {
  if (!list) return null;
  for (const a of list) {
    if (a.transform) return a.transform;
  }
  return null;
}

/**
 * Propagate a canonical repair mask (and optional quad) across a discrete clip.
 *
 * Walks away from the canonical index in both directions. Each hop is an
 * integer block-match on luma, constrained to the current warped mask.
 * Anchors with an explicit transform snap that frame; scene-cut / pose-change
 * anchors flag a re-anchor without requiring chest or sleeve production.
 */
export function propagateRepair(
  input: PropagationInput,
  thresholds: PropagationThresholds = DEFAULT_PROPAGATION_THRESHOLDS,
): PropagationOutput {
  const { width, height, sortedIndices, byIndex } = validatePropagationInput(input);
  const { canonical } = input;
  const byAnchor = anchorsByIndex(input.anchors);
  const out = new Map<number, PropagatedFrame>();

  out.set(
    canonical.index,
    emitFrame({
      index: canonical.index,
      transform: identityTransform(),
      canonicalMask: canonical.mask,
      canonicalQuad: canonical.quadNorm,
      width,
      height,
      confidence: 1,
      source: "canonical",
      reanchorRecommended: extraAnchorReasons(byAnchor.get(canonical.index)).length > 0,
      reanchorReasons: extraAnchorReasons(byAnchor.get(canonical.index)),
    }),
  );

  const walk = (direction: 1 | -1): void => {
    const startPos = sortedIndices.indexOf(canonical.index);
    if (startPos < 0) return;
    let prevIndex = canonical.index;
    let prevTransform = identityTransform();
    let broken = false;
    let breakReasons: string[] = [];
    let step = startPos + direction;
    while (step >= 0 && step < sortedIndices.length) {
      const index = sortedIndices[step]!;
      const snap = snapTransform(byAnchor.get(index));
      const extras = extraAnchorReasons(byAnchor.get(index));

      if (snap) {
        out.set(
          index,
          emitFrame({
            index,
            transform: snap,
            canonicalMask: canonical.mask,
            canonicalQuad: canonical.quadNorm,
            width,
            height,
            confidence: 1,
            source: "anchor_snap",
            reanchorRecommended: extras.length > 0,
            reanchorReasons: extras,
          }),
        );
        prevIndex = index;
        prevTransform = snap;
        broken = extras.includes("scene_cut") || extras.includes("pose_change");
        breakReasons = extras.filter((r) => r === "scene_cut" || r === "pose_change");
        step += direction;
        continue;
      }

      if (broken) {
        const holdReasons = [...new Set([...breakReasons, ...extras])];
        if (holdReasons.length === 0) holdReasons.push("failed_match");
        out.set(
          index,
          emitFrame({
            index,
            transform: prevTransform,
            canonicalMask: canonical.mask,
            canonicalQuad: canonical.quadNorm,
            width,
            height,
            confidence: 0,
            source: "hold",
            reanchorRecommended: true,
            reanchorReasons: holdReasons,
          }),
        );
        prevIndex = index;
        step += direction;
        continue;
      }

      const from = byIndex.get(prevIndex)!;
      const to = byIndex.get(index)!;
      const support = out.get(prevIndex)!.mask;
      const estimate = estimateTranslation(from, to, support);
      const hop = hopReasons(estimate, thresholds, extras);
      const nextTransform =
        hop.source === "hold" ? prevTransform : composeAffine(estimate.transform, prevTransform);

      out.set(
        index,
        emitFrame({
          index,
          transform: nextTransform,
          canonicalMask: canonical.mask,
          canonicalQuad: canonical.quadNorm,
          width,
          height,
          confidence: hop.source === "hold" ? 0 : estimate.confidence,
          source: hop.source,
          reanchorRecommended: hop.reanchorRecommended,
          reanchorReasons: hop.reanchorReasons,
        }),
      );
      if (hop.source === "hold") {
        broken = true;
        breakReasons = hop.reanchorReasons;
      }
      prevIndex = index;
      prevTransform = nextTransform;
      step += direction;
    }
  };

  walk(1);
  walk(-1);

  return {
    contractVersion: TEMPORAL_PROPAGATION_CONTRACT_VERSION,
    clipId: input.clip.id,
    canonicalIndex: canonical.index,
    frames: sortedIndices.map((i) => out.get(i)!),
  };
}
