"""The re-anchor GATE — the hard gate the spec demands.

This is a faithful Python port of ``supabase/functions/_shared/flowBreak.ts``.
It is deliberately the SAME logic on both sides of the boundary: the worker uses
it locally to decide where propagation is untrustworthy, and the edge function
uses the TS version to plan the next keyframe round. Identical thresholds ->
identical decisions.

The gate NEVER fabricates a propagated frame. When flow confidence collapses
(large rotation, occlusion, scene cut) it flags the frame for a fresh anchor.
That is the whole difference between this and Phase-2b "just sample every frame".
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List

from .config import MAX_OCCLUSION_RATIO, MAX_ROTATION_DEG, MIN_CONFIDENCE
from .interfaces import FlowMetrics


@dataclass
class Thresholds:
    min_confidence: float = MIN_CONFIDENCE
    max_rotation_deg: float = MAX_ROTATION_DEG
    max_occlusion_ratio: float = MAX_OCCLUSION_RATIO


@dataclass
class GateDecision:
    reanchor: bool
    reasons: List[str]


def should_reanchor(m: FlowMetrics, t: Thresholds = Thresholds()) -> GateDecision:
    """Decide whether frame ``m`` breaks flow badly enough to need a fresh anchor.

    Missing metrics are "not observed" and never trigger on their own — so a
    caller that supplies no metrics gets a pure cadence plan (no re-anchors),
    matching the TS behaviour exactly.
    """
    reasons: List[str] = []
    if m.sceneCut is True:
        reasons.append("scene_cut")
    if isinstance(m.confidence, (int, float)) and m.confidence < t.min_confidence:
        reasons.append(f"low_confidence({m.confidence:.2f}<{t.min_confidence})")
    if isinstance(m.rotationDeg, (int, float)) and m.rotationDeg > t.max_rotation_deg:
        reasons.append(f"large_rotation({m.rotationDeg:.1f}>{t.max_rotation_deg})")
    if isinstance(m.occlusionRatio, (int, float)) and m.occlusionRatio > t.max_occlusion_ratio:
        reasons.append(f"occlusion({m.occlusionRatio:.2f}>{t.max_occlusion_ratio})")
    return GateDecision(reanchor=len(reasons) > 0, reasons=reasons)


@dataclass
class ReanchorPlan:
    reanchor_at: List[int]
    reasons: Dict[int, List[str]]


def plan_reanchors(
    metrics: Iterable[FlowMetrics],
    existing_keyframes: Iterable[int] = (),
    t: Thresholds = Thresholds(),
) -> ReanchorPlan:
    """Scan per-frame metrics and return indices that must become fresh anchors.

    Already-anchored indices are skipped (an anchor cannot break flow from
    itself), so feeding ``reanchor_at`` back into the keyframe plan converges
    instead of thrashing — same guarantee as ``planReanchors`` in TS.
    """
    anchored = set(existing_keyframes)
    reanchor_at: List[int] = []
    reasons: Dict[int, List[str]] = {}
    for m in metrics:
        if m.index in anchored:
            continue
        d = should_reanchor(m, t)
        if d.reanchor:
            reanchor_at.append(m.index)
            reasons[m.index] = d.reasons
    reanchor_at.sort()
    return ReanchorPlan(reanchor_at=reanchor_at, reasons=reasons)
