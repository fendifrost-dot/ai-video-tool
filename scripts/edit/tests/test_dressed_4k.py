"""dressed_4k.py keeps every unchanged pixel the 4K original and takes only the changed area from the swap, at any working size."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import dressed_4k


def test_selftest():
    dressed_4k.self_test()
