"""reinsert_him.py: his take's pixels stay, the old leash strip, the creature and nothing else come from the swap."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import reinsert_him


def test_selftest():
    reinsert_him.self_test()
