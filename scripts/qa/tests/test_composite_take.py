"""The composite harness's arithmetic: which frames a cut keeps and at what rate. No video is read here."""
import os, sys
from fractions import Fraction

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from composite_take import exact_rate, frame_plan, rate_text  # noqa: E402


def test_a_printed_rate_is_the_rate_the_camera_ran_at():
    # ffmpeg prints two decimals; a phone's 59.94 is 60000/1001, and treating it as 60 plays the take 0.1 % fast
    assert exact_rate(59.94) == Fraction(60000, 1001)
    assert exact_rate(29.97) == Fraction(30000, 1001)
    assert exact_rate(23.98) == Fraction(24000, 1001)
    assert exact_rate(30.0) == Fraction(30)
    assert exact_rate(24.0) == Fraction(24)
    assert exact_rate(25.0) == Fraction(25)


def test_a_rate_that_is_neither_family_is_kept_as_printed():
    assert abs(float(exact_rate(12.5)) - 12.5) < 1e-6


def test_every_second_frame_of_a_5994_take_is_a_true_2997_cut():
    p = frame_plan(Fraction(60000, 1001), "3710:3944:2", 0.0, None)
    assert (p["first"], p["last"], p["step"], p["kept"]) == (3710, 3944, 2, 118)
    assert p["rate"] == Fraction(30000, 1001)
    assert rate_text(p["rate"]) == "30000/1001"
    # the matter is handed a whole rate so its own resample is the identity
    assert p["nominal"] == 30
    # the length is the frames at the real rate — not frames / 30
    assert abs(float(p["kept"] / p["rate"]) - 3.93727) < 1e-4


def test_the_last_frame_is_one_that_is_kept():
    # 10..15 step 2 keeps 10, 12, 14: the recorded last frame is 14, not the 15 that was asked for
    p = frame_plan(Fraction(30), "10:15:2", 0.0, None)
    assert (p["last"], p["kept"]) == (14, 3)


def test_seconds_are_turned_into_the_same_frames():
    p = frame_plan(Fraction(30), None, 0.0, 2.5)
    assert (p["first"], p["last"], p["step"], p["kept"]) == (0, 74, 1, 75)
    assert rate_text(p["rate"]) == "30"


@pytest.mark.parametrize("frames,start,end", [("5:4", 0.0, None), ("0:10:0", 0.0, None), ("1:2:3:4", 0.0, None), (None, 0.0, None), (None, 2.0, 2.0)])
def test_a_cut_of_nothing_is_refused(frames, start, end):
    with pytest.raises(SystemExit):
        frame_plan(Fraction(30), frames, start, end)
