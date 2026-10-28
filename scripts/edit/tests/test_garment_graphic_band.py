"""Band-mode lettering rules of garment_graphic_track (the generator's script in the garment's
own colour on a navy band — the case the chroma rules alone cannot tell from the band's edge)."""
import os, sys
import numpy as np
import cv2
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from garment_graphic_track import body_reaching_out, band_lettering_core, thin_band_rows


def _plane(h=120, w=300, y0=40, y1=80, x0=20, x1=280):
    pl = np.zeros((h, w), bool); pl[y0:y1, x0:x1] = True; return pl


def test_body_island_inside_the_band_is_lettering_but_overshoot_is_not():
    pl = _plane()
    body = np.zeros_like(pl)
    body[:38, :] = True; body[82:, :] = True          # the body above and below the band
    body[38:42, :] = True                              # the plane overshoots 2 rows onto the body: connected outward
    body[55:65, 100:140] = True                        # a beige script enclosed by the band: an island
    kept = body_reaching_out(body, pl)
    assert kept[39, 150] and not kept[60, 120]         # overshoot kept as body, island released for painting


def test_hysteresis_keeps_tails_of_a_sure_stroke_and_drops_weave_noise_and_the_rim():
    pl = _plane()
    body = np.zeros_like(pl); body[:40, :] = True; body[80:, :] = True
    sure = np.zeros_like(pl); sure[55:65, 100:120] = True               # the stroke
    loose = sure.copy(); loose[58:62, 120:150] = True                   # its thin tail
    loose[50:52, 200:203] = True                                        # weave noise: no sure seed
    loose[40:43, 20:280] = True; sure[40:43, 20:280] = True             # the blurred rim against the body (sure too)
    core = band_lettering_core(pl, sure, loose, body) > 0
    assert core[60, 110] and core[60, 140]                              # stroke and tail
    assert not core[51, 201]                                            # noise dropped
    assert not core[41, 150]                                            # rim left alone


def test_thin_band_rows_follow_the_band_not_the_plane():
    pl = _plane(y0=40, y1=80)
    band = np.zeros_like(pl); band[48:72, :] = True                     # the band is narrower than the plane
    H = np.array([[1.0, 0, 20], [0, 1.0, 40], [0, 0, 1]])               # graphic (260x40) → plane at (20,40)
    rows = thin_band_rows(pl, band, H, (260, 40)) > 0
    assert rows[60, 150] and not rows[42, 150] and not rows[78, 150]
