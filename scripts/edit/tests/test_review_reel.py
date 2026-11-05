"""Slot maths of review_reel: where a clip starts for a shot's slot on the song."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from review_reel import source_in, status_colour


def test_source_in_follows_the_clip_sync_and_never_goes_negative():
    assert source_in(72.33, 72.33) == 0.0                 # the clip's first frame sits on the slot's start
    assert source_in(16.75, 15.852) == 0.898              # montage made for 15.852 s on, slot starts 0.898 s into it
    assert source_in(58.06, 60.0) == 0.0                  # a clip synced later than the slot cannot start before frame 0
    assert source_in(40.85, None) == 0.0                  # a cutaway off the song clock plays from its start


def test_status_colours():
    assert status_colour("FINAL 4 Nov") == status_colour("APPROVED 18 Oct") == status_colour("PICK 27 Oct")
    assert status_colour("GAP: only the dressed take") != status_colour("CANDIDATE 17 Oct")
