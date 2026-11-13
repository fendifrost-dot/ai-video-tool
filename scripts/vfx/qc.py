#!/usr/bin/env python3
"""Pass/fail QC on arrays and probe metadata. No file is opened and nothing is uploaded.

Review sheets are described as frame indexes. The pixel checks run on the chunk
the caller passes, which in tests is a small synthetic raster.
"""
from __future__ import annotations

import hashlib

import numpy as np

from limits import CENTROID_GAP_PX, FACE_DIFF_MAX, REVIEW_HEIGHT, REVIEW_SAR, REVIEW_WIDTH


def _check(name: str, ok: bool, detail: str) -> dict:
    return {"name": name, "pass": bool(ok), "detail": detail}


def report(checks: list[dict]) -> dict:
    return {"pass": all(item["pass"] for item in checks), "checks": checks}


def specs(probe: dict) -> dict:
    checks = [
        _check("width", probe.get("width") == REVIEW_WIDTH, f"width {probe.get('width')}"),
        _check("height", probe.get("height") == REVIEW_HEIGHT, f"height {probe.get('height')}"),
        _check("sar", probe.get("sar") == REVIEW_SAR, f"sar {probe.get('sar')}"),
        _check("fps", probe.get("fps") == probe.get("expected_fps"), f"fps {probe.get('fps')}"),
        _check("frames", probe.get("frame_count") == probe.get("expected_frames"), f"frames {probe.get('frame_count')}"),
        _check(
            "audio_md5",
            probe.get("audio_md5") == probe.get("reference_audio_md5"),
            "audio md5",
        ),
    ]
    return report(checks)


def black_ramps(means: list[float], allowed: list[tuple[int, int]], floor: float = 8.0) -> dict:
    """A near-black frame outside an allowed window fails. There is no opacity ramp check beyond that."""
    bad = []
    for index, value in enumerate(means):
        if value >= floor:
            continue
        if any(start <= index < end for start, end in allowed):
            continue
        bad.append(index)
    return report([_check("black_outside_window", not bad, f"frames {bad}")])


def face_proof(output_face: np.ndarray, source_face: np.ndarray) -> dict:
    diff = int(np.max(np.abs(output_face.astype(np.int16) - source_face.astype(np.int16)))) if output_face.size else 0
    return report([_check("face_pixels", diff <= FACE_DIFF_MAX, f"max abs diff {diff}")])


def mouth_correlation(output_motion: list[float], source_motion: list[float]) -> dict:
    if len(output_motion) != len(source_motion) or len(output_motion) < 2:
        return report([_check("mouth_timing", False, "motion series differ")])
    a = np.array(output_motion, dtype=np.float64)
    b = np.array(source_motion, dtype=np.float64)
    if a.std() < 1e-6 and b.std() < 1e-6:
        corr = 1.0
    else:
        corr = float(np.corrcoef(a, b)[0, 1])
    return report([_check("mouth_timing", corr >= 0.98, f"correlation {corr:.4f}")])


def mouth_at_rest(motion: list[float], limit: float = 0.02) -> dict:
    peak = max(motion) if motion else 0.0
    return report([_check("mouth_at_rest", peak <= limit, f"peak {peak}")])


def untouched(output: list[np.ndarray], previous: list[np.ndarray], change_windows: list[tuple[int, int]], tolerance: int = 2) -> dict:
    bad = []
    for index, (frame, prior) in enumerate(zip(output, previous)):
        if any(start <= index < end for start, end in change_windows):
            continue
        delta = int(np.max(np.abs(frame.astype(np.int16) - prior.astype(np.int16))))
        if delta > tolerance:
            bad.append(index)
    return report([_check("untouched_frames", not bad, f"frames {bad}")])


def centroid_gap(before: np.ndarray, after: np.ndarray) -> dict:
    def center(mask: np.ndarray) -> tuple[float, float]:
        ys, xs = np.nonzero(mask)
        if len(xs) == 0:
            return 0.0, 0.0
        return float(ys.mean()), float(xs.mean())
    y0, x0 = center(before)
    y1, x1 = center(after)
    gap = ((y0 - y1) ** 2 + (x0 - x1) ** 2) ** 0.5
    return report([_check("cut_register", gap <= CENTROID_GAP_PX, f"gap {gap:.1f}px")])


def subject_visible(mask: np.ndarray, minimum: float = 0.5) -> dict:
    fraction = float(mask.mean()) if mask.size else 0.0
    return report([_check("subject_visible", fraction >= minimum, f"fraction {fraction:.2f}")])


def edge_in_frame(mask: np.ndarray, margin: int = 2) -> dict:
    """Ears should not be cut off: the mask must not touch the side margin."""
    if mask.size == 0:
        return report([_check("ear_in_frame", False, "empty")])
    left = mask[:, :margin].any()
    right = mask[:, -margin:].any()
    return report([_check("ear_in_frame", not (left or right), f"left {bool(left)} right {bool(right)}")])


def background_psnr(output: np.ndarray, plate: np.ndarray, matte: np.ndarray, minimum: float = 40.0) -> dict:
    outside = ~matte.astype(bool)
    if outside.ndim == 2:
        outside = np.repeat(outside[..., None], output.shape[2], axis=2)
    err = (output.astype(np.float32) - plate.astype(np.float32))[outside]
    mse = float(np.mean(err ** 2)) if err.size else 0.0
    psnr = 99.0 if mse <= 1e-8 else 10 * np.log10((255 ** 2) / mse)
    return report([_check("background_psnr", psnr >= minimum, f"psnr {psnr:.1f}")])


def contact_shadow_present(frame: np.ndarray, floor_row: int) -> dict:
    above = float(frame[max(0, floor_row - 3)].mean())
    on = float(frame[min(frame.shape[0] - 1, floor_row)].mean())
    return report([_check("contact_shadow", on + 4 < above, f"floor {on:.1f} above {above:.1f}")])


def audio_md5(payload: bytes) -> str:
    return hashlib.md5(payload).hexdigest()


def review_indexes(cut: int) -> dict:
    """The cut strip a review sheet must include. Indexes, not a downscaled picture."""
    return {"cut_strip": [cut - 4, cut, cut + 3, cut + 4], "width": REVIEW_WIDTH, "height": REVIEW_HEIGHT, "sar": REVIEW_SAR}
