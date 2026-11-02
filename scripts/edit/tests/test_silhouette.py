"""The protected mask is tightened to the real silhouette, not to the segmenter's overshoot."""
import os, sys
import numpy as np, cv2
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from silhouette import refine_silhouette


def test_overshoot_onto_the_scene_is_dropped_and_the_silhouette_kept():
    H, W = 120, 120
    img = np.full((H, W, 3), 200, np.uint8)                 # a bright scene
    cv2.circle(img, (60, 60), 30, (40, 30, 25), -1)          # his dark head
    protect = np.zeros((H, W), np.uint8); cv2.circle(protect, (60, 60), 33, 1, -1)   # the mask overshoots by 3 px
    out = refine_silhouette(protect.astype(bool), img, band=4)
    yy, xx = np.mgrid[:H, :W]; r = np.hypot(yy - 60, xx - 60)
    assert out[r <= 28].all()                                 # the head stays protected
    assert not out[(r >= 31.5) & (r <= 33)].any()             # the overshoot onto the scene is gone
    assert out[r <= 29.5].mean() > 0.99


def test_nothing_to_judge_against_keeps_the_mask():
    img = np.full((40, 40, 3), 90, np.uint8)
    protect = np.ones((40, 40), bool)                          # no outside at all
    assert refine_silhouette(protect, img).all()
