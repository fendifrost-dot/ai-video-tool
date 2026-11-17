"""relight_from_passes.py moves the light on a sphere to the set's lamp and keeps its texture (a gain, no redraw)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import relight_from_passes


def test_selftest():
    relight_from_passes.self_test()
