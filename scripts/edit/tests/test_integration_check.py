"""integration_check.py passes a figure that shares the set's light, grain and blacks, and flags a paste-up."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import integration_check


def test_selftest():
    integration_check.self_test()
