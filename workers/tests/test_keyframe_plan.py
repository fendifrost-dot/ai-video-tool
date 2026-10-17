"""Keyframe plan = Python port of keyframePlan.ts."""
import pytest

from workers.warp_worker.keyframe_plan import (
    assign_segments,
    clamp_cadence,
    intermediate_frames,
    plan_keyframes,
)


def test_clamp_band():
    assert clamp_cadence(5) == 12
    assert clamp_cadence(100) == 24
    assert clamp_cadence(18) == 18
    assert clamp_cadence(None) == 18
    assert clamp_cadence(float("nan")) == 18


def test_plan_covers_ends_and_cadence():
    kf = plan_keyframes(50, 18)
    assert kf[0] == 0 and kf[-1] == 49
    assert 18 in kf and 36 in kf


def test_forced_anchors_merged_sorted_unique():
    kf = plan_keyframes(50, 18, forced_anchors=[36, 5, 5])
    assert kf == sorted(set(kf))
    assert 5 in kf


def test_assign_segments_brackets_and_t():
    kf = [0, 10, 20]
    segs = assign_segments(kf, 21)
    assert segs[0].is_keyframe and segs[10].is_keyframe and segs[20].is_keyframe
    mid = segs[5]
    assert mid.prev_keyframe == 0 and mid.next_keyframe == 10
    assert mid.t == pytest.approx(0.5)
    assert mid.nearest_keyframe in (0, 10)
    assert len(intermediate_frames(segs)) == 21 - 3


def test_assign_segments_requires_end_coverage():
    with pytest.raises(ValueError):
        assign_segments([0, 10], 21)   # last frame 20 not anchored
    with pytest.raises(ValueError):
        assign_segments([1, 20], 21)   # frame 0 not anchored
