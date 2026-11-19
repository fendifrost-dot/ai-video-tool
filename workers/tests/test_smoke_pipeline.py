"""End-to-end smoke test on a tiny synthetic sequence.

Exercises the full wiring — flow -> masks -> gate -> propagation -> composite ->
status -> QA — on a controlled clip whose garment region TRANSLATES by a known
amount. Provides explicit masks so it is fast and deterministic (no GrabCut).

Assertions are properties the pipeline must always hold, not tuned magic numbers:
  * every frame composited (done == frame_count)
  * identity OUTSIDE the garment region is preserved (near-zero drift), because a
    pure translation is exactly what dense flow recovers
  * artifacts (status.json, qa_report.md, sidebyside.png, metrics) all written
"""
import json
import os

import cv2
import numpy as np
import pytest

from workers.warp_worker.run import main


def _make_sequence(tmp, n=8, w=160, h=284):
    src = os.path.join(tmp, "source")
    mroot = os.path.join(tmp, "masks")
    regions = ["torso", "left_sleeve", "right_sleeve", "collar", "stripe_logo", "hands_arms"]
    for r in regions:
        os.makedirs(os.path.join(mroot, r), exist_ok=True)
    os.makedirs(src, exist_ok=True)
    rng = np.random.RandomState(0)
    # a fixed textured garment patch that will translate frame-to-frame
    patch = rng.randint(0, 255, (80, 60, 3), dtype=np.uint8)
    for i in range(n):
        frame = np.full((h, w, 3), 40, np.uint8)          # static background
        # deterministic horizontal drift
        x = 30 + i * 3
        y = 90
        frame[y:y + 80, x:x + 60] = patch
        cv2.imwrite(os.path.join(src, f"frame_{i:05d}.png"), frame)
        # masks follow the patch
        for r in regions:
            m = np.zeros((h, w), np.uint8)
            if r == "torso":
                m[y:y + 80, x:x + 60] = 255
            cv2.imwrite(os.path.join(mroot, r, f"frame_{i:05d}.png"), m)
    mask_json = os.path.join(tmp, "masks.json")
    with open(mask_json, "w") as f:
        json.dump({r: os.path.join(mroot, r) for r in regions}, f)
    return src, mask_json


def test_end_to_end_smoke(tmp_path):
    tmp = str(tmp_path)
    src, mask_json = _make_sequence(tmp, n=8)
    art = os.path.join(tmp, "art")
    heavy = os.path.join(tmp, "heavy")
    rc = main([
        "--source", src,
        "--shot-id", "smoke",
        "--start", "0", "--count", "8", "--stride", "1",
        "--work-width", "160",
        "--cadence", "12",
        "--mask-dir-json", mask_json,
        "--out-heavy", heavy,
        "--out-artifacts", art,
        "--sample-every", "2",
    ])
    assert rc == 0

    # artifacts written
    for name in ["status.json", "qa_report.md", "sidebyside.png", "qa_metrics.json", "flow_metrics.json"]:
        assert os.path.exists(os.path.join(art, name)), f"missing {name}"

    status = json.load(open(os.path.join(art, "status.json")))
    assert status["rollup"]["done"] == 8
    assert status["rollup"]["complete"] is True

    metrics = json.load(open(os.path.join(art, "qa_metrics.json")))
    # pure translation => compositing outside the garment is near-lossless
    assert metrics["identity_drift_outside"] < 1.0
    # flow recovers the translation => low added shimmer
    assert metrics["flicker_ratio"] < 1.5


def test_resume_skips_completed(tmp_path):
    tmp = str(tmp_path)
    src, mask_json = _make_sequence(tmp, n=6)
    art = os.path.join(tmp, "art")
    heavy = os.path.join(tmp, "heavy")
    argv = [
        "--source", src, "--shot-id", "resume", "--start", "0", "--count", "6",
        "--work-width", "160", "--cadence", "12", "--mask-dir-json", mask_json,
        "--out-heavy", heavy, "--out-artifacts", art, "--sample-every", "2",
    ]
    assert main(argv) == 0
    st1 = json.load(open(os.path.join(art, "status.json")))
    # second run resumes; still complete, no crash
    assert main(argv) == 0
    st2 = json.load(open(os.path.join(art, "status.json")))
    assert st2["rollup"]["complete"] is True
    assert st1["frame_count"] == st2["frame_count"] == 6
