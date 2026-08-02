"""Garment-fidelity metric: stripe detection + variance scoring."""
import numpy as np

from workers.warp_worker.garment_fidelity import (
    StripeMeasurement,
    measure_stripe,
    score_fidelity,
)


def _garment_with_navy_band(h=300, w=200, band_y=140, band_h=24):
    img = np.full((h, w, 3), (120, 150, 170), np.uint8)  # tan-ish BGR
    mask = np.zeros((h, w), np.uint8)
    mask[40:h - 40, 40:w - 40] = 255
    # navy band (BGR ~ dark blue): high B, low R/G, low value
    img[band_y:band_y + band_h, 40:w - 40] = (90, 40, 20)
    return img, mask


def test_detects_navy_band():
    img, mask = _garment_with_navy_band()
    m = measure_stripe(img, mask, index=3)
    assert m.present
    assert 0.0 < m.width_norm < 1.0
    assert 0.0 < m.cy_norm < 1.0


def test_absent_when_no_navy():
    img = np.full((300, 200, 3), (120, 150, 170), np.uint8)
    mask = np.zeros((300, 200), np.uint8)
    mask[40:260, 40:160] = 255
    m = measure_stripe(img, mask, index=1)
    assert m.present is False


def test_variance_low_for_steady_band():
    ms = []
    for i in range(10):
        img, mask = _garment_with_navy_band(band_y=140, band_h=24)
        ms.append(measure_stripe(img, mask, index=i))
    sc = score_fidelity(ms, "steady")
    assert sc.frames_measured == 10
    assert sc.stripe_width_variance is not None and sc.stripe_width_variance < 0.05
    assert sc.stripe_position_variance is not None and sc.stripe_position_variance < 0.02


def test_variance_high_for_swimming_band():
    ms = []
    for i in range(10):
        img, mask = _garment_with_navy_band(band_y=110 + i * 8, band_h=24)  # band drifts down
        ms.append(measure_stripe(img, mask, index=i))
    sc = score_fidelity(ms, "swim")
    assert sc.stripe_position_variance is not None and sc.stripe_position_variance > 0.03


def test_semi_manual_components_null_with_methods():
    sc = score_fidelity([StripeMeasurement(index=0, present=True, width_norm=0.1, cy_norm=0.4)], "x")
    d = sc.as_dict()
    for k in ["logo_alignment", "logo_legibility", "zipper_alignment", "collar_geometry"]:
        assert d[k] is None
        assert k in d["methods"]  # method recorded even when unmeasured
