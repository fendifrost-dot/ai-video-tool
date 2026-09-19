"""Keyframe / anchor planning — Python port of ``_shared/keyframePlan.ts``.

Decides WHICH frames are anchors and, for every frame, which two anchors bracket
it (the bidirectional propagation sources) and where it sits between them
(``t``). Ends are always anchored so nothing extrapolates past a real anchor.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Sequence

from .config import DEFAULT_KEYFRAME_CADENCE, MAX_KEYFRAME_CADENCE, MIN_KEYFRAME_CADENCE


def clamp_cadence(cadence) -> int:
    try:
        c = float(cadence)
    except (TypeError, ValueError):
        return DEFAULT_KEYFRAME_CADENCE
    if c != c:  # NaN
        return DEFAULT_KEYFRAME_CADENCE
    return max(MIN_KEYFRAME_CADENCE, min(MAX_KEYFRAME_CADENCE, round(c)))


def plan_keyframes(
    frame_count: int,
    cadence_frames: int | None = None,
    forced_anchors: Iterable[int] = (),
) -> List[int]:
    """Anchor indices: always 0 and frame_count-1, scheduled cadence anchors, plus
    forced anchors (pose changes / re-anchors). Sorted, de-duplicated."""
    n = int(frame_count)
    if n <= 0:
        raise ValueError(f"plan_keyframes: invalid frame_count {frame_count}")
    if n == 1:
        return [0]
    cadence = clamp_cadence(cadence_frames)
    s = {0, n - 1}
    i = cadence
    while i < n - 1:
        s.add(i)
        i += cadence
    for raw in forced_anchors:
        a = int(raw)
        if 0 <= a < n:
            s.add(a)
    return sorted(s)


@dataclass
class FrameSegment:
    index: int
    is_keyframe: bool
    prev_keyframe: int
    next_keyframe: int
    t: float
    nearest_keyframe: int


def assign_segments(keyframe_indices: Sequence[int], frame_count: int) -> List[FrameSegment]:
    """For every frame resolve its bracketing anchors + blend weight ``t``.
    ``keyframe_indices`` must be sorted and cover both ends."""
    n = int(frame_count)
    if n <= 0:
        raise ValueError(f"assign_segments: invalid frame_count {frame_count}")
    kfs = sorted(k for k in keyframe_indices if 0 <= k < n)
    if not kfs:
        raise ValueError("assign_segments: no keyframes")
    if kfs[0] != 0:
        raise ValueError("assign_segments: keyframes must include frame 0")
    if kfs[-1] != n - 1:
        raise ValueError("assign_segments: keyframes must include the final frame")
    kf_set = set(kfs)
    out: List[FrameSegment] = []
    seg = 0
    for i in range(n):
        while seg + 1 < len(kfs) and kfs[seg + 1] <= i:
            seg += 1
        prev = kfs[seg]
        nxt = kfs[seg + 1] if seg + 1 < len(kfs) else prev
        span = nxt - prev
        t = (i - prev) / span if span > 0 else 0.0
        nearest = prev if t <= 0.5 else nxt
        out.append(
            FrameSegment(
                index=i,
                is_keyframe=i in kf_set,
                prev_keyframe=prev,
                next_keyframe=nxt,
                t=t,
                nearest_keyframe=nearest,
            )
        )
    return out


def intermediate_frames(segments: Sequence[FrameSegment]) -> List[FrameSegment]:
    return [s for s in segments if not s.is_keyframe]
