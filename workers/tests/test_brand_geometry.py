"""Deterministic brand track geometry (pure)."""
from workers.warp_worker.brand import (
    BrandPlacement,
    RegionGeometry,
    place_brand,
    stripe_width_stability,
    track_brand,
)


def _geom(i, x0=100, y0=200, x1=300, y1=600):
    return RegionGeometry(index=i, present=True, cx=(x0 + x1) / 2, cy=(y0 + y1) / 2,
                          x0=x0, y0=y0, x1=x1, y1=y1, angle_deg=0.0)


def test_place_within_torso_bbox():
    p = place_brand(_geom(0))
    assert p.present
    # stripe centred horizontally in the bbox
    assert abs(p.stripe_cx - 200) < 1e-6
    # stripe sits in the upper torso, inside the vertical extent
    assert 200 < p.stripe_cy < 600
    assert p.stripe_w > 0 and p.stripe_h > 0


def test_absent_region_no_placement():
    p = place_brand(RegionGeometry(index=1, present=False))
    assert p.present is False


def test_stripe_stability_zero_for_constant_track():
    geoms = [_geom(i) for i in range(10)]
    track = track_brand(geoms, smooth=1)
    cv = stripe_width_stability(track)
    assert cv is not None and cv < 1e-6


def test_stripe_stability_detects_swim():
    geoms = [_geom(i, x1=300 + i * 40) for i in range(10)]  # torso width grows -> stripe swims
    track = track_brand(geoms, smooth=1)
    cv = stripe_width_stability(track)
    assert cv is not None and cv > 0.1


def test_smoothing_reduces_jitter():
    # alternating widths -> smoothing should cut the variation
    geoms = [_geom(i, x1=300 if i % 2 == 0 else 380) for i in range(12)]
    raw_cv = stripe_width_stability(track_brand(geoms, smooth=1))
    sm_cv = stripe_width_stability(track_brand(geoms, smooth=5))
    assert sm_cv < raw_cv
