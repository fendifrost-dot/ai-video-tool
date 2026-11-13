"""matte_repair.py gives back a dark garment the provider matte dropped, adds nothing that does not touch him, removes nothing."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import matte_repair


def test_selftest():
    assert matte_repair.selftest() == 0
