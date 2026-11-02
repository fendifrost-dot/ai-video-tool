"""The swap's surroundings are re-fitted to his face outline row by row."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from head_fit import row_edges, smooth_edges, x_map, fit_edges


def test_edges_and_map_put_the_swap_brim_on_his_cheek():
    H, W = 200, 400
    oc = np.zeros((H, W), bool); oc[60:160, 150:250] = True            # his face: columns 150..249
    sc = np.zeros((H, W), bool); sc[60:160, 140:265] = True            # the swap's face: wider, 140..264
    eo, es = fit_edges(oc, sc, 70, 150, fh=100.0)
    assert abs(eo[100, 0] - 150) < 1e-3 and abs(es[100, 1] - 264) < 1e-3
    m = x_map(W, H, 40, 180, eo, es, fh=100.0, taper_rows=10)
    # a swap pixel 5 px left of ITS face (x=135) must land 5 px left of HIS (output x=145): the map reads 135 at 145
    assert abs(m[100, 145] - 135) < 1.0
    # on the right the swap's face ends 15 px past his; 6 px out the shift has faded by 6/60: 255 reads 255 + 15 * 54 / 60
    assert abs(m[100, 255] - 268.5) < 0.6
    # far away the map is the identity, and so are rows outside the range
    assert abs(m[100, 20] - 20) < 1e-3 and abs(m[100, 380] - 380) < 1e-3 and abs(m[20, 145] - 145) < 1e-3
    # the shift fades out over the taper rows
    assert abs(m[175, 145] - 145) < abs(m[100, 145] - 145)


def test_rows_without_a_face_take_the_nearest_measured_row():
    e = np.full((10, 2), np.nan, np.float32); e[4] = (10, 20); e[6] = (12, 22)
    s = smooth_edges(e, rows=1)
    assert tuple(s[0]) == (10, 20) and tuple(s[9]) == (12, 22) and abs(s[5, 0] - 11) < 1e-3
    assert smooth_edges(np.full((5, 2), np.nan, np.float32)) is None
