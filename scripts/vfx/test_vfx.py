#!/usr/bin/env python3
"""Synthetic checks for the VFX library, QC, chain, beat-to-cut, and Blender argv. No media files."""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import beat_to_cut
import blender_job
import chain
import library
import qc
from limits import REVIEW_HEIGHT, REVIEW_SAR, REVIEW_WIDTH


def frame(value: int, h: int = 16, w: int = 12) -> np.ndarray:
    img = np.full((h, w, 3), value, np.uint8)
    return img


def main() -> None:
    left = [frame(20) for _ in range(8)]
    right = [frame(220) for _ in range(8)]
    for shot in left:
        shot[2:6, 2:6] = 255  # a bright feature that should break up last
    burst = library.smoke_ember_burst(left, right)
    assert len(burst) == 8
    # early frames still contain the bright feature from the outgoing shot
    assert burst[0][3, 3, 0] == 255
    # no pixel is an average of 20 and 220
    assert not np.any(burst[3] == 120)

    turned = library.page_turn(frame(1), frame(9), 0.5)
    assert turned[0, 0, 0] == 9 and turned[0, -1, 0] == 1

    punched = library.apply_zoom([frame(40), frame(40), frame(40)], "downbeat_punch")
    assert len(punched) == 3
    try:
        library._zoom(frame(1), 1.5, None)
        raise SystemExit("ceiling was not enforced")
    except ValueError:
        pass
    try:
        library._pivot(frame(1, h=20), (15, 6))
        raise SystemExit("mouth pivot was accepted")
    except ValueError:
        pass

    leaked = library.light_leak(frame(80), 40)
    assert int(leaked.mean()) > 80
    flashed = library.flash_frame(frame(30))
    assert flashed.min() > 0

    try:
        library.speed_ramp_indexes(4, "fendi_performance")
        raise SystemExit("performance speed ramp was accepted")
    except ValueError:
        pass
    assert library.speed_ramp_indexes(4, "ai_broll")[0] == 0

    points = chain.catenary((2, 2), (10, 2), sag=4, samples=5)
    assert points[2][1] > points[0][1]
    drawn = chain.draw_chain(frame(0, 24, 16), points)
    assert drawn.shape == (24, 16, 3)
    script = chain.blender_curve_script(points)
    assert "cycles.device = 'CPU'" in script
    assert "HyenasChain" in script

    spec = qc.specs({
        "width": REVIEW_WIDTH, "height": REVIEW_HEIGHT, "sar": REVIEW_SAR,
        "fps": 24, "expected_fps": 24, "frame_count": 48, "expected_frames": 48,
        "audio_md5": "aa", "reference_audio_md5": "aa",
    })
    assert spec["pass"]
    assert not qc.specs({**{"width": 720, "height": 1280, "sar": "1:1", "fps": 24, "expected_fps": 24, "frame_count": 1, "expected_frames": 1, "audio_md5": "a", "reference_audio_md5": "b"}})["pass"]
    assert qc.black_ramps([10, 0, 10], [(1, 2)])["pass"]
    assert not qc.black_ramps([10, 0, 10], [])["pass"]
    face = frame(30, 4, 4)
    assert qc.face_proof(face, face)["pass"]
    assert not qc.face_proof(face, frame(31, 4, 4))["pass"]
    assert qc.mouth_at_rest([0.0, 0.01])["pass"]
    assert not qc.mouth_at_rest([0.2])["pass"]
    assert qc.review_indexes(10)["cut_strip"] == [6, 10, 13, 14]
    assert qc.review_indexes(10)["width"] == 1080

    mask = np.zeros((80, 80), dtype=bool)
    mask[10:20, 10:20] = True
    assert qc.centroid_gap(mask, mask)["pass"]
    shifted = np.zeros_like(mask)
    shifted[60:70, 60:70] = True
    assert not qc.centroid_gap(mask, shifted)["pass"]

    grid = {"fps": 24, "song_asset_id": "067a4cbf-6fd0-4601-9111-df1119c52fa6", "beats": [{"frame": i * 12, "downbeat": i % 4 == 0} for i in range(8)]}
    shots = {"format": "avt.shot_list", "slots": [
        {"slot": "c001", "length_frames": 24, "subject": "fendi_performance"},
        {"slot": "c002", "length_frames": 12, "subject": "ai_broll"},
    ]}
    assets = {
        "c001": {"asset_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "version": 2, "shot_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "source_in": 1.0},
        "c002": {"asset_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "version": 1, "transition": "whip"},
    }
    cut = beat_to_cut.beat_to_cut("764a63d2-93cd-44f3-905f-292f14ab2f51", shots, grid, assets)
    assert cut["clips"][0]["timeRemapAllowed"] is False
    assert cut["clips"][0]["speed"] == 1
    assert cut["clips"][0]["timelineInFrame"] == 0
    assert cut["clips"][0]["assetVersion"] == 2
    assert cut["width"] == 1080 and cut["height"] == 1920
    assert "edl" not in cut

    os.environ["AVT_BLENDER"] = "/opt/blender"
    assert blender_job.blender_bin() == "/opt/blender"
    argv = blender_job.cycles_argv("scene.blend", 1, 8, "/tmp/frame_")
    assert argv[0] == "/opt/blender" and "CPU" in argv and "CYCLES" in argv
    assert blender_job.frame_chunks(1, 10, 4) == [(1, 4), (5, 8), (9, 10)]
    assert len(library.EFFECTS) >= 20
    print("vfx synthetic checks passed", len(library.EFFECTS))


if __name__ == "__main__":
    main()
