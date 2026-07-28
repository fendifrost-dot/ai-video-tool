// Lane A — flow-break / re-anchor logic (LOCKED architecture §3, step 3).
//
// Pure helpers, no Deno / DOM globals (vitest-testable).
//
// Optical-flow propagation carries the approved garment across intermediate
// frames only while the flow solution is TRUSTWORTHY. When confidence collapses
// — a large rotation, an occlusion, or a scene cut — warping from a stale
// keyframe smears the garment. The locked lane says: STOP propagating from that
// keyframe and generate a FRESH Grok keyframe to re-anchor (§3, step 3).
//
// This module does not compute optical flow (that is the propagation engine's
// job — see propagation.ts and the deploy report). It consumes per-frame flow
// METRICS (whatever the engine emits) and decides, deterministically, where a
// new keyframe must be inserted. Those indices feed back into
// planKeyframes(forcedAnchors) for the next round — closing the re-anchor loop.

export interface FlowMetrics {
  /** Frame index these metrics describe. */
  index: number;
  /**
   * Optical-flow confidence 0..1 (1 = fully trusted). Forward/backward
   * consistency or a model-reported score; below the threshold → re-anchor.
   */
  confidence?: number;
  /** Estimated inter-frame rotation magnitude in degrees. */
  rotationDeg?: number;
  /** Fraction 0..1 of the garment region that became occluded this frame. */
  occlusionRatio?: number;
  /** Hard shot boundary detected at this frame — always forces a re-anchor. */
  sceneCut?: boolean;
}

export interface FlowBreakThresholds {
  /** Re-anchor when confidence falls below this (default 0.6). */
  minConfidence: number;
  /** Re-anchor when inter-frame rotation exceeds this many degrees (default 25). */
  maxRotationDeg: number;
  /** Re-anchor when garment occlusion exceeds this fraction (default 0.35). */
  maxOcclusionRatio: number;
}

export const DEFAULT_FLOW_BREAK_THRESHOLDS: FlowBreakThresholds = {
  minConfidence: 0.6,
  maxRotationDeg: 25,
  maxOcclusionRatio: 0.35,
};

export interface FlowBreakDecision {
  reanchor: boolean;
  /** Human-readable reasons (empty when reanchor is false). */
  reasons: string[];
}

/**
 * Decide whether frame `m` breaks flow badly enough to need a fresh keyframe.
 * Missing metrics are treated as "not observed" and never trigger on their own,
 * so a caller that supplies no metrics gets a pure cadence plan (no re-anchors).
 */
export function shouldReanchor(
  m: FlowMetrics,
  thresholds: FlowBreakThresholds = DEFAULT_FLOW_BREAK_THRESHOLDS,
): FlowBreakDecision {
  const reasons: string[] = [];
  if (m.sceneCut === true) reasons.push("scene_cut");
  if (typeof m.confidence === "number" && m.confidence < thresholds.minConfidence) {
    reasons.push(`low_confidence(${m.confidence.toFixed(2)}<${thresholds.minConfidence})`);
  }
  if (typeof m.rotationDeg === "number" && m.rotationDeg > thresholds.maxRotationDeg) {
    reasons.push(`large_rotation(${m.rotationDeg.toFixed(1)}>${thresholds.maxRotationDeg})`);
  }
  if (typeof m.occlusionRatio === "number" && m.occlusionRatio > thresholds.maxOcclusionRatio) {
    reasons.push(`occlusion(${m.occlusionRatio.toFixed(2)}>${thresholds.maxOcclusionRatio})`);
  }
  return { reanchor: reasons.length > 0, reasons };
}

export interface ReanchorPlan {
  /** Frame indices where a fresh Grok keyframe must be generated. */
  reanchorAt: number[];
  /** Per-frame reasons, for the reproducibility record + debugging. */
  reasons: Record<number, string[]>;
}

/**
 * Scan per-frame flow metrics and return the indices that must become new
 * keyframes. Already-approved keyframe indices are skipped (a keyframe cannot
 * "break flow" from itself). Feed `reanchorAt` back into
 * planKeyframes({ forcedAnchors }) to re-plan, then propagate again — this is
 * the re-anchor loop. `existingKeyframes` prevents re-proposing frames that are
 * already anchored, so the loop converges instead of thrashing.
 */
export function planReanchors(
  metrics: FlowMetrics[],
  existingKeyframes: Iterable<number> = [],
  thresholds: FlowBreakThresholds = DEFAULT_FLOW_BREAK_THRESHOLDS,
): ReanchorPlan {
  const anchored = new Set<number>();
  for (const k of existingKeyframes) anchored.add(k);
  const reanchorAt: number[] = [];
  const reasons: Record<number, string[]> = {};
  for (const m of metrics) {
    if (anchored.has(m.index)) continue;
    const decision = shouldReanchor(m, thresholds);
    if (decision.reanchor) {
      reanchorAt.push(m.index);
      reasons[m.index] = decision.reasons;
    }
  }
  reanchorAt.sort((a, b) => a - b);
  return { reanchorAt, reasons };
}
