"""The tracker's arithmetic, without the models (numpy only): what the mouth gate actually measures."""
import math, os, sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import track_mouth as tm


def face(gap=20.0, cx=200.0, cy=200.0, width=200.0, nose=0.0, angle=0.0):
    """A synthetic landmark array: a face `width` pixels wide at (cx, cy), rotated by `angle`. `gap` is the lip gap
    in pixels on a 200-pixel face, so the same `gap` is the same mouth at any size."""
    P = np.zeros((478, 2), np.float32); gap = gap * width / 200.0
    pts = {234: (-0.5, 0.0), 454: (0.5, 0.0), 1: (nose, 0.15), 13: (0.0, 0.30), 14: (0.0, 0.30 + gap / width),
           33: (-0.3, -0.1), 133: (-0.1, -0.1), 362: (0.1, -0.1), 263: (0.3, -0.1), 168: (0.0, -0.1), 6: (0.0, -0.05)}
    for k, i in enumerate(tm.INNER_LIPS):
        a = 2 * math.pi * k / len(tm.INNER_LIPS)
        pts.setdefault(i, (0.12 * math.cos(a), 0.33 + (gap / width) * 0.5 * math.sin(a)))
    c, s = math.cos(angle), math.sin(angle)
    for i, (x, y) in pts.items():
        P[i] = [cx + width * (x * c - y * s), cy + width * (x * s + y * c)]
    return P


def frames(gaps, **kw):
    out = []
    for i, g in enumerate(gaps):
        P = face(gap=g, **kw)
        out.append({"t": i / 24.0, "found": True, "openness": tm.openness(P), "turn": tm.turn(P), "lips": tm.to_face(P, tm.INNER_LIPS).tolist()})
    return {"frames": out}


GAPS = [4 + 18 * abs(math.sin(i * 0.9)) + 6 * abs(math.sin(i * 0.37)) for i in range(72)]


def test_openness_is_the_lip_gap_over_the_face_width():
    assert abs(tm.openness(face(gap=20, width=200)) - 0.1) < 1e-4
    assert abs(tm.openness(face(gap=20, width=100)) - 0.1) < 1e-4


def test_face_coordinates_ignore_where_he_is_how_big_and_how_tilted():
    a = tm.to_face(face(gap=14), tm.INNER_LIPS)
    b = tm.to_face(face(gap=14, cx=900, cy=500, width=80, angle=0.3), tm.INNER_LIPS)
    assert np.abs(a - b).max() < 1e-3


def test_the_same_mouth_scores_one_and_no_shape_error():
    r = tm.score_tracks(frames(GAPS), frames(GAPS, cx=420, width=120))
    assert r["measured"] and r["timing"] > 0.99 and r["lag_frames"] == 0 and r["mouth_shape_distance"] < 1e-3


def test_a_mouth_that_does_not_move_fails_the_timing():
    r = tm.score_tracks(frames(GAPS), frames([8.0 + 0.01 * (i % 2) for i in range(72)]))
    assert r["timing"] < 0.3


def test_a_late_mouth_is_found_at_its_lag():
    late = [GAPS[0]] * 2 + GAPS[:-2]
    r = tm.score_tracks(frames(GAPS), frames(late))
    assert r["lag_frames"] == 2 and r["timing_best"] > 0.99 and r["timing"] < r["timing_best"]


def test_frames_without_a_face_lower_the_coverage_and_are_not_scored():
    out = frames(GAPS)
    for f in out["frames"][:36]: f["found"] = False
    r = tm.score_tracks(frames(GAPS), out)
    assert r["coverage"] == 0.5 and r["paired"] == 36


def test_too_few_faces_is_not_measured():
    out = frames(GAPS)
    for f in out["frames"][5:]: f["found"] = False
    assert tm.score_tracks(frames(GAPS), out)["measured"] is False


def test_a_turned_head_is_refused_for_the_flat_put_back():
    r = tm.score_tracks(frames(GAPS), frames(GAPS, nose=0.2))
    assert r["pose_turn_difference"] > tm.POSE_TURN_MAX and r["pose_ok_for_putback"] is False


def test_similarity_recovers_a_known_move():
    src = np.array([[0, 0], [10, 0], [0, 10], [7, 3]], float)
    ang, sc, sh = 0.4, 1.7, np.array([30.0, -12.0])
    R = sc * np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
    M = tm.similarity(src, src @ R.T + sh)
    assert np.abs(M[:, :2] - R).max() < 1e-4 and np.abs(M[:, 2] - sh).max() < 1e-3


def test_a_clip_of_another_frame_rate_is_paired_by_time():
    slow = [4 + 18 * abs(math.sin(i * 0.25)) for i in range(96)]
    a = frames(slow); b = {"frames": [dict(f) for f in a["frames"][::2]]}
    r = tm.score_tracks(a, b)
    assert r["measured"] and r["paired"] == 96 and r["timing"] > 0.9


def test_the_identity_model_is_used_only_with_its_pinned_checksum(tmp_path, monkeypatch):
    import hashlib, pytest
    # not on disk: identity is simply not measured
    assert tm.arc_model(str(tmp_path)) is None
    # some other file under the model's name: refused, never loaded
    other = tmp_path / tm.ARC_FILE; other.write_bytes(b"not the model")
    with pytest.raises(SystemExit) as stop: tm.arc_model(str(tmp_path))
    assert "not the pinned identity model" in str(stop.value)
    # the pinned file: its path comes back (the pin is swapped for this small file's own hash)
    monkeypatch.setattr(tm, "ARC_SHA256", hashlib.sha256(b"not the model").hexdigest())
    assert tm.arc_model(str(tmp_path)) == str(other)
    # the real pin is the InsightFace buffalo_l w600k_r50.onnx, read from three listings on 27 Nov 2026
    monkeypatch.undo()
    assert tm.ARC_SHA256 == "4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43" and len(tm.ARC_SHA256) == 64
