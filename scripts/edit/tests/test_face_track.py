"""Subject face tracking of body_only_swap: the redressed person is the subject, scenes never borrow from each other."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from face_track import scene_starts, pick_subject, track_scene, subject_score


def face_at(cx, cy, fh=100.0):
    pts = np.array([[cx - fh / 2, cy - fh / 2], [cx + fh / 2, cy - fh / 2], [cx + fh / 2, cy + fh / 2], [cx - fh / 2, cy + fh / 2]], np.float32)
    return (pts, cy - fh / 2 + 0.2 * fh, fh, cy - fh / 2 + 0.4 * fh)


def test_scene_starts_follow_the_cut_rule():
    assert scene_starts([0, 3, 2, 54.7, 4, 61.0, 2]) == [0, 3, 5]


def test_the_subject_is_the_face_whose_clothes_the_swap_changed():
    changed = np.zeros((1280, 720), bool)
    him = face_at(400, 330); other = face_at(120, 1100, 130)        # the man in the foreground has the bigger face
    x0, y0, x1, y1 = 300, 380, 500, 580; changed[y0:y1, x0:x1] = True   # the swap redrew the coat under HIS face
    assert subject_score(him, changed) > 0.5 and subject_score(other, changed) == 0.0
    assert pick_subject([other, him], changed) is him
    assert pick_subject([other], changed) is None                     # nobody redressed: no subject in this frame


def test_a_scene_fills_its_own_gaps_and_drops_the_stranger():
    him = [face_at(400, 330 + k, 100) for k in range(6)]
    stranger = face_at(120, 1100, 130)
    faces = [None, him[1], None, stranger, him[4], None]
    tr = track_scene(faces)
    assert all(f is not None for f in tr)
    assert tr[3][0] is him[4][0] or tr[3][0] is him[1][0]           # the stranger's oval is dropped, a neighbour's used
    assert abs(tr[2][1] - (him[1][1] + (him[4][1] - him[1][1]) / 3)) < 1e-3   # the brow row between two detections is interpolated
    assert tr[0][1] == him[1][1] and tr[5][1] == him[4][1]             # ends hold the nearest detection
    assert track_scene([None, None]) == [None, None]                  # a scene with no face borrows nothing
