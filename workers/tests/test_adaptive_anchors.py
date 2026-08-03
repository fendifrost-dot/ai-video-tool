"""Adaptive anchor placement (pure)."""
from workers.warp_worker.adaptive_anchors import (
    compare_to_fixed,
    plan_adaptive_anchors,
    reach_lookup,
)


def test_always_covers_ends():
    reach = [20] * 100
    a = plan_adaptive_anchors(reach, 100)
    assert a[0] == 0 and a[-1] == 99


def test_uniform_reach_uniform_spacing():
    reach = [20] * 100        # safety 0.8 -> step 16
    a = plan_adaptive_anchors(reach, 100, safety=0.8, min_gap=4, max_gap=48)
    gaps = [a[i + 1] - a[i] for i in range(len(a) - 1)]
    # interior gaps ~16 (last may be shorter to hit the end)
    assert all(g <= 16 for g in gaps)
    assert max(gaps[:-1]) == 16


def test_low_reach_region_gets_denser_anchors():
    # A deformation hotspot at 40..60. reach_fwd is measured by propagating until
    # it breaks, so upstream reach SHRINKS approaching the hotspot (propagation
    # from f<40 breaks on entering it), reach is tiny inside it, and recovers after.
    reach = [40] * 100
    for f in range(0, 40):
        reach[f] = min(40, 40 - f)     # breaks on entering the hotspot
    for f in range(40, 61):
        reach[f] = 2                    # deforms fast inside
    a = plan_adaptive_anchors(reach, 100, safety=0.8, min_gap=2, max_gap=48)
    dense = [x for x in a if 40 <= x <= 62]
    dense_gaps = [dense[i + 1] - dense[i] for i in range(len(dense) - 1)]
    # the fast-deforming region must have tightly-spaced anchors (vs 16+ in stable)
    assert dense_gaps and max(dense_gaps) <= 6
    # leaving the hotspot into the stable tail (reach 40) must produce a wide gap
    tail_anchors = [x for x in a if x >= 60]
    tail_gaps = [tail_anchors[i + 1] - tail_anchors[i] for i in range(len(tail_anchors) - 1)]
    assert max(tail_gaps) >= 16


def test_respects_max_gap_even_if_reach_huge():
    reach = [1000] * 100
    a = plan_adaptive_anchors(reach, 100, max_gap=30)
    gaps = [a[i + 1] - a[i] for i in range(len(a) - 1)]
    assert max(gaps) <= 30


def test_shot_boundaries_forced():
    reach = [40] * 100
    a = plan_adaptive_anchors(reach, 100, shot_boundaries=[50])
    assert 50 in a


def test_reach_lookup_nearest_hold():
    per_anchor = [{"anchor": 0, "max_fwd": 10}, {"anchor": 20, "max_fwd": 4}, {"anchor": 40, "max_fwd": 30}]
    r = reach_lookup(per_anchor, 41)
    assert r[0] == 10
    assert r[20] == 4
    assert r[40] == 30
    # near 20 should hold 4
    assert r[19] == 4 or r[18] == 4


def test_compare_to_fixed_counts():
    a = plan_adaptive_anchors([40] * 100, 100)
    c = compare_to_fixed(a, 100, fixed_cadence=18)
    assert c["adaptive_anchor_count"] == len(a)
    assert c["fixed_anchor_count"] >= 2
