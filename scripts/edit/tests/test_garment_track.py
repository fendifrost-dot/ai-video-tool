"""Synthetic check for the garment tracking core: a textured plane moved by a known
similarity/affine motion must be recovered within a pixel, occluders must be detected,
and the tracker must coast through a short full occlusion.  Run: python3 -m pytest scripts/edit/tests"""
import os, sys
import numpy as np, cv2
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from garment_track import occlusion_mask, quad_array, track_plane, warp_quad

def make_clip(n=40, occlude=()):
    rng = np.random.default_rng(7)
    tex = rng.integers(40, 220, (400, 400, 3), np.uint8)
    tex = cv2.GaussianBlur(tex, (0, 0), 1.2)
    frames, truth = [], []
    for k in range(n):
        ang = 0.6 * k; sc = 1.0 + 0.004 * k; tx, ty = 1.5 * k, 0.8 * k
        M = cv2.getRotationMatrix2D((200, 200), ang, sc); M[:, 2] += (tx, ty)
        f = cv2.warpAffine(tex, M, (400, 400), borderMode=cv2.BORDER_REFLECT)
        if k in occlude: cv2.rectangle(f, (120, 150), (300, 260), (30, 200, 30), -1)
        frames.append(f); truth.append(np.vstack([M, [0, 0, 1]]))
    return frames, truth

def test_recovers_known_motion():
    frames, truth = make_clip()
    quad = quad_array([150, 170, 260, 170, 260, 230, 150, 230])
    tr = track_plane(frames, 0, quad, model="affine", smooth_sigma=0)
    errs = []
    for k in range(1, len(frames)):
        assert tr[k]["H"] is not None and tr[k]["confidence"] > 0.5, k
        errs.append(np.abs(warp_quad(truth[k], quad) - tr[k]["quad"]).max())
    assert max(errs) < 1.5, max(errs)

def test_coasts_through_short_occlusion_and_flags_occluder():
    frames, truth = make_clip(occlude=range(18, 22))
    quad = quad_array([150, 170, 260, 170, 260, 230, 150, 230])
    tr = track_plane(frames, 0, quad, model="affine", smooth_sigma=0)
    assert all(tr[k]["quad"] is not None for k in range(len(frames)))        # never lost
    assert np.abs(warp_quad(truth[30], quad) - tr[30]["quad"]).max() < 2.0    # re-acquired after the occluder
    occ, plane = occlusion_mask(frames[19], frames[0], tr[19]["H"], quad)
    assert occ[plane > 0].mean() > 0.6                                        # the green block reads as occluder
    occ2, plane2 = occlusion_mask(frames[10], frames[0], tr[10]["H"], quad)
    assert occ2[plane2 > 0].mean() < 0.05                                     # clean frame: nothing occluded

def test_quad_shape_gate_rejects_collapsed_fits():
    from garment_graphic_track import quad_shape_ok
    anchor = quad_array([100, 100, 210, 100, 210, 130, 100, 130])
    ok, r = quad_shape_ok(anchor, quad_array([300, 400, 355, 402, 356, 418, 301, 416]), 1.3)   # uniformly half size: fine
    assert ok and r < 1.1, r
    ok, r = quad_shape_ok(anchor, quad_array([100, 100, 148, 104, 139, 133, 91, 132]), 1.3)     # width collapsed to 48 px, height kept
    assert not ok and r > 1.3, r
