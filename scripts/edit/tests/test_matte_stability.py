"""matte_stability.py finds a leg that drops out of a matte, and the alpha a fixed-position fill invents (Hyenas v7)."""
import os, subprocess, sys, tempfile
import numpy as np, cv2

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
import matte_stability as ms


def test_selftest():
    assert ms.selftest() == 0


def _write(path, frames):
    v = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), 24, (frames[0].shape[1], frames[0].shape[0]))
    for f in frames: v.write(cv2.cvtColor(f, cv2.COLOR_GRAY2BGR))
    v.release()


def test_cli_baseline_and_exit_code():
    with tempfile.TemporaryDirectory() as d:
        base, cand = [], []
        for k in range(24):
            a = np.zeros((320, 240), np.uint8); a[20:260, 80:160] = 255; a[260:310, 90:120] = 255
            base.append(a); c = a.copy()
            if k == 12: c[260:310, 90:120] = 0        # the change made the leg drop out for one frame
            cand.append(c)
        pb, pc = os.path.join(d, "b.avi"), os.path.join(d, "c.avi")
        _write(pb, base); _write(pc, cand)
        script = os.path.join(HERE, "..", "matte_stability.py")
        ok = subprocess.run([sys.executable, "-I", script, pb, "--max-flagged", "0"], capture_output=True, text=True)
        assert ok.returncode == 0, ok.stdout + ok.stderr
        bad = subprocess.run([sys.executable, "-I", script, pc, "--baseline", pb, "--max-flagged", "0"],
                             capture_output=True, text=True)
        assert bad.returncode == 1, bad.stdout + bad.stderr
        assert "bottom" in bad.stdout and "removed" in bad.stdout
